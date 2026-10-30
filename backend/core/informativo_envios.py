"""Regras dos envios do informativo (Idap e radar). Só orientam o plantão: erros impedem o registro, avisos pedem confirmação. O painel não envia nada.

Base: PLANCON 2026-2027 / Portaria MIDR 2.458/2026 (Google Alertas, SMS, TV por assinatura e DCA; TV e DCA só no NM 4 e NM 5, art. 13) e o
protocolo do informativo (SMS só com previsão moderada a forte ou mais; TV só com severidade muito alta; ok do diretor)."""

from __future__ import annotations

from core import informativos as inf

# as mesmas ferramentas do lançamento do NM (core/niveis_monitoramento.FERRAMENTAS)
CANAIS_IDAP = ["Google Alertas", "Telegram", "WhatsApp", "SMS", "TV por assinatura", "DCA"]
# gravidade mínima da previsão (core/informativos.INTENSIDADES) para cada canal não gerar aviso
GRAVIDADE_MINIMA = {"SMS": 4, "Google Alertas": 3, "Telegram": 3, "WhatsApp": 3, "TV por assinatura": 6, "DCA": 6}
ROTULO_MINIMA = {4: "moderada a forte ou mais", 3: "moderada ou mais", 6: "muito forte (severidade muito alta)"}
SO_NM_4_5 = {"TV por assinatura", "DCA"}


def avaliar_idap(canal: str, itens: list[dict], autorizado_por: str, regioes: list[str]) -> tuple[list[str], list[str]]:
    """(erros, avisos) para registrar o envio de um canal da Idap deste informativo."""
    erros: list[str] = []
    avisos: list[str] = []
    if canal not in CANAIS_IDAP:
        return [f"Canal inválido: use um de {', '.join(CANAIS_IDAP)}."], []
    if not (autorizado_por or "").strip():
        erros.append("Informe quem autorizou o envio (ok do diretor ou do oficial de ligação).")
    previstas = {i["regiao"]: inf.gravidade(i.get("chuva_prevista") or "") for i in itens}
    escolhidas = [r for r in (regioes or []) if r in previstas]
    if regioes and len(escolhidas) != len(regioes):
        erros.append("Há região no envio que não consta no informativo.")
    base = [previstas[r] for r in escolhidas] if escolhidas else list(previstas.values())
    minima = GRAVIDADE_MINIMA[canal]
    if max(base + [0]) < minima:
        avisos.append(f"{canal}: a previsão deste informativo{' para as regiões escolhidas' if escolhidas else ''} é menor que {ROTULO_MINIMA[minima]}.")
    if canal in SO_NM_4_5:
        avisos.append(f"{canal} só é permitido no NM 4 (Severo) e NM 5 (Extremo) — vedado nos NM 2 e NM 3 (art. 13 da Portaria). Confirme que o NM lançado é 4 ou 5.")
    return erros, avisos
