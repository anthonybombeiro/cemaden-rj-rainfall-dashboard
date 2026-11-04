from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core.models import PrevisaoDia, SistemaAtuanteDia

URL = "/api/sistemas-atuantes/"


class SistemasAtuantesTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user("t", password="x", first_name="Téc"))

    def test_grava_le_e_repete_do_dia_anterior(self):
        r = self.client.put(URL, {"data": "2026-10-22", "sistemas": ["frente_fria", "zcas"], "outro": "Vórtice"}, format="json")
        self.assertEqual(r.status_code, 201)
        r = self.client.put(URL, {"data": "2026-10-22", "sistemas": ["zcas"]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(SistemaAtuanteDia.objects.count(), 1)
        d = self.client.get(URL, {"data": "2026-10-23"}).json()
        self.assertEqual(d["sistemas"], [])
        self.assertEqual(d["anterior"]["sistemas"], ["zcas"])
        self.assertEqual(len(d["catalogo"]), 10)

    def test_ordem_e_duplicados(self):
        self.client.put(URL, {"data": "2026-10-23", "sistemas": ["zcas", "alta_pressao", "zcas"]}, format="json")
        self.assertEqual(self.client.get(URL, {"data": "2026-10-23"}).json()["sistemas"], ["zcas", "alta_pressao"])

    def test_validacoes_e_apagar(self):
        self.assertEqual(self.client.put(URL, {"data": "2026-10-23", "sistemas": ["x"]}, format="json").status_code, 400)
        self.assertEqual(self.client.put(URL, {"data": "2026-10-23", "outro": "a" * 81}, format="json").status_code, 400)
        self.assertEqual(self.client.put(URL, {"data": "ontem"}, format="json").status_code, 400)
        self.client.put(URL, {"data": "2026-10-23", "sistemas": ["zcas"]}, format="json")
        self.client.put(URL, {"data": "2026-10-23", "sistemas": [], "outro": ""}, format="json")
        self.assertFalse(SistemaAtuanteDia.objects.exists())

    def test_mes_e_nao_mexe_na_previsao(self):
        PrevisaoDia.objects.create(data="2026-10-23", texto_geral="Texto")
        self.client.put(URL, {"data": "2026-10-23", "sistemas": ["zcas"]}, format="json")
        self.client.put(URL, {"data": "2026-11-01", "sistemas": ["zcas"]}, format="json")
        m = self.client.get(URL, {"mes": "2026-10"}).json()
        self.assertEqual([x["data"] for x in m["dias"]], ["2026-10-23"])
        self.assertEqual(PrevisaoDia.objects.get().texto_geral, "Texto")
        self.assertEqual(self.client.get(URL, {"mes": "2026-13"}).status_code, 400)

    def test_relatorio_regras(self):
        for d, s in [("2026-03-01", ["zcas", "instabilidade"]), ("2026-03-02", ["zcas"]), ("2026-03-04", ["zcas"]), ("2026-03-05", ["frente_fria"])]:
            self.client.put(URL, {"data": d, "sistemas": s}, format="json")
        self.client.put(URL, {"data": "2026-03-06", "sistemas": [], "outro": "Aproximação"}, format="json")
        r = self.client.get(URL + "relatorio/", {"ano": 2026, "mes": 3}).json()
        zc = next(x for x in r["sistemas"] if x["id"] == "zcas")
        self.assertEqual((zc["dias"], zc["como_principal"]), (3, 3))
        self.assertEqual(zc["maior_sequencia"]["dias"], 2)  # o dia 03 em branco interrompe
        self.assertEqual(next(x for x in r["sistemas"] if x["id"] == "instabilidade")["dias"], 1)
        self.assertEqual(r["dias_com_registro"], 5)
        self.assertIn("2026-03-03", r["dias_em_branco"])
        self.assertEqual(r["dias_com_mais_de_um_sistema"], 1)
        self.assertEqual(r["outros_texto_livre"], [{"texto": "Aproximação", "dias": 1}])
        anual = self.client.get(URL + "relatorio/", {"ano": 2026}).json()
        self.assertEqual(anual["meses"][2]["contagens"]["zcas"], 3)
        self.assertEqual(self.client.get(URL + "relatorio/", {"ano": "x"}).status_code, 400)
