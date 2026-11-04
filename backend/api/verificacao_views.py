"""Verificação Previsto × Observado (04/11/2026). Regras em core/verificacao.py; documentação em docs/verificacao.md.

`GET /api/verificacao/?mes=AAAA-MM` → o mês (por dia e REDEC), contingência/índices, extremos de temperatura (REDEC e estação) e dias sem dado.
`GET /api/verificacao/?ano=AAAA` → contingência e índices do ano (por REDEC, por mês e total).
`GET /api/verificacao/diferencas/` → onde a planilha e o painel discordam.
`POST /api/admin/verificacao/gravar/ {inicio, fim}` e `POST /api/admin/verificacao/importar/ {linhas}` (superusuário)."""

from __future__ import annotations

import calendar
import datetime as dt

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core import verificacao as ver
from core.models import TemperaturaEstacaoDia, VerificacaoDia

REGIOES = ver.REGIOES


def categoria(prev, obs):
    if prev is None or obs is None:
        return None
    return "a" if prev and obs else "b" if prev else "c" if obs else "d"


def _contagem(linhas) -> dict:
    n = {"a": 0, "b": 0, "c": 0, "d": 0}
    for v in linhas:
        k = categoria(v.chuva_prev, v.chuva_obs)
        if k:
            n[k] += 1
    return {**ver.indices(**n)}


def _periodo(request):
    hoje = timezone.localdate()
    if request.query_params.get("mes"):
        a, m = (int(x) for x in request.query_params["mes"].split("-"))
        return dt.date(a, m, 1), dt.date(a, m, calendar.monthrange(a, m)[1]), "mes"
    a = int(request.query_params.get("ano") or hoje.year)
    return dt.date(a, 1, 1), dt.date(a, 12, 31), "ano"


class VerificacaoView(APIView):
    def get(self, request):
        try:
            ini, fim, modo = _periodo(request)
        except (ValueError, TypeError):
            return Response({"detail": "use ?mes=AAAA-MM ou ?ano=AAAA"}, status=400)
        ate = min(fim, timezone.localdate() - dt.timedelta(days=1))
        linhas = list(VerificacaoDia.objects.filter(data__gte=ini, data__lte=fim))
        por_reg = {r: [v for v in linhas if v.regiao == r] for r in REGIOES}
        corpo = {
            "modo": modo, "inicio": ini.isoformat(), "fim": fim.isoformat(), "regioes": REGIOES,
            "contingencia": {r: _contagem(por_reg[r]) for r in REGIOES}, "total": _contagem(linhas),
            "criterio": {"chuva_1h_mm": ver.LIMIAR_CHUVA_1H_MM, "chuva_dia_mm": ver.LIMIAR_CHUVA_DIA_MM},
        }
        if modo == "ano":
            corpo["por_mes"] = [{"mes": m, **_contagem([v for v in linhas if v.data.month == m])} for m in range(1, 13)]
            return Response(corpo)

        dias = {}
        for v in linhas:
            dias.setdefault(v.data.isoformat(), {})[v.regiao] = {
                "chuva_prev": v.chuva_prev, "chuva_obs": v.chuva_obs, "cat": categoria(v.chuva_prev, v.chuva_obs),
                "chuva_max_24h": v.chuva_max_24h_mm, "chuva_max_1h": v.chuva_max_1h_mm, "chuva_estacao": v.chuva_estacao,
                "tmax_prev": v.tmax_prev, "tmax_obs": v.tmax_obs, "tmin_prev": v.tmin_prev, "tmin_obs": v.tmin_obs,
                "tmax_estacao": v.tmax_estacao, "tmin_estacao": v.tmin_estacao, "alertas": v.alertas, "planilha": v.planilha,
            }
        corpo["dias"] = [{"data": d, "regioes": dias[d]} for d in sorted(dias)]
        # extremos do mês por REDEC (a partir dos extremos diários finais)
        ext = {}
        for r in REGIOES:
            mx = max(((v.tmax_obs, v) for v in por_reg[r] if v.tmax_obs is not None), key=lambda x: x[0], default=None)
            mn = min(((v.tmin_obs, v) for v in por_reg[r] if v.tmin_obs is not None), key=lambda x: x[0], default=None)
            ext[r] = {
                "tmax": mx[0] if mx else None, "tmax_data": mx[1].data.isoformat() if mx else None, "tmax_estacao": mx[1].tmax_estacao if mx else "",
                "tmin": mn[0] if mn else None, "tmin_data": mn[1].data.isoformat() if mn else None, "tmin_estacao": mn[1].tmin_estacao if mn else "",
            }
        corpo["temperatura_mensal"] = ext
        est = {}
        for t in TemperaturaEstacaoDia.objects.filter(data__gte=ini, data__lte=fim).select_related("station"):
            e = est.setdefault(t.station_id, {"estacao": t.station.name, "municipio": t.station.municipality, "regiao": t.regiao, "tmax": None, "tmax_data": None, "tmin": None, "tmin_data": None, "dias": 0, "alertas": 0})
            e["dias"] += 1
            if t.tmax is not None and (e["tmax"] is None or t.tmax > e["tmax"]):
                e["tmax"], e["tmax_data"] = t.tmax, t.data.isoformat()
            if t.tmin is not None and (e["tmin"] is None or t.tmin < e["tmin"]):
                e["tmin"], e["tmin_data"] = t.tmin, t.data.isoformat()
            e["alertas"] += bool(t.alerta_max or t.alerta_min)
        corpo["estacoes_mes"] = sorted(est.values(), key=lambda e: (e["regiao"], e["estacao"]))
        corpo["alertas"] = [{"data": v.data.isoformat(), "regiao": v.regiao, "texto": t} for v in sorted(linhas, key=lambda x: x.data) for t in v.alertas]
        # dias sem dado (até ontem): por tipo
        faltam = {"chuva": [], "temperatura": []}
        d = ini
        while d <= ate:
            iso = d.isoformat()
            reg = dias.get(iso, {})
            for tipo, campo in (("chuva", "chuva_obs"), ("temperatura", "tmax_obs")):
                sem = [r for r in REGIOES if reg.get(r, {}).get(campo) is None]
                if sem:
                    faltam[tipo].append({"data": iso, "regioes": sem if len(sem) < len(REGIOES) else ["todas"]})
            d += dt.timedelta(days=1)
        corpo["dias_sem_dado"] = faltam
        return Response(corpo)


class DiferencasView(APIView):
    """Onde o valor da planilha (usado) e o calculado pelo painel discordam."""

    TOL_TEMP = 0.5

    def get(self, request):
        out = []
        for v in VerificacaoDia.objects.exclude(planilha=[]).order_by("data", "regiao"):
            for campo, painel in (("chuva_prev", v.chuva_prev_painel), ("chuva_obs", v.chuva_obs_painel), ("tmax_obs", v.tmax_obs_painel), ("tmin_obs", v.tmin_obs_painel)):
                if campo not in v.planilha or painel is None:
                    continue
                pl = getattr(v, campo)
                difere = pl != painel if isinstance(pl, bool) else abs(pl - painel) > self.TOL_TEMP
                if difere:
                    out.append({"data": v.data.isoformat(), "regiao": v.regiao, "campo": campo, "planilha": pl, "painel": painel})
        return Response({"quantidade": len(out), "diferencas": out})


class GravarVerificacaoView(APIView):
    """POST /api/admin/verificacao/gravar/ {inicio, fim} (no máximo 8 dias por chamada): calcula e grava a verificação pelo painel."""

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        try:
            ini = dt.date.fromisoformat(str(request.data.get("inicio")))
            fim = dt.date.fromisoformat(str(request.data.get("fim") or request.data.get("inicio")))
        except ValueError:
            return Response({"detail": "inicio/fim devem ser AAAA-MM-DD."}, status=400)
        if fim < ini or (fim - ini).days > 7:
            return Response({"detail": "Intervalo inválido (máximo 8 dias por chamada)."}, status=400)
        res = [ver.gravar_dia(ini + dt.timedelta(days=i)) for i in range((fim - ini).days + 1)]
        return Response({"ok": True, "dias": res})


class ImportarVerificacaoView(APIView):
    """POST /api/admin/verificacao/importar/ {linhas:[{data, regiao, chuva_prev, chuva_obs, tmax_prev, tmin_prev, tmax_obs, tmin_obs}]}.
    Valores presentes (não nulos) passam a valer como "da planilha"; os nulos ficam com o que o painel calcula. Repetível."""

    CAMPOS = ("chuva_prev", "chuva_obs", "tmax_prev", "tmin_prev", "tmax_obs", "tmin_obs")

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Apenas administradores."}, status=403)
        n = 0
        for l in request.data.get("linhas") or []:
            reg = str(l.get("regiao") or "").upper()
            if reg not in REGIOES:
                continue
            obj, _ = VerificacaoDia.objects.get_or_create(data=dt.date.fromisoformat(l["data"]), regiao=reg)
            usados = set(obj.planilha or [])
            for c in self.CAMPOS:
                v = l.get(c)
                if v is None:
                    continue
                setattr(obj, c, v)
                usados.add(c)
            obj.planilha = sorted(usados)
            obj.save()
            n += 1
        return Response({"ok": True, "linhas": n})
