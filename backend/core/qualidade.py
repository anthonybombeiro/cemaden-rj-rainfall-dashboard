"""Controle de qualidade de leituras de chuva (03/10/2026).

Inspirado na "Qualificação" (válido / suspeito / inválido) que a Rede Salvar do
CEMADEN mostra por leitura. É um controle PRÓPRIO e simples (limite físico e
data); não replica o algoritmo deles, que não é público. Convenção do WMO-No. 8
para QC de superfície: limite físico, consistência temporal; passo/persistência
ficam para uma próxima etapa (precisam do histórico da estação).

`qualificar_chuva_intervalo` serve para o balde de ~10 min do CEMADEN
(`ultimovalor`); os limites estão em mm POR INTERVALO DE LEITURA.
"""

from __future__ import annotations

import datetime as dt

# Chuva em 10 min: > 20 mm já é extremo para o RJ (taxa > 120 mm/h); > 50 mm
# em 10 min (> 300 mm/h) é fisicamente implausível para pluviômetro basculante.
LIMITE_SUSPEITO_MM = 20.0
LIMITE_INVALIDO_MM = 50.0
TOLERANCIA_FUTURO = dt.timedelta(minutes=10)


def qualificar_chuva_intervalo(
    valor_mm: float, timestamp: dt.datetime, agora: dt.datetime
) -> tuple[str, str] | None:
    """Devolve (qualidade, motivo) quando a leitura NÃO é válida; None = válida."""
    if valor_mm < 0:
        return ("invalido", "valor negativo")
    if valor_mm > LIMITE_INVALIDO_MM:
        return ("invalido", f"> {LIMITE_INVALIDO_MM:g} mm no intervalo (fisicamente implausível)")
    if timestamp > agora + TOLERANCIA_FUTURO:
        return ("invalido", "data/hora no futuro")
    if valor_mm > LIMITE_SUSPEITO_MM:
        return ("suspeito", f"> {LIMITE_SUSPEITO_MM:g} mm no intervalo (extremo)")
    return None
