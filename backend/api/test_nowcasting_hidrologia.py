import datetime as dt

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core import nowcasting_hidrologia as nh
from core.models import CotaHidrologica, Reading, Source, Station

BRT = dt.timezone(dt.timedelta(hours=-3))


class NowcastingHidrologiaTest(APITestCase):
    def setUp(self):
        self.agora = dt.datetime(2026, 11, 21, 14, 20, tzinfo=BRT)
        inea = Source.objects.create(slug="inea", name="INEA")

        def est(ext, nome, mun, rio, atencao, alerta, inund, leituras):
            s = Station.objects.create(source=inea, external_id=ext, name=nome, municipality=mun, station_type="hidrologica", latitude=-22.0, longitude=-43.0, rio_monitorado=rio)
            CotaHidrologica.objects.create(station=s, atencao_cm=atencao, alerta_cm=alerta, inundacao_cm=inund)
            for (h, m), v in leituras:
                Reading.objects.create(station=s, reading_type="nivel_m", value=v, timestamp=dt.datetime(2026, 11, 21, h, m, tzinfo=BRT))
            return s

        # sobe de 1,00 a 3,40 em 3 h: passa do transbordo (3,35) agora
        est("1", "Bingen", "Petrópolis", "Rio Piabanha", 200, 300, 335, [((11, 5), 1.00), ((12, 5), 2.50), ((13, 5), 3.10), ((14, 5), 3.40)])
        # já estava em alerta há horas (permanece)
        est("2", "Quitandinha", "Petrópolis", "Rio Quitandinha", 100, 150, 400, [((11, 5), 1.60), ((12, 5), 1.62), ((13, 5), 1.63), ((14, 5), 1.64)])
        # entra em alerta agora (Carapebus): era atenção há 1 h
        est("3", "Lagoa de Carapebus (Régua 10)", "Carapebus", "", 100, 150, 250, [((11, 5), 1.10), ((12, 5), 1.20), ((13, 5), 1.30), ((14, 5), 1.55)])
        # normal: fora do informe
        est("4", "Tranquila", "Magé", "Rio Inhomirim", 300, 400, 500, [((13, 5), 1.0), ((14, 5), 1.0)])
        # alerta, mas leitura velha (5 h): fora
        est("5", "Velha", "Itaboraí", "Rio Velho", 100, 150, 400, [((9, 5), 1.60)])

    def test_so_estacoes_em_alerta_ou_acima_e_com_leitura_recente(self):
        d = nh.gerar(agora=self.agora)
        muns = [i["municipio"] for i in d["informes"]]
        self.assertEqual(sorted(muns), ["Carapebus", "Petrópolis"])
        # mais grave primeiro: Petrópolis (transbordo) antes de Carapebus (alerta)
        self.assertEqual([i["classe"] for i in d["informes"]], ["transbordo", "alerta"])
        # com atenção incluída entra também quem só está em atenção
        self.assertGreaterEqual(len(nh.gerar(agora=self.agora, incluir_atencao=True)["informes"]), 2)

    def test_texto_no_modelo_da_redec(self):
        d = nh.gerar(agora=self.agora)
        car = next(i for i in d["informes"] if i["municipio"] == "Carapebus")
        linhas = car["texto"].splitlines()
        self.assertEqual(linhas[1], "Município: Carapebus")
        self.assertEqual(linhas[2], "Data: 21/11/2026 – 14:20")
        self.assertEqual(linhas[3], "Evento: Alerta para inundação")
        self.assertIn("Lagoa de Carapebus (Régua 10), entrou em cota de Alerta!", car["texto"])
        self.assertTrue(linhas[-1].endswith("seguem monitorando!"))
        self.assertIn("REDEC", linhas[0])
        self.assertIn("INFORME OPERACIONAL", linhas[0])

    def test_varias_estacoes_do_mesmo_municipio_e_verbos(self):
        d = nh.gerar(agora=self.agora)
        pet = next(i for i in d["informes"] if i["municipio"] == "Petrópolis")
        self.assertEqual(pet["evento"], "Transbordamento (cota de transbordo atingida)")
        self.assertEqual([e["name"] for e in pet["estacoes"]], ["Bingen", "Quitandinha"])
        self.assertIn("Bingen (Rio Piabanha), ultrapassou a cota de Transbordo!", pet["texto"])
        self.assertIn("Quitandinha", pet["texto"])
        self.assertIn("permanece em cota de Alerta.", pet["texto"])
        self.assertIn("subindo (+240 cm em 3 h)", pet["texto"])

    def test_api_exige_login(self):
        self.assertIn(self.client.get("/api/stations/nowcasting-hidrologia/").status_code, (401, 403))
        self.client.force_authenticate(get_user_model().objects.create_user("u", password="x"))
        r = self.client.get("/api/stations/nowcasting-hidrologia/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("informes", r.data)
