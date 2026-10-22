from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core.models import RecomendacaoAlarme


def base(**kw):
    d = {
        "municipio": "Petrópolis",
        "data": "2026-10-22",
        "hora": "15:30",
        "probabilidade": "Alta",
        "estacao": "Independência - Taquara",
        "chuva_1h_mm": 52.4,
        "chuva_24h_mm": 80,
        "gatilho": "I",
        "acionaram": False,
    }
    d.update(kw)
    return d


class RecomendacaoAlarmeAPITest(APITestCase):
    def setUp(self):
        U = get_user_model()
        self.op = U.objects.create_user("operador", password="x", first_name="Operador")
        self.adm = U.objects.create_superuser("admin", password="x")

    def test_exige_login(self):
        self.assertEqual(self.client.get("/api/recomendacoes/").status_code, 403)

    def test_cria_com_numero_automatico_e_responsavel(self):
        self.client.force_authenticate(self.op)
        r = self.client.post("/api/recomendacoes/", base(), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["numero"], "01_2026")
        self.assertEqual(r.data["responsavel"], "Operador")
        r2 = self.client.post("/api/recomendacoes/", base(municipio="Nova Friburgo"), format="json")
        self.assertEqual(r2.data["numero"], "02_2026")
        # outro ano recomeça em 01
        r3 = self.client.post("/api/recomendacoes/", base(data="2027-01-02"), format="json")
        self.assertEqual(r3.data["numero"], "01_2027")
        self.assertEqual(self.client.get("/api/recomendacoes/proximo-numero/?data=2026-10-23").data["numero"], "03_2026")

    def test_validacoes(self):
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(municipio="Atlantis"), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(numero="7-2026"), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(chuva_1h_mm=-3), format="json").status_code, 400)
        # sirenes informadas mas "não acionaram"
        self.assertEqual(self.client.post("/api/recomendacoes/", base(sirenes_acionadas="Rua Nova", acionaram=False), format="json").status_code, 400)
        ok = self.client.post("/api/recomendacoes/", base(sirenes_acionadas="Rua Nova", acionaram=True), format="json")
        self.assertEqual(ok.status_code, 201)
        dup = self.client.post("/api/recomendacoes/", base(numero="01_2026"), format="json")
        self.assertEqual(dup.status_code, 400)

    def test_filtros_resumo_edicao_e_exclusao(self):
        self.client.force_authenticate(self.op)
        a = self.client.post("/api/recomendacoes/", base(acionaram=True, sirenes_acionadas="1"), format="json").data
        self.client.post("/api/recomendacoes/", base(municipio="Magé", probabilidade="Moderada"), format="json")
        self.assertEqual(len(self.client.get("/api/recomendacoes/?acionaram=true").data["results"]), 1)
        self.assertEqual(len(self.client.get("/api/recomendacoes/?q=mag").data["results"]), 1)
        self.assertEqual(len(self.client.get("/api/recomendacoes/?probabilidade=Alta").data["results"]), 1)
        res = self.client.get("/api/recomendacoes/resumo/").data
        self.assertEqual((res["total"], res["acionaram"], res["pct_acatamento"]), (2, 1, 50.0))
        self.assertEqual(res["por_ano"], [{"ano": 2026, "total": 2, "acionaram": 1}])
        # edição preserva o número e grava quem alterou
        up = self.client.patch(f"/api/recomendacoes/{a['id']}/", {"observacao": "ok"}, format="json")
        self.assertEqual((up.status_code, up.data["numero"], up.data["atualizado_por"]), (200, "01_2026", "Operador"))
        # apagar: só superusuário
        self.assertEqual(self.client.delete(f"/api/recomendacoes/{a['id']}/").status_code, 403)
        self.client.force_authenticate(self.adm)
        self.assertEqual(self.client.delete(f"/api/recomendacoes/{a['id']}/").status_code, 204)
        self.assertEqual(RecomendacaoAlarme.objects.count(), 1)
