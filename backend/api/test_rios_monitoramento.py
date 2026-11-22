import datetime as dt

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core import rios_monitoramento as rm
from core.models import CotaHidrologica, Reading, Source, Station

BRT = dt.timezone(dt.timedelta(hours=-3))


class RiosMonitoramentoTest(APITestCase):
    def setUp(self):
        self.agora = dt.datetime(2026, 11, 21, 14, 20, tzinfo=BRT)
        inea = Source.objects.create(slug="inea", name="INEA")
        ana = Source.objects.create(slug="ana", name="ANA")

        def est(src, ext, nome, mun, rio=""):
            return Station.objects.create(source=src, external_id=ext, name=nome, municipality=mun, station_type="hidrologica", latitude=-22.0, longitude=-43.0, rio_monitorado=rio)

        self.bingen = est(inea, "1", "Bingen", "Petrópolis", "Rio Piabanha")
        self.cardoso = est(ana, "2", "Cardoso Moreira", "Cardoso Moreira")
        self.carangola = est(ana, "3", "Carangola", "Carangola")
        self.usina = est(ana, "4", "Pch Piabanha Jusante", "Areal")
        self.livre = est(ana, "5", "Estação Nova", "Itaperuna")
        CotaHidrologica.objects.create(station=self.bingen, atencao_cm=200, alerta_cm=300, inundacao_cm=335)
        for h, v in ((14, 3.40), (13, 3.10), (12, 2.50), (11, 1.00)):
            Reading.objects.create(station=self.bingen, reading_type="nivel_m", value=v, timestamp=dt.datetime(2026, 11, 21, h, 5, tzinfo=BRT))
        for st in (self.cardoso, self.carangola, self.usina, self.livre):
            Reading.objects.create(station=st, reading_type="nivel_m", value=1.0, timestamp=dt.datetime(2026, 11, 21, 14, 0, tzinfo=BRT))

    def test_marcas_sao_relativas_a_agora(self):
        m = rm.marcas_horarias(12, self.agora)
        # da mais recente (1 h atrás = 13:20) para a mais antiga (12 h atrás = 02:20)
        self.assertEqual((len(m), (m[0].hour, m[0].minute), (m[-1].hour, m[-1].minute)), (12, (13, 20), (2, 20)))

    def test_serie_relativa_classes_horario_e_transbordo(self):
        d = rm.montar(12, self.agora)
        b = next(e for e in d["estacoes"] if e["name"] == "Bingen")
        v = [x["v"] for x in b["serie"]]
        # 1 h atrás (13:20) → leitura de 13:05; 2 h (12:20) → 12:05; 3 h (11:20) → 11:05
        self.assertEqual(v[:3], [3.10, 2.50, 1.00])
        self.assertIsNone(v[-1])  # sem leitura 12 h atrás
        self.assertEqual([x["c"] for x in b["serie"][:3]], ["alerta", "atencao", "normal"])
        # o horário real da leitura acompanha o valor (tooltip)
        self.assertEqual(dt.datetime.fromisoformat(b["serie"][0]["t"]), dt.datetime(2026, 11, 21, 13, 5, tzinfo=BRT))
        # "atual" é a leitura mais recente (14:05), já acima do transbordo (3,35 m)
        self.assertEqual((b["transbordo_m"], b["atual_m"], b["atual_classe"], b["fonte"], b["rio"]), (3.35, 3.40, "transbordo", "INEA", "Rio Piabanha"))

    def test_tendencia(self):
        d = rm.montar(12, self.agora)
        b = next(e for e in d["estacoes"] if e["name"] == "Bingen")
        # atual 3,40 × 3 h antes (1,00) → +240 cm
        self.assertEqual((b["tendencia"], b["variacao_cm"], b["tendencia_h"]), ("subindo", 240, 3))
        c = next(e for e in d["estacoes"] if e["name"] == "Carangola")
        self.assertIsNone(c["tendencia"])  # sem leitura de 1/2/3 h atrás para comparar
        serie = [{"v": 1.00}, {"v": 1.01}, {"v": 1.02}]
        ag = self.agora
        self.assertEqual(rm.calcular_tendencia(1.01, ag, serie, ag)["tendencia"], "estavel")
        self.assertEqual(rm.calcular_tendencia(0.90, ag, serie, ag)["tendencia"], "descendo")
        # leitura atual velha demais: sem tendência
        self.assertIsNone(rm.calcular_tendencia(1.0, ag - dt.timedelta(hours=5), serie, ag)["tendencia"])

    def test_redec_rio_e_exclusao_de_usina(self):
        d = rm.montar(12, self.agora)
        nomes = [e["name"] for e in d["estacoes"]]
        self.assertNotIn("Pch Piabanha Jusante", nomes)
        e = {x["name"]: x for x in d["estacoes"]}
        self.assertEqual((e["Cardoso Moreira"]["rio"], e["Cardoso Moreira"]["redec"], e["Cardoso Moreira"]["regiao"]), ("Rio Muriaé", 11, "NOROESTE"))
        self.assertEqual((e["Carangola"]["rio"], e["Carangola"]["redec"], e["Carangola"]["regiao"]), ("Rio Carangola", 11, "NOROESTE"))  # MG → Noroeste
        self.assertEqual(e["Estação Nova"]["rio"], rm.SEM_RIO)
        self.assertEqual(e["Bingen"]["redec"], 7)

    def test_api_exige_login_e_valida_horas(self):
        self.assertIn(self.client.get("/api/stations/rios-monitoramento/").status_code, (401, 403))
        self.client.force_authenticate(get_user_model().objects.create_user("u", password="x"))
        self.assertEqual(self.client.get("/api/stations/rios-monitoramento/?horas=7").status_code, 400)
        r = self.client.get("/api/stations/rios-monitoramento/?horas=24")
        self.assertEqual((r.status_code, len(r.data["horas"])), (200, 24))
