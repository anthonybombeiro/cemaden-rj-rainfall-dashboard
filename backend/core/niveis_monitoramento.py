"""Níveis de Monitoramento (NM 0 a NM 5) do PLANCON 2026/2027 — regras e dados de apoio.

Base: Portaria MIDR nº 2.458/2026 (art. 12) e PLANCON 2026/2027, itens 2.5, 2.5.1 e 2.6 (docs/nivel-monitoramento-plancon.md).
O NM é definido por município; a antecedência e a ação esperada da população limitam o nível (Severo = impacto em até 2 h,
área delimitada e ação de autoproteção); Severo e Extremo exigem aprovação e aviso prévio à COMDEC e à REDEC."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

NIVEIS = {
    0: {"sigla": "NM 0", "nome": "Vigilância", "cor": "#92d050", "alerta": "Sem alerta à população", "ferramentas": [], "nr": "NR 0"},
    1: {"sigla": "NM 1", "nome": "Baixo", "cor": "#ffff00", "alerta": "Sem envio pela Idap", "ferramentas": [], "nr": "NR 1"},
    2: {"sigla": "NM 2", "nome": "Moderado", "cor": "#ffc000", "alerta": "Alerta Moderado", "ferramentas": ["Google Alertas", "Telegram", "WhatsApp", "SMS (opcional)"], "nr": "NR 1"},
    3: {"sigla": "NM 3", "nome": "Alto", "cor": "#ff0000", "alerta": "Alerta Alto", "ferramentas": ["Google Alertas", "Telegram", "WhatsApp", "SMS"], "nr": "NR 2"},
    4: {"sigla": "NM 4", "nome": "Severo", "cor": "#c000ff", "alerta": "Alerta Severo", "ferramentas": ["Google Alertas", "Telegram", "WhatsApp", "SMS", "TV por assinatura", "DCA"], "nr": "NR 2 (NR 3+ conforme impacto)"},
    5: {"sigla": "NM 5", "nome": "Extremo", "cor": "#4b0761", "alerta": "Alerta Extremo", "ferramentas": ["Google Alertas", "Telegram", "WhatsApp", "SMS", "TV por assinatura", "DCA"], "nr": "NR 2 (NR 3+ conforme impacto)"},
}
VIGENCIA_MAX_H = 24  # a vigência do alerta acompanha a do aviso técnico, limitada a 24 h (Anexo III, item 5)

# piso do NM a partir do grau de risco técnico (matriz de equivalência do PLANCON): muito alto previsto com antecedência > 2 h = NM 3
PISO_POR_RISCO = {"muito_baixo": 0, "baixo": 1, "moderado": 2, "alto": 3, "muito_alto": 3}

EQUIPES = {"met": "Meteorologia", "hid": "Hidrologia", "geo": "Geologia"}
ANTECEDENCIAS = {"mais_2h": "Mais de 2 h", "ate_2h": "Em até 2 h", "em_curso": "Em curso"}
FERRAMENTAS = ["Google Alertas", "Telegram", "WhatsApp", "SMS", "TV por assinatura", "DCA"]


@lru_cache(maxsize=1)
def municipios_redec() -> dict[str, dict]:
    """{município canônico: {redec, regiao, lat, lon, autonomo_dca}} dos 92 municípios (core/data/municipio_redec.json)."""
    return json.loads((Path(__file__).resolve().parent / "data" / "municipio_redec.json").read_text(encoding="utf-8"))


def validar_registro(d: dict) -> list[str]:
    """Regras do PLANCON para lançar um nível. `d` traz nivel (int), equipe, antecedencia, area_delimitada, populacao_exposta,
    aprovado_por, comdec_avisada_em, redec_avisada_em, aviso_simultaneo, aviso_motivo, motivo, ferramentas (lista).
    Devolve a lista de erros (vazia = pode registrar)."""
    erros: list[str] = []
    nivel = d["nivel"]
    ferr = set(d.get("ferramentas") or [])
    if nivel in (0, 1) and ferr:
        erros.append("NM 0 e NM 1 não têm envio pela Idap: retire as ferramentas.")
    if nivel in (2, 3) and ferr & {"TV por assinatura", "DCA"}:
        erros.append("TV por assinatura e DCA são vedados nos NM 2 e NM 3 (art. 13 da Portaria).")
    if nivel >= 3 and not (d.get("motivo") or "").strip():
        erros.append("Informe o motivo / a justificativa técnica (gatilho, fenômeno ou risco que sustenta o nível).")
    if nivel >= 4:
        if d.get("antecedencia") == "mais_2h":
            erros.append("NM 4 – Severo exige impacto em até 2 h (art. 12, parágrafo único): com mais de 2 h o máximo é NM 3 – Alto.")
        elif not d.get("antecedencia"):
            erros.append("Informe a antecedência do impacto (até 2 h ou em curso).")
        if not d.get("area_delimitada"):
            erros.append("Sem área delimitada (polígono / KMZ da COMDEC) não há NM 4 nem DCA: mantenha o NM 3 até haver polígono.")
        if not d.get("populacao_exposta"):
            erros.append("Confirme a população exposta na área delimitada.")
        if not (d.get("aprovado_por") or "").strip():
            erros.append("Informe quem aprovou (Diretor do CEMADEN-RJ ou Oficial de Ligação).")
        if not d.get("equipe"):
            erros.append("Informe a equipe que originou o nível (meteorologia, hidrologia ou geologia).")
        avisos = d.get("comdec_avisada_em") and d.get("redec_avisada_em")
        if not avisos and not (nivel == 5 and d.get("aviso_simultaneo") and (d.get("aviso_motivo") or "").strip()):
            erros.append("Registre o horário do aviso à COMDEC e à REDEC (no NM 5 pode ser simultâneo ao envio, com o motivo).")
    return erros
