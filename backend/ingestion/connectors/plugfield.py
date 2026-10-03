"""
Conector para a API oficial da Plugfield (estações meteorológicas
municipais integradas por parceiros/Defesas Civis — conta institucional
da CEMADEN-RJ).

Documentação oficial (Swagger): https://wdg.plugfield.com.br/doc-api/index.html
Servidor real da API (NÃO é o mesmo host da documentação):
  https://prod-api.plugfield.com.br

Autenticação:
  1. POST /login  {"username": ..., "password": ...}  com header x-api-key
     -> {"access_token": "<JWT, não expira>", "user": {...}}
  2. Todas as chamadas seguintes usam os headers:
       x-api-key: <api key>
       Authorization: <access_token>   (valor puro — sem prefixo "Bearer")

Um único endpoint autenticado já basta para nós:
  GET /device?page=1
    -> {"pagination": {...}, "deviceList": [{
          "id", "name", "latitude", "longitude", "altitude", "city",
          "region", "lastUpdateTimestamp",
          "dashboard": {
              "temp", "tempMax", "tempMin", "humi", "rainDay", "rainMonth",
              "wind", "winb" (rajada), "dire" (direção em graus), "duep"
              (ponto de orvalho), "pres"/"prre" (pressão), "uv", "radi",
              "updateDateTime" (ISO 8601 UTC), ...
          }
        }, ...]}
  Cada estação já vem com a última leitura embutida em "dashboard" — por
  isso `fetch_readings` não faz nenhuma chamada extra, só relê o
  `raw_metadata` que `fetch_stations` já guardou.

Credenciais: conta institucional da CEMADEN-RJ (usuário/senha) + uma
api-key, fornecidas pela Plugfield. Configurar em PLUGFIELD_USERNAME,
PLUGFIELD_PASSWORD e PLUGFIELD_API_KEY no `.env` — nunca no código-fonte
(uma versão anterior deste conector, feita em outra sessão, commitou essas
credenciais em texto puro; foram removidas daqui e devem ser trocadas na
conta Plugfield assim que possível).

Unidades: a resposta de /login informa, para esta conta, speed_unit="km"
(km/h) e pressure_unit="hPa" — convertemos vento/rajada para m/s para
bater com o padrão do resto do projeto.

Limites documentados: 5.000 requisições/mês por estação, 5 req/s.
"""

from __future__ import annotations

import datetime as dt
import logging

import requests
from django.conf import settings

from core.models import Reading, Station

from .base import BaseConnector, bucket_from_running_daily_detalhe

logger = logging.getLogger("ingestion")

BASE_URL = "https://prod-api.plugfield.com.br"
LOGIN_URL = f"{BASE_URL}/login"
DEVICE_URL = f"{BASE_URL}/device"


class PlugfieldConnector(BaseConnector):
    slug = "plugfield"
    name = "Plugfield — Estações Meteorológicas"
    website = "https://plugfield.com.br"
    description = "Estações meteorológicas municipais integradas via API Plugfield (conta institucional CEMADEN-RJ)."

    def fetch_stations(self) -> list[dict]:
        api_key = getattr(settings, "PLUGFIELD_API_KEY", "")
        username = getattr(settings, "PLUGFIELD_USERNAME", "")
        password = getattr(settings, "PLUGFIELD_PASSWORD", "")
        if not (api_key and username and password):
            logger.info(
                "PLUGFIELD_API_KEY/PLUGFIELD_USERNAME/PLUGFIELD_PASSWORD não configurados — "
                "pulando ingestão do Plugfield."
            )
            return []

        access_token = self._login(api_key, username, password)
        if access_token is None:
            return []

        headers = {"x-api-key": api_key, "Authorization": access_token}
        stations: list[dict] = []
        page = 1
        while True:
            resp = requests.get(DEVICE_URL, params={"page": page}, headers=headers, timeout=30)
            resp.raise_for_status()
            payload = resp.json()
            device_list = payload.get("deviceList", [])
            for item in device_list:
                station = self._normalize_station(item)
                if station is not None:
                    stations.append(station)

            pagination = payload.get("pagination") or {}
            if page >= pagination.get("totalPages", 1):
                break
            page += 1

        return stations

    def fetch_readings(self, stations: list[dict]) -> list[dict]:
        # As leituras mais recentes já vêm embutidas em raw_metadata["dashboard"]
        # (ver fetch_stations) — nenhuma chamada extra à API é necessária aqui.
        readings: list[dict] = []
        for station in stations:
            raw = station.get("raw_metadata") or {}
            dashboard = raw.get("dashboard")
            if not dashboard:
                continue
            readings.extend(
                self._readings_from_dashboard(station["external_id"], dashboard, raw.get("lastUpdateTimestamp"))
            )
        return readings

    def _login(self, api_key: str, username: str, password: str) -> str | None:
        try:
            resp = requests.post(
                LOGIN_URL,
                headers={"x-api-key": api_key, "Content-Type": "application/json"},
                json={"username": username, "password": password},
                timeout=20,
            )
            resp.raise_for_status()
            data = resp.json()
            token = data.get("access_token")
            if not token:
                logger.error("Login Plugfield não retornou access_token: %r", data)
                return None
            return token
        except Exception:  # noqa: BLE001
            logger.exception("Falha ao autenticar na API Plugfield.")
            return None

    def _normalize_station(self, item: dict) -> dict | None:
        external_id = item.get("id")
        if external_id is None:
            return None
        try:
            latitude = float(item["latitude"])
            longitude = float(item["longitude"])
        except (KeyError, TypeError, ValueError):
            logger.warning("Estação Plugfield %s sem lat/lon válidos, ignorada.", external_id)
            return None

        altitude = None
        if item.get("altitude") not in (None, ""):
            try:
                altitude = float(item["altitude"])
            except (TypeError, ValueError):
                altitude = None

        return {
            "external_id": str(external_id),
            "name": item.get("name") or f"Plugfield {external_id}",
            "municipality": (item.get("city") or "").strip(),
            "station_type": Station.StationType.METEOROLOGICA,
            "status": Station.Status.ATIVA,
            "latitude": latitude,
            "longitude": longitude,
            "altitude_m": altitude,
            "raw_metadata": item,
        }

    def _readings_from_dashboard(
        self, external_id: str, dashboard: dict, last_update_timestamp_ms: int | None
    ) -> list[dict]:
        # Achado em 2026-09-23 (pedido do usuário: "dados da plugfield estão
        # constantemente atrasados"): o campo `dashboard.updateDateTime` da
        # API deles é BUGADO — vem com sufixo "Z" (UTC) mas o valor é na
        # verdade hora LOCAL de Brasília (UTC-3). Confirmado comparando com
        # `lastUpdateTimestamp` (epoch em ms, no nível do device, sem
        # ambiguidade nenhuma): as duas fontes têm o MESMO horário de
        # relógio (ex: "12:54:44"), mas `lastUpdateTimestamp` convertido
        # corretamente dá 15:54:44 UTC — exatamente 3h à frente, o
        # deslocamento de Brasília. Usar `updateDateTime` fazia toda
        # estação Plugfield parecer atrasada em ~3h (era só a leitura de
        # fuso horário errada, o dado em si estava fresco). Por isso
        # usamos `lastUpdateTimestamp` aqui, não `updateDateTime`.
        if last_update_timestamp_ms is None:
            timestamp = _parse_timestamp(dashboard.get("updateDateTime"))
        else:
            try:
                timestamp = dt.datetime.fromtimestamp(last_update_timestamp_ms / 1000, tz=dt.timezone.utc)
            except (TypeError, ValueError, OSError):
                timestamp = _parse_timestamp(dashboard.get("updateDateTime"))
        if timestamp is None:
            return []

        readings = []

        def add(reading_type, valor, qc_hint=None):
            if valor is None:
                return
            leitura = {
                "external_id": external_id,
                "reading_type": reading_type,
                "value": float(valor),
                "timestamp": timestamp,
                "raw_payload": dashboard,
            }
            if qc_hint:
                leitura["qc_hint"] = qc_hint
            readings.append(leitura)

        add(Reading.ReadingType.TEMPERATURA_C, dashboard.get("temp"))
        add(Reading.ReadingType.UMIDADE_PCT, dashboard.get("humi"))
        # rainDay é corrido desde a meia-noite local, não um valor
        # por-janela — convertido pra "balde" (chuva NESSE intervalo), pra
        # ficar escalonado igual às fontes tipo "balde" (ver
        # bucket_from_running_daily em base.py e mesmo tratamento em
        # wunderground.py — pedido do usuário, 2026-09-23).
        rain_day = dashboard.get("rainDay")
        if rain_day is not None:
            balde, ja_registrado = bucket_from_running_daily_detalhe("plugfield", external_id, float(rain_day))
            hint = None
            if ja_registrado is None:
                hint = ("ok", "1a leitura do dia: o balde é o total desde 00h")
            elif float(rain_day) < ja_registrado - 0.5:
                hint = (
                    "suspeito",
                    f"total do dia regrediu ({ja_registrado:.1f} -> {float(rain_day):.1f} mm): contador reiniciou?",
                )
            add(Reading.ReadingType.CHUVA_MM, balde, qc_hint=hint)
        add(Reading.ReadingType.VENTO_DIR_GRAUS, dashboard.get("dire"))

        # Extras (2026-09-25): tempMax/tempMin são os extremos do DIA até agora.
        add(Reading.ReadingType.TEMPERATURA_MAX_C, dashboard.get("tempMax"))
        add(Reading.ReadingType.TEMPERATURA_MIN_C, dashboard.get("tempMin"))
        add(Reading.ReadingType.PRESSAO_HPA, dashboard.get("pres"))
        add(Reading.ReadingType.PRESSAO_NM_HPA, dashboard.get("prre"))
        orvalho, temp_atual = dashboard.get("duep"), dashboard.get("temp")
        if orvalho is not None and -15 <= float(orvalho) <= 32 and (temp_atual is None or float(orvalho) <= float(temp_atual) + 1):
            add(Reading.ReadingType.PONTO_ORVALHO_C, orvalho)
        add(Reading.ReadingType.UV_INDICE, dashboard.get("uv"))
        add(Reading.ReadingType.SENSACAO_TERMICA_C, dashboard.get("feel"))
        # `radi` NÃO é gravado: chegou como ~10.000 às 7h da manhã (unidade não é W/m², provável
        # iluminância) — sem confirmação da unidade, melhor não expor como radiação solar.

        # wind/winb vêm em km/h (speed_unit da conta) — convertendo para m/s.
        vento_kmh = dashboard.get("wind")
        if vento_kmh is not None:
            add(Reading.ReadingType.VENTO_MS, float(vento_kmh) / 3.6)
        rajada_kmh = dashboard.get("winb")
        if rajada_kmh is not None:
            add(Reading.ReadingType.VENTO_RAJADA_MS, float(rajada_kmh) / 3.6)

        return readings

    def pos_ingestao(self, station_objs: dict, station_dicts: list[dict], leituras_criadas: list) -> None:
        from django.utils import timezone

        from core.qualidade import registrar_qualidade_chuva

        registrar_qualidade_chuva(leituras_criadas, timezone.now())


def _parse_timestamp(valor: str | None) -> dt.datetime | None:
    if not valor:
        return None
    try:
        return dt.datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        logger.warning("Timestamp Plugfield inesperado: %r", valor)
        return None
