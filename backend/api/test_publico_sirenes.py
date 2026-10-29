from rest_framework.test import APITestCase

from core.models import AlertEvent, AlertRule, SireneAcaoTipo, Source, Station


class PublicoSirenesTest(APITestCase):
    def setUp(self):
        fonte = Source.objects.create(slug="cemaden_rj_sirenes", name="Sirenes")
        self.regra = AlertRule.objects.create(name="Sirene de alarme tocando", reading_type="chuva_mm", threshold_value=1)
        def sirene(ext, nome, status, cidade="Niterói"):
            return Station.objects.create(source=fonte, external_id=ext, name=nome, municipality=cidade, station_type=Station.StationType.SIRENE, status=status,
                                          latitude=-22.9, longitude=-43.1, raw_metadata={"bairro": "Centro", "rua": "Rua Secreta", "numero": "10"})
        self.a = sirene("a", "Sirene A", Station.Status.ATIVA)
        self.b = sirene("b", "Sirene B", Station.Status.INATIVA)
        sirene("c", "Sirene C", Station.Status.ATIVA)
        SireneAcaoTipo.objects.update_or_create(codigo=1, defaults={"nome": "Alerta máximo", "categoria": "alerta"})
        AlertEvent.objects.create(rule=self.regra, station=self.a, value=1)

    def test_publico_sem_login_e_sem_dados_sensiveis(self):
        r = self.client.get("/api/publico/sirenes/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual((d["total"], d["online"], d["offline"], d["tocando_total"]), (3, 2, 1, 1))
        t = d["tocando"][0]
        self.assertEqual((t["nome"], t["municipio"], t["bairro"], t["acao"]), ("Sirene A", "Niterói", "Centro", "Alerta máximo"))
        corpo = r.content.decode()
        for proibido in ("Rua Secreta", "latitude", "-43.1"):
            self.assertNotIn(proibido, corpo)

    def test_sirene_que_parou_de_tocar_some(self):
        AlertEvent.objects.filter(station=self.a).update(resolved_at="2026-10-29T10:00:00Z")
        self.assertEqual(self.client.get("/api/publico/sirenes/").json()["tocando_total"], 0)
