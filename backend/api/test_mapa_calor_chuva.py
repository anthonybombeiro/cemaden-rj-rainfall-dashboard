import datetime as dt

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core import mapa_calor_chuva as mc
from core.models import Reading, Source, Station


def est(i, total, lat=-22.5, lon=-43.0, cob=1.0, maxl=2.0, maxd=40.0, fonte="inea", atraso=1.0):
    return {"fonte": fonte, "id": i, "lat": lat + i * 0.01, "lon": lon, "total": total, "cobertura": cob, "max_leitura": maxl, "max_bucket": maxd, "atraso_h": atraso, "atraso_max_h": 48}


class ClassificarOutliersTest(APITestCase):
    def motivos(self, lista):
        mc.classificar_outliers(lista)
        return [e["descartada"] for e in lista]

    def test_criterios_individuais(self):
        l = [est(1, 150, cob=0.5), est(2, 150, maxl=140), est(3, 150, maxd=400), est(4, 150), est(5, 150, atraso=100)]
        m = self.motivos(l)
        self.assertIn("cobertura", m[0])
        self.assertIn("leitura única", m[1])
        self.assertIn("dia com", m[2])
        self.assertIsNone(m[3])
        self.assertIn("atrasada", m[4])

    def test_sem_filtro_de_espurios_mantem_valores_altos_mas_nao_estacao_parada(self):
        l = [est(1, 150, cob=0.5), est(2, 150, maxl=140), est(3, 150, atraso=100), est(4, 150)]
        mc.classificar_outliers(l, espurios=False)
        m = [e["descartada"] for e in l]
        self.assertIn("cobertura", m[0])
        self.assertIsNone(m[1])  # leitura impossível só cai com o filtro de espúrios ligado
        self.assertIn("atrasada", m[2])
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
        self.parada = mk(inea, "5", "Parada", "Magé", -22.61)
        for st in (self.a, self.b, self.c, self.w):
            for d in range(30):
                Reading.objects.create(station=st, reading_type="chuva_mm", value=5.0 if st != self.b else 10.0, timestamp=self.agora - dt.timedelta(days=d, hours=1))
        for d in range(5):  # só 5 dias de leitura: cobertura baixa
            Reading.objects.create(station=self.curta, reading_type="chuva_mm", value=2.0, timestamp=self.agora - dt.timedelta(days=d, hours=1))
        Reading.objects.create(station=self.parada, reading_type="chuva_mm", value=1.0, timestamp=self.agora - dt.timedelta(days=60))  # só leitura antiga

    def test_exclui_wunderground_cobertura_e_sem_leitura(self):
        d = mc.montar(30, self.agora)
        self.assertEqual(d["fontes_usadas"], ["inea"])
        self.assertEqual(d["estacoes_total"], 5)  # A, B, C, Curta e Parada (a Wunderground não foi escolhida)
        self.assertEqual(d["estacoes_usadas"], 3)
        motivos = {x["name"]: x["descartada"] for x in d["descartadas"]}
        self.assertIn("cobertura", motivos["Curta"])
        self.assertIn("sem leitura no período", motivos["Parada"])
        pet = next(m for m in d["municipios"] if m["municipio"] == "Petrópolis")
        self.assertEqual((pet["n"], pet["mediana_mm"], pet["max_mm"]), (3, 150.0, 300.0))
        self.assertEqual(d["redecs"][0]["redec"], 7)
        self.assertEqual({f["slug"]: f["padrao"] for f in d["fontes_disponiveis"]}, {"inea": True, "wunderground": False})

    def test_escolher_redes_inclui_wunderground(self):
        d = mc.montar(30, self.agora, fontes=["inea", "wunderground"])
        pet = next(m for m in d["municipios"] if m["municipio"] == "Petrópolis")
        self.assertEqual(pet["n"], 4)
        d2 = mc.montar(30, self.agora, fontes=["wunderground"])
        self.assertEqual([m["municipio"] for m in d2["municipios"]], ["Petrópolis"])
        self.assertEqual(d2["estacoes_usadas"], 1)

    def test_7_dias_e_data_especifica(self):
        d7 = mc.montar(7, self.agora)
        pet = next(m for m in d7["municipios"] if m["municipio"] == "Petrópolis")
        self.assertEqual(pet["mediana_mm"], 35.0)  # 7 leituras de 5 mm
        # um dia só (23/11, 00:00–24:00 BRT): período curto, cobertura por hora; as leituras são de hora em hora 09:00 UTC → só 1 hora com dado → cobertura baixa
        d1 = mc.montar(ini="2026-11-23", fim=None, agora=self.agora)
        self.assertEqual(d1["rotulo"], "23/11/2026")
        self.assertEqual(d1["estacoes_usadas"], 0)
        self.assertTrue(all("cobertura" in x["descartada"] or "sem leitura" in x["descartada"] for x in d1["descartadas"]))

    def test_resolver_periodo(self):
        i, f, r = mc.resolver_periodo(self.agora, mes="2026-10")
        self.assertEqual((i.isoformat(), f.isoformat(), r), ("2026-10-01T00:00:00-03:00", "2026-11-01T00:00:00-03:00", "mês de 10/2026"))
        i, f, r = mc.resolver_periodo(self.agora, mes="2026-11")  # mês corrente vai só até agora
        self.assertEqual(f, self.agora)
        i, f, r = mc.resolver_periodo(self.agora, ini="2026-11-10", fim="2026-11-12")
        self.assertEqual((f - i).days, 3)
        for kwargs in ({"dias": 0}, {"dias": 200}, {"mes": "2026-13"}, {"mes": "abc"}, {"ini": "2026-11-12", "fim": "2026-11-10"}, {"ini": "2027-01-01"}):
            with self.assertRaises(ValueError):
                mc.resolver_periodo(self.agora, **kwargs)

    def test_api_exige_login_e_valida(self):
        self.assertIn(self.client.get("/api/stations/mapa-calor-chuva/").status_code, (401, 403))
        self.client.force_authenticate(get_user_model().objects.create_user("u", password="x"))
        self.assertEqual(self.client.get("/api/stations/mapa-calor-chuva/?dias=0").status_code, 400)
        self.assertEqual(self.client.get("/api/stations/mapa-calor-chuva/?mes=xx").status_code, 400)
        r = self.client.get("/api/stations/mapa-calor-chuva/?dias=7&fontes=inea&espurios=0")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["fontes_usadas"], ["inea"])
