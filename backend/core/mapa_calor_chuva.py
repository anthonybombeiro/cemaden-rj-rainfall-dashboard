"""Mapa de calor da chuva acumulada (24/11/2026): acumulado dos últimos N dias (padrão 30) por município e por REDEC, com a nossa rede.

Pedido do usuário: usar só a rede existente no painel, SEM a rede Wunderground, e SEM os valores espúrios (outliers).

Fonte do número: soma das leituras `chuva_mm` (≥ 0) de cada estação na janela — a mesma conta da coluna "1 mês" da tabela de Precipitação.
Tira da conta (cada estação descartada recebe um motivo, listado no resultado):
  1. Wunderground (rede de terceiros, fora do pedido).
  2. Cobertura baixa: dias com leitura < 80% da janela (estação parada soma menos que choveu → falsa "seca").
  3. Valor físico impossível: alguma leitura > 100 mm num único intervalo, ou algum dia > 350 mm.
  4. Isolada e muito diferente dos vizinhos: mediana das estações boas até 25 km (mín. 3; senão as 5 mais próximas até 45 km) com
     v > 2,5 × mediana (e +120 mm) ou v < 0,25 × mediana (mediana ≥ 80 mm), SEM nenhuma estação de OUTRA rede a até 15 km com valor
     parecido (±40%) que a corrobore — estações da mesma rede concordando entre si não bastam (um erro de coleta se repete em todas);
     já duas redes independentes concordando é chuva de verdade (serra).
  5. Estação zerada (total 0) com vizinhos ≥ 80 mm.
Agregação: mediana das estações restantes em cada município (robusta); REDEC = mediana de todas as estações restantes dela.
Dias contados em UTC (a diferença de 3 h não muda cobertura nem o limite de 350 mm/dia de forma relevante)."""

from __future__ import annotations

import datetime as dt
import math
import statistics
import time

from django.db.models import Count, Max, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from core.models import Reading, Station
from core.municipios import canonico_ou_original, is_municipio_valido
from core.niveis_monitoramento import municipios_redec

FONTES_EXCLUIDAS = {"wunderground"}
COBERTURA_MIN = 0.80
LEITURA_MAX_MM = 100.0
DIA_MAX_MM = 350.0
RAIO_VIZ_KM, MIN_VIZ = 25.0, 3
RAIO_VIZ_AMPLO_KM, N_VIZ_AMPLO = 45.0, 5
RAIO_CORROBORA_KM = 15.0
_CACHE: dict = {}
CACHE_S = 1800


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    t = math.pi / 180
    dl, dn = (b[0] - a[0]) * t, (b[1] - a[1]) * t
    x = math.sin(dl / 2) ** 2 + math.cos(a[0] * t) * math.cos(b[0] * t) * math.sin(dn / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def classificar_outliers(estacoes: list[dict]) -> None:
    """Preenche `descartada` (motivo ou None) em cada item de `estacoes` (dicts com lat, lon, total, cobertura, max_leitura, max_dia).
    Cada item também traz `fonte`. Funciona em duas etapas: critérios individuais (2 e 3) e depois os espaciais (4 e 5), usando só as estações que passaram nas individuais."""
    for e in estacoes:
        e["descartada"] = None
        if e["cobertura"] < COBERTURA_MIN:
            e["descartada"] = f"cobertura {e['cobertura'] * 100:.0f}% (< {COBERTURA_MIN * 100:.0f}%)"
        elif e["max_leitura"] > LEITURA_MAX_MM:
            e["descartada"] = f"leitura única de {e['max_leitura']:.0f} mm"
        elif e["max_dia"] > DIA_MAX_MM:
            e["descartada"] = f"dia com {e['max_dia']:.0f} mm"
    boas = [e for e in estacoes if e["descartada"] is None]
    pos = [(e["lat"], e["lon"]) for e in boas]
    marcar: dict[int, str] = {}
    for i, e in enumerate(boas):
        dist = sorted(((_km(pos[i], pos[j]), j) for j in range(len(boas)) if j != i))
        viz = [j for d, j in dist if d <= RAIO_VIZ_KM]
        if len(viz) < MIN_VIZ:
            viz = [j for d, j in dist[:N_VIZ_AMPLO] if d <= RAIO_VIZ_AMPLO_KM]
        if len(viz) < MIN_VIZ:
            continue
        m = statistics.median(boas[j]["total"] for j in viz)
        v = e["total"]
        if v == 0 and m >= 80:
            marcar[i] = f"zerada com vizinhos em {m:.0f} mm ({len(viz)} est.)"
            continue
        alto = m >= 60 and v > 2.5 * m and v - m > 120
        baixo = m >= 80 and v < 0.25 * m
        if not (alto or baixo):
            continue
        corrobora = any(
            d <= RAIO_CORROBORA_KM and boas[j]["fonte"] != e["fonte"] and abs(boas[j]["total"] - v) <= 0.4 * v + 10 for d, j in dist
        )
        if not corrobora:
            marcar[i] = f"{'acima' if alto else 'abaixo'} dos vizinhos: {v:.0f} mm contra mediana {m:.0f} mm ({len(viz)} est.), sem estação próxima que confirme"
    for i, motivo in marcar.items():
        boas[i]["descartada"] = motivo


def _agregar(itens: list[dict]) -> dict:
    v = [e["total"] for e in itens]
    return {"mediana_mm": round(statistics.median(v), 1), "media_mm": round(statistics.fmean(v), 1), "min_mm": round(min(v), 1), "max_mm": round(max(v), 1), "n": len(v)}


def montar(dias: int = 30, agora: dt.datetime | None = None, usar_cache: bool = True) -> dict:
    agora = agora or timezone.now()
    chave = (dias, agora.strftime("%Y%m%d%H") if not usar_cache else "cache")
    if usar_cache and chave in _CACHE and time.time() - _CACHE[chave][0] < CACHE_S:
        return _CACHE[chave][1]
    ini = agora - dt.timedelta(days=dias)
    por_dia = (
        Reading.objects.filter(reading_type=Reading.ReadingType.CHUVA_MM, value__gte=0, timestamp__gte=ini, timestamp__lte=agora)
        .exclude(station__source__slug__in=FONTES_EXCLUIDAS)
        .annotate(dia=TruncDate("timestamp", tzinfo=dt.timezone.utc))
        .values("station_id", "dia")
        .annotate(soma=Sum("value"), n=Count("id"), maior=Max("value"))
    )
    acc: dict[int, dict] = {}
    for r in por_dia:
        a = acc.setdefault(r["station_id"], {"total": 0.0, "dias": 0, "max_leitura": 0.0, "max_dia": 0.0})
        a["total"] += r["soma"]
        a["dias"] += 1
        a["max_leitura"] = max(a["max_leitura"], r["maior"])
        a["max_dia"] = max(a["max_dia"], r["soma"])
    info = {s.id: s for s in Station.objects.filter(id__in=list(acc)).select_related("source")}
    redecs = municipios_redec()
    estacoes = []
    for sid, a in acc.items():
        s = info[sid]
        mun = canonico_ou_original(s.municipality or "")
        estacoes.append(
            {
                "id": sid,
                "name": s.name,
                "fonte": s.source.slug,
                "municipio": mun,
                "redec": (redecs.get(mun) or {}).get("redec"),
                "regiao": (redecs.get(mun) or {}).get("regiao", ""),
                "lat": s.latitude,
                "lon": s.longitude,
                "total": round(a["total"], 1),
                "cobertura": min(1.0, a["dias"] / dias),
                "max_leitura": a["max_leitura"],
                "max_dia": round(a["max_dia"], 1),
            }
        )
    classificar_outliers(estacoes)
    boas = [e for e in estacoes if e["descartada"] is None]
    por_mun: dict[str, list[dict]] = {}
    por_redec: dict[int, list[dict]] = {}
    for e in boas:
        if not is_municipio_valido(e["municipio"]):
            continue  # estação sem município (ou fora dos 92): fica fora do mapa por município
        por_mun.setdefault(e["municipio"], []).append(e)
        if e["redec"]:
            por_redec.setdefault(e["redec"], []).append(e)
    municipios = [
        {"municipio": m, "redec": (redecs.get(m) or {}).get("redec"), "regiao": (redecs.get(m) or {}).get("regiao", ""), **_agregar(l)}
        for m, l in sorted(por_mun.items())
    ]
    nomes_redec = {}
    for info_m in redecs.values():
        nomes_redec[info_m["redec"]] = info_m["regiao"]
    redecs_out = [{"redec": r, "regiao": nomes_redec.get(r, ""), **_agregar(l)} for r, l in sorted(por_redec.items())]
    resultado = {
        "gerado_em": agora.isoformat(),
        "dias": dias,
        "inicio": ini.isoformat(),
        "excluidas_fontes": sorted(FONTES_EXCLUIDAS),
        "estacoes_total": len(estacoes),
        "estacoes_usadas": len(boas),
        "municipios": municipios,
        "redecs": redecs_out,
        "descartadas": [
            {k: e[k] for k in ("id", "name", "fonte", "municipio", "total", "cobertura", "descartada")}
            for e in sorted(estacoes, key=lambda x: x["municipio"])
            if e["descartada"]
        ],
    }
    if usar_cache:
        _CACHE[chave] = (time.time(), resultado)
    return resultado
