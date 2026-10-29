import datetime as dt
import os
import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from core.management.commands.importar_informativos import _data
from core.models import InformativoMeteorologico


class DataTextoTest(TestCase):
    def test_datas(self):
        self.assertEqual(_data(dt.datetime(2026, 1, 1)), dt.date(2026, 1, 1))
        self.assertEqual(_data("4/28/2021"), dt.date(2021, 4, 28))  # americana (2º número > 12)
        self.assertEqual(_data("30/05/2021"), dt.date(2021, 5, 30))
        self.assertIsNone(_data("04/10/2022"))  # ambígua: não adivinha
        self.assertIsNone(_data("#VALUE!"))
        self.assertIsNone(_data(dt.datetime(2900, 1, 1)))


class ImportarInformativosTest(TestCase):
    def planilha(self):
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "2026"
        ws.append([None, "NÚMERO", "ANO", "DATA", "HORA", "REDEC", "CHUVA", "VENTO", "SMS"])
        ws.append([None, None, None, None, None, None, "CHUVA", "VENTO", None])
        d = dt.datetime(2026, 3, 2)
        ws.append([None, 1.0, 2026.0, d, "15:10:00", "BAIXADA LITORÂNEA", "Moderada/forte", " ", "NÃO "])
        ws.append([None, 1.0, 2026.0, d, "15:10:00", "SIL II", "Moderada", "Forte", "SIM"])
        ws.append([None, 1.0, 2026.0, d, "15:10:00", "REGIAO INEXISTENTE", "Moderada", None, "NÃO"])
        ws.append([None, 2.0, 2026.0, "04/10/2026", "16:00:00", "NORTE", "Fraca/Moderada", None, "NÃO"])  # data ambígua em todas as linhas
        ws.append([None, 3.0, 2026.0, dt.datetime(2026, 3, 3), "09:00:00", "NORTE", "-", None, "NÃO"])
        caminho = os.path.join(tempfile.mkdtemp(), "c.xlsx")
        wb.save(caminho)
        return caminho

    def roda(self, *args):
        saida = StringIO()
        call_command("importar_informativos", self.planilha(), *args, "--relatorio", os.path.join(tempfile.mkdtemp(), "r.csv"), stdout=saida)
        return saida.getvalue()

    def test_simulacao_nao_grava(self):
        self.assertIn("Simulação", self.roda())
        self.assertEqual(InformativoMeteorologico.objects.count(), 0)

    def test_grava_normaliza_e_nao_adivinha(self):
        self.roda("--gravar")
        nums = sorted(InformativoMeteorologico.objects.values_list("numero", flat=True))
        self.assertEqual(nums, [1, 3])  # nº 2 (data ambígua) fica para revisão
        i = InformativoMeteorologico.objects.get(numero=1)
        self.assertTrue(i.importado and i.texto_livre and i.estado == "enviado")
        self.assertEqual({r.regiao: (r.chuva_prevista, r.vento_previsto, r.sms_enviado) for r in i.regioes.all()},
                         {"BAIXADA LITORÂNEA": ("moderada_forte", "", False), "SUL II": ("moderada", "forte", True)})  # REDEC inexistente fora
        self.assertEqual(timezone_hora(i.emitido_em), "15:10")

    def test_repetir_nao_duplica(self):
        self.roda("--gravar")
        total = InformativoMeteorologico.objects.count()
        self.roda("--gravar")
        self.assertEqual(InformativoMeteorologico.objects.count(), total)


def timezone_hora(valor):
    from django.utils import timezone

    return f"{timezone.localtime(valor):%H:%M}"
