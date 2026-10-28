import datetime as dt

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import Previsao, PrevisaoDia


def previsao(regiao, data, **kw):
    d = {
        "data": data,
        "regiao": regiao,
        "temperatura_maxima": 28,
        "temperatura_minima": 18,
        "umidade_maxima": 100,
        "umidade_minima": 60,
        "vento_velocidade": "Fraco",
        "icone": "ceuNublado",
        "comentario": "Céu nublado.",
    }
    d.update(kw)
    return d


class PrevisaoDiaAPITest(APITestCase):
    def setUp(self):
        self.op = get_user_model().objects.create_user("plantao", password="x", first_name="Plantonista")
        self.client.force_authenticate(self.op)

    def test_texto_geral_exige_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/previsoes/texto-geral/?data=2026-10-28").status_code, 403)

    def test_texto_geral_vazio_quando_nao_existe(self):
        r = self.client.get("/api/previsoes/texto-geral/?data=2026-10-28")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["texto_geral"], "")

    def test_grava_e_atualiza_o_texto_geral(self):
        r = self.client.put("/api/previsoes/texto-geral/", {"data": "2026-10-28", "texto_geral": "Céu nublado.  Ventos fracos\na moderados."}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["texto_geral"], "Céu nublado. Ventos fracos a moderados.")  # espaços e quebras viram uma linha
        self.assertEqual(r.data["criado_por"], "Plantonista")
        r = self.client.put("/api/previsoes/texto-geral/", {"data": "2026-10-28", "texto_geral": "Novo texto."}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(PrevisaoDia.objects.count(), 1)
        self.assertEqual(self.client.get("/api/previsoes/texto-geral/?data=2026-10-28").data["texto_geral"], "Novo texto.")

    def test_texto_geral_limite_de_600_caracteres(self):
        r = self.client.put("/api/previsoes/texto-geral/", {"data": "2026-10-28", "texto_geral": "a" * 601}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_cobertura_diz_quais_regioes_faltam_e_se_ha_texto(self):
        amanha = (timezone.localdate() + dt.timedelta(days=1)).isoformat()
        for reg in ("CAPITAL", "SUL I", "NORTE"):
            self.assertEqual(self.client.post("/api/previsoes/", previsao(reg, amanha), format="json").status_code, 201)
        r = self.client.get(f"/api/previsoes/cobertura/?datas={amanha}")
        item = r.data[0]
        self.assertEqual((item["lancadas"], item["total"], item["texto_geral"], item["completo"]), (3, 11, False, False))
        self.assertNotIn("CAPITAL", item["faltam"])
        self.assertEqual(len(item["faltam"]), 8)

    def test_cobertura_completa_com_11_regioes_e_texto(self):
        dia = "2026-10-29"
        for reg in Previsao.REGIOES:
            self.client.post("/api/previsoes/", previsao(reg, dia), format="json")
        self.client.put("/api/previsoes/texto-geral/", {"data": dia, "texto_geral": "Sem chuva."}, format="json")
        item = self.client.get(f"/api/previsoes/cobertura/?datas={dia}").data[0]
        self.assertTrue(item["completo"])
        self.assertEqual(item["faltam"], [])

    def test_cobertura_padrao_e_hoje_e_amanha(self):
        r = self.client.get("/api/previsoes/cobertura/")
        hoje = timezone.localdate()
        self.assertEqual([x["data"] for x in r.data], [hoje.isoformat(), (hoje + dt.timedelta(days=1)).isoformat()])

    def test_umidade_maxima_pode_ser_100_e_nao_passa_disso(self):
        ok = self.client.post("/api/previsoes/", previsao("CAPITAL", "2026-10-28", umidade_maxima=100), format="json")
        self.assertEqual(ok.status_code, 201, ok.data)
        ruim = self.client.post("/api/previsoes/", previsao("SUL I", "2026-10-28", umidade_maxima=101), format="json")
        self.assertEqual(ruim.status_code, 400)

    def test_temperatura_fora_da_faixa_e_rejeitada(self):
        r = self.client.post("/api/previsoes/", previsao("CAPITAL", "2026-10-28", temperatura_maxima=60), format="json")
        self.assertEqual(r.status_code, 400)
