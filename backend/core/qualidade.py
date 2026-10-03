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


def registrar_qualidade_chuva(leituras_criadas: list, agora: dt.datetime) -> int:
    """Qualifica as leituras de chuva NOVAS de uma rodada (pares
    `(dict_da_leitura, Reading)` do gancho `pos_ingestao`) e grava só as
    exceções em `LeituraQualidade` (ausência = válida). Além das regras de
    `qualificar_chuva_intervalo`, aceita uma dica do conector no dict da
    leitura (`qc_hint = (qualidade, motivo)`), usada para sinais próprios da
    fonte (ex.: total do dia que regrediu, `qcStatus` do Wunderground). Uma
    regra de "inválido" nunca é rebaixada pela dica. Devolve quantas gravou."""
    from core.models import LeituraQualidade, Reading

    gravadas = 0
    for rd, leitura in leituras_criadas:
        if rd["reading_type"] != Reading.ReadingType.CHUVA_MM:
            continue
        hint = rd.get("qc_hint")
        if hint and hint[0] == "ok":
            continue  # dica ("ok", motivo): 1a leitura do dia de fonte de total corrido (balde = total desde 00h)
        q = qualificar_chuva_intervalo(rd["value"], rd["timestamp"], agora)
        if hint and (q is None or q[0] != "invalido"):
            q = hint
        if q:
            _, criada = LeituraQualidade.objects.get_or_create(
                reading=leitura, defaults={"qualidade": q[0], "motivo": q[1][:120]}
            )
            gravadas += int(criada)
    return gravadas
