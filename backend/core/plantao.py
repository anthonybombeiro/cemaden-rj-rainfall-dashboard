"""Checklist do plantão da meteorologia (turno 07 h → 07 h) conforme o Protocolo de Meteorologia 2026, "Rotinas do técnico em meteorologia".

A lista de itens e os horários ficam aqui (mudar o protocolo = mudar esta lista); o banco guarda só as marcas "feito" (`ItemPlantao`).
`dias_semana` (0 = segunda) e `dia_mes` limitam o item a certos turnos; `condicional` = só se a situação ocorrer (não conta como pendência).
`hora` None = sem horário fixo no dia."""

from __future__ import annotations

import datetime as dt

from django.utils import timezone

INICIO_TURNO = dt.time(7, 0)

ITENS: list[dict] = [
    {"codigo": "troca_inicio", "hora": "07:00", "titulo": "Troca de plantão", "detalhe": "Receber a passagem do técnico anterior e ver as pendências do turno."},
    {"codigo": "tendencia", "hora": None, "titulo": "Tendência meteorológica", "detalhe": "Sai às segundas e quintas (4 dias à frente).", "dias_semana": [0, 3]},
    {"codigo": "sraas", "hora": "09:30", "titulo": "Tabela de funcionamento do SRAAS", "detalhe": "Status das sirenes; planilha no drive dos técnicos."},
    {"codigo": "simulado", "hora": "10:00", "titulo": "Simulado das sirenes (dia 10)", "detalhe": "Estações GRIDLAB em EM TESTE; ajudar os geólogos a contar sirenes e municípios.", "dia_mes": 10},
    {"codigo": "panorama", "hora": "10:00", "titulo": "Panorama Diário CEMADEN-RJ", "detalhe": "Montar e enviar por e-mail."},
    {"codigo": "incendio_montar", "hora": "13:00", "titulo": "Tabela de risco de incêndio", "detalhe": "Montar com os dados do INMET."},
    {"codigo": "incendio_enviar", "hora": "13:30", "titulo": "Enviar a tabela de incêndio à meteorologista"},
    {"codigo": "previsao_enviar", "hora": "15:30", "titulo": "Revisar e enviar a previsão", "detalhe": "Telegram, grupo 00 CEMADEN-RJ Operações."},
    {"codigo": "previsao_salvar", "hora": "15:40", "titulo": "Salvar a previsão no documento \"Previsão\""},
    {"codigo": "sistemas", "hora": "16:00", "titulo": "Sistemas atuantes", "detalhe": "Completar a planilha com o sistema descrito na previsão; se não houver, perguntar à meteorologista."},
    {"codigo": "verif_prev", "hora": "16:20", "titulo": "Verificação de chuva: previsão de amanhã", "detalhe": "Sim/não conforme a previsão das 15h30, sem espaços na planilha."},
    {"codigo": "maxmin_prev", "hora": "16:40", "titulo": "Temperaturas previstas por REDEC", "detalhe": "Planilha max_min do mês."},
    {"codigo": "briefing_noite", "hora": "18:00", "titulo": "Briefing noturno no Instagram"},
    {"codigo": "briefing_noite_salvar", "hora": "18:20", "titulo": "Salvar o briefing noturno na pasta"},
    {"codigo": "verif_obs", "hora": "00:00", "titulo": "Verificação de chuva: ocorrência do dia", "detalhe": "Sim se alguma estação da região passou de 1 mm em 24 h."},
    {"codigo": "maxmin_obs", "hora": "00:20", "titulo": "Temperaturas máximas e mínimas observadas"},
    {"codigo": "umidade_min", "hora": "01:00", "titulo": "Menor umidade relativa de cada estação"},
    {"codigo": "acumulados_criar", "hora": "05:30", "titulo": "Tabela de acumulados", "detalhe": "Se 3 ou mais estações passaram de 40 mm em 24 h.", "condicional": True},
    {"codigo": "acumulados_enviar", "hora": "06:00", "titulo": "Enviar a tabela de acumulados", "condicional": True},
    {"codigo": "resumo_plantao", "hora": "06:30", "titulo": "Resumo das condições observadas no plantão", "detalhe": "Grupo 00 CEMADEN-RJ."},
    {"codigo": "briefing_dia", "hora": "06:30", "titulo": "Briefing diário no Instagram"},
    {"codigo": "briefing_dia_salvar", "hora": "06:40", "titulo": "Salvar o briefing diário na pasta"},
    {"codigo": "passagem", "hora": "07:00", "titulo": "Passagem de plantão e e-mail do L.O.", "detalhe": "Enviar o Livro de ocorrências (procedimento 03).", "fim_turno": True},
]
CODIGOS = {i["codigo"] for i in ITENS}


def turno_de(agora: dt.datetime | None = None) -> dt.date:
    """Data em que começou o turno em andamento (antes das 07 h local ainda vale o turno que começou ontem)."""
    local = timezone.localtime(agora or timezone.now())
    return local.date() if local.time() >= INICIO_TURNO else local.date() - dt.timedelta(days=1)


def _prazo(data: dt.date, hora: str | None, fim_turno: bool) -> dt.datetime | None:
    if not hora:
        return None
    h, m = (int(x) for x in hora.split(":"))
    dia = data
    if fim_turno or (h, m) < (INICIO_TURNO.hour, INICIO_TURNO.minute):
        dia = data + dt.timedelta(days=1)
    return timezone.make_aware(dt.datetime.combine(dia, dt.time(h, m)))


def janela_do_turno(data: dt.date) -> tuple[dt.datetime, dt.datetime]:
    inicio = timezone.make_aware(dt.datetime.combine(data, INICIO_TURNO))
    return inicio, inicio + dt.timedelta(days=1)


def itens_do_turno(data: dt.date) -> list[dict]:
    """Itens que valem para o turno que começou em `data`, em ordem cronológica, com o prazo local de cada um."""
    out = []
    for i in ITENS:
        if "dias_semana" in i and data.weekday() not in i["dias_semana"]:
            continue
        if "dia_mes" in i and data.day != i["dia_mes"]:
            continue
        prazo = _prazo(data, i["hora"], bool(i.get("fim_turno")))
        out.append({**{k: i.get(k) for k in ("codigo", "hora", "titulo", "detalhe")}, "condicional": bool(i.get("condicional")), "prazo": prazo})
    inicio, _ = janela_do_turno(data)
    out.sort(key=lambda x: (x["prazo"] or inicio, ITENS_ORDEM[x["codigo"]]))
    return out


ITENS_ORDEM = {i["codigo"]: n for n, i in enumerate(ITENS)}
