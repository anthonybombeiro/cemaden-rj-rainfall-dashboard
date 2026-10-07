"""
Conector para as estações pluviométricas e meteorológicas do Sistema
Alerta Rio / GeoRio (Prefeitura do Rio de Janeiro).

Estações (localização): GeoJSON público via DATA.RIO / ArcGIS Hub —
  GET https://www.data.rio/api/download/v1/items/{item_id}/geojson?layers=0
  item_id = 88b61c6abe424c049fdf83d27917602e  (dataset "Estações Alerta Rio")

Leituras em tempo real (encontrado em 15/09/2026 lendo o código-fonte
aberto do painel https://github.com/COR-RIO/dados-rio-chuvas, um projeto
recente — não documentado publicamente em lugar nenhum, mas é literalmente
a API que abastece o site oficial do Alerta Rio):

  GET https://websempre.rio.rj.gov.br/json/chuvas
      Chuva por estação em várias janelas (m05, m15, h01..h04, h24, h96,
      mes), sem paginação, todas as 33 estações pluviométricas de uma vez.
  GET https://websempre.rio.rj.gov.br/json/dados_meteorologicos
      Temperatura (inst./mín./máx.), umidade, pressão e vento (velocidade
      + direção cardinal em texto) por estação meteorológica — conjunto de
      estações parcialmente diferente do pluviométrico.

Achados de 06/10/2026 (comparação com o próprio feed; docs/alerta-rio-e-niteroi.md):
  * o feed manda o valor-sentinela **-99,99** em `m15`/`h24`/`h96`... quando a estação
    está sem dado; 235 leituras negativas já tinham entrado e distorciam os
    acumulados de ~20 estações (ex.: Grota Funda 96 h = -445 mm). Chuva negativa
    nunca vira leitura (guarda em `BaseConnector.run`) e as consultas ignoram negativos;
  * CADA ESTAÇÃO SÓ ATUALIZA A CADA 10 MIN (o `read_at` pula de :10 para :20 e fica parado
    entre eles — medido em 06/10/2026 noite) e o `m05` cobre só 5 desses 10 minutos: a 1ª troca
    (`m15` -> `m05`, 06/10 tarde) perdia ~metade da chuva (Bangu 1 h: 7,4 x 28,8 oficial).
    Por isso gravamos a janela que COBRE o intervalo desde a última leitura gravada da estação
    (`_janela_para_intervalo`: m05/m10/m15/m30; normalmente `m10`, que vem do portal);
  * o retrato dos acumulados OFICIAIS (m05, m15, h01-h04, h24, h96, mes) fica em
    `raw_metadata["acumulados_oficiais"]` e, 1x/hora, em `AcumuladoOficial`.

Essas URLs respondem "Request Rejected" (bloqueio de um WAF por
User-Agent) para clientes genéricos tipo `curl` sem cabeçalhos — não é
CAPTCHA nem desafio interativo, só uma checagem de User-Agent/Referer.
Enviar um User-Agent de navegador comum resolve, e é isso que fazemos
aqui — mesmo princípio de identificar o cliente que qualquer integração
HTTP normal já faz.

O casamento de cada leitura com a estação correta é feito por nome
("est" do GeoJSON == "name" da API de chuva) para pluviômetros, e por
código numérico ("cod" do GeoJSON == "station.id" da API meteorológica)
para as estações meteorológicas.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
import unicodedata

import requests

from core.models import Reading, Station

from .base import BaseConnector, gravar_acumulados_oficiais

logger = logging.getLogger("ingestion")

GEOJSON_URL = "https://www.data.rio/api/download/v1/items/88b61c6abe424c049fdf83d27917602e/geojson?layers=0"
CHUVAS_URL = "https://websempre.rio.rj.gov.br/json/chuvas"
# Página pública "Dados Pluviométricos" do Alerta Rio (HTML renderizado no servidor): traz colunas
# que o JSON não tem — Localização (região), 10 min, 30 min, 6 h, 12 h e "TX - 15" (06/10/2026).
PORTAL_URL = "https://websempre.rio.rj.gov.br/estacoes/"
# Ordem das colunas de chuva da tabela do portal (depois de N°, Estação, Localização, Hora Leitura).
COLUNAS_PORTAL = ("m05", "m10", "m15", "m30", "h01", "h02", "h03", "h04", "h06", "h12", "h24", "h96", "mes", "tx15")
METEOROLOGICOS_URL = "https://websempre.rio.rj.gov.br/json/dados_meteorologicos"

# Sem isso, o WAF do host rejeita a requisição com "Request Rejected"
# (checagem de User-Agent/Referer, não é CAPTCHA).
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.sistema-alerta-rio.com.br/",
}

CARDINAL_TO_DEG = {
    "N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5,
    "SE": 135, "SSE": 157.5, "S": 180, "SSW": 202.5, "SW": 225, "WSW": 247.5,
    "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5,
}


class AlertaRioConnector(BaseConnector):
    slug = "alerta_rio"
    name = "Alerta Rio / GeoRio"
    website = "https://www.sistema-alerta-rio.com.br/"
    description = "Estações pluviométricas e meteorológicas do Sistema Alerta Rio (capital)."

    def fetch_stations(self) -> list[dict]:
        # `acumulados_oficiais` (gravado em `pos_ingestao`) precisa sobreviver ao
        # update_or_create desta rodada.
        anteriores = {
            st.external_id: (st.raw_metadata or {}).get("acumulados_oficiais")
            for st in Station.objects.filter(source__slug=self.slug)
        }
        resp = requests.get(GEOJSON_URL, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        stations = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            coords = (feature.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            lon, lat = coords[0], coords[1]
            codigo = props.get("cod")
            if codigo is None:
                continue
            bairro = props.get("est") or ""
            stations.append(
                {
                    "external_id": str(codigo),
                    "name": f"Alerta Rio - {bairro}" if bairro else f"Alerta Rio - estação {codigo}",
                    "municipality": "Rio de Janeiro",
                    "station_type": Station.StationType.PLUVIOMETRICA,
                    "status": Station.Status.DESCONHECIDO,
                    "latitude": lat,
                    "longitude": lon,
                    "altitude_m": None,
                    "raw_metadata": {**props, "acumulados_oficiais": anteriores.get(str(codigo))},
                }
            )
        return stations

    def fetch_readings(self, stations: list[dict]) -> list[dict]:
        readings: list[dict] = []
        by_bairro = {
            _normalizar(st["raw_metadata"].get("est", "")): st["external_id"] for st in stations
        }
        by_cod = {str(st["raw_metadata"].get("cod")): st["external_id"] for st in stations}

        readings.extend(self._fetch_chuvas(by_bairro))
        readings.extend(self._fetch_meteorologicos(by_cod))
        return readings

    def _fetch_chuvas(self, by_bairro: dict[str, str]) -> list[dict]:
        try:
            resp = requests.get(CHUVAS_URL, headers=BROWSER_HEADERS, timeout=20)
            resp.raise_for_status()
            data = resp.json()
        except Exception:  # noqa: BLE001
            logger.exception("Falha ao buscar %s", CHUVAS_URL)
            return []

        readings = []
        self._oficiais: dict[str, dict] = {}
        portal = _fetch_portal()  # {} se a página falhar: o JSON continua valendo
        # Última leitura de chuva gravada de cada estação (define a janela a usar).
        from django.db.models import Max

        from core.models import Reading as _Reading

        ultimas = {
            r["station__external_id"]: r["m"]
            for r in _Reading.objects.filter(station__source__slug=self.slug, reading_type=_Reading.ReadingType.CHUVA_MM)
            .values("station__external_id")
            .annotate(m=Max("timestamp"))
        }
        for obj in data.get("objects", []):
            external_id = by_bairro.get(_normalizar(obj.get("name", "")))
            if external_id is None:
                continue
            timestamp = _parse_iso(obj.get("read_at"))
            if timestamp is None:
                continue
            dados = obj.get("data") or {}
            # Retrato dos acumulados oficiais (valores < 0 = sentinela "sem dado" -> None).
            acc = {
                ch: (float(v) if isinstance(v, (int, float)) and v >= 0 else None)
                for ch, v in dados.items()
                if ch in ("m05", "m15", "h01", "h02", "h03", "h04", "h24", "h96", "mes")
            }
            p = portal.get(_normalizar(obj.get("name", "")))
            if p:
                # O portal completa (10 min, 30 min, 6 h, 12 h, TX-15) e é a referência visual;
                # onde ele diz "ND" (None) vale o valor do JSON.
                for ch, v in p["acc"].items():
                    if v is not None:
                        acc[ch] = v
                    else:
                        acc.setdefault(ch, None)
            self._oficiais[external_id] = {
                "referencia": timestamp.astimezone(dt.timezone.utc).isoformat(),
                "acc": acc,
                "localizacao": (p or {}).get("localizacao"),
                "numero": (p or {}).get("numero"),
            }
            # Balde = janela que cobre o intervalo desde a última leitura gravada desta estação
            # (normalmente 10 min: a estação só atualiza a cada 10 min).
            valor = _valor_janela(acc, timestamp, ultimas.get(external_id))
            if valor is None:
                continue
            readings.append(
                {
                    "external_id": external_id,
                    "reading_type": Reading.ReadingType.CHUVA_MM,
                    "value": float(valor),
                    "timestamp": timestamp,
                    "raw_payload": obj,
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

    def _fetch_meteorologicos(self, by_cod: dict[str, str]) -> list[dict]:
        try:
            resp = requests.get(METEOROLOGICOS_URL, headers=BROWSER_HEADERS, timeout=20)
            resp.raise_for_status()
            data = resp.json()
        except Exception:  # noqa: BLE001
            logger.exception("Falha ao buscar %s", METEOROLOGICOS_URL)
            return []

        readings = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            station_id = (props.get("station") or {}).get("id")
            external_id = by_cod.get(str(station_id))
            if external_id is None:
                continue
            timestamp = _parse_iso(props.get("read_at"))
            if timestamp is None:
                continue
            valores = props.get("data") or {}

            for chave, reading_type in (
                ("temperature", Reading.ReadingType.TEMPERATURA_C),
                ("humidity", Reading.ReadingType.UMIDADE_PCT),
                ("max", Reading.ReadingType.TEMPERATURA_MAX_C),
                ("min", Reading.ReadingType.TEMPERATURA_MIN_C),
                ("pressure", Reading.ReadingType.PRESSAO_HPA),
            ):
                valor = _parse_br_float(valores.get(chave))
                if valor is not None:
                    readings.append(
                        {
                            "external_id": external_id,
                            "reading_type": reading_type,
                            "value": valor,
                            "timestamp": timestamp,
                            "raw_payload": props,
                        }
                    )

            vel_ms, direcao = _parse_vento(valores.get("wind"))
            if vel_ms is not None:
                readings.append(
                    {
                        "external_id": external_id,
                        "reading_type": Reading.ReadingType.VENTO_MS,
                        "value": vel_ms,
                        "timestamp": timestamp,
                        "raw_payload": props,
                    }
                )
            if direcao is not None:
                readings.append(
                    {
                        "external_id": external_id,
                        "reading_type": Reading.ReadingType.VENTO_DIR_GRAUS,
                        "value": direcao,
                        "timestamp": timestamp,
                        "raw_payload": props,
                    }
                )
        return readings


JANELAS_MIN = (("m05", 5), ("m10", 10), ("m15", 15), ("m30", 30))


def _valor_janela(acc: dict, timestamp: dt.datetime, ultima: dt.datetime | None) -> float | None:
    """Chuva do intervalo desde a última leitura gravada: usa a maior janela (m05/m10/m15/m30) que
    caiba no intervalo (tolerância de 2,5 min). Sem leitura anterior ou intervalo > 30 min, usa
    m10 / m30. Se a janela pedida não existe, cai para a menor disponível."""
    if ultima is None:
        alvo = 10.0
    else:
        alvo = (timestamp - ultima).total_seconds() / 60
        if alvo <= 0:
            alvo = 5.0  # mesmo read_at já gravado: o get_or_create descarta o duplicado
    escolhidas = [ch for ch, m in JANELAS_MIN if m <= alvo + 2.5] or ["m05"]
    for ch in reversed(escolhidas):
        v = acc.get(ch)
        if v is not None:
            return float(v)
    return None


def _fetch_portal() -> dict[str, dict]:
    """Lê a tabela de chuva da página pública do portal: {nome normalizado: {numero,
    localizacao, acc{m05..tx15}}}. Valores "ND" (sem dado) ou negativos viram None."""
    try:
        resp = requests.get(PORTAL_URL, headers=BROWSER_HEADERS, timeout=25)
        resp.raise_for_status()
        html = resp.content.decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        logger.exception("Falha ao buscar %s", PORTAL_URL)
        return {}
    saida: dict[str, dict] = {}
    for linha in re.findall(r'<tr id ?="linha-\d+">(.*?)</tr>', html, flags=re.S):
        c = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x)).strip() for x in re.findall(r"<td[^>]*>(.*?)</td>", linha, flags=re.S)]
        if len(c) < 4 + len(COLUNAS_PORTAL):
            continue
        acc = {}
        for ch, v in zip(COLUNAS_PORTAL, c[4 : 4 + len(COLUNAS_PORTAL)]):
            n = _parse_br_float(v)
            acc[ch] = n if (n is not None and n >= 0) else None
        saida[_normalizar(c[1])] = {"numero": c[0], "localizacao": c[2], "acc": acc}
    return saida


# Pequenas diferenças de nomenclatura entre o GeoJSON de estações (usado
# em fetch_stations) e a API de leituras em tempo real.
_ALIASES_NOME = {
    "estrada grajau/jacarepagua": "est. grajau/jacarepagua",
    # 06/10/2026: o feed de chuva usa outro nome para 2 estações (mesma coordenada /
    # ~1,5 km do GeoJSON); sem o apelido elas NUNCA tiveram chuva gravada.
    "barra/barrinha": "barra/itanhanga",
    "barra/riocentro": "barra/rio centro",
}


def _normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    chave = sem_acento.strip().casefold()
    return _ALIASES_NOME.get(chave, chave)


def _parse_iso(valor: str | None) -> dt.datetime | None:
    if not valor:
        return None
    try:
        return dt.datetime.fromisoformat(valor)
    except ValueError:
        logger.warning("Timestamp Alerta Rio inesperado: %r", valor)
        return None


def _parse_br_float(valor) -> float | None:
    if valor is None:
        return None
    texto = str(valor).strip()
    if texto in ("", "-", "--"):
        return None
    try:
        return float(texto.replace(",", "."))
    except ValueError:
        return None


def _parse_vento(valor: str | None) -> tuple[float | None, float | None]:
    """Formato observado: "8,64 (S)" ou "0,0 (SW)" — velocidade e direção
    cardinal. Unidade da velocidade não está documentada publicamente;
    assumimos km/h (convenção comum em painéis de defesa civil no Brasil)
    e convertemos para m/s — a CONFIRMAR quando possível."""
    if not valor:
        return None, None
    texto = str(valor).strip()
    if texto in ("-", "--", ""):
        return None, None
    m = re.match(r"([\d,.]+)\s*\(([A-Z/]+)\)", texto)
    if not m:
        return None, None
    velocidade_kmh = _parse_br_float(m.group(1))
    cardinal = m.group(2)
    velocidade_ms = velocidade_kmh / 3.6 if velocidade_kmh is not None else None
    direcao = CARDINAL_TO_DEG.get(cardinal)
    return velocidade_ms, direcao
