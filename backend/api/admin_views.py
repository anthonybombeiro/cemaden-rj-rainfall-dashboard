"""
Endpoint de operações administrativas via HTTP — existe só porque o plano
compartilhado do HostGator não dá acesso a shell (confirmado: "Shell
access is not enabled on your account"), então não há como rodar
`python manage.py migrate`/`ingest` por SSH. Isso permite disparar essas
mesmas ações via um POST autenticado por segredo — chamado manualmente
uma vez para o setup inicial (migrate) e depois pelos Cron Jobs do cPanel
(curl) para a ingestão periódica.

Deliberadamente uma lista BRANCA fixa de ações (nunca comando arbitrário):
  - "migrate": roda as migrations do Django
  - "collectstatic": coleta arquivos estáticos (admin do Django)
  - "ingest": roda um conector específico (source obrigatório, tem que
    estar no REGISTRY de ingestion/connectors)
  - "sync_risk_alerts": roda ingestion/connectors/cemaden_rj_alertas.py
    (alertas oficiais de risco da Defesa Civil-RJ — não é um conector
    Station/Reading, por isso não está no REGISTRY normal)
  - "sync_avisos_mau_tempo": roda ingestion/connectors/marinha_avisos.py
    (avisos de mau tempo da Marinha/SMM para as áreas CHARLIE e DELTA —
    também fora do REGISTRY normal, mesmo motivo do sync_risk_alerts)
  - "sync_sirenes": roda ingestion/connectors/cemaden_rj_sirenes.py (as
    225 sirenes de alerta/alarme da CEMADEN-RJ, via API autenticada —
    também fora do REGISTRY normal, porque além de Station/Reading isso
    também cria/resolve AlertEvent de acionamento)
  - "delete_stations": apaga estações de UMA fonte cujo external_id
    bate com um filtro — usado pra limpar registros órfãos quando um
    conector muda o jeito de calcular o external_id (ex: cemaden_mctic já
    trocou duas vezes: chave sintética "cidade|nome" → código oficial
    tipo "330580216A" → id numérico do CEMADEN nacional; a cada troca as
    antigas ficam órfãs, nunca mais recebem leitura). Exige source +
    (external_id_contains e/ou external_id_regex) — nunca apaga a fonte
    inteira sem pelo menos um desses dois filtros.
  - "purge_readings": apaga leituras de UM tipo de UMA fonte a partir de
    um timestamp (ISO) — usado pra migração quando o SIGNIFICADO de um
    valor já armazenado muda (ex: 2026-09-23, Wunderground/Plugfield
    passaram de "total corrido do dia" pra "balde por intervalo" — as
    leituras de HOJE gravadas antes da mudança ficam contaminando a soma
    como se fossem baldes, gerando acumulado absurdo). Exige source +
    reading_type + since (formato "YYYY-MM-DDTHH:MM:SS", sempre UTC).
  - "create_user": cria (ou reseta a senha/papel de) uma conta de login do
    painel — necessário porque o painel inteiro passou a exigir login
    (2026-09-23) e o HostGator não dá shell pra rodar
    `createsuperuser`/`changepassword`. Exige username + password + role
    ("admin" ou "operador"); "admin" vira `is_superuser=True` (também
    entra no /admin/ do Django, que exige `is_staff`) e "operador" vira
    usuário comum (só entra no painel, não no /admin/). Rodar de novo com
    o mesmo username ATUALIZA a senha/papel em vez de duplicar conta.

Diagnósticos READ-ONLY (ex: custo de paginação de /api/stations/) NÃO
entram aqui — ficam em endpoints protegidos por sessão/`is_superuser`
normal (ver `StationViewSet.diagnostico` em `views.py`), não pelo segredo
compartilhado: evita precisar materializar o `ADMIN_TRIGGER_SECRET` de
produção (que só existe no `.env` do servidor) só pra rodar uma consulta.
"""

from __future__ import annotations

import io
import logging

from django.conf import settings
from django.core.management import call_command
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("ingestion")

ACOES_PERMITIDAS = {
    "migrate",
    "collectstatic",
    "ingest",
    "sync_risk_alerts",
    "sync_avisos_mau_tempo",
    "sync_sirenes",
    "delete_stations",
    "purge_readings",
    "create_user",
    "normalize_municipios",
    "populate_sirene_ref",
    "analise_chuva_qc",
    "snapshot_precip",
    "analise_funcionamento",
    "analise_negativos",
    "cotas_hidro",
    "teste_dsat",
    "teste_redemet",
}


class AdminOpsView(APIView):
    """POST /api/admin/run/
    Headers: X-Admin-Secret: <ADMIN_TRIGGER_SECRET>
    Body: {"action": "migrate"} | {"action": "collectstatic"} |
          {"action": "ingest", "source": "inmet"}
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [JSONParser]

    def post(self, request):
        secret_esperado = getattr(settings, "ADMIN_TRIGGER_SECRET", "")
        secret_recebido = request.headers.get("X-Admin-Secret", "")
        if not secret_esperado or secret_recebido != secret_esperado:
            logger.warning("Tentativa de acionar /api/admin/run/ com segredo inválido/ausente.")
            return Response({"detail": "Não autorizado."}, status=401)

        action = (request.data or {}).get("action")
        if action not in ACOES_PERMITIDAS:
            return Response(
                {"detail": f"Ação inválida. Permitidas: {sorted(ACOES_PERMITIDAS)}"}, status=400
            )

        saida = io.StringIO()
        try:
            if action == "migrate":
                call_command("migrate", interactive=False, stdout=saida, stderr=saida)
            elif action == "collectstatic":
                call_command("collectstatic", interactive=False, verbosity=1, stdout=saida, stderr=saida)
            elif action == "ingest":
                from ingestion.connectors import REGISTRY, get_connector

                source = (request.data or {}).get("source")
                if source not in REGISTRY:
                    return Response(
                        {"detail": f"source inválido. Disponíveis: {sorted(REGISTRY)}"}, status=400
                    )
                resultado = get_connector(source).run()
                saida.write(resultado.summary())
                for erro in resultado.errors:
                    saida.write(f"\n  - {erro}")
            elif action == "sync_risk_alerts":
                from ingestion.connectors import cemaden_rj_alertas

                resultado = cemaden_rj_alertas.sync()
                saida.write(resultado.summary())
            elif action == "sync_avisos_mau_tempo":
                from ingestion.connectors import marinha_avisos

                resultado = marinha_avisos.sync()
                saida.write(resultado.summary())
            elif action == "normalize_municipios":
                call_command("normalize_municipios", stdout=saida, stderr=saida)
            elif action == "populate_sirene_ref":
                call_command("populate_sirene_ref", stdout=saida, stderr=saida)
            elif action == "sync_sirenes":
                from ingestion.connectors import cemaden_rj_sirenes

                resultado = cemaden_rj_sirenes.sync()
                saida.write(resultado.summary())
            elif action == "delete_stations":
                import re as re_module

                from core.models import Station

                source = (request.data or {}).get("source")
                contains = (request.data or {}).get("external_id_contains")
                regex = (request.data or {}).get("external_id_regex")
                if not source or not (contains or regex):
                    return Response(
                        {
                            "detail": (
                                "delete_stations exige 'source' e pelo menos um de "
                                "'external_id_contains' / 'external_id_regex'."
                            )
                        },
                        status=400,
                    )
                # Filtra em Python, não em SQL: o MySQL 5.7 de produção não
                # tem REGEXP_LIKE (só chegou no 8.0.4+), que é o que o
                # Django gera por baixo de __regex/__iregex nesse servidor
                # — dá erro "(1305, 'FUNCTION ...REGEXP_LIKE does not
                # exist')" mesmo pedindo a variante case-sensitive. Buscar
                # os pares (id, external_id) e filtrar aqui evita depender
                # de qual dialeto de regex o banco tem disponível.
                candidatos = Station.objects.filter(source__slug=source).values_list("id", "external_id")
                padrao = re_module.compile(regex) if regex else None

                def _bate(external_id: str) -> bool:
                    # AND entre os filtros informados — igual ao .filter()
                    # encadeado que isso substitui: se os dois vierem, os
                    # dois precisam bater, não é OU.
                    if contains and contains not in external_id:
                        return False
                    if padrao and not padrao.search(external_id):
                        return False
                    return True

                ids_para_apagar = [pk for pk, external_id in candidatos if _bate(external_id)]
                apagadas, _ = Station.objects.filter(pk__in=ids_para_apagar).delete()
                saida.write(f"objetos apagados (estação + leituras em cascata): {apagadas}")
            elif action == "purge_readings":
                import datetime as dt_module

                from core.models import Reading

                source = (request.data or {}).get("source")
                reading_type = (request.data or {}).get("reading_type")
                since_str = (request.data or {}).get("since")
                if not source or not reading_type or not since_str:
                    return Response(
                        {"detail": "purge_readings exige 'source', 'reading_type' e 'since' (ISO, UTC)."},
                        status=400,
                    )
                try:
                    since = dt_module.datetime.fromisoformat(since_str).replace(tzinfo=dt_module.timezone.utc)
                except ValueError:
                    return Response({"detail": f"'since' inválido: {since_str!r}"}, status=400)
                apagadas, _ = Reading.objects.filter(
                    station__source__slug=source, reading_type=reading_type, timestamp__gte=since
                ).delete()
                saida.write(f"leituras apagadas: {apagadas}")
            elif action == "analise_chuva_qc":
                # SOMENTE LEITURA (03/10/2026): distribuição dos baldes de chuva
                # de uma fonte p/ calibrar os limites de core/qualidade.py.
                import datetime as dt_module
                import json as json_module
                import statistics
                from collections import defaultdict

                from django.utils import timezone

                from core.models import Reading

                source = (request.data or {}).get("source") or "cemaden_mctic"
                dias = int((request.data or {}).get("dias") or 30)
                desde = timezone.now() - dt_module.timedelta(days=dias)
                linhas = list(
                    Reading.objects.filter(
                        station__source__slug=source, reading_type="chuva_mm", timestamp__gte=desde
                    ).values_list("station_id", "station__municipality", "timestamp", "value")
                )
                valores = sorted(v for _, _, _, v in linhas)
                n = len(valores)

                def pct(q):
                    return valores[min(n - 1, int(q * n))] if n else None

                nao_zero = [v for v in valores if v > 0]
                rel = {
                    "leituras": n,
                    "periodo_dias": dias,
                    "estacoes": len({sid for sid, _, _, _ in linhas}),
                    "nao_zero": len(nao_zero),
                    "percentis_todos": {q: pct(q) for q in (0.5, 0.9, 0.99, 0.999)},
                    "percentis_chuva_nao_zero": {
                        q: (nao_zero[min(len(nao_zero) - 1, int(q * len(nao_zero)))] if nao_zero else None)
                        for q in (0.5, 0.9, 0.99, 0.999)
                    },
                    "maior": valores[-5:] if n else [],
                    "acima_de": {str(t): sum(1 for v in valores if v > t) for t in (5, 8, 10, 12, 15, 20, 30, 50)},
                }
                # Vizinhança: leituras >= 8 mm comparadas com a mediana das demais
                # estações do MESMO município e MESMO horário (arredondado a 10 min).
                por_mun_hora = defaultdict(list)
                for sid, mun, ts, v in linhas:
                    chave = (mun, ts.replace(minute=ts.minute - ts.minute % 10, second=0, microsecond=0))
                    por_mun_hora[chave].append((sid, v))
                isolados, com_apoio, sem_vizinha = [], 0, 0
                for sid, mun, ts, v in linhas:
                    if v < 8:
                        continue
                    chave = (mun, ts.replace(minute=ts.minute - ts.minute % 10, second=0, microsecond=0))
                    outras = [x for s2, x in por_mun_hora[chave] if s2 != sid]
                    if not outras:
                        sem_vizinha += 1
                    elif statistics.median(outras) >= 0.3 * v or max(outras) >= 0.5 * v:
                        com_apoio += 1
                    else:
                        isolados.append((sid, mun, ts.isoformat(), v, round(max(outras), 1)))
                rel["vizinhanca_ge_8mm"] = {
                    "total": sum(1 for *_, v in linhas if v >= 8),
                    "com_apoio_de_vizinha": com_apoio,
                    "sem_vizinha_no_horario": sem_vizinha,
                    "isoladas": len(isolados),
                    "amostra_isoladas(id,mun,ts,valor,max_vizinhas)": isolados[:15],
                }
                # Sensor travado: >= 6 leituras consecutivas iguais e > 0 numa estação.
                por_est = defaultdict(list)
                for sid, mun, ts, v in linhas:
                    por_est[sid].append((ts, v))
                travadas = []
                for sid, seq in por_est.items():
                    seq.sort()
                    run, ant = 0, None
                    for ts, v in seq:
                        if v > 0 and v == ant:
                            run += 1
                        else:
                            if run >= 5:
                                travadas.append((sid, ant, run + 1))
                            run = 0
                        ant = v
                    if run >= 5:
                        travadas.append((sid, ant, run + 1))
                rel["sequencias_iguais_ge_6"] = {"quantidade": len(travadas), "amostra(id,valor,tamanho)": travadas[:10]}
                saida.write(json_module.dumps(rel, ensure_ascii=False, default=str))
            elif action == "snapshot_precip":
                # SOMENTE LEITURA: nossos acumulados (os mesmos da tabela de
                # Precipitação) por estação de uma fonte, p/ comparar com o oficial.
                import json as json_module

                from api.views import StationViewSet
                from core.models import Reading, Station

                source = (request.data or {}).get("source")
                if not source:
                    return Response({"detail": "snapshot_precip exige 'source'."}, status=400)
                estacoes = list(Station.objects.filter(source__slug=source))
                calc = {e["id"]: e for e in StationViewSet()._calcular_precipitacao(estacoes, usar_oficiais=False)}
                linhas = []
                for st in estacoes:
                    c = calc.get(st.id) or {}
                    n = Reading.objects.filter(station=st, reading_type="chuva_mm").count()
                    linhas.append(
                        {
                            "id": st.id, "ext": st.external_id, "nome": st.name, "mun": st.municipality,
                            "atualizado": c.get("updated_at"), "n_leituras_chuva": n,
                            "agora": c.get("chuva_agora_mm"), "1h": c.get("acumulado_1h_mm"),
                            "24h": c.get("acumulado_24h_mm"), "96h": c.get("acumulado_96h_mm"),
                            "hoje": c.get("acumulado_hoje_mm"),
                        }
                    )
                saida.write(json_module.dumps(linhas, ensure_ascii=False, default=str))
            elif action == "analise_funcionamento":
                # SOMENTE LEITURA: funcionamento real das estações de uma fonte
                # (última leitura, cobertura nos últimos N dias, maior lacuna,
                # variáveis presentes).
                import datetime as dt_module
                import json as json_module
                from collections import defaultdict

                from django.db.models import Count
                from django.utils import timezone

                from core.models import Reading, Station

                source = (request.data or {}).get("source")
                dias = int((request.data or {}).get("dias") or 7)
                if not source:
                    return Response({"detail": "analise_funcionamento exige 'source'."}, status=400)
                agora = timezone.now()
                desde = agora - dt_module.timedelta(days=dias)
                estacoes = {st.id: st for st in Station.objects.filter(source__slug=source)}
                tipos = defaultdict(dict)
                for sid, rt, n in (
                    Reading.objects.filter(station_id__in=list(estacoes), timestamp__gte=desde)
                    .values_list("station_id", "reading_type")
                    .annotate(n=Count("id"))
                ):
                    tipos[sid][rt] = n
                ts_por = defaultdict(list)
                for sid, ts in Reading.objects.filter(
                    station_id__in=list(estacoes), timestamp__gte=desde, reading_type__in=["temperatura_c", "chuva_mm"]
                ).values_list("station_id", "timestamp"):
                    ts_por[sid].append(ts)
                linhas = []
                for sid, st in estacoes.items():
                    ts = sorted(set(ts_por.get(sid, [])))
                    gaps = [(b - a).total_seconds() / 60 for a, b in zip(ts, ts[1:])]
                    ultima = (
                        Reading.objects.filter(station_id=sid).order_by("-timestamp").values_list("timestamp", flat=True).first()
                    )
                    primeira = (
                        Reading.objects.filter(station_id=sid).order_by("timestamp").values_list("timestamp", flat=True).first()
                    )
                    mediana = sorted(gaps)[len(gaps) // 2] if gaps else None
                    linhas.append(
                        {
                            "id": sid, "ext": st.external_id, "nome": st.name, "mun": st.municipality,
                            "status": st.status, "primeira": primeira, "ultima": ultima,
                            "idade_ultima_h": round((agora - ultima).total_seconds() / 3600, 1) if ultima else None,
                            "instantes_%dd" % dias: len(ts),
                            "intervalo_mediano_min": round(mediana, 1) if mediana else None,
                            "maior_lacuna_h": round(max(gaps) / 60, 1) if gaps else None,
                            "tipos": tipos.get(sid, {}),
                            "codigo": (st.raw_metadata or {}).get("cod_estacao") or (st.raw_metadata or {}).get("codigo"),
                        }
                    )
                saida.write(json_module.dumps(linhas, ensure_ascii=False, default=str))
            elif action == "analise_negativos":
                # SOMENTE LEITURA: leituras de chuva negativas (valores-sentinela de
                # "sem dado") por fonte — contagem, valores mais comuns, estações e datas.
                import json as json_module
                from collections import Counter

                from core.models import Reading

                source = (request.data or {}).get("source")
                qs = Reading.objects.filter(reading_type="chuva_mm", value__lt=0)
                if source:
                    qs = qs.filter(station__source__slug=source)
                por_fonte = Counter()
                valores = Counter()
                por_estacao = Counter()
                datas = []
                for slug, nome, ts, v in qs.values_list("station__source__slug", "station__name", "timestamp", "value"):
                    por_fonte[slug] += 1
                    valores[round(v, 2)] += 1
                    por_estacao[nome] += 1
                    datas.append(ts)
                saida.write(
                    json_module.dumps(
                        {
                            "total": sum(por_fonte.values()),
                            "por_fonte": dict(por_fonte),
                            "valores_mais_comuns": valores.most_common(8),
                            "estacoes_mais_afetadas": por_estacao.most_common(8),
                            "primeira": min(datas) if datas else None,
                            "ultima": max(datas) if datas else None,
                        },
                        ensure_ascii=False,
                        default=str,
                    )
                )
            elif action == "cotas_hidro":
                # SOMENTE LEITURA: cotas e inventário das estações hidrológicas (nome opcional filtra).
                import json as json_module

                from core.models import Station

                filtro = ((request.data or {}).get("nome") or "").strip()
                qs = Station.objects.filter(cota__isnull=False).select_related("cota", "source")
                if filtro:
                    qs = qs.filter(name__icontains=filtro)
                linhas = [
                    {
                        "id": st.id, "nome": st.name, "fonte": st.source.slug, "mun": st.municipality,
                        "rio": st.rio_monitorado, "regiao_hidro": st.regiao_hidrografica, "bacia": st.bacia,
                        "atencao": st.cota.atencao_cm, "alerta": st.cota.alerta_cm,
                        "inundacao": st.cota.inundacao_cm, "extrema": st.cota.extrema_cm,
                        "cota_rio": st.cota.rio, "ref": st.cota.codigo_referencia, "obs": st.cota.observacao,
                        "atualizado_em": st.cota.atualizado_em,
                    }
                    for st in qs.order_by("name")
                ]
                saida.write(json_module.dumps(linhas, ensure_ascii=False, default=str))
            elif action == "teste_dsat":
                # SOMENTE LEITURA: tempo e erro de cada passo da consulta ao CPTEC/DSAT a partir do servidor.
                import json as json_module
                import time as time_module

                from . import dsat_imagery_views as dsat

                res = {}
                tipo = (request.data or {}).get("tipo") or "truecolor"
                produto, prefixo, _ = dsat.PRODUTOS[tipo]
                try:
                    t0 = time_module.time()
                    q = dsat._quadros(produto, prefixo, 6)
                    res["quadros"] = {"n": len(q), "ultimo": str(q[-1]) if q else None, "s": round(time_module.time() - t0, 1)}
                    if q:
                        t0 = time_module.time()
                        res["bounds"] = {"v": dsat._bounds(produto, prefixo, q[-1]), "s": round(time_module.time() - t0, 1)}
                except Exception as exc:  # noqa: BLE001
                    res["erro"] = f"{type(exc).__name__}: {exc}"
                saida.write(json_module.dumps(res, ensure_ascii=False, default=str))
            elif action == "teste_redemet":
                # SOMENTE LEITURA: GET na API-REDEMET (/produtos/...) com a chave do servidor (nunca exibida).
                import json as json_module

                import requests as requests_module
                from django.conf import settings as settings_module

                res = {}
                for caminho in ((request.data or {}).get("caminhos") or [])[:12]:
                    if not str(caminho).startswith("/produtos/"):
                        res[caminho] = "só /produtos/ é permitido"
                        continue
                    try:
                        r = requests_module.get(
                            "https://api-redemet.decea.mil.br" + caminho,
                            headers={"X-Api-Key": settings_module.REDEMET_API_KEY}, timeout=25,
                        )
                        res[caminho] = {"status": r.status_code, "corpo": r.text[:700]}
                    except Exception as exc:  # noqa: BLE001
                        res[caminho] = f"{type(exc).__name__}: {exc}"
                saida.write(json_module.dumps(res, ensure_ascii=False))
            elif action == "create_user":
                from django.contrib.auth import get_user_model

                username = (request.data or {}).get("username")
                password = (request.data or {}).get("password")
                role = (request.data or {}).get("role")
                if not username or not password or role not in ("admin", "operador"):
                    return Response(
                        {"detail": "create_user exige 'username', 'password' e 'role' ('admin' ou 'operador')."},
                        status=400,
                    )
                User = get_user_model()
                is_admin = role == "admin"
                user, criado = User.objects.get_or_create(username=username)
                user.set_password(password)
                user.is_superuser = is_admin
                user.is_staff = is_admin
                user.is_active = True
                user.save()
                saida.write(f"usuário {'criado' if criado else 'atualizado'}: {username} (role={role})")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Falha ao executar ação administrativa %r", action)
            return Response({"detail": f"Erro: {exc}", "saida": saida.getvalue()}, status=500)

        return Response({"ok": True, "action": action, "saida": saida.getvalue()})


class MigrateSuperuserView(APIView):
    """POST /api/admin/migrate/ — roda `migrate` para um superusuário logado
    (sessão + CSRF), sem depender do segredo `X-Admin-Secret`."""

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        saida = io.StringIO()
        call_command("migrate", interactive=False, stdout=saida, stderr=saida)
        return Response({"ok": True, "output": saida.getvalue()[-2000:]})


class SyncAvisosMauTempoSuperuserView(APIView):
    """POST /api/admin/sync-avisos-mau-tempo/ — sessão + CSRF, sem precisar
    do segredo. Existe só pra testar/disparar manualmente pela sessão do
    painel (o Cron Job de produção continua chamando /api/admin/run/ com
    X-Admin-Secret, igual os outros sync_*) — ver
    ingestion/connectors/marinha_avisos.py."""

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        from ingestion.connectors import marinha_avisos

        resultado = marinha_avisos.sync()
        return Response({"ok": True, "output": resultado.summary(), "erros": resultado.errors})


class PopulateSireneRefSuperuserView(APIView):
    """POST /api/admin/populate-sirene-ref/ — mesma ideia da MigrateSuperuserView
    acima (sessão + CSRF, sem precisar do segredo X-Admin-Secret): preenche o
    campo REF das sirenes sem pluviômetro próprio (ver management command
    populate_sirene_ref). Idempotente — não sobrescreve REF já definido
    manualmente, então é seguro rodar de novo depois de cadastrar sirenes novas."""

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        saida = io.StringIO()
        call_command("populate_sirene_ref", stdout=saida, stderr=saida)
        return Response({"ok": True, "output": saida.getvalue()[-4000:]})


class SetRiscoSireneSuperuserView(APIView):
    """POST /api/admin/set-risco-sirene/ — sessão + CSRF, sem precisar do segredo.
    Preenche risco_sirene em massa pras sirenes AINDA EM BRANCO (não sobrescreve
    quem já foi classificado manualmente). Body opcional: {"valor": "geo"} (padrão)."""

    VALORES_VALIDOS = {"geo", "hidro", "geo_hidro"}

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        valor = (request.data or {}).get("valor", "geo")
        if valor not in self.VALORES_VALIDOS:
            return Response({"detail": f"valor inválido. Permitidos: {sorted(self.VALORES_VALIDOS)}"}, status=400)
        saida = io.StringIO()
        call_command("set_risco_sirene_padrao", valor=valor, stdout=saida, stderr=saida)
        return Response({"ok": True, "output": saida.getvalue()})


class FixSirenesChuvaSobrepostaSuperuserView(APIView):
    """POST /api/admin/fix-sirenes-chuva-sobreposta/ — sessão + CSRF, sem
    precisar do segredo. Roda o management command de mesmo nome (ver seu
    docstring): remove leituras de chuva (sirenes com pluviômetro) que
    ficaram sobrepostas por causa de `tempo1` ser janela deslizante, não
    bucket de verdade. Por padrão SÓ SIMULA (dry-run) — body
    {"aplicar": true} pra remover de fato."""

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        aplicar = bool((request.data or {}).get("aplicar", False))
        saida = io.StringIO()
        kwargs = {"aplicar": True} if aplicar else {}
        call_command("fix_sirenes_chuva_sobreposta", stdout=saida, stderr=saida, **kwargs)
        return Response({"ok": True, "aplicado": aplicar, "output": saida.getvalue()})


class EnvCheckView(APIView):
    """GET /api/admin/env-check/ — só superusuário. Diz SE segredos estão
    configurados (booleanos/tamanho), nunca o valor."""

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        import os

        from django.conf import settings as dj

        arq = dj.BASE_DIR / ".env.local"
        info = {"env_local_existe": arq.exists(), "env_local_legivel": os.access(arq, os.R_OK) if arq.exists() else False}
        if info["env_local_legivel"]:
            try:
                linhas = arq.read_text(encoding="utf-8", errors="replace").splitlines()
                info["env_local_chaves"] = [l.split("=", 1)[0] for l in linhas if "=" in l]
                info["env_local_bytes"] = arq.stat().st_size
            except Exception as exc:  # noqa: BLE001
                info["env_local_erro"] = str(exc)
        token = getattr(dj, "INMET_API_TOKEN", "")
        info["settings_inmet_token_configurado"] = bool(token)
        info["settings_inmet_token_tamanho"] = len(token)
        info["os_environ_tem_token"] = bool(os.environ.get("INMET_API_TOKEN"))
        try:
            import dotenv

            info["dotenv_versao"] = getattr(dotenv, "__version__", "?")
            vals = dotenv.dotenv_values(arq)
            info["dotenv_values"] = {k: (len(v) if v is not None else None) for k, v in vals.items()}
            info["dotenv_load_retorno"] = dotenv.load_dotenv(arq, override=False)
            info["apos_load_env_tem_token"] = bool(os.environ.get("INMET_API_TOKEN"))
        except Exception as exc:  # noqa: BLE001
            info["dotenv_erro"] = str(exc)
        return Response(info)
