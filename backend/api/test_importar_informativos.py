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


class ImportacaoPelaNumeracaoTest(TestCase):
    """Data em texto ambígua só é aceita quando a ordem dos números prova qual é; o asterisco do reenvio não derruba o número."""

    def planilha(self):
        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "2026"
        ws.append([None, "NÚMERO", "ANO", "DATA", "HORA", "REDEC", "CHUVA", "VENTO", "SMS"])
        ws.append([None, None, None, None, None, None, "CHUVA", "VENTO", None])
        ws.append([None, 1.0, 2026.0, dt.datetime(2026, 3, 2), "10:00:00", "NORTE", "Moderada", None, "NÃO"])
        ws.append([None, 2.0, 2026.0, "04/03/2026", "11:00:00", "NORTE", "Moderada", None, "NÃO"])  # 4 de março cabe entre 1 e 3; 3 de abril não
        ws.append([None, "3*", 2026.0, dt.datetime(2026, 3, 5), "12:00:00", "NORTE", "Forte", None, "SIM"])  # reenvio marcado com asterisco
        ws.append([None, 4.0, 2026.0, "04/10/2026", "13:00:00", "NORTE", "Fraca", None, "NÃO"])  # nenhuma leitura cabe depois do nº 3 e antes de nada: 04/10 e 10/04 caberiam
        caminho = os.path.join(tempfile.mkdtemp(), "c.xlsx")
        wb.save(caminho)
        return caminho

    def test_resolve_so_o_que_a_numeracao_prova(self):
        call_command("importar_informativos", self.planilha(), "--gravar", "--relatorio", os.path.join(tempfile.mkdtemp(), "r.csv"), stdout=StringIO())
        nums = sorted(InformativoMeteorologico.objects.values_list("numero", flat=True))
        self.assertEqual(nums, [1, 2, 3])  # nº 4: as duas leituras cabem depois do nº 3 → ambíguo, fica para revisão
        self.assertEqual(InformativoMeteorologico.objects.get(numero=2).emitido_em.date(), dt.date(2026, 3, 4))

    def test_json_e_endpoint_do_servidor(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient

        from core import importacao_informativos as imp

        arq = os.path.join(tempfile.mkdtemp(), "i.json")
        call_command("importar_informativos", self.planilha(), "--json", arq, "--relatorio", os.path.join(tempfile.mkdtemp(), "r.csv"), stdout=StringIO())
        self.assertEqual(InformativoMeteorologico.objects.count(), 0)  # só gerou o arquivo
        grupos, revisao = imp.de_json(open(arq, encoding="utf-8").read())
        self.assertEqual(sorted(grupos), [(2026, 1), (2026, 2), (2026, 3)])
        self.assertTrue(revisao)
        imp.ARQUIVO, original = __import__("pathlib").Path(arq), imp.ARQUIVO
        try:
            u = get_user_model().objects.create_user("comum", password="x")
            c = APIClient()
            c.force_authenticate(u)
            self.assertEqual(c.post("/api/admin/importar-informativos/", {}, format="json").status_code, 403)  # só superusuário
            adm = get_user_model().objects.create_superuser("adm", "a@a.com", "x")
            c.force_authenticate(adm)
            r = c.post("/api/admin/importar-informativos/", {"dry_run": True}, format="json").json()
            self.assertEqual((r["a_importar"], InformativoMeteorologico.objects.count()), (3, 0))
            r = c.post("/api/admin/importar-informativos/", {}, format="json").json()
            self.assertEqual(r["importados"], 3)
            r = c.post("/api/admin/importar-informativos/", {}, format="json").json()
            self.assertEqual((r["importados"], r["ja_existiam"]), (0, 3))  # repetível
        finally:
            imp.ARQUIVO = original


def timezone_hora(valor):
    from django.utils import timezone

    return f"{timezone.localtime(valor):%H:%M}"
