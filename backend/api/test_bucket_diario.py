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


class LimpezaTotalCorridoTest(TestCase):
    """Estação 1999 (07/11/2026): leitura das 22:59 coletada depois da meia-noite saiu igual ao total corrido (29,3 mm) e não era a última a partir das 23:30."""

    def setUp(self):
        from django.contrib.auth import get_user_model

        src = Source.objects.create(slug="plugfield", name="Plugfield")
        self.st = Station.objects.create(source=src, external_id="10899", name="DC GUAPI", municipality="Guapimirim", station_type="meteorologica", latitude=-22.5, longitude=-43.0)
        for h, v in ((16, 22.9), (17, 3.1), (19, 3.3)):  # 29,3 mm reais até as 19h
            Reading.objects.create(station=self.st, reading_type="chuva_mm", value=v, timestamp=dt.datetime(2026, 11, 7, h, 0, tzinfo=BRT), raw_payload={"rainDay": 0})
        self.dup = Reading.objects.create(station=self.st, reading_type="chuva_mm", value=29.3, timestamp=dt.datetime(2026, 11, 7, 22, 59, 14, tzinfo=BRT), raw_payload={"rainDay": 29.3})
        # leitura legítima parecida: balde grande, mas o total corrido é maior que o valor (sobra chuva nova no dia)
        self.legit = Reading.objects.create(station=self.st, reading_type="chuva_mm", value=7.0, timestamp=dt.datetime(2026, 11, 8, 10, 0, tzinfo=BRT), raw_payload={"rainDay": 7.0})
        self.adm = get_user_model().objects.create_superuser("adm2", "a@x.org", "x")

    def test_acha_o_duplicado_das_2259_e_nao_a_chuva_legitima(self):
        from core import limpeza_baldes

        r = limpeza_baldes.limpar("plugfield", dry_run=True, modo="total_corrido", external_id="10899")
        self.assertEqual([b["id"] for b in r["baldes"]], [self.dup.id])  # o balde de 7,0 do dia 08 não tem soma anterior: é a 1ª chuva do dia

    def test_apaga_via_api_so_o_duplicado(self):
        self.client.force_login(self.adm)
        r = self.client.post("/api/admin/limpar-baldes-duplicados/", {"fonte": "plugfield", "dry_run": False, "modo": "total_corrido", "external_id": "10899"}, content_type="application/json")
        self.assertEqual((r.status_code, r.json()["apagados_registros"]), (200, 1))
        self.assertFalse(Reading.objects.filter(pk=self.dup.pk).exists())
        self.assertTrue(Reading.objects.filter(pk=self.legit.pk).exists())

    def test_reconciliacao_corrige_sozinha_e_deixa_auditoria(self):
        from core import limpeza_baldes
        from core.models import BaldeCorrigido

        seco = limpeza_baldes.reconciliar(dias=30, aplicar=False)
        self.assertEqual((seco["corrigidos"], seco["encontrados"]), (0, 1))
        self.assertTrue(Reading.objects.filter(pk=self.dup.pk).exists())  # simulação não apaga
        r = limpeza_baldes.reconciliar(dias=30)
        self.assertEqual(r["corrigidos"], 1)
        self.assertFalse(Reading.objects.filter(pk=self.dup.pk).exists())
        a = BaldeCorrigido.objects.get()
        self.assertEqual((a.leitura_id, a.valor_mm, a.total_corrido_mm, a.fonte, a.estacao_nome), (self.dup.id, 29.3, 29.3, "plugfield", "DC GUAPI"))
        self.assertEqual(a.raw_payload, {"rainDay": 29.3})
        self.assertEqual(limpeza_baldes.reconciliar(dias=30)["corrigidos"], 0)  # idempotente

    def test_carona_nunca_levanta_erro_e_respeita_a_janela(self):
        from unittest import mock

        from core import limpeza_baldes

        with mock.patch("core.limpeza_baldes.reconciliar", side_effect=RuntimeError("x")), mock.patch("django.utils.timezone.localtime") as lt:
            lt.return_value.minute = 2
            self.assertIsNone(limpeza_baldes.reconciliar_se_for_hora())  # erro engolido
            lt.return_value.minute = 17
            self.assertIsNone(limpeza_baldes.reconciliar_se_for_hora())  # fora da janela: nem chama
