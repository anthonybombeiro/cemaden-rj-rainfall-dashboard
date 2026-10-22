"""Importação da planilha de controle de recomendações (2020–2026) para o banco.

Lê `core/data/recomendacoes_planilha.json` (gerado por backend/scripts/preparar_recomendacoes_planilha.py) e grava:
* `RecomendacaoAlarme` (uma por número NN_AAAA) com origem "planilha";
* `AcionamentoMunicipio` (mobilizações feitas pelo próprio município).

Seguro para rodar mais de uma vez: recomendação que já existe (mesmo número) é **pulada** (não sobrescreve o que foi editado no
painel); acionamento igual (município, data, hora, sirene) também. `dry_run=True` só conta, sem gravar.
"""
from __future__ import annotations

import datetime
import json
from pathlib import Path

from django.utils import timezone

from core.models import AcionamentoMunicipio, RecomendacaoAlarme

ARQUIVO = Path(__file__).resolve().parent / "data" / "recomendacoes_planilha.json"


def _hora(t):
    return datetime.time.fromisoformat(t) if t else None


def importar(dry_run: bool = False) -> dict:
    dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    agora = timezone.now()
    res = {"recomendacoes_novas": 0, "recomendacoes_ja_existiam": 0, "acionamentos_novos": 0, "acionamentos_ja_existiam": 0, "dry_run": dry_run}

    existentes = set(RecomendacaoAlarme.objects.values_list("numero", flat=True))
    for r in dados["recomendacoes"]:
        if r["numero"] in existentes:
            res["recomendacoes_ja_existiam"] += 1
            continue
        res["recomendacoes_novas"] += 1
        if dry_run:
            continue
        RecomendacaoAlarme.objects.create(
            numero=r["numero"],
            municipio=r["municipio"],
            data=datetime.date.fromisoformat(r["data"]),
            hora=_hora(r["hora"]),
            probabilidade=r["probabilidade"],
            estacao=r["estacao"],
            indice_alcancado=r["indice_alcancado"][:200],
            chuva_1h_mm=r["chuva_1h_mm"],
            chuva_24h_mm=r["chuva_24h_mm"],
            chuva_96h_mm=r["chuva_96h_mm"],
            chuva_30d_mm=r["chuva_30d_mm"],
            gatilho=r["gatilho"],
            estagio_operacional=r["estagio_operacional"],
            acionaram=r["acionaram"],
            sirenes_qtd=r["sirenes_qtd"],
            sirenes_acionadas=r["sirenes_acionadas"],
            responsavel=r["responsavel"],
            observacao=r["observacao"],
            origem="planilha",
            criado_por="importação da planilha",
            atualizado_por="importação da planilha",
            validado_por="planilha" if r["acionaram"] is not None else "",
            validado_em=agora if r["acionaram"] is not None else None,
        )

    chaves = {(a.municipio, a.data, a.hora, a.sirene) for a in AcionamentoMunicipio.objects.all()}
    for a in dados["acionamentos_municipio"]:
        chave = (a["municipio"], datetime.date.fromisoformat(a["data"]), _hora(a["hora"]), a["sirene"])
        if chave in chaves:
            res["acionamentos_ja_existiam"] += 1
            continue
        res["acionamentos_novos"] += 1
        if dry_run:
            continue
        AcionamentoMunicipio.objects.create(
            municipio=a["municipio"],
            data=chave[1],
            hora=chave[2],
            probabilidade=a["probabilidade"],
            sirene=a["sirene"],
            tipo_alarme=a["tipo_alarme"],
            quantidade=a["quantidade"],
            responsavel=a["responsavel"],
            observacao=a["observacao"],
            origem="planilha",
            criado_por="importação da planilha",
            atualizado_por="importação da planilha",
        )
    return res
