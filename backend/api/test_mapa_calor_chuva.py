import datetime as dt

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core import mapa_calor_chuva as mc
from core.models import Reading, Source, Station


def est(i, total, lat=-22.5, lon=-43.0, cob=1.0, maxl=2.0, maxd=40.0, fonte="inea"):
    return {"fonte": fonte, "id": i, "lat": lat + i * 0.01, "lon": lon, "total": total, "cobertura": cob, "max_leitura": maxl, "max_dia": maxd}


class ClassificarOutliersTest(APITestCase):
    def motivos(self, lista):
        mc.classificar_outliers(lista)
        return [e["descartada"] for e in lista]

    def test_criterios_individuais(self):
        l = [est(1, 150, cob=0.5), est(2, 150, maxl=140), est(3, 150, maxd=400), est(4, 150)]
        m = self.motivos(l)
        self.assertIn("cobertura", m[0])
        self.assertIn("leitura única", m[1])
        self.assertIn("dia com", m[2])
        self.assertIsNone(m[3])

    def test_isolada_muito_acima_dos_vizinhos(self):
        viz = [est(i, 100 + i) for i in range(1, 8)]
        m = self.motivos(viz + [est(9, 480)])
        self.assertIsNone(m[0])
        self.assertIn("acima dos vizinhos", m[-1])

    def test_redes_independentes_que_concordam_nao_e_outlier(self):
        # três estações próximas com ~450 mm de duas redes diferentes: se confirmam (chuva de serra); os vizinhos distantes ficam em ~100
        serra = [est(i, 440 + 10 * i, lat=-22.0, fonte="inea" if i % 2 else "cemaden_mctic") for i in range(1, 4)]
        resto = [est(i, 100, lat=-22.12) for i in range(10, 16)]
        m = self.motivos(serra + resto)
        self.assertEqual(m[:3], [None, None, None])

    def test_mesma_rede_concordando_entre_si_nao_basta(self):
        # cinco estações da MESMA rede com ~450 mm e nenhuma outra rede por perto: continuam suspeitas (erro de coleta se repete)
        grupo = [est(i, 440 + 10 * i, lat=-22.0, fonte="plugfield") for i in range(1, 6)]
        resto = [est(i, 100, lat=-22.12) for i in range(10, 16)]
        m = self.motivos(grupo + resto)
        self.assertTrue(all(x and "acima dos vizinhos" in x for x in m[:5]))

    def test_zerada_com_vizinhos_chuvosos(self):
        viz = [est(i, 150) for i in range(1, 8)]
        m = self.motivos(viz + [est(9, 0)])
        self.assertIn("zerada", m[-1])


class MontarTest(APITestCase):
    def setUp(self):
        self.agora = dt.datetime(2026, 11, 24, 12, 0, tzinfo=dt.timezone.utc)
        inea = Source.objects.create(slug="inea", name="INEA")
        wu = Source.objects.create(slug="wunderground", name="WU")
        mk = lambda src, ext, nome, mun, lat: Station.objects.create(source=src, external_id=ext, name=nome, municipality=mun, station_type="pluviometrica", latitude=lat, longitude=-43.0)  # noqa: E731
        self.a = mk(inea, "1", "A", "Petrópolis", -22.50)
        self.b = mk(inea, "2", "B", "Petrópolis", -22.51)
        self.c = mk(inea, "3", "C", "Petrópolis", -22.52)
        self.w = mk(wu, "9", "W", "Petrópolis", -22.50)
        self.curta = mk(inea, "4", "Curta", "Magé", -22.60)
        for st in (self.a, self.b, self.c, self.w):
            for d in range(30):
                Reading.objects.create(station=st, reading_type="chuva_mm", value=5.0 if st != self.b else 10.0, timestamp=self.agora - dt.timedelta(days=d, hours=1))
        for d in range(5):  # só 5 dias de leitura: cobertura baixa
            Reading.objects.create(station=self.curta, reading_type="chuva_mm", value=2.0, timestamp=self.agora - dt.timedelta(days=d, hours=1))

    def test_exclui_wunderground_e_baixa_cobertura(self):
        d = mc.montar(30, self.agora, usar_cache=False)
        self.assertEqual(d["excluidas_fontes"], ["wunderground"])
        self.assertEqual(d["estacoes_total"], 4)  # A, B, C e Curta (a Wunderground nem entra)
        usadas = d["estacoes_usadas"]
        self.assertEqual(usadas, 3)
        self.assertEqual([x["name"] for x in d["descartadas"]], ["Curta"])
        pet = next(m for m in d["municipios"] if m["municipio"] == "Petrópolis")
        self.assertEqual((pet["n"], pet["mediana_mm"], pet["max_mm"]), (3, 150.0, 300.0))
        self.assertEqual(d["redecs"][0]["redec"], 7)

    def test_api_exige_login_e_valida_dias(self):
        self.assertIn(self.client.get("/api/stations/mapa-calor-chuva/").status_code, (401, 403))
        self.client.force_authenticate(get_user_model().objects.create_user("u", password="x"))
        self.assertEqual(self.client.get("/api/stations/mapa-calor-chuva/?dias=0").status_code, 400)
        self.assertEqual(self.client.get("/api/stations/mapa-calor-chuva/?dias=7").status_code, 200)
