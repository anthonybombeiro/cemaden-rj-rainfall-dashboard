"""Importa o histórico de informativos da planilha de controle (abas 2020 a 2026) para o painel.

Uso (rodar LOCAL primeiro; em produção só com autorização explícita):
    python manage.py importar_informativos CAMINHO.xlsx                 # simulação: mostra o que faria e grava o relatório
    python manage.py importar_informativos CAMINHO.xlsx --gravar        # grava
    python manage.py importar_informativos CAMINHO.xlsx --anos 2025 2026 --relatorio saida.csv

Regras: cada informativo (ano, número) vira um registro `importado=True`, estado enviado, uma linha por REDEC; (ano, número) que já existe não é tocado
(importação repetível). Nunca adivinha: REDEC ou intensidade que a normalização não reconhece vão para o relatório de revisão e a linha fica de fora.
A planilha tem só a previsão e o SMS (não tem o texto), então o texto não é reconstruído: `texto_livre=True` com observação indicando a origem."""

from __future__ import annotations

import csv
import datetime as dt
from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core import informativos as inf
from core.models import InformativoMeteorologico, InformativoRegiao

COLUNAS = {"numero": 1, "ano": 2, "data": 3, "hora": 4, "regiao": 5, "chuva": 6, "vento": 7, "sms": 8}  # índices (base 0) da planilha
VENTO = {"fraco": "", "moderado": "moderado", "forte": "forte"}


def _sms(valor) -> bool:
    return str(valor or "").strip().upper().replace("Ã", "A") == "SIM"


def _data(valor) -> dt.date | None:
    """Data da célula: datetime válido, ou texto sem ambiguidade (m/d/aaaa quando o 2º número passa de 12; d/m/aaaa quando o 1º passa de 12).
    Texto ambíguo (ex.: 04/10/2022) NÃO é adivinhado — a data vem de outra linha do mesmo informativo ou o informativo vai para revisão."""
    if isinstance(valor, dt.datetime):
        return valor.date() if 2019 < valor.year < 2100 else None
    partes = str(valor or "").strip().replace("-", "/").split("/")
    try:
        a, b, ano = (int(x) for x in partes)
    except ValueError:
        return None
    try:
        if a > 12 >= b:
            return dt.date(ano, b, a)
        if b > 12 >= a:
            return dt.date(ano, a, b)
    except ValueError:
        return None
    return None


def _hora(valor) -> dt.time | None:
    if isinstance(valor, dt.datetime):
        return valor.time()
    if isinstance(valor, dt.time):
        return valor
    try:
        h, m = str(valor).strip().split(":")[:2]
        return dt.time(int(h), int(m))
    except (ValueError, TypeError):
        return None


class Command(BaseCommand):
    help = "Importa os informativos meteorológicos da planilha de controle (2020-2026)."

    def add_arguments(self, parser):
        parser.add_argument("arquivo")
        parser.add_argument("--gravar", action="store_true", help="Sem esta opção apenas simula.")
        parser.add_argument("--anos", nargs="*", type=int, help="Só estes anos (nomes das abas).")
        parser.add_argument("--relatorio", default="importacao_informativos_revisao.csv")

    def handle(self, *args, arquivo, gravar, anos, relatorio, **opts):
        try:
            import openpyxl
        except ImportError as e:  # só necessário para esta importação, que roda localmente
            raise CommandError("Instale openpyxl (pip install openpyxl) para importar a planilha.") from e
        wb = openpyxl.load_workbook(arquivo, data_only=True, read_only=True)
        grupos: dict[tuple[int, int], dict] = defaultdict(lambda: {"quando": None, "linhas": [], "sem_data": []})
        revisao: list[list] = []
        for ws in wb.worksheets:
            if not ws.title.strip().isdigit():
                continue
            if anos and int(ws.title) not in anos:
                continue
            for n, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
                c = {k: (row[i] if i < len(row) else None) for k, i in COLUNAS.items()}
                if c["numero"] in (None, "") or not c["regiao"]:
                    continue
                try:
                    numero, ano = int(float(c["numero"])), int(float(c["ano"]))
                except (TypeError, ValueError):
                    revisao.append([ws.title, n, "número/ano ilegíveis", c["numero"], c["ano"]])
                    continue
                data, hora = _data(c["data"]), _hora(c["hora"])
                g = grupos[(ano, numero)]
                if data is None:
                    g["sem_data"].append([ws.title, n, "data ilegível ou ambígua", numero, str(c["data"])])
                elif g["quando"] is None and hora:
                    g["quando"] = timezone.make_aware(dt.datetime.combine(data, hora))
                regioes = inf.normalizar_regiao(str(c["regiao"]))
                if str(c["chuva"] or "").strip() in ("-", "–"):
                    c["chuva"] = ""  # traço = sem chuva significativa nessa REDEC
                intensidade = inf.normalizar_intensidade(str(c["chuva"] or ""))
                if not regioes:
                    revisao.append([ws.title, n, "REDEC não reconhecida", numero, c["regiao"]])
                    continue
                if str(c["chuva"] or "").strip() and not intensidade:
                    revisao.append([ws.title, n, "intensidade não reconhecida", numero, c["chuva"]])
                    continue
                vento = VENTO.get(str(c["vento"] or "").strip().lower().split("/")[-1], "")
                for r in regioes:
                    g["linhas"].append({"regiao": r, "chuva_prevista": intensidade, "vento_previsto": vento, "sms_enviado": _sms(c["sms"])})
        for chave in [k for k, g in grupos.items() if g["quando"] is None]:
            revisao.append([str(chave[0]), "", "informativo sem data utilizável (não importado)", chave[1], ""])
            revisao.extend(grupos.pop(chave)["sem_data"])
        existentes = set(InformativoMeteorologico.objects.values_list("ano", "numero"))
        novos = {k: v for k, v in grupos.items() if k not in existentes}
        self.stdout.write(f"Informativos na planilha: {len(grupos)} · já existentes: {len(grupos) - len(novos)} · a importar: {len(novos)} · linhas para revisão: {len(revisao)}")
        por_ano: dict[int, int] = defaultdict(int)
        for ano, _ in novos:
            por_ano[ano] += 1
        for ano in sorted(por_ano):
            numeros = [n for a, n in grupos if a == ano]
            self.stdout.write(f"  {ano}: {por_ano[ano]} novos · lacunas na numeração: {len(inf.lacunas(numeros))}")
        if revisao:
            with open(relatorio, "w", newline="", encoding="utf-8-sig") as f:
                w = csv.writer(f, delimiter=";")
                w.writerow(["aba", "linha", "problema", "informativo", "valor"])
                w.writerows(revisao)
            self.stdout.write(f"Relatório de revisão: {relatorio}")
        if not gravar:
            self.stdout.write(self.style.WARNING("Simulação: nada foi gravado (use --gravar)."))
            return
        with transaction.atomic():
            for (ano, numero), g in sorted(novos.items()):
                i = InformativoMeteorologico.objects.create(
                    numero=numero, ano=ano, estado="enviado", emitido_em=g["quando"], enviado_em=g["quando"], enviado_por="Importado da planilha",
                    criado_por="Importado da planilha", importado=True, texto_livre=True,
                    observacao="Importado da planilha de controle: só previsão e SMS por REDEC (o texto original não consta na planilha).",
                )
                vistos = {}
                for linha in g["linhas"]:
                    vistos[linha["regiao"]] = linha  # a última linha da REDEC prevalece
                InformativoRegiao.objects.bulk_create([InformativoRegiao(informativo=i, **linha) for linha in vistos.values()])
        self.stdout.write(self.style.SUCCESS(f"Importados {len(novos)} informativos."))
