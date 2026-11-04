import datetime as dt

from django.contrib.auth import get_user_model

from api.test_meteorologia import Base, local
from core import verificacao as ver
from core.models import Previsao, Reading, TemperaturaEstacaoDia, VerificacaoDia

DIA = dt.date(2026, 10, 10)
ver.MIN_ESTACOES_CHUVA_DIA = ver.MIN_ESTACOES_CHUVA_REGIAO = 1  # nos testes há poucas estações
ver.MIN_ESTACOES_TEMP_DIA = 1


class VerificacaoTests(Base):
    def prev(self, regiao, icone="ceuNublado", tmax=30, tmin=20):
        Previsao.objects.create(data=DIA, regiao=regiao, temperatura_maxima=tmax, temperatura_minima=tmin, umidade_maxima=90, umidade_minima=50, icone=icone)

    def temp(self, est, h, v, tipo="temperatura_c"):
        Reading.objects.create(station=est, reading_type=tipo, value=v, timestamp=local(2026, 10, 10, h))

    def test_criterio_de_chuva_1h_ou_dia(self):
        a = self.estacao("inmet", "Capital A", "Rio de Janeiro")
        b = self.estacao("inmet", "Sul II A", "Piraí")
        c = self.estacao("inmet", "Costa Verde A", "Mangaratiba")
        self.chuva(a, local(2026, 10, 10, 14, 10), 0.6)  # 1,2 mm na mesma hora cheia -> > 1 mm/h
        self.chuva(a, local(2026, 10, 10, 14, 40), 0.6)
        for h in range(6, 18):  # 12 mm em 12 horas, nenhuma hora passa de 1 mm -> > 10 mm/dia
            self.chuva(b, local(2026, 10, 10, h, 5), 1.0)
        self.chuva(c, local(2026, 10, 10, 9, 0), 1.0)  # 1,0 mm: não passa (estritamente maior)
        self.prev("CAPITAL", "ceuNubladoChuva")
        self.prev("SUL II", "ceuNublado")
        ver.gravar_dia(DIA)
        v = {x.regiao: x for x in VerificacaoDia.objects.filter(data=DIA)}
        self.assertEqual(len(v), 11)
        self.assertTrue(v["CAPITAL"].chuva_obs)
        self.assertTrue(v["SUL II"].chuva_obs)
        self.assertFalse(v["COSTA VERDE"].chuva_obs)
        self.assertIsNone(v["NORTE"].chuva_obs)  # sem estação = em branco
        self.assertEqual((v["CAPITAL"].chuva_prev, v["SUL II"].chuva_prev, v["NORTE"].chuva_prev), (True, False, None))

    def test_temperatura_alerta_e_ignora_dia_incompleto(self):
        for i, nome in enumerate(["E1", "E2", "E3", "E4"]):
            est = self.estacao("inmet", nome, "Rio de Janeiro")
            for h in range(0, 24, 2):
                self.temp(est, h, (9.5 if nome == "E4" else 20.0 + i) + (8 if h == 14 else 0))
        pobre = self.estacao("inmet", "Pobre", "Rio de Janeiro")
        self.temp(pobre, 3, 40.0)  # poucas leituras: fora
        ver.gravar_dia(DIA)
        v = VerificacaoDia.objects.get(data=DIA, regiao="CAPITAL")
        self.assertEqual(v.tmax_obs, 30.0)  # E3: 22 + 8
        self.assertEqual(v.tmin_obs, 9.5)
        self.assertEqual(v.tmin_estacao, "E4")
        self.assertTrue(any("E4" in t and "mediana" in t for t in v.alertas))
        self.assertFalse(TemperaturaEstacaoDia.objects.filter(station=pobre).exists())

    def test_planilha_prevalece_e_gera_diferenca(self):
        a = self.estacao("inmet", "Capital A", "Rio de Janeiro")
        self.chuva(a, local(2026, 10, 10, 14, 10), 5.0)
        self.prev("CAPITAL", "ceuNublado")
        ver.gravar_dia(DIA)
        su = get_user_model().objects.create_superuser("adm", password="x")
        self.client.force_authenticate(su)
        r = self.client.post("/api/admin/verificacao/importar/", {"linhas": [{"data": "2026-10-10", "regiao": "CAPITAL", "chuva_prev": True, "chuva_obs": False}, {"data": "2026-10-10", "regiao": "SUL II", "chuva_obs": True}]}, format="json")
        self.assertEqual(r.json()["linhas"], 2)
        ver.gravar_dia(DIA)  # novo cálculo do painel não sobrescreve a planilha
        v = VerificacaoDia.objects.get(data=DIA, regiao="CAPITAL")
        self.assertEqual((v.chuva_prev, v.chuva_obs, v.chuva_obs_painel), (True, False, True))
        dif = self.client.get("/api/verificacao/diferencas/").json()["diferencas"]
        self.assertEqual({(d["regiao"], d["campo"]) for d in dif}, {("CAPITAL", "chuva_prev"), ("CAPITAL", "chuva_obs")})
        self.assertEqual(self.client.post("/api/admin/verificacao/gravar/", {"inicio": "2026-10-01", "fim": "2026-10-30"}, format="json").status_code, 400)

    def test_indices_e_tela(self):
        ix = ver.indices(a=8, b=2, c=1, d=9)
        self.assertEqual((ix["acuracia"], ix["threat_score"], ix["bias"], ix["far"], ix["pod"]), (0.85, 0.727, 1.111, 0.2, 0.889))
        self.assertEqual(ix["razao_possibilidades"], 36.0)  # ad/bc = 72/2
        self.assertEqual(ix["razao_acertos_erros"], 5.667)
        self.assertIsNone(ver.indices(0, 0, 0, 0)["acuracia"])
        VerificacaoDia.objects.create(data=DIA, regiao="CAPITAL", chuva_prev=True, chuva_obs=True, tmax_obs=31.0, tmax_estacao="X")
        m = self.client.get("/api/verificacao/", {"mes": "2026-10"}).json()
        self.assertEqual(m["contingencia"]["CAPITAL"]["a"], 1)
        self.assertEqual(m["temperatura_mensal"]["CAPITAL"]["tmax"], 31.0)
        self.assertTrue(m["dias_sem_dado"]["chuva"])
        self.assertEqual(self.client.get("/api/verificacao/", {"ano": 2026}).json()["total"]["a"], 1)
        self.assertEqual(self.client.get("/api/verificacao/", {"mes": "x"}).status_code, 400)

    def test_carona_so_depois_das_0020_e_refaz_depois_das_6h(self):
        self.assertIsNone(ver.gravar_ontem_se_pendente(local(2026, 10, 11, 0, 10)))
        self.assertIn("2026-10-10", ver.gravar_ontem_se_pendente(local(2026, 10, 11, 0, 30)))
        VerificacaoDia.objects.filter(data=DIA).update(atualizado_em=local(2026, 10, 11, 0, 31))
        self.assertIsNone(ver.gravar_ontem_se_pendente(local(2026, 10, 11, 3, 0)))
        self.assertIn("2026-10-10", ver.gravar_ontem_se_pendente(local(2026, 10, 11, 6, 5)))
        VerificacaoDia.objects.filter(data=DIA).update(atualizado_em=local(2026, 10, 11, 6, 10))
        self.assertIsNone(ver.gravar_ontem_se_pendente(local(2026, 10, 11, 9, 0)))
