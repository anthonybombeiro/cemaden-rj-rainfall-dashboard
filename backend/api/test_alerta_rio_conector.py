from unittest import mock

from django.test import TestCase

from core.models import Source, Station
from ingestion.connectors.alerta_rio import AlertaRioConnector


class AlertaRioGeoJsonForaDoArTest(TestCase):
    """08/11/2026: o GeoJSON de estações (data.rio) saiu do ar e o Alerta Rio parou 14 h; agora usa as estações já gravadas."""

    def _estacao(self, source, cod, nome):
        return Station.objects.create(
            source=source, external_id=str(cod), name=f"Alerta Rio - {nome}", municipality="Rio de Janeiro", station_type=Station.StationType.PLUVIOMETRICA,
            latitude=-22.9, longitude=-43.2, raw_metadata={"cod": cod, "est": nome, "acumulados_oficiais": {"x": 1}},
        )

    def test_usa_estacoes_gravadas_quando_o_geojson_cai(self):
        src = Source.objects.create(slug="alerta_rio", name="Alerta Rio")
        self._estacao(src, 1, "Vidigal")
        self._estacao(src, 2, "Santa Teresa")
        with mock.patch("ingestion.connectors.alerta_rio.requests.get", side_effect=TimeoutError("data.rio fora do ar")):
            est = AlertaRioConnector().fetch_stations()
        self.assertEqual({e["external_id"] for e in est}, {"1", "2"})
        self.assertEqual(est[0]["raw_metadata"]["est"] in ("Vidigal", "Santa Teresa"), True)

    def test_sem_estacoes_gravadas_continua_falhando(self):
        Source.objects.create(slug="alerta_rio", name="Alerta Rio")
        with mock.patch("ingestion.connectors.alerta_rio.requests.get", side_effect=TimeoutError("fora")):
            with self.assertRaises(TimeoutError):
                AlertaRioConnector().fetch_stations()
