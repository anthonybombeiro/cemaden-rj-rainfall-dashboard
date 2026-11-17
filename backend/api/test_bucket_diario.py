import datetime as dt
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from core.models import Reading, Source, Station
from ingestion.connectors.base import bucket_from_running_daily_detalhe

BRT = dt.timezone(dt.timedelta(hours=-3))


class BaldeDoTotalCorridoTest(TestCase):
    """17/11/2026: leitura de 23:58 coletada depois da meia-noite duplicava o total do dia (Plugfield/Guapimirim: 101,6 mm)."""

    def setUp(self):
        src = Source.objects.create(slug="plugfield", name="Plugfield")
        self.st = Station.objects.create(source=src, external_id="E1", name="E1", municipality="Guapimirim", station_type="meteorologica", latitude=-22.5, longitude=-43.0)
        for h, v in ((14, 60.0), (15, 41.6)):  # 101,6 mm de chuva real em 16/11
            Reading.objects.create(station=self.st, reading_type="chuva_mm", value=v, timestamp=dt.datetime(2026, 11, 16, h, 0, tzinfo=BRT))

    def test_leitura_das_2358_coletada_depois_da_meia_noite_nao_duplica(self):
        depois_da_meia_noite = dt.datetime(2026, 11, 17, 0, 5, tzinfo=BRT)
        with mock.patch.object(timezone, "now", return_value=depois_da_meia_noite):
            balde, ja = bucket_from_running_daily_detalhe("plugfield", "E1", 101.6, dt.datetime(2026, 11, 16, 23, 58, 56, tzinfo=BRT))
        self.assertEqual(balde, 0.0)
        self.assertEqual(round(ja, 1), 101.6)

    def test_chuva_nova_no_mesmo_dia_continua_virando_balde(self):
        with mock.patch.object(timezone, "now", return_value=dt.datetime(2026, 11, 16, 20, 0, tzinfo=BRT)):
            balde, _ = bucket_from_running_daily_detalhe("plugfield", "E1", 104.6, dt.datetime(2026, 11, 16, 20, 0, tzinfo=BRT))
        self.assertEqual(round(balde, 1), 3.0)

    def test_primeira_leitura_do_dia_novo_usa_o_total_corrido(self):
        balde, ja = bucket_from_running_daily_detalhe("plugfield", "E1", 0.2, dt.datetime(2026, 11, 17, 0, 20, tzinfo=BRT))
        self.assertEqual((balde, ja), (0.2, None))

    def test_sem_referencia_mantem_o_comportamento_antigo(self):
        with mock.patch.object(timezone, "now", return_value=dt.datetime(2026, 11, 16, 22, 0, tzinfo=BRT)):
            balde, _ = bucket_from_running_daily_detalhe("plugfield", "E1", 101.6)
        self.assertEqual(balde, 0.0)


class LimpezaBaldesDuplicadosTest(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        self.src = Source.objects.create(slug="plugfield", name="Plugfield")
        self.st = Station.objects.create(source=self.src, external_id="E2", name="E2", municipality="Guapimirim", station_type="meteorologica", latitude=-22.5, longitude=-43.0)
        for h, v in ((14, 60.0), (15, 41.6)):
            Reading.objects.create(station=self.st, reading_type="chuva_mm", value=v, timestamp=dt.datetime(2026, 11, 16, h, 0, tzinfo=BRT))
        self.dup = Reading.objects.create(station=self.st, reading_type="chuva_mm", value=101.6, timestamp=dt.datetime(2026, 11, 16, 23, 58, 56, tzinfo=BRT))
        # dia legítimo: última leitura da noite com chuva nova que NÃO é a soma do dia
        Reading.objects.create(station=self.st, reading_type="chuva_mm", value=5.0, timestamp=dt.datetime(2026, 11, 15, 10, 0, tzinfo=BRT))
        self.real = Reading.objects.create(station=self.st, reading_type="chuva_mm", value=1.0, timestamp=dt.datetime(2026, 11, 15, 23, 50, tzinfo=BRT))
        self.adm = get_user_model().objects.create_superuser("adm", "a@x.org", "x")

    def test_acha_so_o_duplicado(self):
        from core import limpeza_baldes

        r = limpeza_baldes.limpar("plugfield", dry_run=True)
        self.assertEqual([b["id"] for b in r["baldes"]], [self.dup.id])
        self.assertEqual(Reading.objects.count(), 5)  # nada apagado no dry_run

    def test_apaga_so_o_duplicado_via_api(self):
        self.client.force_login(self.adm)
        r = self.client.post("/api/admin/limpar-baldes-duplicados/", {"fonte": "plugfield", "dry_run": False}, content_type="application/json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["encontrados"], 1)
        self.assertFalse(Reading.objects.filter(pk=self.dup.pk).exists())
        self.assertTrue(Reading.objects.filter(pk=self.real.pk).exists())
        self.assertEqual(self.client.post("/api/admin/limpar-baldes-duplicados/", {"fonte": "plugfield", "dry_run": False}, content_type="application/json").json()["encontrados"], 0)

    def test_so_superusuario_e_fonte_valida(self):
        from django.contrib.auth import get_user_model

        self.client.force_login(get_user_model().objects.create_user("op", password="x"))
        self.assertEqual(self.client.post("/api/admin/limpar-baldes-duplicados/", {"fonte": "plugfield"}, content_type="application/json").status_code, 403)
        self.client.force_login(self.adm)
        self.assertEqual(self.client.post("/api/admin/limpar-baldes-duplicados/", {"fonte": "inmet"}, content_type="application/json").status_code, 400)
