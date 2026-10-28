import datetime as dt

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import NivelMonitoramento, NivelMonitoramentoRegistro, RecomendacaoAlarme, RiskAlert


def agora_iso(min_atras=5):
    return (timezone.now() - dt.timedelta(minutes=min_atras)).isoformat()


def dados(**kw):
    d = {"municipios": ["Petrópolis"], "nivel": 3, "equipe": "geo", "motivo": "Risco geológico alto previsto"}
    d.update(kw)
    return d


class NivelMonitoramentoAPITest(APITestCase):
    def setUp(self):
        self.op = get_user_model().objects.create_user("plantao", password="x", first_name="Plantonista")

    def test_niveis_exige_login_e_traz_92_municipios_em_nm0(self):
        self.assertEqual(self.client.get("/api/monitoramento/niveis/").status_code, 403)
        self.client.force_authenticate(self.op)
        r = self.client.get("/api/monitoramento/niveis/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["niveis"]), 92)
        self.assertEqual(r.data["resumo"]["0"], 92)
        self.assertTrue(all(n["regiao"] for n in r.data["niveis"]))

    def test_nm3_sem_tv_nem_dca_e_com_vigencia_de_24h(self):
        self.client.force_authenticate(self.op)
        r = self.client.post("/api/monitoramento/registrar/", dados(ferramentas=["SMS", "Telegram"]), format="json")
        self.assertEqual(r.status_code, 201, r.data)
        n = NivelMonitoramento.objects.get(municipio="Petrópolis")
        self.assertEqual(n.nivel, 3)
        self.assertAlmostEqual((n.vigencia_ate - timezone.now()).total_seconds() / 3600, 24, delta=0.1)
        reg = NivelMonitoramentoRegistro.objects.get()
        self.assertEqual((reg.nivel_anterior, reg.nivel, reg.registrado_por), (0, 3, "Plantonista"))
        r = self.client.post("/api/monitoramento/registrar/", dados(ferramentas=["DCA"]), format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("vedados", " ".join(r.data["erros"]))
        self.assertEqual(NivelMonitoramentoRegistro.objects.count(), 1)  # nada gravado no erro

    def test_nm4_exige_area_aprovacao_avisos_e_ate_2h(self):
        self.client.force_authenticate(self.op)
        r = self.client.post("/api/monitoramento/registrar/", dados(nivel=4, antecedencia="mais_2h"), format="json")
        self.assertEqual(r.status_code, 400)
        texto = " ".join(r.data["erros"])
        for trecho in ("em até 2 h", "área delimitada", "população exposta", "aprovou", "COMDEC e à REDEC"):
            self.assertIn(trecho, texto)
        completo = dados(nivel=4, antecedencia="ate_2h", area_delimitada=True, populacao_exposta=True, aprovado_por="Oficial de Ligação",
                         comdec_avisada_em=agora_iso(), redec_avisada_em=agora_iso(), ferramentas=["SMS", "DCA", "TV por assinatura"])
        r = self.client.post("/api/monitoramento/registrar/", completo, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        reg = NivelMonitoramentoRegistro.objects.get()
        self.assertEqual((reg.aprovado_por, reg.antecedencia), ("Oficial de Ligação", "ate_2h"))

    def test_nm5_aceita_aviso_simultaneo_com_motivo(self):
        self.client.force_authenticate(self.op)
        base = dados(nivel=5, antecedencia="em_curso", area_delimitada=True, populacao_exposta=True, aprovado_por="Diretor", aviso_simultaneo=True)
        self.assertEqual(self.client.post("/api/monitoramento/registrar/", base, format="json").status_code, 400)  # sem o motivo
        base["aviso_motivo"] = "Risco iminente: não houve tempo para ligar antes"
        self.assertEqual(self.client.post("/api/monitoramento/registrar/", base, format="json").status_code, 201)
        # no NM 4 o aviso simultâneo NÃO vale
        nm4 = dict(base, nivel=4, antecedencia="ate_2h")
        self.assertEqual(self.client.post("/api/monitoramento/registrar/", nm4, format="json").status_code, 400)

    def test_lote_encerramento_e_nivel_anterior(self):
        self.client.force_authenticate(self.op)
        r = self.client.post("/api/monitoramento/registrar/", dados(municipios=["Petrópolis", "Teresópolis", "Nova Friburgo"]), format="json")
        self.assertEqual(r.data["registrados"], 3)
        self.assertEqual(len({x.lote for x in NivelMonitoramentoRegistro.objects.all()}), 1)
        r = self.client.post("/api/monitoramento/registrar/", {"municipios": ["Petrópolis"], "nivel": 0, "encerramento": True}, format="json")
        self.assertEqual(r.status_code, 201)
        reg = NivelMonitoramentoRegistro.objects.filter(municipio="Petrópolis").first()
        self.assertEqual((reg.nivel_anterior, reg.nivel, reg.encerramento), (3, 0, True))
        self.assertIsNone(NivelMonitoramento.objects.get(municipio="Petrópolis").vigencia_ate)
        hist = self.client.get("/api/monitoramento/registros/?municipio=Petrópolis")
        self.assertEqual(len(hist.data), 2)
        self.assertEqual(hist.data[0]["nivel"], 0)

    def test_valida_municipio_nivel_e_vigencia(self):
        self.client.force_authenticate(self.op)
        post = lambda **kw: self.client.post("/api/monitoramento/registrar/", dados(**kw), format="json")  # noqa: E731
        self.assertEqual(post(municipios=["Atlântida"]).status_code, 400)
        self.assertEqual(post(nivel=7).status_code, 400)
        self.assertEqual(post(vigencia_horas=48).status_code, 400)
        self.assertEqual(post(municipios=[]).status_code, 400)
        self.assertEqual(post(nivel=3, motivo="").status_code, 400)  # NM 3 pede justificativa
        self.assertEqual(post(municipios=["Capital"]).status_code, 201)  # "Capital" vira Rio de Janeiro
        self.assertTrue(NivelMonitoramento.objects.filter(municipio="Rio de Janeiro").exists())

    def test_vigencia_vencida_e_sugestoes(self):
        self.client.force_authenticate(self.op)
        NivelMonitoramento.objects.create(municipio="Nova Friburgo", nivel=3, vigencia_ate=timezone.now() - dt.timedelta(hours=1))
        RiskAlert.objects.create(tipo="geologico", redec="SERRANA I", municipio="Petrópolis", risco="muito_alto")
        RiskAlert.objects.create(tipo="geologico", redec="SERRANA I", municipio="Teresópolis", risco="moderado")
        RiskAlert.objects.create(tipo="meteorologico", redec="SUL I", municipio="", risco="alto")
        RecomendacaoAlarme.objects.create(numero="01_2026", municipio="Angra dos Reis", data=timezone.localdate(), hora=(timezone.localtime() - dt.timedelta(minutes=30)).time(), probabilidade="Alta")
        r = self.client.get("/api/monitoramento/sugestoes/")
        sug = {(s["municipio"], s["tipo"]): s for s in r.data["sugestoes"]}
        self.assertEqual(sug[("Petrópolis", "risco_tecnico")]["sugerido"], 3)  # muito alto previsto = NM 3, nunca 4/5 automático
        self.assertEqual(sug[("Teresópolis", "risco_tecnico")]["sugerido"], 2)
        self.assertEqual(sug[("Resende", "risco_tecnico")]["sugerido"], 3)  # meteorológico por REDEC SUL I
        self.assertEqual(sug[("Angra dos Reis", "recomendacao_sirene")]["sugerido"], 4)
        self.assertIn(("Nova Friburgo", "vigencia_vencida"), sug)
        self.assertTrue(next(n for n in self.client.get("/api/monitoramento/niveis/").data["niveis"] if n["municipio"] == "Nova Friburgo")["vencida"])

    def test_publico_sem_login_e_sem_dados_internos(self):
        NivelMonitoramento.objects.create(municipio="Petrópolis", nivel=4, vigencia_ate=timezone.now() + dt.timedelta(hours=3))
        RiskAlert.objects.create(tipo="hidrologico", redec="SERRANA I", municipio="Petrópolis", risco="alto", responsavel="Fulano")
        r = self.client.get("/api/publico/monitoramento/")  # sem autenticar
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["niveis"]), 92)
        self.assertEqual(next(n for n in r.data["niveis"] if n["municipio"] == "Petrópolis")["nivel"], 4)
        self.assertEqual(r.data["riscos"][0]["responsavel"], "")
        texto = str(r.data)
        for proibido in ("aprovado_por", "registrado_por", "motivo", "plantao"):
            self.assertNotIn(proibido, texto)
        self.assertIn("max-age", r["Cache-Control"])

    def test_guia_exige_login(self):
        self.assertEqual(self.client.get("/api/monitoramento/guia/").status_code, 403)
        self.client.force_authenticate(self.op)
        r = self.client.get("/api/monitoramento/guia/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Guia do Plantão", r.content.decode())
