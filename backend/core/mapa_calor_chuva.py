"""Mapa de calor da chuva acumulada por município e REDEC (24–25/11/2026): camada "Mapa de calor da chuva" da aba Mapa e imagens de relatório.

Períodos (horário de Brasília): últimos N dias (7, 15, 30… até 90, terminando agora), mês cheio (`mes=AAAA-MM`; o mês corrente vai até agora) ou data
específica (`ini` e, opcionalmente, `fim`, ambos inclusive; um dia só se `fim` faltar). Redes (`fontes`): qualquer subconjunto; por padrão todas MENOS a
Wunderground (rede de terceiros, a pedido do usuário). Número de cada estação = soma das leituras `chuva_mm` (≥ 0) no período, a mesma conta da coluna
"1 mês" da tabela de Precipitação.

Estação descartada (cada uma sai com o motivo, listado no resultado):
  Disponibilidade (sempre aplicada) — estações que não representam o período:
    · sem leitura nenhuma no período (parada/fora do ar);
    · cobertura baixa: períodos de 3+ dias → dias com leitura < 80%; períodos curtos (1–2 dias) → horas com leitura < 60% do tempo decorrido;
    · atrasada: última leitura do período mais de 48 h (3+ dias) ou 6 h (curto) antes do fim do período.
  Valores espúrios (`espurios`, ligado por padrão):
    · leitura única > 100 mm num intervalo; dia > 350 mm (3+ dias) ou hora > 150 mm (curto);
    · zerada com vizinhos chuvosos; isolada muito acima/abaixo da mediana dos vizinhos (≤ 25 km, mín. 3; senão as 5 mais próximas até 45 km) SEM uma
      estação de OUTRA rede, a até 15 km, com valor parecido (±40%) que a corrobore — redes diferentes concordando = chuva de verdade (serra).
    Os limites de "chuvoso" e de diferença escalam com o tamanho do período (≈ 2 mm/dia para o piso, 4 mm/dia para a folga), como em 30 dias (60/80/120 mm).
Agregação: mediana das estações restantes de cada município (robusta); REDEC = mediana de todas as suas estações restantes.
Dias/horas contados em UTC (a diferença de 3 h não muda a cobertura de forma relevante); os limites do período são exatos em Brasília."""

from __future__ import annotations

import datetime as dt
import math
import statistics

from django.db.models import Count, Exists, Max, OuterRef, Sum
from django.db.models.functions import TruncDate, TruncHour
from django.utils import timezone

from core.models import Reading, Station
from core.municipios import canonico_ou_original, is_municipio_valido
from core.niveis_monitoramento import municipios_redec

BRT = dt.timezone(dt.timedelta(hours=-3))
FONTES_PADRAO_EXCLUIDAS = {"wunderground"}
COBERTURA_MIN_DIAS = 0.80
COBERTURA_MIN_HORAS = 0.60
ATRASO_MAX_H_LONGO = 48
ATRASO_MAX_H_CURTO = 6
LEITURA_MAX_MM = 100.0
DIA_MAX_MM = 350.0
HORA_MAX_MM = 150.0
RAIO_VIZ_KM, MIN_VIZ = 25.0, 3
RAIO_VIZ_AMPLO_KM, N_VIZ_AMPLO = 45.0, 5
RAIO_CORROBORA_KM = 15.0
MAX_DIAS = 92


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    t = math.pi / 180
    dl, dn = (b[0] - a[0]) * t, (b[1] - a[1]) * t
    x = math.sin(dl / 2) ** 2 + math.cos(a[0] * t) * math.cos(b[0] * t) * math.sin(dn / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(x))


def _meia_noite_brt(d: dt.date) -> dt.datetime:
    return dt.datetime(d.year, d.month, d.day, tzinfo=BRT)


def resolver_periodo(agora: dt.datetime, dias: int | None = None, mes: str | None = None, ini: str | None = None, fim: str | None = None) -> tuple[dt.datetime, dt.datetime, str]:
    """(início, fim, rótulo) do período, em datetimes com fuso. O fim nunca passa de `agora`. ValueError para parâmetros inválidos."""
    if mes:
        try:
            ano, m = (int(x) for x in mes.split("-"))
            primeiro = dt.date(ano, m, 1)
        except ValueError as exc:
            raise ValueError("mes deve ser AAAA-MM.") from exc
        prox = dt.date(ano + (m == 12), m % 12 + 1, 1)
        i, f, rotulo = _meia_noite_brt(primeiro), _meia_noite_brt(prox), f"mês de {m:02d}/{ano}"
    elif ini:
        try:
            d_ini = dt.date.fromisoformat(ini)
            d_fim = dt.date.fromisoformat(fim) if fim else d_ini
        except ValueError as exc:
            raise ValueError("ini e fim devem ser AAAA-MM-DD.") from exc
        if d_fim < d_ini:
            raise ValueError("fim não pode ser antes de ini.")
        i, f = _meia_noite_brt(d_ini), _meia_noite_brt(d_fim + dt.timedelta(days=1))
        rotulo = f"{d_ini:%d/%m/%Y}" if d_ini == d_fim else f"{d_ini:%d/%m/%Y} a {d_fim:%d/%m/%Y}"
    else:
        n = 30 if dias is None else dias
        if not 1 <= n <= MAX_DIAS:
            raise ValueError(f"dias deve ficar entre 1 e {MAX_DIAS}.")
        return agora - dt.timedelta(days=n), agora, f"últimos {n} dias"
    f = min(f, agora)
    if i >= f:
        raise ValueError("o período começa depois de agora.")
    if (f - i) > dt.timedelta(days=MAX_DIAS):
        raise ValueError(f"o período não pode passar de {MAX_DIAS} dias.")
    return i, f, rotulo


def classificar_outliers(estacoes: list[dict], n_dias: float = 30, espurios: bool = True, cobertura_min: float = COBERTURA_MIN_DIAS, limite_bucket: float = DIA_MAX_MM) -> None:
    """Preenche `descartada` (motivo ou None) em cada item (dicts com fonte, lat, lon, total, cobertura, max_leitura, max_bucket, atraso_h, atraso_max_h).
    Etapa 1: disponibilidade (cobertura, atraso) e, se `espurios`, valores impossíveis. Etapa 2 (só com `espurios`): comparação espacial entre as que passaram."""
    for e in estacoes:
        e["descartada"] = None
        if e["cobertura"] < cobertura_min:
            e["descartada"] = f"cobertura {e['cobertura'] * 100:.0f}% (mín. {cobertura_min * 100:.0f}%)"
        elif e["atraso_h"] > e["atraso_max_h"]:
            e["descartada"] = f"atrasada: última leitura há {e['atraso_h']:.0f} h do fim do período (máx. {e['atraso_max_h']} h)"
        elif espurios and e["max_leitura"] > LEITURA_MAX_MM:
            e["descartada"] = f"leitura única de {e['max_leitura']:.0f} mm"
        elif espurios and e["max_bucket"] > limite_bucket:
            e["descartada"] = f"{'hora' if limite_bucket == HORA_MAX_MM else 'dia'} com {e['max_bucket']:.0f} mm"
    if not espurios:
        return
    piso_alto = max(10.0, 2.0 * n_dias)
    piso_baixo = max(15.0, round(2.67 * n_dias))
    folga = max(30.0, 4.0 * n_dias)
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
        if v == 0 and m >= piso_baixo:
            marcar[i] = f"zerada com vizinhos em {m:.0f} mm ({len(viz)} est.)"
            continue
        alto = m >= piso_alto and v > 2.5 * m and v - m > folga
        baixo = m >= piso_baixo and v < 0.25 * m
        if not (alto or baixo):
            continue
        corrobora = any(d <= RAIO_CORROBORA_KM and boas[j]["fonte"] != e["fonte"] and abs(boas[j]["total"] - v) <= 0.4 * v + 10 for d, j in dist)
        if not corrobora:
            marcar[i] = f"{'acima' if alto else 'abaixo'} dos vizinhos: {v:.0f} mm contra mediana {m:.0f} mm ({len(viz)} est.), sem estação de outra rede que confirme"
    for i, motivo in marcar.items():
        boas[i]["descartada"] = motivo


def _agregar(itens: list[dict]) -> dict:
    v = [e["total"] for e in itens]
    return {"mediana_mm": round(statistics.median(v), 1), "media_mm": round(statistics.fmean(v), 1), "min_mm": round(min(v), 1), "max_mm": round(max(v), 1), "n": len(v)}


def montar(
    dias: int | None = None,
    agora: dt.datetime | None = None,
    mes: str | None = None,
    ini: str | None = None,
    fim: str | None = None,
    fontes: list[str] | None = None,
    espurios: bool = True,
) -> dict:
    agora = agora or timezone.now()
    p_ini, p_fim, rotulo = resolver_periodo(agora, dias, mes, ini, fim)
    horas_totais = (p_fim - p_ini).total_seconds() / 3600
    n_dias = max(1.0, horas_totais / 24)
    curto = n_dias < 3
    Trunc = TruncHour if curto else TruncDate
    # Exists (uma sondagem no índice por estação) em vez de join+distinct: o join varria a tabela inteira de leituras (minutos no HostGator)
    tem_chuva = Reading.objects.filter(station=OuterRef("pk"), reading_type=Reading.ReadingType.CHUVA_MM)
    todas = {s.id: s for s in Station.objects.filter(Exists(tem_chuva)).select_related("source")}
    # station_id__in é essencial: sem ele o MySQL varre o índice de TODAS as leituras (89 s e erro 500 no HostGator); com ele faz uma faixa por estação
    por_balde = (
        Reading.objects.filter(station_id__in=list(todas), reading_type=Reading.ReadingType.CHUVA_MM, value__gte=0, timestamp__gte=p_ini, timestamp__lt=p_fim)
        .annotate(balde=Trunc("timestamp", tzinfo=dt.timezone.utc))
        .values("station_id", "balde")
        .annotate(soma=Sum("value"), maior=Max("value"), ultimo=Max("timestamp"), n=Count("id"))
    )
    acc: dict[int, dict] = {}
    for r in por_balde:
        a = acc.setdefault(r["station_id"], {"total": 0.0, "baldes": 0, "max_leitura": 0.0, "max_bucket": 0.0, "ultimo": None})
        a["total"] += r["soma"]
        a["baldes"] += 1
        a["max_leitura"] = max(a["max_leitura"], r["maior"])
        a["max_bucket"] = max(a["max_bucket"], r["soma"])
        a["ultimo"] = r["ultimo"] if a["ultimo"] is None else max(a["ultimo"], r["ultimo"])
    redecs = municipios_redec()
    disponiveis: dict[str, int] = {}
    for sid, a in acc.items():
        if sid in todas:
            disponiveis[todas[sid].source.slug] = disponiveis.get(todas[sid].source.slug, 0) + 1
    escolhidas = set(fontes) if fontes else {s for s in {x.source.slug for x in todas.values()} if s not in FONTES_PADRAO_EXCLUIDAS}
    cobertura_min = COBERTURA_MIN_HORAS if curto else COBERTURA_MIN_DIAS
    esperados = max(1.0, horas_totais if curto else n_dias)
    estacoes, sem_leitura = [], []
    for sid, s in todas.items():
        slug = s.source.slug
        if slug not in escolhidas:
            continue
        mun = canonico_ou_original(s.municipality or "")
        base = {"id": sid, "name": s.name.strip(), "fonte": slug, "municipio": mun, "redec": (redecs.get(mun) or {}).get("redec"), "lat": s.latitude, "lon": s.longitude}
        a = acc.get(sid)
        if not a:
            sem_leitura.append({**base, "total": None, "cobertura": 0.0, "descartada": "sem leitura no período (parada/fora do ar)"})
            continue
        estacoes.append(
            {
                **base,
                "total": round(a["total"], 1),
                "cobertura": min(1.0, a["baldes"] / esperados),
                "max_leitura": a["max_leitura"],
                "max_bucket": round(a["max_bucket"], 1),
                "atraso_h": max(0.0, (p_fim - a["ultimo"]).total_seconds() / 3600),
                "atraso_max_h": ATRASO_MAX_H_CURTO if curto else ATRASO_MAX_H_LONGO,
            }
        )
    classificar_outliers(estacoes, n_dias=n_dias, espurios=espurios, cobertura_min=cobertura_min, limite_bucket=HORA_MAX_MM if curto else DIA_MAX_MM)
    boas = [e for e in estacoes if e["descartada"] is None]
    por_mun: dict[str, list[dict]] = {}
    por_redec: dict[int, list[dict]] = {}
    for e in boas:
        if not is_municipio_valido(e["municipio"]):
            continue  # estação sem município (ou fora dos 92): fica fora do mapa
        por_mun.setdefault(e["municipio"], []).append(e)
        if e["redec"]:
            por_redec.setdefault(e["redec"], []).append(e)
    regiao_de = {v["redec"]: v["regiao"] for v in redecs.values()}
    municipios = [{"municipio": m, "redec": (redecs.get(m) or {}).get("redec"), "regiao": (redecs.get(m) or {}).get("regiao", ""), **_agregar(l)} for m, l in sorted(por_mun.items())]
    redecs_out = [{"redec": r, "regiao": regiao_de.get(r, ""), **_agregar(l)} for r, l in sorted(por_redec.items())]
    descartadas = [
        {"id": e["id"], "name": e["name"], "fonte": e["fonte"], "municipio": e["municipio"], "total": e["total"], "cobertura": round(e["cobertura"], 2), "descartada": e["descartada"]}
        for e in sorted(estacoes + sem_leitura, key=lambda x: (x["municipio"], x["name"]))
        if e["descartada"]
    ]
    return {
        "gerado_em": agora.isoformat(),
        "rotulo": rotulo,
        "inicio": p_ini.isoformat(),
        "fim": p_fim.isoformat(),
        "dias": round(n_dias, 1),
        "espurios": espurios,
        "fontes_usadas": sorted(escolhidas),
        "fontes_disponiveis": [{"slug": k, "estacoes": v, "padrao": k not in FONTES_PADRAO_EXCLUIDAS} for k, v in sorted(disponiveis.items())],
        "estacoes_total": len(estacoes) + len(sem_leitura),
        "estacoes_usadas": len(boas),
        "municipios": municipios,
        "redecs": redecs_out,
        "descartadas": descartadas,
    }
