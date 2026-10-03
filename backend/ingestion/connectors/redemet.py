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
ICAO_RE = re.compile(r"\b(?:METAR|SPECI)(?:\s+COR)?\s+([A-Z]{4})\b")
OBS_TIME_RE = re.compile(r"\b(\d{2})(\d{2})(\d{2})Z\b")

# Quantas horas pra trás buscar a cada execução — cobre execuções perdidas
# do cron sem pesar (cada mensagem nova vira ~6 leituras, as já guardadas
# só passam por get_or_create).
JANELA_HORAS = 3


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


def _icao_da_mensagem(texto: str) -> str | None:
    m = ICAO_RE.search(texto)
    return m.group(1) if m else None


def _timestamp_observacao(texto: str, recebimento: str | None) -> dt.datetime | None:
    """Horário REAL da observação (grupo DDHHMMZ do próprio METAR) — o campo
    `recebimento` é quando a REDEMET recebeu a mensagem, 10-30min DEPOIS da
    observação, o que fazia a estação parecer atrasada e desalinhava o
    histórico. Mês/ano vêm do `recebimento` (o METAR só traz o dia); se o dia
    da observação for maior que o do recebimento, é do mês anterior
    (observação 23h59 do último dia recebida já no dia 1º)."""
    try:
        ref = dt.datetime.strptime(recebimento, "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)
    except (TypeError, ValueError):
        ref = None
    m = OBS_TIME_RE.search(texto)
    if m and ref is not None:
        dia, hora, minuto = (int(g) for g in m.groups())
        try:
            obs = ref.replace(day=dia, hour=hora, minute=minuto, second=0, microsecond=0)
            if obs > ref + dt.timedelta(hours=1):
                mes_ant = ref.replace(day=1) - dt.timedelta(days=1)
                obs = mes_ant.replace(day=dia, hour=hora, minute=minuto, second=0, microsecond=0)
            return obs
        except ValueError:
            pass
    return ref


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
        icaos = [st["external_id"] for st in stations]
        por_icao = self._buscar_mensagens(icaos)

        readings: list[dict] = []
        for icao, mensagens in por_icao.items():
            for msg in mensagens:
                readings.extend(self._readings_da_mensagem(icao, msg))
        return readings

    def _buscar_mensagens(self, icaos: list[str]) -> dict[str, list[dict]]:
        """Busca os METARs das últimas JANELA_HORAS horas de TODAS as
        estações numa chamada só (`/mensagens/metar/SBGL,SBRJ,...`) — antes
        era 1 chamada por estação, só a mensagem mais recente, com até 4
        tentativas de 40s cada: 17 estações sequenciais estouravam o tempo
        do cron/CGI e, sem janela, qualquer execução perdida deixava buraco
        no histórico (pedido do usuário, 02/10/2026: estações da REDEMET sem
        histórico e sempre atrasadas). Se a chamada em lote/com janela
        falhar, cai pro modo antigo por estação."""
        agora = dt.datetime.now(dt.timezone.utc)
        params = {
            "data_ini": (agora - dt.timedelta(hours=JANELA_HORAS)).strftime("%Y%m%d%H"),
            "data_fim": agora.strftime("%Y%m%d%H"),
        }
        por_icao: dict[str, list[dict]] = {}
        try:
            resp = _get_with_retry(METAR_URL_TEMPLATE.format(icao=",".join(icaos)), params=params, tries=3)
            for msg in resp.json().get("data", {}).get("data", []) or []:
                icao = _icao_da_mensagem(msg.get("mens", ""))
                if icao in icaos:
                    por_icao.setdefault(icao, []).append(msg)
        except (requests.RequestException, ValueError) as exc:
            logger.warning("REDEMET: busca em lote falhou (%s), usando modo por estação.", exc)

        if por_icao:
            return por_icao

        for icao in icaos:
            try:
                resp = _get_with_retry(METAR_URL_TEMPLATE.format(icao=icao), tries=2, timeout=20)
            except requests.RequestException as exc:
                logger.warning("REDEMET: falha ao buscar METAR de %s: %s", icao, exc)
                continue
            mensagens = resp.json().get("data", {}).get("data", [])
            if mensagens:
                por_icao[icao] = mensagens
        return por_icao

    def _readings_da_mensagem(self, icao: str, msg: dict) -> list[dict]:
        texto = msg.get("mens", "")
        timestamp = _timestamp_observacao(texto, msg.get("recebimento"))
        if timestamp is None:
            logger.warning("REDEMET %s: METAR sem timestamp válido, ignorado.", icao)
            return []

        readings: list[dict] = []

        def add(tipo, valor):
            readings.append(
                {"external_id": icao, "reading_type": tipo, "value": valor, "timestamp": timestamp, "raw_payload": msg}
            )

        vento = VENTO_RE.search(texto)
        if vento:
            direcao, velocidade_kt, rajada_kt = vento.groups()
            if direcao != "VRB":
                add(Reading.ReadingType.VENTO_DIR_GRAUS, float(direcao))
            add(Reading.ReadingType.VENTO_MS, float(velocidade_kt) * KT_PARA_MS)
            if rajada_kt:
                add(Reading.ReadingType.VENTO_RAJADA_MS, float(rajada_kt) * KT_PARA_MS)

        temp_orvalho = TEMP_PONTO_ORVALHO_RE.search(f" {texto} ")
        if temp_orvalho:
            temp_str, orvalho_str = temp_orvalho.groups()
            add(Reading.ReadingType.TEMPERATURA_C, _parse_metar_temperatura(temp_str))
            add(Reading.ReadingType.PONTO_ORVALHO_C, _parse_metar_temperatura(orvalho_str))

        qnh = QNH_RE.search(texto)
        if qnh:
            add(Reading.ReadingType.PRESSAO_NM_HPA, float(qnh.group(1)))

        return readings
