import importlib

from django.apps import apps
from django.test import TestCase

from core.models import CotaHidrologica, Source, Station

migracao = importlib.import_module("core.migrations.0034_cotas_inea_conferidas")


class CotasIneaMigracaoTest(TestCase):
    def _estacao(self, ext):
        src, _ = Source.objects.get_or_create(slug="inea", defaults={"name": "INEA"})
        return Station.objects.create(source=src, external_id=ext, name=ext.title(), station_type="hidrologica", latitude=-22, longitude=-43)

    def test_corrige_cota_da_planilha_cria_a_que_faltava_e_respeita_ajuste_manual(self):
        flores = self._estacao("RIO DAS FLORES")
        CotaHidrologica.objects.create(station=flores, atencao_cm=213, alerta_cm=284, inundacao_cm=355)
        unifeso = self._estacao("UNIFESO")
        CotaHidrologica.objects.create(station=unifeso, atencao_cm=1, alerta_cm=2, inundacao_cm=999)  # editada à mão
        comari = self._estacao("COMARI")
        migracao.aplicar(apps, None)
        c = CotaHidrologica.objects.get(station=flores)
        self.assertEqual((c.atencao_cm, c.alerta_cm, c.inundacao_cm), (172.2, 229.6, 287.0))  # INEA: 2,296 m e 2,87 m
        self.assertEqual(CotaHidrologica.objects.get(station=unifeso).inundacao_cm, 999)
        n = CotaHidrologica.objects.get(station=comari)
        self.assertEqual((n.atencao_cm, n.alerta_cm, n.inundacao_cm), (228.0, 304.0, 380.0))
        migracao.aplicar(apps, None)  # idempotente
        self.assertEqual(CotaHidrologica.objects.get(station=flores).inundacao_cm, 287.0)
