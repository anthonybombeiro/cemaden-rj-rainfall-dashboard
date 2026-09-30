"""
Conector para a rede de telemetria de Macaé, operada pela UFRJ/Defesa
Civil de Macaé (telemetria.macae.ufrj.br) — acesso institucional cedido
diretamente pela Defesa Civil de Macaé (2026-09-30).

Sistema em CodeIgniter (PHP), sem API pública documentada, mas com uma
área autenticada (login usuário/senha simples, POST sem CSRF) que expõe
JSON/GeoJSON — achado inspecionando o próprio dashboard (Network tab),
não é scraping de HTML:

  1. POST /Login (username, password, form-urlencoded) → cookie de sessão.
  2. GET /Estacoes/visualizarEstacoes → HTML com a lista de estações
     (extraímos os IDs via regex em vez de fazer o parsing de tabela HTML —
     mais estável a mudanças de layout, e o `id` é tudo que precisamos
     pra chamada seguinte).
  3. GET /Estacoes/getEstacoesGeoJson/volume_chuva/?ids=<lista>&ativa=true
     → GeoJSON com TODAS as estações de uma vez: coordenada exata,
     endereço, tipo, status online/offline, e a ÚLTIMA LEITURA completa
     (temperatura/umidade/vento/direção/chuva + um `payload` bruto do
     sensor com rajada/pressão).

Autenticação: MACAE_UFRJ_USERNAME/MACAE_UFRJ_PASSWORD no `.env` — login
de serviço fornecido pela Defesa Civil de Macaé, nunca no código.

Duas famílias de estação no cadastro deles (campo `estacao.tipo`):
  - "interna": sensor próprio da rede (a rede telemetria em si) — o que
    nos interessa aqui.
  - "weather.com": estação PESSOAL (Wunderground/PWS) redirecionada pelo
    dashboard deles, com `weathercom_station_id` (ex: "IMACA28") — JÁ
    coberta (ou cobrível) pelo nosso próprio conector Wunderground
    (ver wunderground.py) usando o mesmo código PWS. Ignoradas aqui pra
    não duplicar leitura da mesma estação física por duas fontes.

`fetch_readings` REAPROVEITA o payload já baixado em `fetch_stations`
(salvo em `raw_metadata`) em vez de logar/buscar de novo — a API já
devolve estação+leitura numa única chamada.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
from zoneinfo import ZoneInfo

import requests
from django.conf import settings

from core.models import Reading, Station

from .base import BaseConnector

logger = logging.getLogger("ingestion")

BASE_URL = "https://telemetria.macae.ufrj.br"
LOGIN_URL = f"{BASE_URL}/Login"
LISTA_ESTACOES_URL = f"{BASE_URL}/Estacoes/visualizarEstacoes"
GEOJSON_URL = f"{BASE_URL}/Estacoes/getEstacoesGeoJson/volume_chuva/"
TZ_RJ = ZoneInfo("America/Sao_Paulo")


def _login() -> requests.Session | None:
    username = getattr(settings, "MACAE_UFRJ_USERNAME", "")
    password = getattr(settings, "MACAE_UFRJ_PASSWORD", "")
    if not (username and password):
        logger.info("MACAE_UFRJ_USERNAME/MACAE_UFRJ_PASSWORD não configurados — pulando Macaé (UFRJ).")
        return None

    session = requests.Session()
    resp = session.post(LOGIN_URL, data={"username": username, "password": password}, timeout=30)
    resp.raise_for_status()
    # Login errado só re-renderiza a própria tela (sem 401/403) — checa se
    # a sessão ficou autenticada de verdade pedindo uma página que só
    # existe logado; se o portal devolver o form de login de novo, falhou.
    check = session.get(f"{BASE_URL}/Dashboard", timeout=30)
    if 'name="password"' in check.text:
        logger.error("Login recusado pelo portal de telemetria de Macaé (usuário/senha incorretos?).")
        return None
    return session


def _extrair_ids_estacoes(html: str) -> list[str]:
    return sorted(set(re.findall(r"monitoramentoIndividual/(\d+)", html)), key=int)


def _buscar_geojson(session: requests.Session) -> list[dict]:
    resp = session.get(LISTA_ESTACOES_URL, timeout=30)
    resp.raise_for_status()
    ids = _extrair_ids_estacoes(resp.text)
    if not ids:
        logger.warning("Nenhum ID de estação encontrado em /Estacoes/visualizarEstacoes (Macaé).")
        return []

    resp = session.get(GEOJSON_URL, params={"ids": ",".join(ids), "ativa": "true"}, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    return payload.get("features", [])


class MacaeUfrjConnector(BaseConnector):
    slug = "macae_ufrj"
    name = "Macaé — Rede de Telemetria (UFRJ/Defesa Civil)"
    website = BASE_URL
    description = "Rede de estações meteorológicas/pluviométricas de Macaé, operada pela UFRJ."

    def fetch_stations(self) -> list[dict]:
        session = _login()
        if session is None:
            return []

        try:
            features = _buscar_geojson(session)
        except Exception:  # noqa: BLE001
            logger.exception("Falha ao buscar estações de Macaé (UFRJ)")
            return []

        estacoes = []
        for feature in features:
            props = feature.get("properties") or {}
            info = props.get("estacao") or {}
            # Só "interna" (sensor próprio da rede) — "weather.com" é PWS
            # pessoal já coberto (ou cobrível) pelo conector Wunderground,
            # evita duplicar a mesma estação física por duas fontes.
            if info.get("tipo") != "interna":
                continue
            geometry = feature.get("geometry") or {}
            coords = geometry.get("coordinates")
            if not coords or len(coords) < 2:
                continue
            lon, lat = coords[0], coords[1]  # GeoJSON é [lon, lat]
            external_id = str(info.get("id") or feature.get("id"))
            if not external_id:
                continue
            estacoes.append(
                {
                    "external_id": external_id,
                    "name": info.get("descricao") or f"Macaé {external_id}",
                    "municipality": "Macaé",
                    "station_type": Station.StationType.METEOROLOGICA,
                    "status": Station.Status.ATIVA if info.get("online") else Station.Status.INATIVA,
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "altitude_m": None,
                    "raw_metadata": props,  # guarda ultimaLeitura pra fetch_readings reaproveitar
                }
            )
        return estacoes

    def fetch_readings(self, stations: list[dict]) -> list[dict]:
        readings: list[dict] = []
        for st in stations:
            props = st.get("raw_metadata") or {}
            ultima = props.get("ultimaLeitura")
            if not ultima:
                continue
            external_id = st["external_id"]
            timestamp = _parse_data_hora(ultima.get("datahora"))
            if timestamp is None:
                continue

            def add(reading_type, valor):
                if valor is None:
                    return
                try:
                    valor_float = float(valor)
                except (TypeError, ValueError):
                    return
                readings.append(
                    {
                        "external_id": external_id,
                        "reading_type": reading_type,
                        "value": valor_float,
                        "timestamp": timestamp,
                        "raw_payload": ultima,
                    }
                )

            add(Reading.ReadingType.TEMPERATURA_C, ultima.get("temperatura"))
            add(Reading.ReadingType.UMIDADE_PCT, ultima.get("umidade_ar"))
            add(Reading.ReadingType.VENTO_DIR_GRAUS, ultima.get("dir_vento"))
            # velocidade_vento_kmh já vem em km/h — convertido pra m/s (SI),
            # mesma convenção do resto do projeto (Wunderground/Plugfield).
            vento_kmh = ultima.get("velocidade_vento_kmh")
            if vento_kmh is not None:
                add(Reading.ReadingType.VENTO_MS, float(vento_kmh) / 3.6)
            # volume_chuva é a leitura NESSE intervalo (não corrido) — tipo
            # "bucket" igual Alerta Rio/CEMADEN nacional, somável direto
            # (ver PRECIPITACAO_BUCKET_SOURCES em api/views.py).
            add(Reading.ReadingType.CHUVA_MM, ultima.get("volume_chuva"))

            # rajada de vento e pressão só vêm dentro do `payload` bruto do
            # sensor (string JSON aninhada), não no nível externo.
            payload_bruto = ultima.get("payload")
            if payload_bruto:
                try:
                    bruto = json.loads(payload_bruto)
                except (TypeError, ValueError):
                    bruto = {}
                rajada_ms = bruto.get("rajada_vento")
                if rajada_ms is not None:
                    add(Reading.ReadingType.VENTO_RAJADA_MS, rajada_ms)
                pressao = bruto.get("pressao")
                if pressao is not None:
                    add(Reading.ReadingType.PRESSAO_HPA, pressao)

        return readings


def _parse_data_hora(valor: str | None) -> dt.datetime | None:
    if not valor:
        return None
    try:
        naive = dt.datetime.strptime(valor, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        logger.warning("Data/hora Macaé (UFRJ) inesperada: %r", valor)
        return None
    return naive.replace(tzinfo=TZ_RJ).astimezone(dt.timezone.utc)
