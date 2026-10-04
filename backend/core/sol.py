"""Nascer e pôr do sol por REDEC/dia (2026-2035) — tabela de referência do CEMADEN-RJ.

Arquivo de origem: `DADOS DE REFERENCIA/Meteorologia/tabela_nascer_por_sol_redecs_2026_2035.json`
(40.172 linhas = 11 REDECs x 3.652 dias; horários locais, UTC-03:00, calculados para
o município-sede de cada REDEC). Convertido para um formato compacto
(`core/data/sol_redecs_2026_2035.json`, ~560 KB): por região, a data inicial e a
lista de "HH:MM HH:MM" (nascer pôr), um item por dia consecutivo.

Uso: pré-preenche a previsão do tempo (`Previsao.nascer_sol` / `por_sol`) quando o
operador não informa; o valor gravado continua editável.
"""

from __future__ import annotations

import datetime as dt
import json
from functools import lru_cache
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parent / "data" / "sol_redecs_2026_2035.json"


@lru_cache(maxsize=1)
def _tabela() -> dict:
    try:
        with open(ARQUIVO, encoding="utf-8") as f:
            return json.load(f).get("regioes", {})
    except (OSError, ValueError):
        return {}


def sol_para(regiao: str, data: dt.date | str) -> tuple[str, str] | None:
    """(nascer, pôr) "HH:MM" da REDEC no dia, ou None se a tabela não cobre
    a região/data (fora de 2026-2035) ou não está disponível."""
    reg = _tabela().get((regiao or "").strip().upper())
    if not reg:
        return None
    if isinstance(data, str):
        try:
            data = dt.date.fromisoformat(data)
        except ValueError:
            return None
    ini = dt.date.fromisoformat(reg["inicio"])
    i = (data - ini).days
    if i < 0 or i >= len(reg["v"]):
        return None
    nascer, por = reg["v"][i].split(" ")
    return nascer, por


def sol_do_dia(data: dt.date | str) -> dict[str, dict[str, str]]:
    """{região: {"nascer": ..., "por": ...}} de todas as REDECs no dia."""
    out = {}
    for regiao in _tabela():
        s = sol_para(regiao, data)
        if s:
            out[regiao] = {"nascer": s[0], "por": s[1]}
    return out
