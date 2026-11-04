"""Verificação diária Previsto × Observado por REDEC (04/11/2026). Documentação: docs/verificacao.md.

* Chuva observada: alguma estação da REDEC com chuva > 1 mm em 1 h (hora cheia, horário local) OU > 10 mm no dia civil local. Sem estação com dado = em branco.
* Temperatura: Tmax = maior entre `temperatura_c` e `temperatura_max_c`; Tmin = menor entre `temperatura_c` e `temperatura_min_c` (faixa −5…48 °C),
  sem leituras inválidas ou suspeitas. Região = extremo entre as estações da REDEC. Valor fora do padrão vira ALERTA para o técnico (não é apagado).
* Consultas a `Reading` sempre filtradas por `station_id__in` (o único índice é por estação + tipo + hora).
"""

from __future__ import annotations

import datetime as dt
import statistics
from collections import defaultdict

from django.db.models import Count, F, Max, Min, Sum
from django.db.models.functions import TruncHour
from django.utils import timezone

from core.models import Previsao, Reading, RiskAlert, Station, TemperaturaEstacaoDia, VerificacaoDia
from core.municipios import _chave, canonico_ou_original

LIMIAR_CHUVA_1H_MM = 1.0  # estritamente maior
LIMIAR_CHUVA_DIA_MM = 10.0  # estritamente maior
CHUVA_BALDE_MAX_MM = 200
FAIXA_TEMP = (-5.0, 48.0)
MIN_LEITURAS_TEMP = 6
MIN_ESTACOES_CHUVA_DIA = 30  # cobertura mínima no estado para o painel afirmar chuva/sem chuva (antes disso o histórico é parcial)
MIN_ESTACOES_CHUVA_REGIAO = 2
MIN_ESTACOES_TEMP_DIA = 10
DESVIO_REGIAO_C = 8.0  # |valor − mediana da REDEC| a partir daqui é "possível erro"
SALTO_DIA_C = 10.0  # |valor − mesmo valor da estação no dia anterior|
REGIOES = Previsao.REGIOES


def mapa_regioes() -> dict[int, str]:
    """station_id → REDEC (pela tabela de risco, via município). Estações sem REDEC (ex.: MG) ficam de fora."""
    redec_de = {_chave(m): r.strip().upper() for m, r in RiskAlert.objects.exclude(redec="").exclude(municipio="").values_list("municipio", "redec")}
    out = {}
    for sid, mun in Station.objects.values_list("id", "municipality"):
        r = redec_de.get(_chave(canonico_ou_original(mun) or ""), "")
        if r in REGIOES:
            out[sid] = r
    return out


def _janela(dia: dt.date):
    ini = timezone.make_aware(dt.datetime.combine(dia, dt.time.min))
    return ini, ini + dt.timedelta(days=1)


def chuva_do_dia(dia: dt.date, regioes: dict[int, str]) -> dict[str, dict]:
    """Por REDEC: máximo em 24 h (dia civil) e em 1 h (hora cheia) entre as estações, e quem registrou."""
    ini, fim = _janela(dia)
    off = ini.utcoffset()
    por_est: dict[int, list[float]] = defaultdict(list)
    qs = (
        Reading.objects.filter(station_id__in=list(regioes), reading_type=Reading.ReadingType.CHUVA_MM, value__gte=0, value__lte=CHUVA_BALDE_MAX_MM, timestamp__gte=ini, timestamp__lt=fim)
        .exclude(qualidade__qualidade="invalido")
        .annotate(h=TruncHour(F("timestamp") + off, tzinfo=dt.timezone.utc))
        .values("station_id", "h")
        .annotate(t=Sum("value"))
    )
    for r in qs:
        por_est[r["station_id"]].append(float(r["t"]))
    nomes = dict(Station.objects.filter(id__in=list(por_est)).values_list("id", "name"))
    out: dict[str, dict] = {}
    for sid, horas in por_est.items():
        reg = regioes[sid]
        o = out.setdefault(reg, {"max_24h": None, "max_1h": None, "estacao": "", "estacoes": 0})
        o["estacoes"] += 1
        tot, h1 = sum(horas), max(horas)
        if o["max_24h"] is None or tot > o["max_24h"]:
            o["max_24h"], o["estacao"] = tot, nomes.get(sid, "")
        if o["max_1h"] is None or h1 > o["max_1h"]:
            o["max_1h"] = h1
    return out


def temperatura_do_dia(dia: dt.date, regioes: dict[int, str]) -> dict[int, dict]:
    """Por estação: Tmax, Tmin e nº de leituras do dia civil local."""
    ini, fim = _janela(dia)
    tmax: dict[int, float] = {}
    tmin: dict[int, float] = {}
    n: dict[int, int] = defaultdict(int)
    qs = (
        Reading.objects.filter(station_id__in=list(regioes), reading_type__in=["temperatura_c", "temperatura_max_c", "temperatura_min_c"], timestamp__gte=ini, timestamp__lt=fim)
        .exclude(qualidade__qualidade__in=["invalido", "suspeito"])
        .values("station_id", "reading_type")
        .annotate(mx=Max("value"), mn=Min("value"), c=Count("id"))
    )
    for r in qs:
        sid, rt = r["station_id"], r["reading_type"]
        n[sid] += r["c"]
        if rt in ("temperatura_c", "temperatura_max_c") and FAIXA_TEMP[0] <= r["mx"] <= FAIXA_TEMP[1]:
            tmax[sid] = max(tmax.get(sid, -99), r["mx"])
        if rt in ("temperatura_c", "temperatura_min_c") and FAIXA_TEMP[0] <= r["mn"] <= FAIXA_TEMP[1]:
            tmin[sid] = min(tmin.get(sid, 99), r["mn"])
    return {s: {"tmax": tmax.get(s), "tmin": tmin.get(s), "n": n[s]} for s in set(tmax) | set(tmin) if n[s] >= MIN_LEITURAS_TEMP}


def _alertas_estacoes(dia: dt.date, temps: dict[int, dict], regioes: dict[int, str]) -> dict[int, dict]:
    """Marca possíveis erros: longe da mediana da REDEC, salto em relação ao dia anterior ou Tmax < Tmin."""
    por_reg: dict[str, list[int]] = defaultdict(list)
    for s in temps:
        por_reg[regioes[s]].append(s)
    ontem = {t.station_id: t for t in TemperaturaEstacaoDia.objects.filter(data=dia - dt.timedelta(days=1), station_id__in=list(temps))}
    out: dict[int, dict] = {}
    for reg, sids in por_reg.items():
        med = {k: statistics.median([temps[s][k] for s in sids if temps[s][k] is not None]) for k in ("tmax", "tmin") if any(temps[s][k] is not None for s in sids)}
        for s in sids:
            a = {"max": "", "min": ""}
            for k, rot in (("tmax", "max"), ("tmin", "min")):
                v = temps[s][k]
                if v is None:
                    continue
                msgs = []
                if len(sids) >= 3 and k in med and abs(v - med[k]) >= DESVIO_REGIAO_C:
                    msgs.append(f"{abs(v - med[k]):.1f} °C {'acima' if v > med[k] else 'abaixo'} da mediana da REDEC")
                prev = ontem.get(s)
                pv = getattr(prev, k) if prev else None
                if pv is not None and abs(v - pv) >= SALTO_DIA_C:
                    msgs.append(f"salto de {abs(v - pv):.1f} °C em relação ao dia anterior")
                a[rot] = "; ".join(msgs)
            if temps[s]["tmax"] is not None and temps[s]["tmin"] is not None and temps[s]["tmax"] < temps[s]["tmin"]:
                a["max"] = a["max"] or "Tmax menor que Tmin"
            out[s] = a
    return out


def indices(a: int, b: int, c: int, d: int) -> dict:
    """Tabela de contingência 2×2 (a acerto, b falso alarme, c omissão, d acerto negativo) e índices de Wilks."""
    n = a + b + c + d

    def r(x, y, nd=3):
        return None if not y else round(x / y, nd)

    return {
        "a": a, "b": b, "c": c, "d": d, "n": n,
        "acuracia": r(a + d, n), "threat_score": r(a, a + b + c), "bias": r(a + b, a + c), "far": r(b, a + b), "pod": r(a, a + c),
        "razao_possibilidades": r(a * d, b * c),  # θ = ad/bc (Wilks)
        "razao_acertos_erros": r(a + d, b + c),  # fórmula da planilha ("a+d/b+c"), mantida para comparação
    }


def gravar_dia(dia: dt.date) -> dict:
    """Calcula e grava o dia (todas as REDECs). Preserva os valores que vieram da planilha e preenche os demais com o painel."""
    regioes = mapa_regioes()
    chuva = chuva_do_dia(dia, regioes)
    if sum(o["estacoes"] for o in chuva.values()) < MIN_ESTACOES_CHUVA_DIA:
        chuva = {}
    chuva = {r: o for r, o in chuva.items() if o["estacoes"] >= MIN_ESTACOES_CHUVA_REGIAO}
    temps = temperatura_do_dia(dia, regioes)
    if len(temps) < MIN_ESTACOES_TEMP_DIA:
        temps = {}
    alertas = _alertas_estacoes(dia, temps, regioes)
    nomes = dict(Station.objects.filter(id__in=list(temps)).values_list("id", "name"))
    for s, t in temps.items():
        TemperaturaEstacaoDia.objects.update_or_create(
            data=dia, station_id=s, defaults={"regiao": regioes[s], "tmax": t["tmax"], "tmin": t["tmin"], "n_leituras": t["n"], "alerta_max": alertas[s]["max"], "alerta_min": alertas[s]["min"]},
        )
    TemperaturaEstacaoDia.objects.filter(data=dia).exclude(station_id__in=list(temps)).delete()
    previsoes = {p.regiao.upper(): p for p in Previsao.objects.filter(data=dia)}
    gravados = 0
    for reg in REGIOES:
        c = chuva.get(reg)
        sids = [s for s in temps if regioes[s] == reg]
        tx = max(((temps[s]["tmax"], s) for s in sids if temps[s]["tmax"] is not None), default=None)
        tn = min(((temps[s]["tmin"], s) for s in sids if temps[s]["tmin"] is not None), default=None)
        p = previsoes.get(reg)
        painel = {
            "chuva_prev": None if not p else "huva" in (p.icone or ""),
            "chuva_obs": None if not c else bool(c["max_1h"] > LIMIAR_CHUVA_1H_MM or c["max_24h"] > LIMIAR_CHUVA_DIA_MM),
            "tmax_prev": p.temperatura_maxima if p else None, "tmin_prev": p.temperatura_minima if p else None,
            "tmax_obs": round(tx[0], 1) if tx else None, "tmin_obs": round(tn[0], 1) if tn else None,
        }
        obj, _ = VerificacaoDia.objects.get_or_create(data=dia, regiao=reg)
        da_planilha = set(obj.planilha or [])
        obj.chuva_prev_painel, obj.chuva_obs_painel = painel["chuva_prev"], painel["chuva_obs"]
        obj.tmax_obs_painel, obj.tmin_obs_painel = painel["tmax_obs"], painel["tmin_obs"]
        for campo, valor in painel.items():
            if campo not in da_planilha:
                setattr(obj, campo, valor)
        obj.chuva_max_24h_mm = None if not c else round(c["max_24h"], 1)
        obj.chuva_max_1h_mm = None if not c else round(c["max_1h"], 1)
        obj.chuva_estacao = c["estacao"] if c else ""
        obj.tmax_estacao = nomes.get(tx[1], "") if tx else ""
        obj.tmin_estacao = nomes.get(tn[1], "") if tn else ""
        obj.alertas = [f"{nomes.get(s, s)}: Tmax {temps[s]['tmax']} °C — {alertas[s]['max']}" for s in sids if alertas[s]["max"]] + [f"{nomes.get(s, s)}: Tmin {temps[s]['tmin']} °C — {alertas[s]['min']}" for s in sids if alertas[s]["min"]]
        obj.save()
        gravados += 1
    return {"data": dia.isoformat(), "regioes": gravados, "estacoes_com_temperatura": len(temps), "regioes_com_chuva": len(chuva)}


def gravar_ontem_se_pendente(agora: dt.datetime | None = None) -> str | None:
    """Carona do cron: grava o dia de ontem depois das 00h20 e o refaz uma vez depois das 06h (dados que chegam atrasados)."""
    agora = timezone.localtime(agora or timezone.now())
    if agora.hour == 0 and agora.minute < 20:
        return None
    ontem = agora.date() - dt.timedelta(days=1)
    fechamento = agora.replace(hour=6, minute=0, second=0, microsecond=0)
    ult = list(VerificacaoDia.objects.filter(data=ontem).values_list("atualizado_em", flat=True))
    pendente = len(ult) < len(REGIOES) or (agora >= fechamento and min(ult) < fechamento)
    if not pendente:
        return None
    r = gravar_dia(ontem)
    return f"verificação de {r['data']}: {r['regioes']} REDECs"
