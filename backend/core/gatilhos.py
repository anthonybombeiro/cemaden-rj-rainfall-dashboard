"""Avaliação dos gatilhos pluviométricos de sirene (2026-09-29).

Cada gatilho (GI-GIV) é avaliado de forma INDEPENDENTE dos demais — pode
disparar só um, vários ou nenhum, dependendo da situação dos acumulados
(confirmado pelo usuário). GI usa só a chuva de 1h; GII/GIII/GIV têm DUAS
condições que precisam ser atingidas SIMULTANEAMENTE (1h + a janela mais
longa da coluna).

Bandas (confirmado pelo usuário):
- "condicionado" (amarelo): valor entre 95% e 110% do gatilho (ou seja,
  "5% abaixo até estar prestes a virar obrigatório").
- "obrigatorio" (laranja): valor >= 110% do gatilho.
- "acionado" (vermelho): NÃO é calculado aqui — é sobreposto depois pelo
  estado REAL de "tocando" (a sirene já disparou de verdade, segundo o
  portal GridLab). Ver `aplicar_estado_real` abaixo.

Município sem `GatilhoPluviometrico` cadastrado (só fazemos a gestão de
13 municípios) → todos os 4 gatilhos ficam `None` (a tabela mostra "--",
não "normal").
"""

from __future__ import annotations

CONDICIONADO_MIN_FRACAO = 0.95
OBRIGATORIO_MIN_FRACAO = 1.10


def _status_simples(valor: float | None, limite: float | None) -> str | None:
    if valor is None or limite is None:
        return None
    if valor >= limite * OBRIGATORIO_MIN_FRACAO:
        return "obrigatorio"
    if valor >= limite * CONDICIONADO_MIN_FRACAO:
        return "condicionado"
    return None


def _status_composto(v1: float | None, l1: float | None, v2: float | None, l2: float | None) -> str | None:
    """GII/GIII/GIV: as DUAS condições precisam bater na mesma banda."""
    if v1 is None or l1 is None or v2 is None or l2 is None:
        return None
    if v1 >= l1 * OBRIGATORIO_MIN_FRACAO and v2 >= l2 * OBRIGATORIO_MIN_FRACAO:
        return "obrigatorio"
    if v1 >= l1 * CONDICIONADO_MIN_FRACAO and v2 >= l2 * CONDICIONADO_MIN_FRACAO:
        return "condicionado"
    return None


def avaliar_gatilhos(gatilho_config, chuva_1h, chuva_24h, chuva_96h, chuva_30d) -> dict[str, str | None]:
    """`gatilho_config` é uma instância de GatilhoPluviometrico ou None (município
    sem gestão de gatilhos). Retorna {"GI": ..., "GII": ..., "GIII": ..., "GIV": ...}
    com valores "condicionado" / "obrigatorio" / None (None = não definido OU não atingido —
    o chamador distingue os dois casos pelo `gatilho_config is None`)."""
    if gatilho_config is None:
        return {"GI": None, "GII": None, "GIII": None, "GIV": None}
    return {
        "GI": _status_simples(chuva_1h, gatilho_config.gatilho_i_1h_mm),
        "GII": _status_composto(chuva_1h, gatilho_config.gatilho_ii_1h_mm, chuva_24h, gatilho_config.gatilho_ii_24h_mm),
        "GIII": _status_composto(chuva_1h, gatilho_config.gatilho_iii_1h_mm, chuva_96h, gatilho_config.gatilho_iii_96h_mm),
        "GIV": _status_composto(chuva_1h, gatilho_config.gatilho_iv_1h_mm, chuva_30d, gatilho_config.gatilho_iv_30d_mm),
    }


def aplicar_estado_real(status_calculado: dict[str, str | None], tocando: bool, gatilho_definido: bool) -> dict[str, str | None]:
    """Sobrepõe "acionado" (realidade — sirene já tocando) por cima do status
    calculado. Se o município não tem gatilho definido, mantém "--" (None)
    mesmo tocando — não dá pra dizer QUAL gatilho, mas o resto da tela
    (coluna Status/Toque) já mostra que está tocando de qualquer forma."""
    if not tocando or not gatilho_definido:
        return status_calculado
    return {k: "acionado" for k in status_calculado}
