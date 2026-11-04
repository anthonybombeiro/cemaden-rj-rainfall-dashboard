"""Relatório dos sistemas atuantes (04/11/2026): agrega `SistemaAtuanteDia` por mês ou por ano.

Regras (decididas pelo usuário):
* vários sistemas no mesmo dia são normais (o dia tem 24 h): um dia conta para TODOS os sistemas listados (principal ou secundário) e
  também separadamente como "principal" (o primeiro da lista);
* dias em branco ficam fora dos percentuais e são listados no fim; o percentual é "dias com o sistema ÷ dias com registro" (a soma pode passar de 100 %);
* sequência = dias CONSECUTIVOS do calendário em que o sistema aparece (em qualquer posição); um dia em branco interrompe a sequência.
"""

from __future__ import annotations

import calendar
import datetime as dt

from core.models import SistemaAtuanteDia
from core.sistemas_atuantes import CATALOGO


def _periodo(ano: int, mes: int | None, hoje: dt.date):
    if mes:
        ini, fim = dt.date(ano, mes, 1), dt.date(ano, mes, calendar.monthrange(ano, mes)[1])
    else:
        ini, fim = dt.date(ano, 1, 1), dt.date(ano, 12, 31)
    return ini, min(fim, hoje) if ini <= hoje else ini - dt.timedelta(days=1)


def _sequencias(datas_por_sistema: dict[str, list[dt.date]]) -> dict[str, dict]:
    out = {}
    for sid, datas in datas_por_sistema.items():
        melhor, atual = None, None
        for d in sorted(datas):
            atual = [atual[0], d] if atual and (d - atual[1]).days == 1 else [d, d]
            if melhor is None or (atual[1] - atual[0]).days > (melhor[1] - melhor[0]).days:
                melhor = list(atual)
        out[sid] = {"dias": 0, "inicio": None, "fim": None} if not melhor else {"dias": (melhor[1] - melhor[0]).days + 1, "inicio": melhor[0].isoformat(), "fim": melhor[1].isoformat()}
    return out


def relatorio(ano: int, mes: int | None = None, hoje: dt.date | None = None) -> dict:
    hoje = hoje or dt.date.today()
    ini, fim = _periodo(ano, mes, hoje)
    registros = {o.data: o for o in SistemaAtuanteDia.objects.filter(data__gte=ini, data__lte=fim)}
    dias_periodo = (fim - ini).days + 1 if fim >= ini else 0
    todos = [ini + dt.timedelta(days=i) for i in range(dias_periodo)]
    em_branco = [d.isoformat() for d in todos if d not in registros]
    n_reg = len(registros)

    qualquer: dict[str, list[dt.date]] = {c["id"]: [] for c in CATALOGO}
    principal: dict[str, int] = {c["id"]: 0 for c in CATALOGO}
    outros: dict[str, int] = {}
    por_mes: dict[int, dict[str, int]] = {}
    multiplos = 0
    for d, o in sorted(registros.items()):
        ids = [s for s in o.sistemas if s in qualquer]
        for s in ids:
            qualquer[s].append(d)
            por_mes.setdefault(d.month, {}).setdefault(s, 0)
            por_mes[d.month][s] += 1
        if ids:
            principal[ids[0]] += 1
        if len(ids) + (1 if o.outro else 0) > 1:
            multiplos += 1
        if o.outro:
            outros[o.outro] = outros.get(o.outro, 0) + 1
    seq = _sequencias(qualquer)
    sistemas = [
        {
            "id": c["id"], "rotulo": c["rotulo"], "cor": c["cor"], "dias": len(qualquer[c["id"]]),
            "pct": round(100 * len(qualquer[c["id"]]) / n_reg, 1) if n_reg else 0.0,
            "como_principal": principal[c["id"]], "maior_sequencia": seq[c["id"]],
        }
        for c in CATALOGO
    ]
    analitico = [{"data": d.isoformat(), "sistemas": [s for s in o.sistemas], "outro": o.outro} for d, o in sorted(registros.items())]
    meses = []
    if not mes:
        for m in range(1, 13):
            mi, mf = _periodo(ano, m, hoje)
            n = (mf - mi).days + 1 if mf >= mi else 0
            regs = sum(1 for d in registros if d.month == m)
            meses.append({"mes": m, "dias": n, "registrados": regs, "contagens": por_mes.get(m, {})})
    return {
        "ano": ano, "mes": mes, "inicio": ini.isoformat(), "fim": fim.isoformat(), "dias_no_periodo": dias_periodo, "dias_com_registro": n_reg,
        "dias_com_mais_de_um_sistema": multiplos, "dias_em_branco": em_branco, "sistemas": sistemas,
        "outros_texto_livre": sorted(({"texto": t, "dias": n} for t, n in outros.items()), key=lambda x: -x["dias"]),
        "analitico": analitico, "meses": meses, "catalogo": CATALOGO,
    }
