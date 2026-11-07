"""Importação do histórico de avisos meteorológicos de 2026 (artes das pastas mensais do Drive "2026/avisos_emitidos_*").

O módulo de avisos entrou no ar (migração 0035) sem os avisos já emitidos no ano; por isso a numeração recomeçou do 1 e dois avisos foram
cancelados. Esta importação grava os avisos que existem como arte (nº 01-05 e 08/2026), nos seus números reais, e corrige o conflito:

* aviso emitido igual (mesmo ano, número e início de vigência): não é tocado (repetível);
* rascunho que ocupa um número importado: ganha o próximo número livre (máximo + 1), sem perder o conteúdo;
* cancelado que nunca foi emitido e ocupa um número importado: sai do caminho (número 0 ou, se já usado, 900000 + id) — nunca é apagado;
* aviso emitido diferente no mesmo número: a importação para e avisa (não sobrescreve aviso real).

Lacunas (números que não estão nas pastas do Drive, hoje 06 e 07) NÃO são inventadas: ficam livres e aparecem no retorno."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.utils import timezone

from core.models import AvisoMeteorologico

ANO = 2026
USUARIO = "importação (Drive 2026)"
SENTINELA = 900000


def _d(dia: int, mes: int, hora: int) -> dt.datetime:
    return timezone.make_aware(dt.datetime(ANO, mes, dia, hora, 0))


# Texto = corpo do aviso (negrito entre **). A linha "Sistemas atuantes" sai de `sistemas`; o título "VENDAVAL" do nº 04 fica no início do texto.
AVISOS = [
    {
        "numero": 1, "inicio": _d(17, 1, 10), "fim": _d(21, 1, 0), "sistemas": ["frente_fria", "transporte_umidade"], "icones": ["chuva", "vento"],
        "texto": (
            "No final de semana (17/01 e 18/01), áreas de instabilidade influenciarão o estado. São esperadas pancadas isoladas de chuva moderadas a fortes em todo o estado.\n\n"
            "Entre a tarde de segunda-feira (19/01) e manhã de terça-feira (20/01), a aproximação e passagem de uma Frente Fria e a formação de um Canal de Umidade em baixos níveis da atmosfera "
            "causarão pancadas de chuva, com raios, de intensidade moderada a forte, pontualmente muito forte, em todo o estado. Também são esperadas ocorrências de rajadas de vento moderado a forte.\n\n"
            "Devido aos acumulados de chuva esperados para o fim de semana, a passagem dessa frente fria pode agravar o risco hidrológico e o risco de deslizamento de alguns municípios."
        ),
    },
    {
        "numero": 2, "inicio": _d(4, 2, 12), "fim": _d(9, 2, 21), "sistemas": ["zcas", "frente_fria"], "icones": ["chuva", "vento"],
        "texto": (
            "Nos próximos dias são esperados **altos acumulados** de chuva em todo o estado do Rio de Janeiro.\n\n"
            "Nessa **quarta-feira** (04/02), a passagem de uma Frente Fria pelo oceano favorecerá a formação da Zona de Convergência do Atlântico Sul (ZCAS), mantendo o tempo instável até **segunda-feira** (09/02).\n\n"
            "A previsão é de pancadas de chuva a qualquer momento do dia, de intensidade moderada a forte, pontualmente muito forte, acompanhadas de raios, em todo o estado. "
            "Também são esperadas ocorrências de rajadas de vento moderado a ocasionalmente forte.\n\n"
            "No **domingo** (08/02), a chegada de uma nova frente fria reforçará as instabilidades, com persistência da chuva e queda acentuada nas temperaturas máximas.\n\n"
            "Em função dos elevados acumulados previstos, há risco de agravamento das condições hidrológicas e aumento do risco de deslizamentos, especialmente em áreas mais vulneráveis."
        ),
    },
    {
        "numero": 3, "inicio": _d(20, 2, 14), "fim": _d(24, 2, 0), "sistemas": ["frente_fria", "convergencia_umidade"], "icones": ["chuva"],
        "texto": (
            "Nos próximos dias são esperados **altos acumulados** de chuva em todo o estado do Rio de Janeiro.\n\n"
            "Nessa **sexta-feira** (20/02), a passagem de uma Frente Fria pelo oceano e posterior convergência de umidade sobre o continente, manterá o tempo instável até o final da **segunda-feira** (23/02).\n\n"
            "A previsão é de pancadas de chuva a qualquer momento do dia, de intensidade moderada a forte, pontualmente muito forte, acompanhadas de raios, em todo o estado.\n\n"
            "As temperaturas máximas apresentarão declínio durante o final de semana.\n\n"
            "Em função dos elevados acumulados previstos, há risco de agravamento das condições hidrológicas e aumento do risco de deslizamentos, especialmente em áreas mais vulneráveis."
        ),
    },
    {
        "numero": 4, "inicio": _d(6, 8, 14), "fim": _d(9, 8, 22), "sistemas": ["frente_fria", "baixa_pressao"], "icones": ["vento"],
        "texto": (
            "**VENDAVAL**\n\n"
            "A aproximação e passagem de uma frente fria, associada a um sistema de baixa pressão, causará rajadas de vento moderadas a forte em todo estado, podendo chegar a ocasionalmente muito fortes em algumas regiões, "
            "entre a tarde de quinta-feira (06/08) e sexta-feira (07/08). Essas rajadas devem persistir até domingo (09/08). Para o período, também são esperadas chuvas fracas a moderadas, de forma isolada."
        ),
    },
    {
        "numero": 5, "inicio": _d(15, 8, 12), "fim": _d(16, 8, 0), "sistemas": ["frente_fria_oceano", "instabilidade"], "icones": ["vento", "chuva"],
        "texto": (
            "A passagem de uma frente fria pelo oceano e a formação de áreas de instabilidade sobre o estado, causarão **rajadas de vento moderado a forte** em todo estado, "
            "podendo chegar a **ocasionalmente muito forte** em algumas regiões entre a **tarde de hoje (15/08) e madrugada de amanhã (16/08)**. "
            "Também estão previstas **pancadas de chuva moderada a ocasionalmente forte** durante o mesmo período."
        ),
    },
    {
        "numero": 8, "inicio": _d(14, 9, 9), "fim": _d(15, 9, 9), "sistemas": ["baixa_pressao"], "icones": ["chuva"],
        "texto": (
            "Entre o final da manhã de segunda-feira (14/09) e a manhã da terça-feira (15/09), a atuação um sistema de baixa pressão ocasionará "
            "**pancadas de chuva moderada a ocasionalmente forte, resultando em altos acumulados em 24h em todo o estado.**"
        ),
    },
]


def _sentinela(a: AvisoMeteorologico) -> int:
    return SENTINELA + a.pk


def importar(avisos=None, dry_run: bool = False, ano: int = ANO) -> dict:
    """Grava os avisos e acerta a numeração. Devolve o que foi criado/movido, as lacunas e o próximo número. `dry_run` desfaz tudo no fim."""
    avisos = avisos if avisos is not None else AVISOS
    out: dict = {"criados": [], "ja_existiam": [], "movidos": [], "erros": []}
    with transaction.atomic():
        sentinelas: list[AvisoMeteorologico] = []
        for item in avisos:
            existente = AvisoMeteorologico.objects.filter(ano=ano, numero=item["numero"]).first()
            if existente:
                if existente.estado == "emitido" and existente.vigencia_inicio == item["inicio"]:
                    out["ja_existiam"].append(item["numero"])
                    continue
                if existente.estado == "emitido" or existente.emitido_em:
                    out["erros"].append(f"nº {item['numero']}/{ano}: já existe um aviso emitido diferente; não foi sobrescrito.")
                    continue
                antigo = existente.numero
                existente.numero = _sentinela(existente)
                existente.historico = [*existente.historico, {"em": timezone.now().isoformat(), "por": USUARIO, "acao": f"número {antigo} cedido ao aviso importado"}]
                existente.save()
                out["movidos"].append({"id": existente.pk, "estado": existente.estado, "de": antigo})
                if existente.estado == "rascunho":
                    sentinelas.append(existente)
                else:  # cancelado que nunca foi emitido: fica sem número (0), se estiver livre
                    existente.numero = 0 if not AvisoMeteorologico.objects.filter(ano=ano, numero=0).exists() else existente.numero
                    existente.save()
            AvisoMeteorologico.objects.create(
                numero=item["numero"], ano=ano, estado="emitido", vigencia_inicio=item["inicio"], vigencia_fim=item["fim"], regioes=[],
                sistemas=item["sistemas"], icones=item["icones"], texto=item["texto"], criado_por=USUARIO, emitido_por=USUARIO,
                emitido_em=item["inicio"], historico=[{"em": timezone.now().isoformat(), "por": USUARIO, "acao": "importou (arte do Drive)"}],
            )
            out["criados"].append(item["numero"])
        # rascunhos que cederam o número: próximo número livre (máximo real + 1), na ordem em que foram criados
        reais = [n for n in AvisoMeteorologico.objects.filter(ano=ano).exclude(numero__gte=SENTINELA).values_list("numero", flat=True)]
        proximo = max(reais or [0]) + 1
        for r in sorted(sentinelas, key=lambda x: x.criado_em):
            r.numero = proximo
            r.historico = [*r.historico, {"em": timezone.now().isoformat(), "por": USUARIO, "acao": f"renumerado para {proximo}"}]
            r.save()
            out["movidos"] = [{**m, "para": proximo} if m["id"] == r.pk else m for m in out["movidos"]]
            proximo += 1
        numeros = sorted(AvisoMeteorologico.objects.filter(ano=ano, numero__gt=0, numero__lt=SENTINELA).values_list("numero", flat=True))
        out["lacunas"] = [n for n in range(1, (numeros[-1] if numeros else 0) + 1) if n not in numeros]
        out["proximo_numero"] = (numeros[-1] if numeros else 0) + 1
        if dry_run:
            transaction.set_rollback(True)
    out["dry_run"] = dry_run
    return out
