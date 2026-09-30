"""
Conector para as estações pessoais Ecowitt da Defesa Civil de Paracambi
(2026-09-30, acesso cedido diretamente pela Defesa Civil municipal: 2
estações GW3000B/Fine Offset — "Cascata" e "BNH de Cima").

Diferente do Wunderground (rede pública crowd-sourced, chave própria só
pra consulta), aqui é a API OFICIAL da Ecowitt
(https://api.ecowitt.net/api/v3/), autenticada por Application Key + API
Key fornecidas pela própria Defesa Civil — mesmo esquema de autenticação
por chave que Wunderground/Plugfield já usam neste projeto, sem
scraping/login.

`device/list` já devolve nome, MAC e COORDENADAS de cada estação
cadastrada na conta — não precisamos cadastrar lat/lon manualmente, nem
saber os MACs de antemão pra listar estações (só pra consultar leituras).

Atenção (2026-09-30): a 2ª estação ("BNH de Cima") vinha com coordenadas
(-22.332, -42.0008) que caem lá pelos lados de Macaé/Rio das Ostras — a
Defesa Civil de Paracambi confirmou que a estação é mesmo de lá (bairro
BNH de Cima, referência = Escola Municipal Prefeito Hélio Ferreira da
Silva), então o cadastro na Ecowitt é que está com a coordenada errada,
não a estação em si. Corrigido manualmente em `COORDENADAS_CORRIGIDAS`
abaixo (localizada via Google Maps: R. Maceió, Jardim Nova Era, Paracambi)
— a coordenada bruta da Ecowitt continua em `raw_metadata`, caso mudem o
cadastro lá e a correção precise ser revista.
"""

from __future__ import annotations

import datetime as dt
import logging

import requests
from django.conf import settings

from core.models import Reading, Station

from .base import BaseConnector, bucket_from_running_daily

logger = logging.getLogger("ingestion")

DEVICE_LIST_URL = "https://api.ecowitt.net/api/v3/device/list"
REAL_TIME_URL = "https://api.ecowitt.net/api/v3/device/real_time"

# MAC -> (latitude, longitude) corrigida manualmente (ver nota acima).
COORDENADAS_CORRIGIDAS: dict[str, tuple[float, float]] = {
    "38:18:2B:F2:F5:C7": (-22.6006603, -43.6931076),  # BNH de Cima / EM Hélio Ferreira da Silva
}


def _chaves() -> tuple[str, str]:
    return (
        getattr(settings, "ECOWITT_PARACAMBI_APPLICATION_KEY", ""),
        getattr(settings, "ECOWITT_PARACAMBI_API_KEY", ""),
    )


class EcowittParacambiConnector(BaseConnector):
    slug = "ecowitt_paracambi"
    name = "Ecowitt (Defesa Civil de Paracambi)"
    website = "https://www.ecowitt.net/"
    description = "Estações pessoais Ecowitt/Fine Offset cedidas pela Defesa Civil de Paracambi."

    def fetch_stations(self) -> list[dict]:
        app_key, api_key = _chaves()
        if not app_key or not api_key:
            logger.info("ECOWITT_PARACAMBI_*_KEY não configurado — pulando estações da Paracambi.")
            return []
        try:
            resp = requests.get(
                DEVICE_LIST_URL, params={"application_key": app_key, "api_key": api_key}, timeout=15
            )
            resp.raise_for_status()
            payload = resp.json()
        except Exception:  # noqa: BLE001
            logger.exception("Falha ao buscar lista de estações Ecowitt (Paracambi)")
            return []

        if payload.get("code") != 0:
            logger.warning("Ecowitt device/list retornou código %s: %s", payload.get("code"), payload.get("msg"))
            return []

        estacoes = []
        for d in payload.get("data", {}).get("list", []):
            # Nome vem tipo "Cascata_EM Dr Carlos Nabuco" — só a parte antes
            # do "_" (o resto é o ponto de referência/escola, útil no
            # raw_metadata mas polui o nome curto da tabela).
            nome_curto = (d.get("name") or d["mac"]).split("_")[0]
            lat, lon = COORDENADAS_CORRIGIDAS.get(d["mac"], (d["latitude"], d["longitude"]))
            estacoes.append(
                {
                    "external_id": d["mac"],
                    "name": nome_curto,
                    "municipality": "Paracambi",
                    "station_type": Station.StationType.METEOROLOGICA,
                    "status": Station.Status.DESCONHECIDO,
                    "latitude": lat,
                    "longitude": lon,
                    "altitude_m": None,
                    "raw_metadata": d,
                }
            )
        return estacoes

    def fetch_readings(self, stations: list[dict]) -> list[dict]:
        app_key, api_key = _chaves()
        if not app_key or not api_key:
            return []

        readings: list[dict] = []
        for st in stations:
            mac = st["external_id"]
            try:
                resp = requests.get(
                    REAL_TIME_URL,
                    params={
                        "application_key": app_key,
                        "api_key": api_key,
                        "mac": mac,
                        "call_back": "all",
                        "temp_unitid": 1,  # Celsius
                        "pressure_unitid": 3,  # hPa
                        "wind_speed_unitid": 6,  # m/s — mesma unidade que o resto do projeto guarda
                        "rainfall_unitid": 12,  # mm
                        "solar_radiation_unitid": 16,  # W/m²
                    },
                    timeout=15,
                )
                resp.raise_for_status()
                payload = resp.json()
            except Exception:  # noqa: BLE001
                logger.exception("Falha ao buscar leitura Ecowitt de %s", mac)
                continue

            if payload.get("code") != 0:
                logger.warning(
                    "Ecowitt real_time (%s) retornou código %s: %s", mac, payload.get("code"), payload.get("msg")
                )
                continue

            data = payload.get("data") or {}

            def add(reading_type, campo: dict | None):
                if not campo or campo.get("value") is None:
                    return
                try:
                    valor = float(campo["value"])
                    timestamp = dt.datetime.fromtimestamp(int(campo["time"]), tz=dt.timezone.utc)
                except (TypeError, ValueError, KeyError):
                    return
                readings.append(
                    {
                        "external_id": mac,
                        "reading_type": reading_type,
                        "value": valor,
                        "timestamp": timestamp,
                        "raw_payload": campo,
                    }
                )

            outdoor = data.get("outdoor", {})
            add(Reading.ReadingType.TEMPERATURA_C, outdoor.get("temperature"))
            add(Reading.ReadingType.UMIDADE_PCT, outdoor.get("humidity"))
            add(Reading.ReadingType.SENSACAO_TERMICA_C, outdoor.get("feels_like"))
            add(Reading.ReadingType.PONTO_ORVALHO_C, outdoor.get("dew_point"))

            pressure = data.get("pressure", {})
            add(Reading.ReadingType.PRESSAO_NM_HPA, pressure.get("relative"))

            wind = data.get("wind", {})
            add(Reading.ReadingType.VENTO_MS, wind.get("wind_speed"))
            add(Reading.ReadingType.VENTO_RAJADA_MS, wind.get("wind_gust"))
            add(Reading.ReadingType.VENTO_DIR_GRAUS, wind.get("wind_direction"))

            solar = data.get("solar_and_uvi", {})
            add(Reading.ReadingType.RADIACAO_WM2, solar.get("solar"))
            add(Reading.ReadingType.UV_INDICE, solar.get("uvi"))

            # Chuva: "daily" é um total CORRIDO desde meia-noite local (igual
            # Wunderground precipTotal/Plugfield rainDay) — convertido pra
            # "balde" (chuva NESSE intervalo) com a mesma técnica já usada
            # pras outras fontes running_daily, pra ficar somável igual ao
            # resto do projeto (ver bucket_from_running_daily em base.py).
            daily = (data.get("rainfall") or {}).get("daily")
            if daily and daily.get("value") is not None:
                try:
                    balde = bucket_from_running_daily("ecowitt_paracambi", mac, float(daily["value"]))
                    timestamp = dt.datetime.fromtimestamp(int(daily["time"]), tz=dt.timezone.utc)
                except (TypeError, ValueError, KeyError):
                    balde, timestamp = None, None
                if balde is not None and timestamp is not None:
                    readings.append(
                        {
                            "external_id": mac,
                            "reading_type": Reading.ReadingType.CHUVA_MM,
                            "value": balde,
                            "timestamp": timestamp,
                            "raw_payload": daily,
                        }
                    )

        return readings
