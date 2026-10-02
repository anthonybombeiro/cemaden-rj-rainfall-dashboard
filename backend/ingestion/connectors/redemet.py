"""
Conector para as estações meteorológicas da Aeronáutica (aeródromos do RJ)
via API-REDEMET (DECEA). Ver levantamento completo em
docs/fontes-de-dados.md (seção REDEMET) e o passo a passo de cadastro em
docs/redemet-cadastro-rascunho.md.

Confirmado com chamadas reais em 02/10/2026:
  - GET https://api-redemet.decea.mil.br/aerodromos (sem filtro por país/UF
    na própria API — lista global, ~4.200 aeródromos; filtramos aqui por
    `pais` == Brazil/Brasil e `cidade` terminando em "RJ"). Dá nome,
    lat/lon decimais e altitude.
  - GET https://api-redemet.decea.mil.br/mensagens/metar/{icao} — mensagem
    METAR mais recente do dia corrente (UTC) daquele aeródromo, ou lista
    vazia se não houver observação na janela atual (comum fora do horário
    de operação de aeródromos menores/militares).
  - Autenticação: header `X-Api-Key` (ordem de precedência documentada pela
    própria REDEMET; usamos o header em vez do query param `api_key` para
    não vazar a chave em logs de acesso/URL).

Confirmado nesta mesma sessão que pelo menos SBGL, SBRJ, SBJR, SBME, SBMI e
SBSC relatam METAR em tempo real (estações sem controle de torre 24h, como
SBAF/SBCB/SBCP/SBVR, às vezes não têm observação na janela atual — não é
erro do conector).

Decodificação do METAR feita aqui com regex simples (texto é bem padronizado
pela OACI) em vez de trazer uma dependência nova só para isso — extraímos
só o que já temos campo de leitura para guardar: vento (direção/
velocidade/rajada), temperatura, ponto de orvalho e QNH (pressão ao nível
do mar). Fenômenos de tempo presente, visibilidade e nuvens ficam só no
texto bruto (`raw_payload`), sem campo próprio no modelo hoje.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
import time

import requests
from django.conf import settings

from core.models import Reading, Station

from .base import BaseConnector

logger = logging.getLogger("ingestion")

BASE_URL = "https://api-redemet.decea.mil.br"
AERODROMOS_URL = f"{BASE_URL}/aerodromos"
METAR_URL_TEMPLATE = f"{BASE_URL}/mensagens/metar/{{icao}}"

KT_PARA_MS = 0.514444

# Regexes sobre o corpo da mensagem METAR (ex: "METAR SBGL 020000Z 27003KT
# 9999 FEW030 BKN050 23/19 Q1016=" ou "METAR COR SBSC 020000Z 23004KT 9999
# -TSRA BKN010 FEW020CB OVC023 21/21 Q1017 RETS=").
VENTO_RE = re.compile(r"\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b")
TEMP_PONTO_ORVALHO_RE = re.compile(r"\s(M?\d{2})/(M?\d{2})\s")
QNH_RE = re.compile(r"\bQ(\d{3,4})\b")


def _get_with_retry(url: str, *, params: dict | None = None, tries: int = 4, timeout: int = 40) -> requests.Response:
    """A API-REDEMET às vezes reseta a conexão no meio da resposta (visto
    repetidas vezes testando manualmente em 01-02/10/2026, inclusive com
    `requests` puro) — não é bloqueio por ferramenta tipo o caso da
    Marinha (ver docs/fontes-de-dados.md), parece só instabilidade mesmo.
    Retry simples com backoff resolve na prática."""
    ultimo_erro: Exception | None = None
    for tentativa in range(tries):
        try:
            resp = requests.get(
                url,
                params=params,
                headers={"X-Api-Key": settings.REDEMET_API_KEY},
                timeout=timeout,
            )
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            ultimo_erro = exc
            time.sleep(1.5 * (tentativa + 1))
    raise ultimo_erro  # type: ignore[misc]


def _parse_metar_temperatura(valor: str) -> float:
    # METAR usa "M" como prefixo de negativo (ex: "M02" = -2°C), não "-".
    sinal = -1 if valor.startswith("M") else 1
    return sinal * float(valor.lstrip("M"))


def _municipio_do_campo_cidade(cidade: str) -> str:
    """Campo `cidade` da API-REDEMET vem como "Rio de Janeiro/RJ" ou, para
    plataformas marítimas, "MACAÉ, RJ" — normalizamos pro nome só do
    município, mesmo padrão de apresentação já usado pelos outros
    conectores (ex: InmetConnector)."""
    base = re.split(r"[/,]", cidade)[0].strip()
    return base.title()


class RedemetConnector(BaseConnector):
    slug = "redemet"
    name = "REDEMET — Rede de Meteorologia do Comando da Aeronáutica (DECEA)"
    website = "https://redemet.decea.mil.br"
    description = "Estações meteorológicas (METAR) dos aeródromos do estado do Rio de Janeiro."

    def fetch_stations(self) -> list[dict]:
        if not settings.REDEMET_API_KEY:
            raise RuntimeError(
                "REDEMET_API_KEY não configurado — cadastre-se em "
                "https://api-redemet.decea.mil.br/cadastro-api/ (ver docs/redemet-cadastro-rascunho.md)."
            )

        resp = _get_with_retry(AERODROMOS_URL)
        aerodromos = resp.json().get("data", [])

        stations = []
        for item in aerodromos:
            if (item.get("pais") or "").strip().upper() not in ("BRAZIL", "BRASIL"):
                continue
            cidade = item.get("cidade") or ""
            if not re.search(r"(?:/|,\s*)RJ$", cidade.strip()):
                continue

            try:
                lat = float(item["lat_dec"])
                lon = float(item["lon_dec"])
            except (TypeError, ValueError, KeyError):
                logger.warning("Aeródromo REDEMET %s sem lat/lon válidos, ignorado.", item.get("cod"))
                continue

            altitude = None
            if item.get("altitude_metros") not in (None, ""):
                try:
                    altitude = float(item["altitude_metros"])
                except (TypeError, ValueError):
                    altitude = None

            stations.append(
                {
                    "external_id": item["cod"],
                    "name": item.get("nome") or item["cod"],
                    "municipality": _municipio_do_campo_cidade(cidade),
                    "station_type": Station.StationType.METEOROLOGICA,
                    "status": Station.Status.DESCONHECIDO,
                    "latitude": lat,
                    "longitude": lon,
                    "altitude_m": altitude,
                    "raw_metadata": item,
                }
            )
        return stations

    def fetch_readings(self, stations: list[dict]) -> list[dict]:
        readings: list[dict] = []
        for st in stations:
            icao = st["external_id"]
            try:
                resp = _get_with_retry(METAR_URL_TEMPLATE.format(icao=icao))
            except requests.RequestException as exc:
                logger.warning("REDEMET: falha ao buscar METAR de %s: %s", icao, exc)
                continue

            mensagens = resp.json().get("data", {}).get("data", [])
            if not mensagens:
                # Comum fora do horário de operação de aeródromos sem torre 24h
                # (ex: SBAF, SBCB) — não é erro.
                continue

            mais_recente = max(mensagens, key=lambda m: m.get("recebimento", ""))
            texto = mais_recente.get("mens", "")
            try:
                timestamp = dt.datetime.strptime(mais_recente["recebimento"], "%Y-%m-%d %H:%M:%S").replace(
                    tzinfo=dt.timezone.utc
                )
            except (KeyError, ValueError):
                logger.warning("REDEMET %s: METAR sem timestamp de recebimento válido, ignorado.", icao)
                continue

            vento = VENTO_RE.search(texto)
            if vento:
                direcao, velocidade_kt, rajada_kt = vento.groups()
                if direcao != "VRB":
                    readings.append(
                        {
                            "external_id": icao,
                            "reading_type": Reading.ReadingType.VENTO_DIR_GRAUS,
                            "value": float(direcao),
                            "timestamp": timestamp,
                            "raw_payload": mais_recente,
                        }
                    )
                readings.append(
                    {
                        "external_id": icao,
                        "reading_type": Reading.ReadingType.VENTO_MS,
                        "value": float(velocidade_kt) * KT_PARA_MS,
                        "timestamp": timestamp,
                        "raw_payload": mais_recente,
                    }
                )
                if rajada_kt:
                    readings.append(
                        {
                            "external_id": icao,
                            "reading_type": Reading.ReadingType.VENTO_RAJADA_MS,
                            "value": float(rajada_kt) * KT_PARA_MS,
                            "timestamp": timestamp,
                            "raw_payload": mais_recente,
                        }
                    )

            temp_orvalho = TEMP_PONTO_ORVALHO_RE.search(f" {texto} ")
            if temp_orvalho:
                temp_str, orvalho_str = temp_orvalho.groups()
                readings.append(
                    {
                        "external_id": icao,
                        "reading_type": Reading.ReadingType.TEMPERATURA_C,
                        "value": _parse_metar_temperatura(temp_str),
                        "timestamp": timestamp,
                        "raw_payload": mais_recente,
                    }
                )
                readings.append(
                    {
                        "external_id": icao,
                        "reading_type": Reading.ReadingType.PONTO_ORVALHO_C,
                        "value": _parse_metar_temperatura(orvalho_str),
                        "timestamp": timestamp,
                        "raw_payload": mais_recente,
                    }
                )

            qnh = QNH_RE.search(texto)
            if qnh:
                readings.append(
                    {
                        "external_id": icao,
                        "reading_type": Reading.ReadingType.PRESSAO_NM_HPA,
                        "value": float(qnh.group(1)),
                        "timestamp": timestamp,
                        "raw_payload": mais_recente,
                    }
                )

        return readings
