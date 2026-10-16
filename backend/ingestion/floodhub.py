"""
Sincronização com o Google Flood Hub (Flood Forecasting API) — 16/10/2026.

API: https://floodforecasting.googleapis.com/v1 (chave em `settings.FLOODHUB_API_KEY`, header `X-Goog-Api-Key`).
Dados sob CC BY 4.0 (citar o Google). Documentação: https://developers.google.com/flood-forecasting

Fluxo de `sync()` (idempotente; pensado para rodar a cada 30 min–1 h):
1. `floodStatus:searchLatestFloodStatusByArea` num retângulo que cobre o RJ → severidade e tendência de cada posto;
2. metadados dos postos (`gauges:searchGaugesByArea`) e limiares (`gaugeModels:batchGet`), 1x por dia ou sob demanda;
3. previsões (`gauges:queryGaugeForecasts`) dos postos com modelo que interessam;
4. casamento com a estação hidrológica nossa mais próxima (≤ 3 km) e histórico diário da situação.

Mantemos os postos DENTRO do RJ mais os "quality verified" do entorno (ex.: ANA de Cataguases/MG, a montante
no Paraíba do Sul). Postos virtuais `hybas_*` ainda sem verificação de qualidade são guardados mas a tela
mostra, por padrão, só os verificados (a decisão de uso operacional é do CEMADEN-RJ).
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import math
from pathlib import Path

import requests
from django.conf import settings
from django.utils import timezone

from core.models import FloodHubForecast, FloodHubGauge, FloodHubSituacao, Station
from core.municipios import canonico_ou_original

logger = logging.getLogger("ingestion")

BASE = "https://floodforecasting.googleapis.com/v1/"
# Retângulo que cobre o estado do RJ (um pouco além, para pegar postos a montante).
LOOP = {
    "vertices": [
        {"latitude": -20.6, "longitude": -45.2},
        {"latitude": -20.6, "longitude": -40.8},
        {"latitude": -23.5, "longitude": -40.8},
        {"latitude": -23.5, "longitude": -45.2},
    ]
}
RAIO_CASAMENTO_KM = 3.0
METADADOS_VALIDADE_H = 24
TIMEOUT = 40
GEOJSON = Path(__file__).resolve().parent / "data" / "rj_municipios.geojson"
ORDEM_SEVERIDADE = {"UNKNOWN": 0, "SEVERITY_UNSPECIFIED": 0, "NO_FLOODING": 1, "ABOVE_NORMAL": 2, "SEVERE": 3, "EXTREME": 4}

_poligonos: list[tuple[str, list]] | None = None


def _headers() -> dict:
    chave = getattr(settings, "FLOODHUB_API_KEY", "")
    if not chave:
        raise RuntimeError("FLOODHUB_API_KEY não configurada.")
    return {"X-Goog-Api-Key": chave, "Content-Type": "application/json"}


def _parse_dt(txt):
    if not txt:
        return None
    return dt.datetime.fromisoformat(txt.replace("Z", "+00:00"))


def _municipio(lat: float, lon: float) -> str:
    """Município do RJ que contém o ponto (vazio se fora do estado)."""
    global _poligonos
    if _poligonos is None:
        geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
        _poligonos = []
        for f in geo["features"]:
            g = f["geometry"]
            partes = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
            for p in partes:
                _poligonos.append((f["properties"]["nome"], p[0]))
    for nome, anel in _poligonos:
        dentro = False
        j = len(anel) - 1
        for i in range(len(anel)):
            xi, yi = anel[i]
            xj, yj = anel[j]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                dentro = not dentro
            j = i
        if dentro:
            return nome
    return ""


def _km(lat1, lon1, lat2, lon2) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


def _post_paginado(caminho: str, corpo: dict, chave: str) -> list:
    saida: list = []
    token = None
    for _ in range(20):
        b = dict(corpo, pageSize=500)
        if token:
            b["pageToken"] = token
        r = requests.post(BASE + caminho, headers=_headers(), json=b, timeout=TIMEOUT)
        r.raise_for_status()
        d = r.json()
        saida += d.get(chave, [])
        token = d.get("nextPageToken")
        if not token:
            break
    return saida


def _em_lotes(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def classificar_vazao(valor: float | None, g: FloodHubGauge) -> str | None:
    """Severidade da vazão prevista contra os limiares do posto (mesma escala do Flood Hub)."""
    if valor is None:
        return None
    if g.extreme is not None and valor >= g.extreme:
        return "EXTREME"
    if g.danger is not None and valor >= g.danger:
        return "SEVERE"
    if g.warning is not None and valor >= g.warning:
        return "ABOVE_NORMAL"
    return "NO_FLOODING"


def _atualizar_metadados(resumo: dict) -> None:
    postos = _post_paginado(
        "gauges:searchGaugesByArea",
        {"loop": LOOP, "includeNonQualityVerified": True, "includeGaugesWithoutHydroModel": True},
        "gauges",
    )
    agora = timezone.now()
    mantidos = []
    for x in postos:
        lat, lon = x["location"]["latitude"], x["location"]["longitude"]
        mun = _municipio(lat, lon)
        if not mun and not x.get("qualityVerified"):
            continue  # fora do RJ e sem verificação: ignora
        mantidos.append(x["gaugeId"])
        FloodHubGauge.objects.update_or_create(
            gauge_id=x["gaugeId"],
            defaults={
                "source": x.get("source", ""),
                "site_name": x.get("siteName", ""),
                "river": x.get("river", ""),
                "latitude": lat,
                "longitude": lon,
                "municipio": canonico_ou_original(mun) if mun else "",
                "has_model": bool(x.get("hasModel")),
                "quality_verified": bool(x.get("qualityVerified")),
                "metadados_em": agora,
            },
        )
    resumo["postos_mantidos"] = len(mantidos)
    # limiares (só postos com modelo)
    com_modelo = list(FloodHubGauge.objects.filter(has_model=True).values_list("gauge_id", flat=True))
    for lote in _em_lotes(com_modelo, 40):
        r = requests.get(
            BASE + "gaugeModels:batchGet",
            headers=_headers(),
            params=[("names", f"gaugeModels/{g}") for g in lote],
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        for m in r.json().get("gaugeModels", []):
            th = m.get("thresholds") or {}
            FloodHubGauge.objects.filter(gauge_id=m["gaugeId"]).update(
                unit=m.get("gaugeValueUnit", ""),
                warning=th.get("warningLevel"),
                danger=th.get("dangerLevel"),
                extreme=th.get("extremeDangerLevel"),
            )
    # casamento com a estação hidrológica mais próxima
    candidatas = list(
        Station.objects.filter(cota__isnull=False)
        | Station.objects.filter(station_type=Station.StationType.HIDROLOGICA)
    )
    casados = 0
    for g in FloodHubGauge.objects.all():
        melhor, dist = None, None
        for s in candidatas:
            d = _km(g.latitude, g.longitude, s.latitude, s.longitude)
            if d <= RAIO_CASAMENTO_KM and (dist is None or d < dist):
                melhor, dist = s, d
        if (g.estacao_id, g.distancia_estacao_km) != (melhor.id if melhor else None, dist):
            g.estacao, g.distancia_estacao_km = melhor, dist
            g.save(update_fields=["estacao", "distancia_estacao_km"])
        casados += melhor is not None
    resumo["postos_casados_com_estacao"] = casados


def sync(forcar_metadados: bool = False) -> dict:
    """Atualiza situação, metadados, previsões e histórico. Devolve um resumo (para a ação admin)."""
    resumo: dict = {"erros": []}
    agora = timezone.now()
    try:
        ultimo = FloodHubGauge.objects.order_by("-metadados_em").values_list("metadados_em", flat=True).first()
        if forcar_metadados or ultimo is None or agora - ultimo > dt.timedelta(hours=METADADOS_VALIDADE_H):
            _atualizar_metadados(resumo)

        # 1) situação
        status = _post_paginado(
            "floodStatus:searchLatestFloodStatusByArea", {"loop": LOOP, "includeNonQualityVerified": True}, "floodStatuses"
        )
        por_id = {g.gauge_id: g for g in FloodHubGauge.objects.all()}
        atualizados = 0
        for s in status:
            g = por_id.get(s.get("gaugeId"))
            if g is None:
                continue
            emitido = _parse_dt(s.get("issuedTime"))
            tr = s.get("forecastTimeRange") or {}
            g.severity = s.get("severity", "")
            g.trend = s.get("forecastTrend") or ""
            g.status_emitido_em = emitido
            g.previsao_inicio = _parse_dt(tr.get("start"))
            g.previsao_fim = _parse_dt(tr.get("end"))
            g.save(update_fields=["severity", "trend", "status_emitido_em", "previsao_inicio", "previsao_fim", "atualizado_em"])
            atualizados += 1
            if emitido:
                sit, criada = FloodHubSituacao.objects.get_or_create(
                    gauge=g, dia=timezone.localtime(emitido).date(),
                    defaults={"severity": g.severity, "trend": g.trend, "emitido_em": emitido},
                )
                if not criada and sit.emitido_em < emitido:  # fica a última emissão do dia
                    sit.severity, sit.trend, sit.emitido_em = g.severity, g.trend, emitido
                    sit.save(update_fields=["severity", "trend", "emitido_em"])
        resumo["situacoes_atualizadas"] = atualizados

        # 2) previsões dos postos com modelo que interessam
        alvo = [
            g for g in FloodHubGauge.objects.filter(has_model=True)
            if g.quality_verified or g.estacao_id or ORDEM_SEVERIDADE.get(g.severity, 0) >= 2
        ]
        inicio = (agora - dt.timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        novas = 0
        for lote in _em_lotes([g.gauge_id for g in alvo], 40):
            r = requests.get(
                BASE + "gauges:queryGaugeForecasts",
                headers=_headers(),
                params=[("gaugeIds", i) for i in lote] + [("issuedTimeStart", inicio)],
                timeout=TIMEOUT,
            )
            r.raise_for_status()
            for gid, conj in (r.json().get("forecasts") or {}).items():
                g = por_id.get(gid)
                if g is None:
                    continue
                for f in conj.get("forecasts") or []:
                    emitida = _parse_dt(f.get("issuedTime"))
                    faixas = [
                        {"inicio": x.get("forecastStartTime"), "fim": x.get("forecastEndTime"), "valor": x.get("value")}
                        for x in f.get("forecastRanges") or []
                    ]
                    _, criado = FloodHubForecast.objects.get_or_create(gauge=g, emitida_em=emitida, defaults={"faixas": faixas})
                    novas += criado
        resumo["postos_com_previsao"] = len(alvo)
        resumo["previsoes_novas"] = novas
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha na sincronização com o Flood Hub")
        resumo["erros"].append(f"{type(exc).__name__}: {exc}")
    return resumo


def sync_se_vencido(minutos: int = 30) -> dict | None:
    """Roda `sync()` só se a última atualização tem mais de `minutos` min. Usado como carona nos jobs de
    ingestão que já rodam no cron (não há como criar cron novo pela API do cPanel); nunca levanta erro."""
    try:
        if not getattr(settings, "FLOODHUB_API_KEY", ""):
            return None
        ultimo = FloodHubGauge.objects.order_by("-atualizado_em").values_list("atualizado_em", flat=True).first()
        if ultimo is not None and timezone.now() - ultimo < dt.timedelta(minutes=minutos):
            return None
        return sync()
    except Exception:  # noqa: BLE001
        logger.exception("Falha ao sincronizar o Flood Hub (carona)")
        return None
