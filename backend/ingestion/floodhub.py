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

from core.models import FloodHubEvento, FloodHubForecast, FloodHubGauge, FloodHubSituacao, Station
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
RAIO_CASAMENTO_KM = 3.0  # posto virtual (hybas): estação nossa a até 3 km
RAIO_MESMO_RIO_KM = 20.0  # posto ANA: estação nossa do MESMO RIO a até 20 km
# Rios que escoam para o RJ (afluentes do Paraíba do Sul e do Itabapoana). Postos ANA FORA do RJ só entram se
# estiverem nesses rios. Postos virtuais fora do RJ nunca entram: os verificados em 16/10/2026 ficavam todos em MG
# a oeste de -43,9° (bacia do Rio das Mortes/Rio Grande, que corre para o Paraná) e não contribuem para o RJ.
RIOS_QUE_ESCOAM_PARA_RJ = ("POMBA", "MURIAE", "CARANGOLA", "PARAIBA DO SUL", "PARAIBUNA", "PRETO", "PIABANHA", "ITABAPOANA", "DOIS RIOS")
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


def _req(metodo: str, url: str, tentativas: int = 3, **kw):
    """Chamada HTTP com repetição (a API do Google às vezes derruba a conexão: `RemoteDisconnected`)."""
    import time

    ultimo = None
    for i in range(tentativas):
        try:
            r = requests.request(metodo, url, timeout=TIMEOUT, **kw)
            if r.status_code >= 500:
                raise requests.HTTPError(f"HTTP {r.status_code}")
            return r
        except (requests.ConnectionError, requests.Timeout, requests.HTTPError) as exc:
            ultimo = exc
            time.sleep(1.5 * (i + 1))
    raise ultimo  # type: ignore[misc]


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


def _chave_rio(nome: str) -> str:
    import unicodedata

    sem = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode("ascii").upper()
    for pref in ("RIO ", "R. ", "CORREGO ", "CANAL "):
        if sem.startswith(pref):
            sem = sem[len(pref):]
    return sem.strip()


def _rio_relevante(rio: str) -> bool:
    k = _chave_rio(rio)
    return any(r in k for r in RIOS_QUE_ESCOAM_PARA_RJ)


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
        r = _req("POST", BASE + caminho, headers=_headers(), json=b)
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
        if not mun:
            # fora do RJ: só posto ANA verificado em rio que escoa para o RJ
            if not (x.get("source") == "ANA" and x.get("qualityVerified") and _rio_relevante(x.get("river", ""))):
                continue
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
    removidos, _ = FloodHubGauge.objects.exclude(gauge_id__in=mantidos).delete()
    resumo["postos_removidos"] = removidos
    # limiares (só postos com modelo)
    com_modelo = list(FloodHubGauge.objects.filter(has_model=True).values_list("gauge_id", flat=True))
    for lote in _em_lotes(com_modelo, 40):
        r = _req(
            "GET",
            BASE + "gaugeModels:batchGet",
            headers=_headers(),
            params=[("names", f"gaugeModels/{g}") for g in lote],
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
            if g.source == "ANA":
                # posto real da ANA: mesma régua/rio, até 20 km (ex.: Cardoso Moreira ↔ Italva, no Muriaé)
                ok = d <= RAIO_MESMO_RIO_KM and g.river and s.rio_monitorado and _chave_rio(g.river) == _chave_rio(s.rio_monitorado)
                ok = ok or d <= RAIO_CASAMENTO_KM
            else:
                ok = d <= RAIO_CASAMENTO_KM
            if ok and (dist is None or d < dist):
                melhor, dist = s, d
        if (g.estacao_id, g.distancia_estacao_km) != (melhor.id if melhor else None, dist):
            g.estacao, g.distancia_estacao_km = melhor, dist
            g.save(update_fields=["estacao", "distancia_estacao_km"])
        casados += melhor is not None
    resumo["postos_casados_com_estacao"] = casados


# --------------------------------------------------------------------------- eventos (polígonos)
CENTROIDES = Path(__file__).resolve().parent / "data" / "rj_municipios_centroides.json"
MAX_POLIGONOS_POR_RODADA = 60  # chamadas a serializedPolygons por sincronização
MAX_VERTICES = 2500  # acima disso o contorno é simplificado (guardar/trafegar polígonos gigantes pesa)


def kml_para_geojson(kml: str) -> dict | None:
    """KML (`serializedPolygons`) -> geometria GeoJSON (MultiPolygon, [lon, lat]). None se não houver polígono."""
    import xml.etree.ElementTree as ET

    ns = "{http://www.opengis.net/kml/2.2}"
    try:
        raiz = ET.fromstring(kml)
    except ET.ParseError:
        return None

    def anel(no) -> list[list[float]]:
        pts = []
        for tok in (no.text or "").split():
            partes = tok.split(",")
            if len(partes) >= 2:
                pts.append([round(float(partes[0]), 4), round(float(partes[1]), 4)])
        return pts

    poligonos = []
    for poly in raiz.iter(ns + "Polygon"):
        aneis = []
        for tag in ("outerBoundaryIs", "innerBoundaryIs"):
            for limite in poly.findall(ns + tag):
                for coords in limite.iter(ns + "coordinates"):
                    a = anel(coords)
                    if len(a) >= 4:
                        aneis.append(a)
        if aneis:
            poligonos.append(aneis)
    if not poligonos:
        return None
    total = sum(len(a) for pol in poligonos for a in pol)
    if total > MAX_VERTICES:  # simplifica por amostragem uniforme (mantém o primeiro e fecha o anel)
        passo = math.ceil(total / MAX_VERTICES)
        poligonos = [
            [(a[::passo] + [a[0]]) if (a[::passo][-1] != a[0]) else a[::passo] for a in pol] for pol in poligonos
        ]
    return {"type": "MultiPolygon", "coordinates": poligonos}


def _ponto_no_anel(lon: float, lat: float, anel: list) -> bool:
    dentro = False
    j = len(anel) - 1
    for i in range(len(anel)):
        xi, yi = anel[i]
        xj, yj = anel[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


def geometria_toca_rj(geom: dict) -> bool:
    """True se o contorno cobre algum município do RJ (centroide dentro do polígono) ou tem vértice dentro do RJ."""
    centros = json.loads(CENTROIDES.read_text(encoding="utf-8"))
    pontos = [(v[1], v[0]) for k, v in centros.items() if not k.isdigit()]  # (lon, lat)
    for pol in geom["coordinates"]:
        externo = pol[0]
        lons = [c[0] for c in externo]
        lats = [c[1] for c in externo]
        if max(lons) < -45.2 or min(lons) > -40.8 or max(lats) < -23.5 or min(lats) > -20.6:
            continue  # fora do retângulo do RJ
        buracos = pol[1:]
        for lon, lat in pontos:
            if _ponto_no_anel(lon, lat, externo) and not any(_ponto_no_anel(lon, lat, b) for b in buracos):
                return True
        passo = max(1, len(externo) // 200)
        if any(_municipio(c[1], c[0]) for c in externo[::passo]):
            return True
    return False


def _poligono(pid: str):
    r = _req("GET", BASE + f"serializedPolygons/{pid}", headers=_headers())
    r.raise_for_status()
    return kml_para_geojson(r.json().get("kml", ""))


def sincronizar_eventos(resumo: dict) -> None:
    """Eventos significativos e chuvas repentinas (flash flood) do Brasil; guarda o contorno só dos que tocam o RJ."""
    agora = timezone.now()
    vistos: set[int] = set()  # pks dos eventos que vieram na consulta
    consultas = 0

    sig = _post_paginado("significantEvents:search", {}, "significantEvents")
    for e in sig:
        if "BR" not in (e.get("affectedCountryCodes") or []):
            continue
        chave = e.get("eventPolygonId") or ""
        if not chave:
            continue
        ev, criado = FloodHubEvento.objects.get_or_create(tipo="significativo", chave=chave)
        vistos.add(ev.pk)
        iv = e.get("eventInterval") or {}
        ev.inicio = _parse_dt(iv.get("startTime"))
        ev.fim = _parse_dt(iv.get("endTime") or iv.get("minimumEndTime"))
        ev.area_km2, ev.populacao, ev.gauge_ids = e.get("areaKm2"), e.get("affectedPopulation"), e.get("gaugeIds") or []
        ev.ativo = True
        if criado or ev.geojson is None and not ev.afeta_rj:
            if consultas < MAX_POLIGONOS_POR_RODADA:
                consultas += 1
                geom = _poligono(chave)
                ev.afeta_rj = bool(geom and geometria_toca_rj(geom))
                ev.geojson = geom if ev.afeta_rj else None
        ev.save()

    flash = _post_paginado("flashFloods:search", {"countryCodes": ["BR"]}, "flashFloodEvents")
    for e in flash:
        chave = e.get("eventPolygonId") or ""
        if not chave:
            continue
        ev, criado = FloodHubEvento.objects.get_or_create(tipo="flash", chave=chave)
        vistos.add(ev.pk)
        ev.emitido_em = _parse_dt(e.get("forecastIssueTime"))
        ev.periodo_horas = e.get("forecastPeriodHours")
        ev.ativo = True
        if criado and consultas < MAX_POLIGONOS_POR_RODADA:
            consultas += 1
            geom = _poligono(chave)
            if geom and geometria_toca_rj(geom):
                ev.afeta_rj = True
                feicoes = []
                for nivel, campo in (("provavel", "likelyAffectedPolygonId"), ("muito_provavel", "highlyLikelyAffectedPolygonId")):
                    pid = e.get(campo)
                    g = _poligono(pid) if pid else None
                    if g:
                        feicoes.append({"nivel": nivel, "geometry": g})
                ev.geojson = {"feicoes": feicoes or [{"nivel": "provavel", "geometry": geom}]}
        ev.save()

    FloodHubEvento.objects.filter(ativo=True).exclude(pk__in=vistos).update(ativo=False)
    resumo["eventos_brasil"] = len(vistos)
    resumo["eventos_no_rj"] = FloodHubEvento.objects.filter(ativo=True, afeta_rj=True).count()


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
            r = _req(
                "GET",
                BASE + "gauges:queryGaugeForecasts",
                headers=_headers(),
                params=[("gaugeIds", i) for i in lote] + [("issuedTimeStart", inicio)],
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

        try:
            sincronizar_eventos(resumo)
        except Exception as exc:  # noqa: BLE001  (eventos não podem derrubar a sincronização dos postos)
            logger.exception("Falha ao sincronizar eventos do Flood Hub")
            resumo["erros"].append(f"eventos: {type(exc).__name__}: {exc}")
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
