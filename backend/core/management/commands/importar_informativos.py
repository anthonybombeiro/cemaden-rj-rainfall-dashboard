"""Importa o histórico de informativos da planilha de controle (abas 2020 a 2026) para o painel.

Uso (rodar LOCAL primeiro):
    python manage.py importar_informativos CAMINHO.xlsx                 # simulação: mostra o que faria e grava o relatório
    python manage.py importar_informativos CAMINHO.xlsx --gravar        # grava no banco do ambiente atual
    python manage.py importar_informativos CAMINHO.xlsx --json core/data/informativos_planilha.json   # gera o arquivo que o servidor importa
    python manage.py importar_informativos CAMINHO.xlsx --anos 2025 2026 --relatorio saida.csv

Regras: cada informativo (ano, número) vira um registro `importado=True`, estado enviado, uma linha por REDEC; (ano, número) que já existe não é tocado
(importação repetível). Nunca adivinha: REDEC ou intensidade que a normalização não reconhece vão para o relatório de revisão e a linha fica de fora;
data ambígua só é aceita quando a numeração prova qual é (e fica no relatório para conferência). A planilha tem só a previsão e o SMS (não tem o
texto), então o texto não é reconstruído: `texto_livre=True` com observação indicando a origem. A lógica está em `core/importacao_informativos.py`."""

from __future__ import annotations

import csv
from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError

from core import importacao_informativos as imp
from core import informativos as inf
from core.importacao_informativos import _data, _hora  # noqa: F401  (usados pelos testes)
from core.models import InformativoMeteorologico


class Command(BaseCommand):
    help = "Importa os informativos meteorológicos da planilha de controle (2020-2026)."

    def add_arguments(self, parser):
        parser.add_argument("arquivo")
        parser.add_argument("--gravar", action="store_true", help="Sem esta opção apenas simula.")
        parser.add_argument("--anos", nargs="*", type=int, help="Só estes anos (nomes das abas).")
        parser.add_argument("--relatorio", default="importacao_informativos_revisao.csv")
        parser.add_argument("--json", help="Grava o resultado da leitura neste arquivo JSON (o servidor importa a partir dele).")

    def handle(self, *args, arquivo, gravar, anos, relatorio, json=None, **opts):
        try:
            import openpyxl
        except ImportError as e:  # só necessário para esta importação, que roda localmente
            raise CommandError("Instale openpyxl (pip install openpyxl) para importar a planilha.") from e
        wb = openpyxl.load_workbook(arquivo, data_only=True, read_only=True)
        grupos, revisao = imp.ler_planilha(wb, anos)
        existentes = set(InformativoMeteorologico.objects.values_list("ano", "numero"))
        novos = {k: v for k, v in grupos.items() if k not in existentes}
        self.stdout.write(f"Informativos na planilha: {len(grupos)} · já existentes: {len(grupos) - len(novos)} · a importar: {len(novos)} · linhas no relatório: {len(revisao)}")
        por_ano: dict[int, int] = defaultdict(int)
        for ano, _ in novos:
            por_ano[ano] += 1
        for ano in sorted(por_ano):
            numeros = [n for a, n in grupos if a == ano]
            self.stdout.write(f"  {ano}: {por_ano[ano]} novos · lacunas após o 1º número da aba: {len(inf.lacunas(numeros, desde=min(numeros)))}")
        if revisao:
            with open(relatorio, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f, delimiter=";")
                w.writerow(["aba", "linha", "problema", "informativo", "valor"])
                w.writerows(revisao)
            self.stdout.write(f"Relatório de revisão: {relatorio}")
        if json:
            with open(json, "w", encoding="utf-8") as f:
                f.write(imp.para_json(grupos, revisao))
            self.stdout.write(f"Arquivo para o servidor: {json}")
        if not gravar:
            self.stdout.write(self.style.WARNING("Simulação: nada foi gravado (use --gravar)."))
            return
        r = imp.gravar(grupos)
        self.stdout.write(self.style.SUCCESS(f"Importados {r['importados']} informativos."))
