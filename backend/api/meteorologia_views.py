"""Produção da Meteorologia (03/11/2026): maiores acumulados em 24 h (base 06 h), calendário de dias com chuva, alertas de limiar,
aviso meteorológico (nº/AAAA), checklist do plantão (07 h → 07 h) e livro de ocorrências.

O painel NÃO envia nada (Telegram, Idap, e-mail, redes): entrega texto e arte prontos e registra o que a equipe fez.
Regras e decisões: docs/meteorologia-producao.md."""

from __future__ import annotations

import datetime as dt
from collections import defaultdict

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import DateTimeField, ExpressionWrapper, F, Max, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.response import Response
from rest_framework.views import APIView

from core import plantao
from core.models import (
    AvisoMeteorologico,
    ConfiguracaoPlantao,
    InformativoEnvio,
    InformativoMeteorologico,
    ItemPlantao,
    OcorrenciaPlantao,
    Previsao,
    Reading,
    RiskAlert,
    Station,
)
from core.municipios import _chave, canonico_ou_original
from core.sistemas_atuantes import IDS as SISTEMAS_IDS

# Limiares do protocolo (decididos em 03/11/2026): 25 mm em 1 h; 3 ou mais estações com 40 mm em 24 h; umidade abaixo de 30 %.
LIMIAR_CHUVA_1H_MM = 25.0
LIMIAR_ESTACOES_24H_MM = 40.0
LIMIAR_ESTACOES_24H_N = 3
LIMIAR_UMIDADE_PCT = 30.0
CHUVA_BALDE_MAX_MM = 200.0  # leitura individual acima disso é erro de sensor, não chuva
CACHE_LIMIARES_S = 120

# Redes que não vão para arte pública (Weather Underground: uso interno, os termos proíbem redistribuir os dados).
FONTES_FORA_DA_ARTE = {"wunderground", "rio_chuva_bairro"}
ROTULO_FONTE_ARTE = {
    "inmet": "INMET", "ana": "ANA", "inea": "INEA", "alerta_rio": "Alerta Rio", "redemet": "REDEMET",
    "cemaden_mctic": "CEMADEN/MCTI", "cemaden_nacional": "CEMADEN/MCTI", "cemaden_rj": "CEMADEN-RJ", "cemaden_rj_sirenes": "CEMADEN-RJ",
    "niteroi": "DC Niterói", "ecowitt_paracambi": "DC Paracambi", "macae_ufrj": "DC Macaé",
}


def _usuario(request) -> str:
    return (request.user.get_full_name() or request.user.get_username()).strip()


def _local(d: dt.datetime | None):
    return timezone.localtime(d).isoformat() if d else None


def nome_regiao(regiao: str) -> str:
    """"SUL II" -> "Sul II"; "COSTA VERDE" -> "Costa Verde" (algarismos romanos ficam em maiúsculas)."""
    return " ".join(p if p in ("I", "II") else p.capitalize() for p in (regiao or "").split())


def rotulo_fonte(slug: str, municipio: str) -> str:
    if slug == "plugfield":
        return f"DC {municipio}"
    return ROTULO_FONTE_ARTE.get(slug, slug)


def _redec_por_municipio() -> dict[str, str]:
    """REDEC de cada município (chave sem acento) a partir dos alertas de risco, como o Resumo 24 h."""
    out = {}
    for mun, redec in RiskAlert.objects.exclude(redec="").exclude(municipio="").values_list("municipio", "redec"):
        out[_chave(mun)] = redec.strip().upper()
    return out


def _estacoes_rj() -> dict[int, dict]:
    """Estações com município de alguma REDEC do RJ (o resto, como as de Minas, fica de fora das contas do estado)."""
    redec_de = _redec_por_municipio()
    out = {}
    for s in Station.objects.values("id", "name", "municipality", "source__slug"):
        municipio = canonico_ou_original(s["municipality"]) or ""
        regiao = redec_de.get(_chave(municipio), "")
        if regiao:
            out[s["id"]] = {"id": s["id"], "estacao": s["name"], "municipio": municipio, "regiao": regiao, "fonte": s["source__slug"]}
    return out


def _chuva_validas(estacoes, **filtros):
    """Leituras de chuva válidas das estações dadas. O filtro por `station_id` é essencial: sem ele o MySQL varre a tabela inteira de leituras (o
    único índice é por estação + tipo + hora) e a consulta passa de 80 s em produção; com ele usa o índice por estação."""
    return (
        Reading.objects.filter(station_id__in=list(estacoes), reading_type=Reading.ReadingType.CHUVA_MM, value__gte=0, value__lte=CHUVA_BALDE_MAX_MM, **filtros)
        .exclude(qualidade__qualidade="invalido")
    )


# ------------------------------------------------------------------ maiores acumulados (arte)

def _janela_24h(ref_txt: str | None):
    """(início, fim, referência local) da janela de 24 h que termina às 06 h. Sem `ref`, a última 06 h já passada."""
    agora = timezone.now()
    if ref_txt:
        ref = parse_datetime(ref_txt.replace(" ", "T"))
        if ref is None:
            raise ValueError("ref deve ser AAAA-MM-DDTHH:MM (hora local)")
        if timezone.is_naive(ref):
            ref = timezone.make_aware(ref)
    else:
        loc = timezone.localtime(agora)
        ref = loc.replace(hour=6, minute=0, second=0, microsecond=0)
        if ref > loc:
            ref -= dt.timedelta(days=1)
    fim = min(ref, agora)
    return fim - dt.timedelta(hours=24), fim, timezone.localtime(ref)


class AcumuladosView(APIView):
    """`GET /api/meteorologia/acumulados/?ref=AAAA-MM-DDTHH:MM&n=10`: os maiores acumulados em 24 h até `ref` (padrão: a última 06 h), UM por
    município (a estação de maior valor), no modelo da arte de 19/10/2026. Soma das leituras de chuva da janela (início exclusivo, fim inclusive:
    a leitura carimbada às 06 h fecha o período). Weather Underground fica de fora (arte é pública)."""

    def get(self, request):
        try:
            ini, fim, ref = _janela_24h(request.query_params.get("ref"))
            n = max(1, min(50, int(request.query_params.get("n") or 10)))
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        estacoes = _estacoes_rj()
        totais = {
            r["station_id"]: r["total"]
            for r in _chuva_validas(estacoes, timestamp__gt=ini, timestamp__lte=fim)
            .exclude(station__source__slug__in=FONTES_FORA_DA_ARTE)
            .values("station_id")
            .annotate(total=Sum("value"))
            if r["station_id"] in estacoes
        }
        por_municipio: dict[str, dict] = {}
        for sid, total in totais.items():
            e = estacoes[sid]
            atual = por_municipio.get(e["municipio"])
            if atual is None or total > atual["valor"]:
                por_municipio[e["municipio"]] = {**e, "valor": round(total, 1)}
        ordenados = sorted(por_municipio.values(), key=lambda x: (-x["valor"], x["municipio"]))
        itens = [
            {
                "posicao": i, "regiao": x["regiao"], "regiao_nome": nome_regiao(x["regiao"]), "municipio": x["municipio"], "estacao": x["estacao"],
                "valor": x["valor"], "fonte": x["fonte"], "fonte_rotulo": rotulo_fonte(x["fonte"], x["municipio"]),
            }
            for i, x in enumerate(ordenados[:n], 1)
        ]
        ge = sum(1 for v in totais.values() if v >= LIMIAR_ESTACOES_24H_MM)
        return Response(
            {
                "ref": ref.isoformat(), "inicio": _local(ini), "fim": _local(fim), "janela_h": 24, "itens": itens,
                "municipios_com_chuva": sum(1 for x in ordenados if x["valor"] > 0),
                "estacoes_acima_limiar": ge, "limiar_mm": LIMIAR_ESTACOES_24H_MM, "tabela_recomendada": ge >= LIMIAR_ESTACOES_24H_N,
                "legenda": "Os maiores acumulados em 24h no estado do Rio de Janeiro.",
            }
        )


# ------------------------------------------------------------------ calendário de dias com chuva

class ChuvaCalendarioView(APIView):
    """`GET /api/resumo/chuva-calendario/?mes=AAAA-MM&limiar=10`: dias do mês (dia civil local) em que alguma estação do estado somou `limiar` mm
    (padrão 10) ou mais, com a maior estação, quantas passaram do limiar e o mesmo por REDEC (o filtro por REDEC é feito na tela)."""

    def get(self, request):
        hoje = timezone.localdate()
        try:
            ano, mes = (int(x) for x in (request.query_params.get("mes") or f"{hoje:%Y-%m}").split("-"))
            primeiro = dt.date(ano, mes, 1)
            limiar = float(request.query_params.get("limiar") or 10)
        except ValueError:
            return Response({"detail": "mes deve ser AAAA-MM e limiar numérico"}, status=400)
        limiar = max(0.5, min(500.0, limiar))
        proximo = (primeiro.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        ini = timezone.make_aware(dt.datetime.combine(primeiro, dt.time.min))
        fim = min(timezone.make_aware(dt.datetime.combine(proximo, dt.time.min)), timezone.now())
        if fim <= ini:
            return Response({"mes": f"{ano:04d}-{mes:02d}", "limiar": limiar, "dias": []})
        deslocamento = timezone.localtime(ini + dt.timedelta(days=14)).utcoffset()
        estacoes = _estacoes_rj()
        dia_local = TruncDate(ExpressionWrapper(F("timestamp") + deslocamento, output_field=DateTimeField()), tzinfo=dt.timezone.utc)
        linhas = (
            _chuva_validas(estacoes, timestamp__gte=ini, timestamp__lt=fim)
            .annotate(dia=dia_local)
            .values("station_id", "dia")
            .annotate(total=Sum("value"))
            .filter(total__gte=limiar)
        )
        por_dia: dict[dt.date, list[dict]] = defaultdict(list)
        for r in linhas:
            e = estacoes.get(r["station_id"])
            if e:
                por_dia[r["dia"]].append({**e, "mm": round(r["total"], 1)})
        dias = []
        for dia in sorted(por_dia):
            lista = sorted(por_dia[dia], key=lambda x: -x["mm"])
            por_regiao: dict[str, dict] = {}
            for x in lista:
                g = por_regiao.setdefault(x["regiao"], {"max_mm": x["mm"], "n_estacoes": 0})
                g["n_estacoes"] += 1
            dias.append(
                {
                    "data": dia.isoformat(), "max_mm": lista[0]["mm"], "n_estacoes": len(lista), "por_regiao": por_regiao,
                    "estacoes": [
                        {"estacao": x["estacao"], "municipio": x["municipio"], "regiao": x["regiao"], "fonte": x["fonte"], "mm": x["mm"]} for x in lista[:80]
                    ],
                }
            )
        return Response({"mes": f"{ano:04d}-{mes:02d}", "limiar": limiar, "dias": dias})


# ------------------------------------------------------------------ alertas de limiar

class LimiaresView(APIView):
    """`GET /api/meteorologia/limiares/`: os três alertas do protocolo, calculados na hora (cache de 2 min): chuva acima de 25 mm em 1 h em qualquer
    estação; 3 ou mais estações com 40 mm ou mais em 24 h; umidade abaixo de 30 % (último valor da última hora e meia). Soma das leituras
    (não usa o valor oficial da fonte, que só existe para a janela terminada agora)."""

    def get(self, request):
        cached = cache.get("meteorologia:limiares")
        if cached is not None:
            return Response(cached)
        agora = timezone.now()
        estacoes = _estacoes_rj()
        h1_ini = agora - dt.timedelta(hours=1)
        chuva: dict[int, dict] = {}
        for r in (
            _chuva_validas(estacoes, timestamp__gte=agora - dt.timedelta(hours=24))
            .values("station_id")
            .annotate(h24=Sum("value"), h1=Sum("value", filter=Q(timestamp__gte=h1_ini)))
        ):
            if r["station_id"] in estacoes:
                chuva[r["station_id"]] = {"h1": r["h1"] or 0.0, "h24": r["h24"] or 0.0}

        def item(sid, **extra):
            e = estacoes[sid]
            return {"estacao": e["estacao"], "municipio": e["municipio"], "regiao": e["regiao"], "fonte": e["fonte"], **extra}

        h1 = sorted(((s, v["h1"]) for s, v in chuva.items() if v["h1"] > LIMIAR_CHUVA_1H_MM), key=lambda x: -x[1])
        h24 = sorted(((s, v["h24"]) for s, v in chuva.items() if v["h24"] >= LIMIAR_ESTACOES_24H_MM), key=lambda x: -x[1])

        ultima: dict[int, tuple[dt.datetime, float]] = {}
        for r in (
            Reading.objects.filter(station_id__in=list(estacoes), reading_type=Reading.ReadingType.UMIDADE_PCT, value__gte=1, value__lte=100, timestamp__gte=agora - dt.timedelta(minutes=90))
            .exclude(qualidade__qualidade="invalido")
            .values("station_id", "timestamp", "value")
        ):
            if r["station_id"] in estacoes and (r["station_id"] not in ultima or r["timestamp"] > ultima[r["station_id"]][0]):
                ultima[r["station_id"]] = (r["timestamp"], r["value"])
        seca = sorted(((s, v) for s, (_t, v) in ultima.items() if v < LIMIAR_UMIDADE_PCT), key=lambda x: x[1])

        payload = {
            "gerado_em": agora,
            "limiares": {"chuva_1h_mm": LIMIAR_CHUVA_1H_MM, "estacoes_24h_mm": LIMIAR_ESTACOES_24H_MM, "estacoes_24h_n": LIMIAR_ESTACOES_24H_N, "umidade_pct": LIMIAR_UMIDADE_PCT},
            "chuva_1h": {"ativo": bool(h1), "n": len(h1), "estacoes": [item(s, mm=round(v, 1)) for s, v in h1[:15]]},
            "acumulado_24h": {"ativo": len(h24) >= LIMIAR_ESTACOES_24H_N, "n": len(h24), "estacoes": [item(s, mm=round(v, 1)) for s, v in h24[:15]]},
            "umidade": {
                "ativo": bool(seca), "n": len(seca), "regioes": sorted({estacoes[s]["regiao"] for s, _ in seca}),
                "estacoes": [item(s, pct=round(v)) for s, v in seca[:15]],
            },
        }
        cache.set("meteorologia:limiares", payload, CACHE_LIMIARES_S)
        return Response(payload)


# ------------------------------------------------------------------ aviso meteorológico

def _aviso_dict(a: AvisoMeteorologico) -> dict:
    return {
        "id": a.id, "numero": a.numero, "ano": a.ano, "estado": a.estado, "vigencia_inicio": _local(a.vigencia_inicio), "vigencia_fim": _local(a.vigencia_fim),
        "regioes": a.regioes, "sistemas": a.sistemas, "icones": a.icones, "texto": a.texto, "sms_texto": a.sms_texto, "tv_texto": a.tv_texto,
        "idap_enviado": a.idap_enviado, "idap_municipios": a.idap_municipios, "idap_protocolo": a.idap_protocolo, "idap_enviado_em": _local(a.idap_enviado_em),
        "motivo_cancelamento": a.motivo_cancelamento, "criado_por": a.criado_por, "criado_em": _local(a.criado_em), "emitido_por": a.emitido_por,
        "emitido_em": _local(a.emitido_em), "historico": a.historico,
    }


def _historico(a: AvisoMeteorologico, usuario: str, acao: str):
    a.historico = [*a.historico, {"em": timezone.now().isoformat(), "por": usuario, "acao": acao}]


def _data(valor, nome: str) -> dt.datetime:
    d = parse_datetime(str(valor or "").replace(" ", "T"))
    if d is None:
        raise ValueError(f"{nome} deve ser uma data e hora (AAAA-MM-DDTHH:MM)")
    return timezone.make_aware(d) if timezone.is_naive(d) else d


def _aplicar_aviso(a: AvisoMeteorologico, dados: dict, so_idap: bool = False):
    """Valida e aplica os campos recebidos; levanta ValueError com a mensagem para o usuário."""
    if not so_idap:
        if "vigencia_inicio" in dados:
            a.vigencia_inicio = _data(dados["vigencia_inicio"], "vigencia_inicio")
        if "vigencia_fim" in dados:
            a.vigencia_fim = _data(dados["vigencia_fim"], "vigencia_fim")
        if a.vigencia_fim <= a.vigencia_inicio:
            raise ValueError("O fim da vigência precisa ser depois do início.")
        if "regioes" in dados:
            ruins = [r for r in dados["regioes"] if r not in Previsao.REGIOES]
            if ruins:
                raise ValueError(f"REDEC desconhecida: {', '.join(map(str, ruins))}")
            a.regioes = list(dados["regioes"])
        if "sistemas" in dados:
            ruins = [s for s in dados["sistemas"] if s not in SISTEMAS_IDS]
            if ruins:
                raise ValueError(f"Sistema atuante desconhecido: {', '.join(map(str, ruins))}")
            a.sistemas = list(dados["sistemas"])
        if "icones" in dados:
            if any(i not in ("chuva", "vento") for i in dados["icones"]):
                raise ValueError('Ícones aceitos: "chuva" e "vento".')
            a.icones = list(dados["icones"])
        if "texto" in dados:
            a.texto = str(dados["texto"] or "")[:4000]
    if "sms_texto" in dados:
        if len(dados["sms_texto"] or "") > 146:
            raise ValueError("O SMS do Idap aceita no máximo 146 caracteres.")
        a.sms_texto = dados["sms_texto"] or ""
    if "tv_texto" in dados:
        if len(dados["tv_texto"] or "") > 62:
            raise ValueError("A mensagem de TV do Idap aceita no máximo 62 caracteres.")
        a.tv_texto = dados["tv_texto"] or ""
    if "idap_enviado" in dados:
        a.idap_enviado = bool(dados["idap_enviado"])
        if a.idap_enviado and not a.idap_enviado_em:
            a.idap_enviado_em = timezone.now()
        if not a.idap_enviado:
            a.idap_enviado_em = None
    if "idap_municipios" in dados:
        a.idap_municipios = [str(m)[:60] for m in dados["idap_municipios"]][:100]
    if "idap_protocolo" in dados:
        a.idap_protocolo = str(dados["idap_protocolo"] or "")[:80]


class AvisosMeteorologicosView(APIView):
    """`GET /api/avisos-meteorologicos/?ano=&estado=&vigentes=1` lista; `POST` cria o rascunho e já reserva o próximo número do ano."""

    def get(self, request):
        qs = AvisoMeteorologico.objects.all()
        if request.query_params.get("ano"):
            qs = qs.filter(ano=int(request.query_params["ano"]))
        if request.query_params.get("estado"):
            qs = qs.filter(estado=request.query_params["estado"])
        if request.query_params.get("vigentes"):
            agora = timezone.now()
            qs = qs.filter(estado="emitido", vigencia_inicio__lte=agora, vigencia_fim__gte=agora)
        return Response({"avisos": [_aviso_dict(a) for a in qs[:300]]})

    def post(self, request):
        dados = request.data if isinstance(request.data, dict) else {}
        usuario = _usuario(request)
        agora = timezone.now()
        inicio = agora.replace(minute=0, second=0, microsecond=0)
        ano = timezone.localdate().year
        for _ in range(5):
            try:
                with transaction.atomic():
                    ultimo = AvisoMeteorologico.objects.filter(ano=ano).aggregate(m=Max("numero"))["m"] or 0
                    a = AvisoMeteorologico(numero=ultimo + 1, ano=ano, vigencia_inicio=inicio, vigencia_fim=inicio + dt.timedelta(hours=24), criado_por=usuario)
                    _aplicar_aviso(a, dados)
                    _historico(a, usuario, "criou")
                    a.save()
                return Response(_aviso_dict(a), status=201)
            except IntegrityError:
                continue  # outro usuário pegou o mesmo número agora: tenta o próximo
            except ValueError as e:
                return Response({"detail": str(e)}, status=400)
        return Response({"detail": "Não foi possível reservar o número; tente de novo."}, status=409)


class AvisoMeteorologicoDetalheView(APIView):
    """`GET`/`PATCH /api/avisos-meteorologicos/<id>/`. Rascunho edita tudo; emitido só os dados do Idap; cancelado não muda."""

    def get(self, request, pk):
        a = AvisoMeteorologico.objects.filter(pk=pk).first()
        return Response(_aviso_dict(a)) if a else Response({"detail": "Aviso não encontrado."}, status=404)

    def patch(self, request, pk):
        a = AvisoMeteorologico.objects.filter(pk=pk).first()
        if not a:
            return Response({"detail": "Aviso não encontrado."}, status=404)
        if a.estado == "cancelado":
            return Response({"detail": "Aviso cancelado não pode ser editado."}, status=409)
        try:
            _aplicar_aviso(a, request.data if isinstance(request.data, dict) else {}, so_idap=a.estado == "emitido")
        except ValueError as e:
            return Response({"detail": str(e)}, status=400)
        _historico(a, _usuario(request), "editou")
        a.save()
        return Response(_aviso_dict(a))


class AvisoMeteorologicoAcaoView(APIView):
    """`POST /api/avisos-meteorologicos/<id>/<emitir|cancelar|reabrir>/`."""

    def post(self, request, pk, acao):
        a = AvisoMeteorologico.objects.filter(pk=pk).first()
        if not a:
            return Response({"detail": "Aviso não encontrado."}, status=404)
        usuario = _usuario(request)
        if acao == "emitir":
            if a.estado != "rascunho":
                return Response({"detail": "Só rascunho pode ser emitido."}, status=409)
            if not a.texto.strip():
                return Response({"detail": "Escreva o texto do aviso antes de emitir."}, status=400)
            a.estado, a.emitido_por, a.emitido_em = "emitido", usuario, timezone.now()
        elif acao == "cancelar":
            motivo = str((request.data or {}).get("motivo") or "").strip()[:300]
            if a.estado == "cancelado":
                return Response({"detail": "Aviso já cancelado."}, status=409)
            if not motivo:
                return Response({"detail": "Informe o motivo do cancelamento."}, status=400)
            a.estado, a.motivo_cancelamento = "cancelado", motivo
        elif acao == "reabrir":
            if a.estado != "emitido":
                return Response({"detail": "Só aviso emitido volta para rascunho."}, status=409)
            a.estado = "rascunho"
        else:
            return Response({"detail": "Ação desconhecida."}, status=404)
        _historico(a, usuario, acao)
        a.save()
        return Response(_aviso_dict(a))


# ------------------------------------------------------------------ checklist do plantão

def _turno_param(request) -> dt.date:
    txt = request.query_params.get("data") or (request.data.get("data") if isinstance(request.data, dict) else None)
    return dt.date.fromisoformat(txt) if txt else plantao.turno_de()


class PlantaoChecklistView(APIView):
    """`GET /api/plantao/checklist/?data=AAAA-MM-DD` (data em que o turno começou; padrão: o turno em andamento) e
    `POST` {data, codigo, feito, observacao} para marcar/desmarcar. A marca é de todos os técnicos."""

    def get(self, request):
        try:
            data = _turno_param(request)
        except ValueError:
            return Response({"detail": "data deve ser AAAA-MM-DD"}, status=400)
        agora = timezone.now()
        inicio, fim = plantao.janela_do_turno(data)
        marcas = {m.codigo: m for m in ItemPlantao.objects.filter(data=data)}
        itens = []
        for i in plantao.itens_do_turno(data):
            m = marcas.get(i["codigo"])
            itens.append(
                {
                    **{k: i[k] for k in ("codigo", "hora", "titulo", "detalhe", "condicional")}, "prazo": _local(i["prazo"]),
                    "atrasado": bool(i["prazo"] and i["prazo"] < agora and not m and not i["condicional"]),
                    "feito": {"por": m.feito_por, "em": _local(m.feito_em), "observacao": m.observacao} if m else None,
                }
            )
        anterior = data - dt.timedelta(days=1)
        marcas_ant = set(ItemPlantao.objects.filter(data=anterior).values_list("codigo", flat=True))
        pendencias = [
            {"data": anterior.isoformat(), "codigo": i["codigo"], "hora": i["hora"], "titulo": i["titulo"]}
            for i in plantao.itens_do_turno(anterior)
            if not i["condicional"] and i["codigo"] not in marcas_ant and i["prazo"] and i["prazo"] < agora and i["codigo"] != "passagem"
        ] if data == plantao.turno_de() else []
        proximo = next((i["codigo"] for i in itens if not i["feito"] and not i["condicional"]), None)
        return Response({"data": data.isoformat(), "inicio": _local(inicio), "fim": _local(fim), "agora": _local(agora), "itens": itens, "pendencias_anteriores": pendencias, "proximo": proximo})

    def post(self, request):
        dados = request.data if isinstance(request.data, dict) else {}
        try:
            data = dt.date.fromisoformat(str(dados.get("data") or ""))
        except ValueError:
            return Response({"detail": "data deve ser AAAA-MM-DD"}, status=400)
        codigo = str(dados.get("codigo") or "")
        if codigo not in {i["codigo"] for i in plantao.itens_do_turno(data)}:
            return Response({"detail": "Item inexistente neste turno."}, status=400)
        if dados.get("feito", True):
            m, _ = ItemPlantao.objects.update_or_create(
                data=data, codigo=codigo,
                defaults={"feito_por": _usuario(request), "feito_em": timezone.now(), "observacao": str(dados.get("observacao") or "")[:300]},
            )
            return Response({"codigo": codigo, "feito": {"por": m.feito_por, "em": _local(m.feito_em), "observacao": m.observacao}})
        ItemPlantao.objects.filter(data=data, codigo=codigo).delete()
        return Response({"codigo": codigo, "feito": None})


# ------------------------------------------------------------------ livro de ocorrências

def _registro_dict(o: OcorrenciaPlantao | None) -> dict | None:
    if not o:
        return None
    return {
        "plantao": o.plantao, "operador": o.operador, "tecnico_encerra": o.tecnico_encerra, "hora_encerra": o.hora_encerra,
        "tecnico_inicia": o.tecnico_inicia, "hora_inicia": o.hora_inicia, "ocorrencias": o.ocorrencias, "texto": o.texto,
        "atualizado_por": o.atualizado_por, "atualizado_em": _local(o.atualizado_em),
    }


def _automatico(inicio: dt.datetime, fim: dt.datetime) -> dict:
    """O que o painel já sabe do turno: informativos e avisos enviados e os envios da Idap (para não digitar de novo)."""
    informativos = [
        {
            "numero": i.numero, "ano": i.ano, "enviado_em": _local(i.enviado_em),
            "regioes": [r.regiao for r in i.regioes.all() if r.chuva_atual or r.chuva_prevista],
        }
        for i in InformativoMeteorologico.objects.filter(estado="enviado", enviado_em__gte=inicio, enviado_em__lt=fim).order_by("enviado_em").prefetch_related("regioes")
    ]
    avisos = [
        {"numero": a.numero, "ano": a.ano, "emitido_em": _local(a.emitido_em), "regioes": a.regioes, "idap_municipios": a.idap_municipios, "idap_enviado_em": _local(a.idap_enviado_em)}
        for a in AvisoMeteorologico.objects.filter(estado="emitido", emitido_em__gte=inicio, emitido_em__lt=fim).order_by("emitido_em")
    ]
    idap = [
        {"numero": e.informativo.numero, "ano": e.informativo.ano, "canal": e.canal, "regioes": e.regioes, "enviado_em": _local(e.enviado_em)}
        for e in InformativoEnvio.objects.filter(tipo="idap", enviado_em__gte=inicio, enviado_em__lt=fim).select_related("informativo").order_by("enviado_em")
    ]
    return {"informativos": informativos, "avisos": avisos, "idap": idap}


class PlantaoLivroView(APIView):
    """`GET /api/plantao/livro/?data=AAAA-MM-DD`: o L.O. salvo do turno (ou None), o que o painel preencheu sozinho (informativos, avisos, Idap) e os
    destinatários do e-mail (configuração, não código). `POST` salva/atualiza o registro do turno."""

    def get(self, request):
        try:
            data = _turno_param(request)
        except ValueError:
            return Response({"detail": "data deve ser AAAA-MM-DD"}, status=400)
        inicio, fim = plantao.janela_do_turno(data)
        destinatarios = [l.strip() for l in ConfiguracaoPlantao.obter().destinatarios_lo.splitlines() if l.strip()]
        return Response(
            {
                "data": data.isoformat(), "inicio": _local(inicio), "fim": _local(fim), "registro": _registro_dict(OcorrenciaPlantao.objects.filter(data=data).first()),
                "automatico": _automatico(inicio, fim), "destinatarios": destinatarios,
            }
        )

    def post(self, request):
        dados = request.data if isinstance(request.data, dict) else {}
        try:
            data = dt.date.fromisoformat(str(dados.get("data") or ""))
        except ValueError:
            return Response({"detail": "data deve ser AAAA-MM-DD"}, status=400)
        linhas = [
            {"tipo": str(l.get("tipo") or "")[:40], "texto": str(l.get("texto") or "")[:1000]}
            for l in (dados.get("ocorrencias") or []) if isinstance(l, dict) and str(l.get("texto") or "").strip()
        ][:100]
        usuario = _usuario(request)
        o, criado = OcorrenciaPlantao.objects.get_or_create(data=data, defaults={"criado_por": usuario})
        for campo, limite in (("plantao", 60), ("operador", 120), ("tecnico_encerra", 120), ("hora_encerra", 5), ("tecnico_inicia", 120), ("hora_inicia", 5)):
            if campo in dados:
                setattr(o, campo, str(dados[campo] or "")[:limite])
        o.ocorrencias = linhas
        if "texto" in dados:
            o.texto = str(dados["texto"] or "")[:20000]
        o.atualizado_por = usuario
        o.save()
        return Response({"registro": _registro_dict(o), "criado": criado})


class PublicoAvisosView(APIView):
    """`GET /api/publico/avisos/` — sem login, só leitura: avisos meteorológicos emitidos e dentro da vigência agora (página pública e Modo TV).
    Não expõe rascunho, cancelado, dados do Idap nem histórico."""

    from rest_framework.permissions import AllowAny as _AllowAny

    permission_classes = [_AllowAny]
    authentication_classes: list = []

    def get(self, request):
        from core.sistemas_atuantes import CATALOGO

        rotulo = {c["id"]: c["rotulo"] for c in CATALOGO}
        agora = timezone.now()
        qs = AvisoMeteorologico.objects.filter(estado="emitido", vigencia_inicio__lte=agora, vigencia_fim__gte=agora).order_by("-vigencia_inicio", "-numero")
        return Response({"avisos": [
            {
                "numero": a.numero, "ano": a.ano, "vigencia_inicio": _local(a.vigencia_inicio), "vigencia_fim": _local(a.vigencia_fim), "regioes": a.regioes,
                "sistemas": [rotulo.get(x, x) for x in a.sistemas], "icones": a.icones, "texto": a.texto, "emitido_em": _local(a.emitido_em),
            }
            for a in qs[:10]
        ]})
