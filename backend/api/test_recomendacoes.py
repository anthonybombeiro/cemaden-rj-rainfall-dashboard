from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core.models import AcionamentoMunicipio, RecomendacaoAlarme


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

    def test_cria_com_numero_automatico_e_fica_aguardando_validacao(self):
        self.client.force_authenticate(self.op)
        r = self.client.post("/api/recomendacoes/", base(), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["numero"], "01_2026")
        self.assertEqual(r.data["responsavel"], "Operador")
        self.assertIsNone(r.data["acionaram"])
        self.assertFalse(r.data["validada"])
        r2 = self.client.post("/api/recomendacoes/", base(municipio="Nova Friburgo"), format="json")
        self.assertEqual(r2.data["numero"], "02_2026")
        r3 = self.client.post("/api/recomendacoes/", base(data="2027-01-02"), format="json")
        self.assertEqual(r3.data["numero"], "01_2027")
        self.assertEqual(self.client.get("/api/recomendacoes/proximo-numero/?data=2026-10-23").data["numero"], "03_2026")

    def test_validacao_posterior(self):
        self.client.force_authenticate(self.op)
        a = self.client.post("/api/recomendacoes/", base(), format="json").data
        # sirenes sem dizer se acionaram: recusa
        self.assertEqual(self.client.patch(f"/api/recomendacoes/{a['id']}/", {"sirenes_qtd": 2}, format="json").status_code, 400)
        ok = self.client.patch(f"/api/recomendacoes/{a['id']}/", {"acionaram": True, "sirenes_qtd": 2, "sirenes_acionadas": "Rua Nova; Morro do Estado"}, format="json")
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertTrue(ok.data["validada"])
        self.assertEqual(ok.data["validado_por"], "Operador")
        self.assertEqual(self.client.get("/api/recomendacoes/?validacao=validada").data["count"], 1)
        self.assertEqual(self.client.get("/api/recomendacoes/?validacao=pendente").data["count"], 0)
        # Não acionaram + sirenes: recusa
        self.assertEqual(self.client.patch(f"/api/recomendacoes/{a['id']}/", {"acionaram": False}, format="json").status_code, 400)

    def test_validacoes_de_campos(self):
        self.client.force_authenticate(self.op)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(municipio="Atlantis"), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(numero="7-2026"), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(chuva_1h_mm=-3), format="json").status_code, 400)
        self.client.post("/api/recomendacoes/", base(), format="json")
        self.assertEqual(self.client.post("/api/recomendacoes/", base(numero="01_2026"), format="json").status_code, 400)

    def test_so_municipios_com_gestao_de_sirenes(self):
        # os 13 municípios com gatilhos vêm da migração 0014
        self.client.force_authenticate(self.op)
        m = self.client.get("/api/recomendacoes/municipios/").data
        self.assertEqual(len(m), 13)
        self.assertNotIn("Angra dos Reis", [x["municipio"] for x in m])  # autônomo
        self.assertEqual(self.client.post("/api/recomendacoes/", base(), format="json").status_code, 201)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(municipio="Niterói"), format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(municipio="Angra dos Reis"), format="json").status_code, 400)

    def test_varios_gatilhos_na_mesma_recomendacao(self):
        self.client.force_authenticate(self.op)
        r = self.client.post("/api/recomendacoes/", base(gatilho="IV, i"), format="json")
        self.assertEqual((r.status_code, r.data["gatilho"]), (201, "I,IV"))
        self.client.post("/api/recomendacoes/", base(gatilho="II"), format="json")
        self.client.post("/api/recomendacoes/", base(gatilho="I"), format="json")
        self.assertEqual(self.client.get("/api/recomendacoes/?gatilho=I").data["count"], 2)  # "I,IV" e "I" (não "II")
        self.assertEqual(self.client.get("/api/recomendacoes/?gatilho=IV").data["count"], 1)
        self.assertEqual(self.client.get("/api/recomendacoes/?gatilho=II").data["count"], 1)
        self.assertEqual(self.client.post("/api/recomendacoes/", base(gatilho="V"), format="json").status_code, 400)
        # a mesma estação pode ser recomendada de novo no mesmo dia, em outro gatilho
        self.assertEqual(self.client.post("/api/recomendacoes/", base(gatilho="III"), format="json").status_code, 201)

    def test_filtros_resumo_edicao_e_exclusao(self):
        self.client.force_authenticate(self.op)
        a = self.client.post("/api/recomendacoes/", base(acionaram=True, sirenes_qtd=1, sirenes_acionadas="1"), format="json").data
        self.client.post("/api/recomendacoes/", base(municipio="Magé", probabilidade="Moderada"), format="json")
        self.assertEqual(len(self.client.get("/api/recomendacoes/?acionaram=true").data["results"]), 1)
        self.assertEqual(len(self.client.get("/api/recomendacoes/?q=mag").data["results"]), 1)
        res = self.client.get("/api/recomendacoes/resumo/").data
        # 1 validada (acionaram) e 1 pendente: o acatamento é sobre as validadas
        self.assertEqual((res["total"], res["pendentes"], res["acionaram"], res["pct_acatamento"]), (2, 1, 1, 100.0))
        up = self.client.patch(f"/api/recomendacoes/{a['id']}/", {"observacao": "ok"}, format="json")
        self.assertEqual((up.status_code, up.data["numero"], up.data["atualizado_por"]), (200, "01_2026", "Operador"))
        self.assertEqual(self.client.delete(f"/api/recomendacoes/{a['id']}/").status_code, 403)
        self.client.force_authenticate(self.adm)
        self.assertEqual(self.client.delete(f"/api/recomendacoes/{a['id']}/").status_code, 204)
        self.assertEqual(RecomendacaoAlarme.objects.count(), 1)


class AcionamentoMunicipioAPITest(APITestCase):
    def setUp(self):
        self.op = get_user_model().objects.create_user("operador", password="x", first_name="Operador")
        self.client.force_authenticate(self.op)

    def test_crud_basico(self):
        r = self.client.post("/api/acionamentos-municipio/", {"municipio": "Angra dos Reis", "data": "2022-01-07", "hora": "18:50", "probabilidade": "Alta", "sirene": "Santa Rita do Bracuí; Gamboa de Belém", "quantidade": 2, "responsavel": "Adriano"}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data["tipo_alarme"], "MOBILIZAÇÃO")
        self.assertEqual(self.client.get("/api/acionamentos-municipio/?q=bracui").data["count"], 0)  # acento: busca literal
        self.assertEqual(self.client.get("/api/acionamentos-municipio/?q=Bracuí").data["count"], 1)
        self.assertEqual(self.client.post("/api/acionamentos-municipio/", {"municipio": "Xx", "data": "2022-01-07"}, format="json").status_code, 400)

    def test_lista_de_municipios_com_sirenes_editavel(self):
        from core.models import MunicipioComSirene

        lista = self.client.get("/api/acionamentos-municipio/municipios/").data
        self.assertEqual(len(lista), 17)
        for m in ("Rio de Janeiro", "Niterói", "Angra dos Reis", "Mangaratiba", "Teresópolis"):
            self.assertIn(m, lista)
        corpo = {"data": "2026-02-01", "sirene": "x"}
        self.assertEqual(self.client.post("/api/acionamentos-municipio/", {**corpo, "municipio": "Araruama"}, format="json").status_code, 400)
        # incluir o município no Admin libera; desativar bloqueia
        MunicipioComSirene.objects.create(municipio="Araruama")
        self.assertEqual(self.client.post("/api/acionamentos-municipio/", {**corpo, "municipio": "Araruama"}, format="json").status_code, 201)
        MunicipioComSirene.objects.filter(municipio="Niterói").update(ativo=False)
        self.assertNotIn("Niterói", self.client.get("/api/acionamentos-municipio/municipios/").data)
        self.assertEqual(self.client.post("/api/acionamentos-municipio/", {**corpo, "municipio": "Niterói"}, format="json").status_code, 400)
        self.assertEqual(AcionamentoMunicipio.objects.count(), 1)


class ImportacaoPlanilhaTest(APITestCase):
    def test_importa_a_planilha_de_2020_a_2026_e_e_idempotente(self):
        from core.importacao_recomendacoes import importar

        seco = importar(dry_run=True)
        self.assertEqual(RecomendacaoAlarme.objects.count(), 0)
        self.assertEqual((seco["recomendacoes_novas"], seco["acionamentos_novos"]), (273, 26))
        importar()
        self.assertEqual(RecomendacaoAlarme.objects.count(), 273)
        self.assertEqual(AcionamentoMunicipio.objects.count(), 26)
        r = RecomendacaoAlarme.objects.get(numero="48_2026")
        self.assertEqual((r.municipio, str(r.data), r.hora.strftime("%H:%M"), r.estacao, r.gatilho, r.acionaram, r.sirenes_qtd, r.responsavel), ("Teresópolis", "2026-09-30", "18:56", "Quinta do Lebrão 1", "I", True, 2, "Tiago"))
        self.assertEqual(r.chuva_1h_mm, 44.6)
        self.assertEqual(r.origem, "planilha")
        again = importar()
        self.assertEqual((again["recomendacoes_novas"], again["acionamentos_novos"]), (0, 0))
        self.assertEqual(RecomendacaoAlarme.objects.count(), 273)
