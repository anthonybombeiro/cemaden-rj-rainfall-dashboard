"""
Conector para a rede de pluviômetros da Defesa Civil de Niterói
(plataforma "Alerta Nit", operada pela Tecal — fornecida pelo usuário,
diretor do CEMADEN-RJ, em setembro/2026).

  GET http://alertanit.tecal.com.br/estacoes/rest/stations/
      GeoJSON (FeatureCollection) com todas as estações — id, nome,
      código, tipo ("plv" = pluviômetro), latitude/longitude exata.
  GET http://alertanit.tecal.com.br/dados/rest/last_leituras/
      Última leitura de cada estação (por "estacao" = id da estação),
      já com chuva acumulada em várias janelas prontas: m05, m10, m15,
      m30, h01, h06, h12, h24, h36, h48, h72, h96, h168, h720, mes.

Autenticação: HTTP Basic (usuário/senha institucional, configurar em
NITEROI_API_USERNAME/NITEROI_API_PASSWORD no `.env` — nunca no código).

ATUALIZAÇÃO 06/10/2026: passou a gravar `m05` (balde de 5 min na grade de `horaLeitura`) com cron de
5 min — `m15` é janela deslizante e, em coleta irregular, sobrepunha/perdia baldes (96 h nossas
até ~10% acima das oficiais em 25 de 30 estações). O retrato dos acumulados OFICIAIS (m05..mes,
`is_delay`) fica em `raw_metadata["acumulados_oficiais"]` e, 1x/hora, em `AcumuladoOficial`.

(Texto histórico:) Guardamos "m15" (chuva acumulada nos últimos 15 min) como `chuva_mm`, tratada
como "balde" (soma ao longo do tempo é válida) pro nosso cálculo de acumulados em
`api/views.py` (`PRECIPITACAO_BUCKET_SOURCES`). ATENÇÃO: o balde só é válido se a
janela gravada tiver o MESMO tamanho do intervalo entre coletas. A coleta é de 15 em
15 min (cron), então a janela certa é `m15` — até 2026-09-25 gravávamos `m05`, que
captava só 5 de cada 15 min (subestimava a chuva em até ~3x: ex. Engenho do Mato
informava h01=2,2 mm e o painel mostrava 0,0). O histórico foi corrigido a partir do
`raw_payload` (migração 0012). As janelas maiores que a API já entrega prontas (h24,
h96, mes, ...) não são usadas diretamente, por consistência com as outras fontes.
"""

from __future__ import annotations

import datetime as dt
import logging

import requests
from django.conf import settings

from core.models import Reading, Station

from .base import BaseConnector, gravar_acumulados_oficiais

logger = logging.getLogger("ingestion")

BASE_URL = "http://alertanit.tecal.com.br"
STATIONS_URL = f"{BASE_URL}/estacoes/rest/stations/"
READINGS_URL = f"{BASE_URL}/dados/rest/last_leituras/"


class NiteroiConnector(BaseConnector):
    slug = "niteroi"
    name = "Niterói — Defesa Civil Municipal (Alerta Nit/Tecal)"
    website = BASE_URL
    description = "Rede de pluviômetros da Defesa Civil de Niterói, plataforma Alerta Nit (Tecal)."

    def _auth(self) -> tuple[str, str] | None:
        username = getattr(settings, "NITEROI_API_USERNAME", "")
        password = getattr(settings, "NITEROI_API_PASSWORD", "")
        if not (username and password):
            logger.info("NITEROI_API_USERNAME/NITEROI_API_PASSWORD não configurados — pulando Niterói.")
            return None
        return (username, password)

    def fetch_stations(self) -> list[dict]:
        auth = self._auth()
        if auth is None:
            return []

        anteriores = {
            st.external_id: (st.raw_metadata or {}).get("acumulados_oficiais")
            for st in Station.objects.filter(source__slug=self.slug)
        }
        resp = requests.get(STATIONS_URL, auth=auth, timeout=30)
        resp.raise_for_status()
        payload = resp.json()

        stations = []
        for feature in payload.get("features", []):
            props = feature.get("properties") or {}
            geometry = feature.get("geometry") or {}
            coords = geometry.get("coordinates")
            if not coords or len(coords) < 2:
                continue
            external_id = str(feature.get("id"))
            lon, lat = coords[0], coords[1]  # GeoJSON é [lon, lat]
            stations.append(
                {
                    "external_id": external_id,
                    "name": props.get("nome") or f"Niterói {external_id}",
                    "municipality": "Niterói",
                    "station_type": Station.StationType.PLUVIOMETRICA,
                    "status": Station.Status.ATIVA,
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "altitude_m": None,
                    "raw_metadata": {**props, "acumulados_oficiais": anteriores.get(external_id)},
                }
            )
        return stations

    def fetch_readings(self, stations: list[dict]) -> list[dict]:
        auth = self._auth()
        if auth is None:
            return []

        resp = requests.get(READINGS_URL, auth=auth, timeout=30)
        resp.raise_for_status()
        payload = resp.json()

        readings = []
        self._oficiais: dict[str, dict] = {}
        for item in payload:
            timestamp = _parse_timestamp(item.get("horaLeitura"))
            if timestamp is None:
                continue
            self._oficiais[str(item.get("estacao"))] = {
                "referencia": timestamp.astimezone(dt.timezone.utc).isoformat(),
                "acc": {
                    ch: (float(item[ch]) if isinstance(item.get(ch), (int, float)) and item[ch] >= 0 else None)
                    for ch in ("m05", "m10", "m15", "m30", "h01", "h06", "h12", "h24", "h36", "h48", "h72", "h96", "h168", "h720", "mes")
                },
                "is_delay": bool(item.get("is_delay")),
            }
            valor = item.get("m05")
            if valor is None:
                continue
            readings.append(
                {
                    "external_id": str(item.get("estacao")),
                    "reading_type": Reading.ReadingType.CHUVA_MM,
                    "value": float(valor),
                    "timestamp": timestamp,
                    "raw_payload": item,
                }
            )
        return readings

    def pos_ingestao(self, station_objs: dict, station_dicts: list[dict], leituras_criadas: list) -> None:
        from django.utils import timezone

        from core.qualidade import registrar_qualidade_chuva

        for external_id, snap in getattr(self, "_oficiais", {}).items():
            estacao = station_objs.get(external_id)
            if estacao is None:
                continue
            estacao.raw_metadata = {**(estacao.raw_metadata or {}), "acumulados_oficiais": snap}
            estacao.save(update_fields=["raw_metadata"])
        gravar_acumulados_oficiais(
            station_objs, getattr(self, "_oficiais", {}), {1: "h01", 24: "h24", 96: "h96"}
        )
        registrar_qualidade_chuva(leituras_criadas, timezone.now())


def _parse_timestamp(valor: str | None) -> dt.datetime | None:
    if not valor:
        return None
    try:
        return dt.datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        logger.warning("Timestamp Niterói inesperado: %r", valor)
        return None
