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
        self.assertEqual(len(d["catalogo"]), 9)

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
