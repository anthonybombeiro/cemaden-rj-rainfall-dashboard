"""Endpoints do Google Flood Hub (16/10/2026) — dados de `ingestion/floodhub.py`.

GET /api/floodhub/            postos (padrão: só "quality verified"; `?todos=1` inclui os demais; `?estacao=<id>`)
GET /api/floodhub/validacao/  previsão (severidade) × observado (classe da cota) por dia, nas estações casadas
"""

from __future__ import annotations

import datetime as dt
from collections import defaultdict

from django.db.models import Max
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import FloodHubEvento, FloodHubForecast, FloodHubGauge, FloodHubSituacao, Reading
from ingestion.floodhub import ORDEM_SEVERIDADE, classificar_vazao

ROTULO = {
    "EXTREME": "Extremo",
    "SEVERE": "Severo",
    "ABOVE_NORMAL": "Acima do normal",
    "NO_FLOODING": "Sem cheia",
    "UNKNOWN": "Desconhecido",
}
# classe da cota nossa -> equivalente na escala do Flood Hub (para comparar)
COTA_PARA_FH = {
    "normal": "NO_FLOODING",
    "atencao": "ABOVE_NORMAL",
    "alerta": "SEVERE",
    "transbordo": "SEVERE",
    "extrema": "EXTREME",
}


def _resumo_previsao(g: FloodHubGauge, previsao):
    if previsao is None:
        return None
    faixas = previsao.faixas or []
    valores = [f["valor"] for f in faixas if f.get("valor") is not None]
    pico = max(valores) if valores else None
    pico_faixa = next((f for f in faixas if f.get("valor") == pico), None) if pico is not None else None
    return {
        "emitida_em": previsao.emitida_em,
        "faixas": faixas,
        "pico": pico,
        "pico_em": pico_faixa["inicio"] if pico_faixa else None,
        "severidade_prevista": classificar_vazao(pico, g),
    }


def _observados(gauges) -> dict:
    """Nível que NÓS lemos na estação casada (últimas 72 h, 1 ponto por hora, em cm), tendência de 6 h e classe da cota.
    Serve para os postos ANA, que no Google não têm previsão (só a situação), e como contraste nos demais."""
    estacoes = {g.estacao_id: g.estacao for g in gauges if g.estacao_id}
    if not estacoes:
        return {}
    desde = timezone.now() - dt.timedelta(hours=72)
    pontos = defaultdict(list)
    for sid, ts, v in (
        Reading.objects.filter(station_id__in=list(estacoes), reading_type="nivel_m", timestamp__gte=desde)
        .order_by("timestamp")
        .values_list("station_id", "timestamp", "value")
    ):
        pontos[sid].append((ts, v * 100))  # m -> cm
    saida = {}
    for sid, pts in pontos.items():
        horas = {}
        for ts, v in pts:
            horas[ts.replace(minute=0, second=0, microsecond=0)] = v
        ultimo_ts, ultimo = pts[-1]
        ref = next((v for ts, v in reversed(pts) if ts <= ultimo_ts - dt.timedelta(hours=6)), None)
        delta = None if ref is None else round(ultimo - ref, 1)
        tend = None if delta is None else ("RISE" if delta >= 5 else "FALL" if delta <= -5 else "NO_CHANGE")
        cota = getattr(estacoes[sid], "cota", None)
        saida[sid] = {
            "nivel_cm": round(ultimo, 1),
            "em": ultimo_ts,
            "variacao_6h_cm": delta,
            "tendencia": tend,
            "classe_cota": cota.classificar(ultimo) if cota else None,
            "cotas_cm": (
                {"atencao": cota.atencao_cm, "alerta": cota.alerta_cm, "inundacao": cota.inundacao_cm, "extrema": cota.extrema_calculada_cm}
                if cota
                else None
            ),
            "serie": [[k.isoformat(), round(v, 1)] for k, v in sorted(horas.items())],
        }
    return saida


def serializar(g: FloodHubGauge, previsao, observados=None) -> dict:
    return {
        "gauge_id": g.gauge_id,
        "fonte": g.source,
        "nome": g.site_name or g.river or (f"Ponto de rio ({g.municipio})" if g.municipio else g.gauge_id),
        "rio": g.river or (g.estacao.rio_monitorado if g.estacao_id else ""),
        "municipio": g.municipio,
        "latitude": g.latitude,
        "longitude": g.longitude,
        "tem_modelo": g.has_model,
        "verificado": g.quality_verified,
        "unidade": g.unit,
        "limiares": {"atencao": g.warning, "perigo": g.danger, "extremo": g.extreme},
        "severidade": g.severity or None,
        "severidade_rotulo": ROTULO.get(g.severity, g.severity or None),
        "tendencia": g.trend or None,
        "emitido_em": g.status_emitido_em,
        "previsao_inicio": g.previsao_inicio,
        "previsao_fim": g.previsao_fim,
        "estacao": (
            {"id": g.estacao_id, "nome": g.estacao.name, "distancia_km": round(g.distancia_estacao_km or 0, 2)}
            if g.estacao_id
            else None
        ),
        "previsao": _resumo_previsao(g, previsao),
        "observado": (observados or {}).get(g.estacao_id) if g.estacao_id else None,
    }


def _nivel(x: dict) -> int:
    sev = ORDEM_SEVERIDADE.get(x["severidade"] or "", 0)
    prev = ORDEM_SEVERIDADE.get((x["previsao"] or {}).get("severidade_prevista") or "", 0)
    return max(sev, prev)


class FloodHubView(APIView):
    def get(self, request):
        qs = FloodHubGauge.objects.select_related("estacao", "estacao__cota")
        if request.query_params.get("estacao"):
            qs = qs.filter(estacao_id=request.query_params["estacao"])
        elif request.query_params.get("todos") != "1":
            qs = qs.filter(quality_verified=True)
        gauges = list(qs)
        ultimas: dict = {}
        for f in FloodHubForecast.objects.filter(gauge__in=gauges).order_by("gauge_id", "-emitida_em"):
            ultimas.setdefault(f.gauge_id, f)
        observados = _observados(gauges)
        itens = [serializar(g, ultimas.get(g.id), observados) for g in gauges]
        itens.sort(key=lambda x: (-_nivel(x), x["municipio"], x["nome"]))

        # alerta informativo: posto verificado com situação ou previsão acima do normal (não aciona sirene)
        alertas = [x for x in itens if x["verificado"] and _nivel(x) >= 2]
        return Response(
            {
                "atualizado_em": FloodHubGauge.objects.aggregate(m=Max("atualizado_em"))["m"],
                "total": len(itens),
                "total_nao_verificados": FloodHubGauge.objects.filter(quality_verified=False).count(),
                "alertas": alertas,
                "postos": itens,
                "atribuicao": "Dados: Google Flood Hub (Flood Forecasting API), CC BY 4.0.",
            }
        )


class FloodHubValidacaoView(APIView):
    """Compara, por dia e por estação casada, a severidade do Flood Hub com a classe da cota observada."""

    def get(self, request):
        try:
            dias = max(1, min(int(request.query_params.get("dias", 14)), 60))
        except ValueError:
            dias = 14
        hoje = timezone.localdate()
        desde = hoje - dt.timedelta(days=dias - 1)
        inicio = timezone.make_aware(dt.datetime.combine(desde, dt.time.min))
        casados = list(FloodHubGauge.objects.filter(estacao__isnull=False).select_related("estacao", "estacao__cota"))
        linhas = []
        for g in casados:
            cota = getattr(g.estacao, "cota", None)
            niveis: dict = {}
            for ts, v in Reading.objects.filter(
                station=g.estacao, reading_type="nivel_m", timestamp__gte=inicio
            ).values_list("timestamp", "value"):
                d = timezone.localtime(ts).date()
                niveis[d] = max(niveis.get(d, -1e9), v * 100)  # m -> cm
            sit = {s.dia: s for s in FloodHubSituacao.objects.filter(gauge=g, dia__gte=desde)}
            for n in range(dias):
                d = hoje - dt.timedelta(days=n)
                s, nv = sit.get(d), niveis.get(d)
                if s is None and nv is None:
                    continue
                classe = cota.classificar(nv) if cota and nv is not None else None
                esperado = COTA_PARA_FH.get(classe)
                resultado = None
                if s and esperado:
                    a, b = ORDEM_SEVERIDADE.get(s.severity, 0), ORDEM_SEVERIDADE.get(esperado, 0)
                    resultado = "Confere" if a == b else ("Flood Hub acima" if a > b else "Flood Hub abaixo")
                linhas.append(
                    {
                        "dia": d,
                        "gauge_id": g.gauge_id,
                        "posto": g.site_name or g.river or g.gauge_id,
                        "estacao_id": g.estacao_id,
                        "estacao": g.estacao.name,
                        "distancia_km": round(g.distancia_estacao_km or 0, 1),
                        "municipio": g.municipio,
                        "verificado": g.quality_verified,
                        "floodhub": s.severity if s else None,
                        "floodhub_rotulo": ROTULO.get(s.severity) if s else None,
                        "nivel_max_cm": None if nv is None else round(nv, 1),
                        "classe_cota": classe,
                        "resultado": resultado,
                    }
                )
        linhas.sort(key=lambda x: (x["dia"], x["estacao"]), reverse=True)
        return Response({"dias": dias, "estacoes_casadas": len(casados), "linhas": linhas})


class FloodHubEventosView(APIView):
    """GET /api/floodhub/eventos/ — eventos ativos do Flood Hub que tocam o RJ (polígonos em GeoJSON).
    `significativo` = inundação significativa (vários postos, vários dias); `flash` = chuva repentina, com duas áreas:
    `provavel` e `muito_provavel` (probabilidade nas próximas `periodo_horas`)."""

    def get(self, request):
        ativos = FloodHubEvento.objects.filter(ativo=True)
        eventos = []
        for e in ativos.filter(afeta_rj=True):
            if e.tipo == "flash":
                feicoes = (e.geojson or {}).get("feicoes") or []
            else:
                feicoes = [{"nivel": "significativo", "geometry": e.geojson}] if e.geojson else []
            eventos.append(
                {
                    "id": e.id,
                    "tipo": e.tipo,
                    "inicio": e.inicio,
                    "fim": e.fim,
                    "emitido_em": e.emitido_em,
                    "periodo_horas": e.periodo_horas,
                    "area_km2": e.area_km2,
                    "populacao": e.populacao,
                    "postos": len(e.gauge_ids or []),
                    "feicoes": feicoes,
                }
            )
        return Response(
            {
                "consultado_em": FloodHubEvento.objects.aggregate(m=Max("visto_em"))["m"],
                "total_brasil": ativos.count(),
                "no_rj": eventos,
                "atribuicao": "Dados: Google Flood Hub (Flood Forecasting API), CC BY 4.0.",
            }
        )
