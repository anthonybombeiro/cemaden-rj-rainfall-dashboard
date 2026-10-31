"""Catálogo fixo dos sistemas atuantes (levantamento de 28/10/2026, §4.8). A ordem e as cores valem para o formulário e o calendário."""

CATALOGO = [
    {"id": "alta_pressao", "rotulo": "Alta pressão", "cor": "#85B7EB"},
    {"id": "baixa_pressao", "rotulo": "Baixa pressão", "cor": "#AFA9EC"},
    {"id": "frente_fria", "rotulo": "Frente fria", "cor": "#5DCAA5"},
    {"id": "frente_fria_oceano", "rotulo": "Frente fria no oceano", "cor": "#9FE1CB"},
    {"id": "pre_frontal", "rotulo": "Pré-frontal", "cor": "#F0997B"},
    {"id": "instabilidade", "rotulo": "Áreas de instabilidade", "cor": "#EF9F27"},
    {"id": "zcas", "rotulo": "ZCAS", "cor": "#ED93B1"},
    {"id": "transporte_umidade", "rotulo": "Transporte de umidade", "cor": "#97C459"},
    {"id": "convergencia_umidade", "rotulo": "Convergência de umidade", "cor": "#B4B2A9"},
]
IDS = {c["id"] for c in CATALOGO}
