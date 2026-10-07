"""
Aba "Resumo 24 h" (07/10/2026): dashboard do dia com os principais acontecimentos, Top 10
(chuva, Tmáx, Tmín, rajada), previsão × observado por região e cidades com chuva/rajada.

`GET /api/resumo/?dia=AAAA-MM-DD` (dia civil local) ou sem `dia` = últimas 24 h até agora.

Regras (documentadas em docs/resumo-24h.md):
* Chuva = soma dos baldes gravados (todas as fontes são "balde"); para "últimas 24 h" e "hoje"
  reaproveita `_calcular_precipitacao`, que já usa o valor OFICIAL da fonte quando existe.
  Leituras com qualificação "inválida" ficam de fora.
* Tmáx = maior entre `temperatura_c` e `temperatura_max_c`; Tmín = menor entre `temperatura_c`
  e `temperatura_min_c` (faixa física −5…48 °C).
* Rajada = maior `vento_rajada_ms` (≤ 60 m/s) em km/h, mesmas faixas da tabela Ventos.
* Região = REDEC do município (tabela de risco geológico); a previsão é a do dia civil.
"""

from __future__ import annotations

import datetime as dt
import statistics
from collections import defaultdict

from django.core.cache import cache
from django.db.models import Max, Min, Q, Sum
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import AlertEvent, AvisoMauTempo, Previsao, Reading, RiskAlert, Station
from core.municipios import _chave, canonico_ou_original

CACHE_S = 180
FAIXAS_RAJADA = [(76.0, "Muito forte"), (52.0, "Forte"), (18.6, "Moderada"), (0.0, "Fraca")]
FAIXAS_CHUVA_DIA = [(70.0, "Muito forte"), (30.0, "Forte"), (10.0, "Moderada"), (0.2, "Fraca")]
CHUVA_MIN_MM = 0.2

VENTO_PREVISTO_ACEITA = {
    "Fraco": {"Fraco"},
    "Fraco/Moderado": {"Fraco", "Moderado"},
    "Moderado": {"Moderado"},
    "Moderado/Forte": {"Moderado", "Forte"},
    "Forte": {"Forte"},
}


def classe_rajada(kmh):
    if kmh is None:
        return None
    return next(n for m, n in FAIXAS_RAJADA if kmh >= m)


def classe_chuva(mm):
    if mm is None or mm < CHUVA_MIN_MM:
        return None
    return next(n for m, n in FAIXAS_CHUVA_DIA if mm >= m)


def classe_vento_sustentado(kmh):
    """Classe do vento médio, para comparar com Fraco/Moderado/Forte da previsão."""
    if kmh is None:
        return None
    return "Fraco" if kmh < 20 else "Moderado" if kmh < 40 else "Forte"


def _veredito_temp(dif):
    if dif is None:
        return None
    return "Confere" if abs(dif) <= 2 else "Atenção" if abs(dif) <= 4 else "Divergente"


def _janela(dia_txt):
    agora = timezone.now()
    if not dia_txt:
        return agora - dt.timedelta(hours=24), agora, timezone.localdate(agora), "rolling"
    dia = dt.date.fromisoformat(dia_txt)
    ini = timezone.make_aware(dt.datetime.combine(dia, dt.time.min))
    fim = min(ini + dt.timedelta(days=1), agora)
    modo = "hoje" if dia == timezone.localdate(agora) else "dia"
    return ini, fim, dia, modo


class Resumo24hView(APIView):
    def get(self, request):
        dia_txt = request.query_params.get("dia") or ""
        try:
            ini, fim, dia, modo = _janela(dia_txt)
        except ValueError:
            return Response({"detail": "dia deve ser AAAA-MM-DD"}, status=400)
        chave = f"resumo:{dia_txt or 'rolling'}"
        if modo != "dia":
            cached = cache.get(chave)
            if cached is not None:
                return Response(cached)

        estacoes = {
            s["id"]: s
            for s in Station.objects.values("id", "name", "municipality", "source__slug", "station_type")
        }
        redec_de = {}
        for mun, redec in RiskAlert.objects.exclude(redec="").exclude(municipio="").values_list("municipio", "redec"):
            redec_de[_chave(mun)] = redec.strip().upper()

        def regiao_de(sid):
            return redec_de.get(_chave(canonico_ou_original(estacoes[sid]["municipality"]) or ""), "")

        # ---------------- chuva ----------------
        chuva: dict[int, float] = {}
        if modo in ("rolling", "hoje"):
            from .views import StationViewSet

            pluv = list(
                Station.objects.select_related("source")
                .filter(readings__reading_type=Reading.ReadingType.CHUVA_MM, readings__timestamp__gte=ini)
                .distinct()
            )
            campo = "acumulado_24h_mm" if modo == "rolling" else "acumulado_hoje_mm"
            for e in StationViewSet()._calcular_precipitacao(pluv):
                if e.get(campo) is not None:
                    chuva[e["id"]] = float(e[campo])
        else:
            for r in (
                Reading.objects.filter(reading_type="chuva_mm", value__gte=0, timestamp__gte=ini, timestamp__lt=fim)
                .exclude(qualidade__qualidade="invalido")
                .values("station_id")
                .annotate(t=Sum("value"))
            ):
                chuva[r["station_id"]] = float(r["t"])

        # ---------------- temperatura e vento ----------------
        tipos = ["temperatura_c", "temperatura_max_c", "temperatura_min_c", "vento_rajada_ms", "vento_ms"]
        tmax: dict[int, float] = {}
        tmin: dict[int, float] = {}
        rajada: dict[int, float] = {}
        vento: dict[int, float] = {}
        for r in (
            Reading.objects.filter(reading_type__in=tipos, timestamp__gte=ini, timestamp__lt=fim)
            .exclude(qualidade__qualidade="invalido")
            .values("station_id", "reading_type")
            .annotate(mx=Max("value"), mn=Min("value"))
        ):
            sid, rt = r["station_id"], r["reading_type"]
            if rt in ("temperatura_c", "temperatura_max_c") and -5 <= r["mx"] <= 48:
                tmax[sid] = max(tmax.get(sid, -99), r["mx"])
            if rt in ("temperatura_c", "temperatura_min_c") and -5 <= r["mn"] <= 48:
                tmin[sid] = min(tmin.get(sid, 99), r["mn"])
            if rt == "vento_rajada_ms" and 0 <= r["mx"] <= 60:
                rajada[sid] = r["mx"] * 3.6
            if rt == "vento_ms" and 0 <= r["mx"] <= 45:
                vento[sid] = r["mx"] * 3.6

        def item(sid, valor):
            e = estacoes[sid]
            return {
                "id": sid,
                "name": e["name"],
                "municipio": canonico_ou_original(e["municipality"]),
                "fonte": e["source__slug"],
                "valor": round(valor, 1),
            }

        def top(d, reverse=True, n=10):
            return [item(s, v) for s, v in sorted(d.items(), key=lambda kv: kv[1], reverse=reverse) if s in estacoes][:n]

        chuva_pos = {s: v for s, v in chuva.items() if v >= CHUVA_MIN_MM and s in estacoes}

        # ---------------- por município ----------------
        mun: dict[str, dict] = defaultdict(
            lambda: {"chuva": [], "rajada": [], "tmax": [], "tmin": [], "n": 0, "regiao": "", "est_chuva": None, "est_raj": None}
        )
        for sid, e in estacoes.items():
            if sid not in chuva and sid not in rajada and sid not in tmax:
                continue
            nome = canonico_ou_original(e["municipality"]) or "—"
            m = mun[nome]
            m["n"] += 1
            m["regiao"] = m["regiao"] or regiao_de(sid)
            if sid in chuva:
                m["chuva"].append(chuva[sid])
                if m["est_chuva"] is None or chuva[sid] > chuva[m["est_chuva"]]:
                    m["est_chuva"] = sid
            if sid in rajada:
                m["rajada"].append(rajada[sid])
                if m["est_raj"] is None or rajada[sid] > rajada[m["est_raj"]]:
                    m["est_raj"] = sid
            if sid in tmax:
                m["tmax"].append(tmax[sid])
            if sid in tmin:
                m["tmin"].append(tmin[sid])

        municipios = []
        for nome, m in mun.items():
            cm = max(m["chuva"]) if m["chuva"] else None
            rj = max(m["rajada"]) if m["rajada"] else None
            municipios.append(
                {
                    "municipio": nome,
                    "regiao": m["regiao"],
                    "estacoes": m["n"],
                    "estacoes_com_chuva": sum(1 for v in m["chuva"] if v >= CHUVA_MIN_MM),
                    "chuva_max_mm": None if cm is None else round(cm, 1),
                    "chuva_media_mm": round(statistics.mean(m["chuva"]), 1) if m["chuva"] else None,
                    "chuva_estacao": estacoes[m["est_chuva"]]["name"] if m["est_chuva"] else None,
                    "chuva_classe": classe_chuva(cm),
                    "rajada_max_kmh": None if rj is None else round(rj, 1),
                    "rajada_estacao": estacoes[m["est_raj"]]["name"] if m["est_raj"] else None,
                    "rajada_classe": classe_rajada(rj),
                    "tmax": round(max(m["tmax"]), 1) if m["tmax"] else None,
                    "tmin": round(min(m["tmin"]), 1) if m["tmin"] else None,
                }
            )
        municipios.sort(key=lambda x: (-(x["chuva_max_mm"] or 0), x["municipio"]))

        # ---------------- previsão × observado por região ----------------
        previsoes = {p.regiao.upper(): p for p in Previsao.objects.filter(data=dia)}
        regioes = []
        for reg in Previsao.REGIOES:
            ms = [m for m in municipios if m["regiao"] == reg]
            sids = [s for s in estacoes if regiao_de(s) == reg]
            r_chuva = [chuva[s] for s in sids if s in chuva]
            r_tmax = [tmax[s] for s in sids if s in tmax]
            r_tmin = [tmin[s] for s in sids if s in tmin]
            r_raj = [rajada[s] for s in sids if s in rajada]
            r_vento = [vento[s] for s in sids if s in vento]
            p = previsoes.get(reg)
            obs = {
                "estacoes": len(sids),
                "chuva_max_mm": round(max(r_chuva), 1) if r_chuva else None,
                "estacoes_com_chuva": sum(1 for v in r_chuva if v >= CHUVA_MIN_MM),
                "tmax": round(max(r_tmax), 1) if r_tmax else None,
                "tmax_mediana": round(statistics.median(r_tmax), 1) if r_tmax else None,
                "tmin": round(min(r_tmin), 1) if r_tmin else None,
                "tmin_mediana": round(statistics.median(r_tmin), 1) if r_tmin else None,
                "rajada_max_kmh": round(max(r_raj), 1) if r_raj else None,
                "vento_max_kmh": round(max(r_vento), 1) if r_vento else None,
                "vento_classe": classe_vento_sustentado(max(r_vento)) if r_vento else None,
            }
            veredito = {}
            if p:
                dmax = None if obs["tmax"] is None else round(obs["tmax"] - p.temperatura_maxima, 1)
                dmin = None if obs["tmin"] is None else round(obs["tmin"] - p.temperatura_minima, 1)
                prev_chuva = "huva" in (p.icone or "")
                choveu = obs["chuva_max_mm"] is not None and obs["chuva_max_mm"] >= 1.0
                if obs["chuva_max_mm"] is None:
                    chuva_v = None
                elif prev_chuva and choveu:
                    chuva_v = "Acertou (previu e choveu)"
                elif prev_chuva:
                    chuva_v = "Falso alarme (previu, não choveu)"
                elif choveu:
                    chuva_v = "Não previsto (choveu)"
                else:
                    chuva_v = "Acertou (sem chuva)"
                vento_v = None
                if obs["vento_classe"]:
                    aceita = VENTO_PREVISTO_ACEITA.get(p.vento_velocidade, set())
                    vento_v = "Confere" if obs["vento_classe"] in aceita else "Divergente"
                veredito = {
                    "tmax_dif": dmax,
                    "tmax": _veredito_temp(dmax),
                    "tmin_dif": dmin,
                    "tmin": _veredito_temp(dmin),
                    "chuva": chuva_v,
                    "vento": vento_v,
                }
            regioes.append(
                {
                    "regiao": reg,
                    "previsao": None
                    if not p
                    else {
                        "tmax": p.temperatura_maxima,
                        "tmin": p.temperatura_minima,
                        "umid_max": p.umidade_maxima,
                        "umid_min": p.umidade_minima,
                        "vento": p.vento_velocidade,
                        "vento_dir": p.vento_direcao,
                        "icone": p.icone,
                        "comentario": p.comentario,
                        "preve_chuva": "huva" in (p.icone or ""),
                    },
                    "observado": obs,
                    "veredito": veredito,
                    "municipios_com_chuva": sorted(m["municipio"] for m in ms if (m["chuva_max_mm"] or 0) >= CHUVA_MIN_MM),
                }
            )

        # ---------------- acontecimentos ----------------
        eventos = (
            AlertEvent.objects.filter(Q(triggered_at__lt=fim) & (Q(resolved_at__isnull=True) | Q(resolved_at__gte=ini)))
            .select_related("rule", "station")
            .order_by("-triggered_at")
        )
        sirenes_por_mun: dict[str, int] = defaultdict(int)
        sirenes_est = set()
        outros = 0
        ativas = 0
        for ev in eventos:
            if ev.station.station_type == Station.StationType.SIRENE:
                sirenes_est.add(ev.station_id)
                sirenes_por_mun[canonico_ou_original(ev.station.municipality)] += 1
                ativas += ev.resolved_at is None
            else:
                outros += 1
        riscos: dict[str, dict] = {}
        for tipo, risco in RiskAlert.objects.filter(
            tipo__in=["meteorologico", "hidrologico", "geologico"], risco__in=["alto", "muito_alto"]
        ).values_list("tipo", "risco"):
            riscos.setdefault(tipo, {"alto": 0, "muito_alto": 0})[risco] += 1
        avisos = [
            {"area": a.area, "tipo": a.tipo, "valido_ate": a.valido_ate}
            for a in AvisoMauTempo.objects.filter(valido_ate__gte=timezone.now()).order_by("-emitido_em")[:5]
        ]

        classes_chuva: dict[str, int] = defaultdict(int)
        classes_rajada: dict[str, int] = defaultdict(int)
        for m in municipios:
            if m["chuva_classe"]:
                classes_chuva[m["chuva_classe"]] += 1
            if m["rajada_classe"] in ("Moderada", "Forte", "Muito forte"):
                classes_rajada[m["rajada_classe"]] += 1

        def primeiro(lst):
            return lst[0] if lst else None

        payload = {
            "modo": modo,
            "dia": dia.isoformat(),
            "inicio": ini,
            "fim": fim,
            "gerado_em": timezone.now(),
            "resumo": {
                "estacoes_com_dado": len(set(chuva) | set(tmax) | set(rajada)),
                "estacoes_com_chuva": len(chuva_pos),
                "municipios_com_chuva": sum(1 for m in municipios if m["chuva_classe"]),
                "municipios_por_classe_chuva": dict(classes_chuva),
                "municipios_rajada_moderada_ou_mais": dict(classes_rajada),
                "maior_chuva": primeiro(top(chuva_pos, n=1)),
                "maior_tmax": primeiro(top(tmax, n=1)),
                "menor_tmin": primeiro(top(tmin, reverse=False, n=1)),
                "maior_rajada": primeiro(top(rajada, n=1)),
                "sirenes_acionadas": len(sirenes_est),
                "sirenes_tocando_agora": ativas,
                "acionamentos_por_municipio": sorted(sirenes_por_mun.items(), key=lambda kv: -kv[1])[:8],
                "outros_alertas": outros,
                "riscos_altos": riscos,
                "avisos_marinha": avisos,
            },
            "top10": {
                "chuva": top(chuva_pos),
                "tmax": top(tmax),
                "tmin": top(tmin, reverse=False),
                "rajada": top(rajada),
            },
            "regioes": regioes,
            "municipios": municipios,
        }
        if modo != "dia":
            cache.set(chave, payload, CACHE_S)
        return Response(payload)
