import datetime as dt

from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Previsao, PrevisaoDia

from .test_previsao_dia import previsao


class PublicoPrevisaoTest(APITestCase):
    def setUp(self):
        self.hoje = timezone.localdate()
        self.amanha = self.hoje + dt.timedelta(days=1)

    def _cria(self, regiao, dia, **kw):
        d = previsao(regiao, dia.isoformat(), **kw)
        d["data"] = dia
        return Previsao.objects.create(**d, criado_por="Fulano de Tal", atualizado_por="Beltrano")

    def test_sem_login_devolve_o_dia_mais_recente_e_o_texto_geral(self):
        self._cria("CAPITAL", self.hoje)
        self._cria("CAPITAL", self.amanha)
        self._cria("NORTE", self.amanha)
        PrevisaoDia.objects.create(data=self.amanha, texto_geral="Céu nublado.")
        r = self.client.get("/api/publico/previsao/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"], self.amanha.isoformat())
        self.assertEqual(r.data["texto_geral"], "Céu nublado.")
        self.assertEqual({p["regiao"] for p in r.data["previsoes"]}, {"CAPITAL", "NORTE"})
        self.assertIn("public", r["Cache-Control"])

    def test_nao_expoe_quem_cadastrou(self):
        self._cria("CAPITAL", self.hoje)
        r = self.client.get(f"/api/publico/previsao/?data={self.hoje.isoformat()}")
        item = r.data["previsoes"][0]
        for campo in ("criado_por", "atualizado_por", "criado_em", "atualizado_em", "origem", "id"):
            self.assertNotIn(campo, item)
        self.assertNotIn("Fulano", str(r.data))

    def test_data_especifica_sem_previsao_volta_vazia(self):
        r = self.client.get(f"/api/publico/previsao/?data={self.hoje.isoformat()}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["previsoes"], [])
        self.assertEqual(r.data["texto_geral"], "")

    def test_data_invalida_ou_fora_do_periodo(self):
        self.assertEqual(self.client.get("/api/publico/previsao/?data=abc").status_code, 400)
        longe = (self.hoje + dt.timedelta(days=30)).isoformat()
        self.assertEqual(self.client.get(f"/api/publico/previsao/?data={longe}").status_code, 400)
        antiga = (self.hoje - dt.timedelta(days=90)).isoformat()
        self.assertEqual(self.client.get(f"/api/publico/previsao/?data={antiga}").status_code, 400)

    def test_nao_permite_escrever(self):
        self.assertEqual(self.client.post("/api/publico/previsao/", {}).status_code, 405)
