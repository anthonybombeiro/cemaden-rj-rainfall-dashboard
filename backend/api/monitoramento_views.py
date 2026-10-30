"""Níveis de Monitoramento (NM 0 a NM 5) do PLANCON 2026/2027: painel interno e versão pública.

Interno (login): níveis vigentes, lançamento com as regras do PLANCON, histórico e sugestões (o que pede inserção humana). Público (sem login, só leitura): `PublicoMonitoramentoView`, para municípios e órgãos de defesa civil verem o nível vigente e
os mapas de risco. Regras e dados de apoio: core/niveis_monitoramento.py; documentação: docs/nivel-monitoramento-plancon.md."""

from __future__ import annotations

import datetime as dt
import uuid

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import ConfiguracaoNm, NivelMonitoramento, NivelMonitoramentoRegistro, RecomendacaoAlarme, RiskAlert
from core import nm_automatico
from core.municipios import MUNICIPIOS_CANONICOS, normalizar_para_canonico
from core.niveis_monitoramento import (
    ANTECEDENCIAS,
    EQUIPES,
    FERRAMENTAS,
    NIVEIS,
    PISO_POR_RISCO,
    VIGENCIA_MAX_H,
    municipios_redec,
    validar_registro,
)

COM_GRANULARIDADE_MUNICIPAL = nm_automatico.COM_GRANULARIDADE_MUNICIPAL
TIPOS_CHUVA = nm_automatico.TIPOS_CHUVA


def _niveis_vigentes() -> list[dict]:
    """Os 92 municípios com o NM vigente (sem linha = NM 0)."""
    agora = timezone.now()
    por_mun = {n.municipio: n for n in NivelMonitoramento.objects.all()}
    redec = municipios_redec()
    out = []
    for m in MUNICIPIOS_CANONICOS:
        n = por_mun.get(m)
        r = redec.get(m, {})
        nivel = n.nivel if n else 0
        out.append(
            {
                "municipio": m,
                "redec": r.get("redec"),
                "regiao": r.get("regiao", ""),
                "autonomo_dca": bool(r.get("autonomo_dca")),
                "nivel": nivel,
                "vigencia_ate": n.vigencia_ate if n else None,
                "vencida": bool(n and nivel >= 2 and n.vigencia_ate and n.vigencia_ate < agora),
                "atualizado_em": n.atualizado_em if n else None,
                "origem": n.origem if n else "",
            }
        )
    return out


def _resumo(niveis: list[dict]) -> dict:
    cont = {str(k): 0 for k in NIVEIS}
    for n in niveis:
        cont[str(n["nivel"])] += 1
    return cont


def _parse_dt(valor):
    if not valor:
        return None
    d = parse_datetime(str(valor))
    if d is not None and timezone.is_naive(d):
        d = timezone.make_aware(d, timezone.get_current_timezone())
    return d


class NiveisMonitoramentoView(APIView):
    """GET /api/monitoramento/niveis/ — NM vigente dos 92 municípios, resumo por nível e a escala (cores e regras)."""

    def get(self, request):
        niveis = _niveis_vigentes()
        return Response(
            {
                "gerado_em": timezone.now(),
                "niveis": niveis,
                "resumo": _resumo(niveis),
                "escala": {str(k): v for k, v in NIVEIS.items()},
                "equipes": EQUIPES,
                "antecedencias": ANTECEDENCIAS,
                "ferramentas": FERRAMENTAS,
                "vigencia_max_h": VIGENCIA_MAX_H,
            }
        )


class RegistrarNivelView(APIView):
    """POST /api/monitoramento/registrar/ — lança o nível de um ou mais municípios (inserção humana, com as regras do PLANCON).

    Corpo: municipios[], nivel (0-5), equipe (met|hid|geo), antecedencia (mais_2h|ate_2h|em_curso), area_delimitada, populacao_exposta,
    motivo, ferramentas[], vigencia_horas (1-24; padrão 24 para NM 2+), aprovado_por, comdec_avisada_em, redec_avisada_em (ISO),
    aviso_simultaneo, aviso_motivo, encerramento. Erros de regra voltam em `erros` (HTTP 400)."""

    def post(self, request):
        b = request.data or {}
        erros: list[str] = []
        nomes = b.get("municipios") or []
        if not isinstance(nomes, list) or not nomes:
            return Response({"erros": ["Escolha ao menos um município."]}, status=400)
        municipios, invalidos = [], []
        for nome in nomes:
            canon = normalizar_para_canonico(str(nome))
            (municipios if canon else invalidos).append(canon or str(nome))
        municipios = sorted(set(municipios))
        if invalidos:
            erros.append(f"Município inválido: {', '.join(invalidos)}.")
        try:
            nivel = int(b.get("nivel"))
            if nivel not in NIVEIS:
                raise ValueError
        except (TypeError, ValueError):
            return Response({"erros": ["nivel deve ser um inteiro de 0 a 5."]}, status=400)
        equipe = b.get("equipe") or ""
        if equipe and equipe not in EQUIPES:
            erros.append("equipe deve ser met, hid ou geo.")
        antecedencia = b.get("antecedencia") or ""
        if antecedencia and antecedencia not in ANTECEDENCIAS:
            erros.append("antecedencia deve ser mais_2h, ate_2h ou em_curso.")
        ferramentas = [f for f in (b.get("ferramentas") or []) if f in FERRAMENTAS]
        dados = {
            "nivel": nivel,
            "equipe": equipe,
            "antecedencia": antecedencia,
            "area_delimitada": bool(b.get("area_delimitada")),
            "populacao_exposta": bool(b.get("populacao_exposta")),
            "motivo": str(b.get("motivo") or "").strip(),
            "ferramentas": ferramentas,
            "aprovado_por": str(b.get("aprovado_por") or "").strip(),
            "comdec_avisada_em": _parse_dt(b.get("comdec_avisada_em")),
            "redec_avisada_em": _parse_dt(b.get("redec_avisada_em")),
            "aviso_simultaneo": bool(b.get("aviso_simultaneo")),
            "aviso_motivo": str(b.get("aviso_motivo") or "").strip(),
        }
        erros += validar_registro(dados)
        agora = timezone.now()
        vigencia = None
        if nivel >= 2:
            try:
                horas = float(b.get("vigencia_horas") or VIGENCIA_MAX_H)
            except (TypeError, ValueError):
                horas = -1
            if not 0 < horas <= VIGENCIA_MAX_H:
                erros.append(f"A vigência deve ser de 1 a {VIGENCIA_MAX_H} horas.")
            else:
                vigencia = agora + dt.timedelta(hours=horas)
        if erros:
            return Response({"erros": erros}, status=400)

        usuario = (request.user.get_full_name() or request.user.get_username()).strip()
        lote = str(uuid.uuid4())
        with transaction.atomic():
            atuais = {n.municipio: n for n in NivelMonitoramento.objects.select_for_update().filter(municipio__in=municipios)}
            for m in municipios:
                atual = atuais.get(m)
                reg = NivelMonitoramentoRegistro.objects.create(
                    municipio=m,
                    nivel=nivel,
                    nivel_anterior=atual.nivel if atual else 0,
                    equipe=dados["equipe"],
                    antecedencia=dados["antecedencia"],
                    area_delimitada=dados["area_delimitada"],
                    populacao_exposta=dados["populacao_exposta"],
                    motivo=dados["motivo"],
                    ferramentas=", ".join(ferramentas),
                    vigencia_ate=vigencia,
                    aprovado_por=dados["aprovado_por"],
                    comdec_avisada_em=dados["comdec_avisada_em"],
                    redec_avisada_em=dados["redec_avisada_em"],
                    aviso_simultaneo=dados["aviso_simultaneo"],
                    aviso_motivo=dados["aviso_motivo"],
                    encerramento=bool(b.get("encerramento")) and nivel <= 1,
                    lote=lote,
                    registrado_por=usuario,
                )
                NivelMonitoramento.objects.update_or_create(municipio=m, defaults={"nivel": nivel, "vigencia_ate": vigencia, "registro": reg})
        return Response({"registrados": len(municipios), "lote": lote, "nivel": nivel, "municipios": municipios}, status=201)


def _serializa_registro(r: NivelMonitoramentoRegistro) -> dict:
    return {
        "id": r.id,
        "municipio": r.municipio,
        "regiao": municipios_redec().get(r.municipio, {}).get("regiao", ""),
        "nivel": r.nivel,
        "nivel_anterior": r.nivel_anterior,
        "equipe": r.equipe,
        "antecedencia": r.antecedencia,
        "area_delimitada": r.area_delimitada,
        "populacao_exposta": r.populacao_exposta,
        "motivo": r.motivo,
        "ferramentas": r.ferramentas,
        "vigencia_ate": r.vigencia_ate,
        "aprovado_por": r.aprovado_por,
        "comdec_avisada_em": r.comdec_avisada_em,
        "redec_avisada_em": r.redec_avisada_em,
        "aviso_simultaneo": r.aviso_simultaneo,
        "aviso_motivo": r.aviso_motivo,
        "encerramento": r.encerramento,
        "lote": r.lote,
        "origem": r.origem,
        "sinais": r.sinais,
        "registrado_por": r.registrado_por,
        "registrado_em": r.registrado_em,
    }


class RegistrosNivelView(APIView):
    """GET /api/monitoramento/registros/?municipio=&nivel=&horas=&limit= — histórico de lançamentos (mais recentes primeiro)."""

    def get(self, request):
        p = request.query_params
        qs = NivelMonitoramentoRegistro.objects.all()
        if v := p.get("municipio"):
            qs = qs.filter(municipio=normalizar_para_canonico(v) or v)
        if v := p.get("nivel"):
            qs = qs.filter(nivel=v)
        if v := p.get("horas"):
            try:
                qs = qs.filter(registrado_em__gte=timezone.now() - dt.timedelta(hours=float(v)))
            except ValueError:
                pass
        try:
            limite = min(int(p.get("limit") or 100), 500)
        except ValueError:
            limite = 100
        return Response([_serializa_registro(r) for r in qs[:limite]])


def _sugestoes_do_informativo(niveis: dict[str, dict], agora: dt.datetime) -> list[dict]:
    """Sugestões de NM vindas do informativo meteorológico vigente (enviado e dentro das 6 h); NM 3 só aparece marcado como "a pedido da meteorologia"."""
    from core import informativo_apoio as apoio
    from core.models import InformativoMeteorologico

    i = InformativoMeteorologico.objects.filter(estado="enviado", importado=False).order_by("-enviado_em").first()
    if i is None or i.enviado_em is None or agora - i.enviado_em > dt.timedelta(hours=6):
        return []
    itens = [{"regiao": r.regiao, "chuva_atual": r.chuva_atual, "chuva_prevista": r.chuva_prevista, "vento_previsto": r.vento_previsto, "raios": r.raios, "granizo": r.granizo} for r in i.regioes.all()]
    out = []
    for s in apoio.sugestoes_nm(itens, i.numero, i.ano, niveis):
        a_pedido = " NM 3 só a pedido da meteorologia." if s["so_a_pedido"] else ""
        out.append({"municipio": s["municipio"], "regiao": s["regiao"], "tipo": "informativo", "atual": s["atual"], "sugerido": s["sugerido"], "fontes": [s["fonte"]],
                    "orientacao": f"Previsão do informativo nº {i.numero}/{i.ano} para a REDEC.{a_pedido} Sugestão apenas: confirme com a meteorologia; NM 4 exige gatilho, impacto em até 2 h e área delimitada."})
    return out


class SugestoesNivelView(APIView):
    """GET /api/monitoramento/sugestoes/ — onde o nível vigente parece defasado e pede lançamento humano:
    (1) risco técnico (hidrológico, geológico, meteorológico) acima do NM vigente; (2) recomendação de mobilização de sirene hoje (NM 4
    a avaliar); (3) vigência vencida. A decisão é sempre do plantonista."""

    def get(self, request):
        niveis = {n["municipio"]: n for n in _niveis_vigentes()}
        agora = timezone.now()
        out: list[dict] = []
        riscos = nm_automatico.riscos_por_municipio()  # município -> fontes de risco
        for m, fontes in riscos.items():
            piso = max(f["piso"] for f in fontes)
            atual = niveis[m]["nivel"]
            if piso > atual and piso >= 2:
                out_item = {"municipio": m, "regiao": niveis[m]["regiao"], "tipo": "risco_tecnico", "atual": atual, "sugerido": piso, "fontes": [f for f in fontes if f["piso"] == piso],
                            "orientacao": "Risco técnico acima do nível vigente. Previsão com mais de 2 h fica no máximo em NM 3; NM 4 exige gatilho atingido/fenômeno detectado, até 2 h e área delimitada."}
                out.append(out_item)
        for m, fontes in nm_automatico.cotas_por_municipio(agora).items():
            piso = max(f["piso"] for f in fontes)
            atual = niveis.get(m, {}).get("nivel", 0)
            if piso > atual and piso >= 2:
                out.append({"municipio": m, "regiao": niveis[m]["regiao"], "tipo": "cota_hidrologica", "atual": atual, "sugerido": piso, "fontes": [f for f in fontes if f["piso"] == piso],
                            "orientacao": "Nível do rio passou da cota de alerta/transbordo (leitura das últimas 3 h). Confira a tendência e o INEA antes de lançar; NM 4 só com gatilho atingido, impacto em até 2 h e área delimitada."})
        out.extend(_sugestoes_do_informativo(niveis, agora))
        hoje = timezone.localdate()
        for r in RecomendacaoAlarme.objects.filter(data=hoje):
            quando = timezone.make_aware(dt.datetime.combine(r.data, r.hora), timezone.get_current_timezone())
            if agora - quando > dt.timedelta(hours=6):
                continue
            if r.municipio in niveis and niveis[r.municipio]["nivel"] < 4:
                out.append({"municipio": r.municipio, "regiao": niveis[r.municipio]["regiao"], "tipo": "recomendacao_sirene", "atual": niveis[r.municipio]["nivel"], "sugerido": 4,
                            "fontes": [{"tipo": "recomendacao_sirene", "numero": r.numero, "hora": r.hora.strftime("%H:%M"), "probabilidade": r.probabilidade, "estacao": r.estacao}],
                            "orientacao": "Recomendação de mobilização de sirenes = NM 4 – Severo nas áreas das estações (PLANCON 2.5). Confirme impacto em até 2 h, polígono, aprovação e aviso à COMDEC/REDEC."})
        for m, n in niveis.items():
            if n["vencida"]:
                out.append({"municipio": m, "regiao": n["regiao"], "tipo": "vigencia_vencida", "atual": n["nivel"], "sugerido": None, "fontes": [{"tipo": "vigencia", "vigencia_ate": n["vigencia_ate"]}],
                            "orientacao": "Vigência vencida: atualize o alerta (CAP) ou registre o retorno à normalidade."})
        out.sort(key=lambda s: (-(s["sugerido"] if s["sugerido"] is not None else 9), s["municipio"]))
        return Response({"gerado_em": agora, "sugestoes": out})


class AutomacaoNmView(APIView):
    """GET /api/monitoramento/automatico/ — estado da automação do NM (ativa?, teto, última execução e resumo, quantos NM automáticos vigentes).
    POST — roda a sincronização agora (atalho do plantonista; respeita o interruptor, que fica no Admin)."""

    def get(self, request):
        cfg = ConfiguracaoNm.obter()
        automaticos = NivelMonitoramento.objects.filter(origem="automatico", nivel__gte=1)
        return Response(
            {
                "ativo": cfg.ativo,
                "nivel_maximo_auto": cfg.nivel_maximo_auto,
                "ultima_execucao": cfg.ultima_execucao,
                "ultimo_resumo": cfg.ultimo_resumo,
                "vigentes_automaticos": {str(n): automaticos.filter(nivel=n).count() for n in (1, 2, 3)},
                "regras": {
                    "renovar_quando_restam_h": nm_automatico.RENOVAR_QUANDO_RESTAM_H,
                    "histerese_baixar_h": nm_automatico.HISTERESE_BAIXAR_H,
                    "bloqueio_humano_nm01_h": nm_automatico.BLOQUEIO_HUMANO_NM01_H,
                },
            }
        )

    def post(self, request):
        return Response(nm_automatico.sincronizar())


class PublicoMonitoramentoView(APIView):
    """GET /api/publico/monitoramento/ — SEM login, só leitura: nível vigente por município e mapas de risco, para as COMDECs e demais
    órgãos. Não expõe nomes de usuários, aprovações, telefones nem motivos internos."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        niveis = _niveis_vigentes()
        riscos = [
            {"id": a.id, "tipo": a.tipo, "redec": a.redec, "municipio": a.municipio, "risco": a.risco, "numero_externo": "", "responsavel": "", "criado_em": a.criado_em,
             "atualizado_em": a.atualizado_em, "fonte": a.fonte}
            for a in RiskAlert.objects.all()
        ]
        resposta = Response(
            {
                "gerado_em": timezone.now(),
                "niveis": [{k: n[k] for k in ("municipio", "redec", "regiao", "nivel", "vigencia_ate", "vencida", "atualizado_em", "origem")} for n in niveis],
                "resumo": _resumo(niveis),
                "escala": {str(k): {kk: vv for kk, vv in v.items() if kk in ("sigla", "nome", "cor", "alerta")} for k, v in NIVEIS.items()},
                "riscos": riscos,
            }
        )
        resposta["Cache-Control"] = "public, max-age=60"
        return resposta
