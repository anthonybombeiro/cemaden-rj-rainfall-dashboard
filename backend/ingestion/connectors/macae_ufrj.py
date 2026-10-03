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

Achados de 03/10/2026 (comparação com o próprio portal; ver
docs/fontes-de-dados.md, seção Macaé):
  * `ultimaLeitura.volume_chuva` é o volume de UM MINUTO (basculador de
    0,34 mm) — gravar só ele a cada 15 min guardava ~3% da chuva (Bicuda
    Grande: 3,4 mm gravados x 90,8 mm oficiais em 24 h).
  * A mesma `ultimaLeitura` traz os acumulados OFICIAIS do portal
    (`volume_acumulado_1h/24h/96h`) — guardados como retrato em
    `raw_metadata["acumulados_oficiais"]` e, 1x/hora, em `AcumuladoOficial`.
  * O portal tem histórico: `POST /Leituras/getEstatisticasLeiturasJson`
    (estacao_selecionada, data_inicial, data_final, escala=ESCALA_MINUTO|
    ESCALA_HORA|ESCALA_DIA, tipo_dados=TIPO_VOLUME_CHUVA) -> {"AAAA-MM-DD
    HH:MM": "mm"} (hora local, soma do período). `pos_ingestao` usa a escala
    de minuto para gravar a chuva REAL (só os minutos com chuva + o último
    minuto observado); idempotente: minuto já gravado é atualizado, não
    duplicado.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import re
import time
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
HISTORICO_URL = f"{BASE_URL}/Leituras/getEstatisticasLeiturasJson"
JANELAS_OFICIAIS_H = (1, 24, 96)
BACKFILL_INICIAL_H = 96  # 1a rodada: recupera as últimas 96 h (maior janela oficial)
ORCAMENTO_HISTORICO_S = 70.0  # tempo máximo do histórico por rodada (cron tem -m 120)


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
        self._session = session

        # `historico_minuto_ate` (até onde já gravamos o histórico por minuto)
        # precisa sobreviver ao update_or_create desta rodada.
        anteriores = {
            st.external_id: (st.raw_metadata or {}).get("historico_minuto_ate")
            for st in Station.objects.filter(source__slug=self.slug)
        }

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
            ultima = props.get("ultimaLeitura") or {}
            referencia = _parse_data_hora(ultima.get("datahora"))
            oficiais = {
                "referencia": referencia.isoformat() if referencia else None,
                "acc": {str(j): _num(ultima.get(f"volume_acumulado_{j}h")) for j in JANELAS_OFICIAIS_H},
            }
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
                    # guarda ultimaLeitura pra fetch_readings reaproveitar
                    "raw_metadata": {
                        **props,
                        "acumulados_oficiais": oficiais,
                        "codigo": info.get("identificador"),
                        "historico_minuto_ate": anteriores.get(external_id),
                    },
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
            # CHUVA (03/10/2026): NÃO se grava mais `volume_chuva` da última
            # leitura (volume de 1 minuto, ~3% da chuva real a cada 15 min) —
            # a chuva vem do histórico por minuto em `pos_ingestao`.

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

    def pos_ingestao(self, station_objs: dict, station_dicts: list[dict], leituras_criadas: list) -> None:
        from django.utils import timezone

        from core.models import AcumuladoOficial, LeituraQualidade, Reading
        from core.qualidade import LIMITE_SUSPEITO_MM, qualificar_chuva_intervalo

        agora = timezone.now()

        # 1) Acumulados oficiais (1/24/96 h) do portal, 1x por hora por estação.
        for sd in station_dicts:
            snap = (sd.get("raw_metadata") or {}).get("acumulados_oficiais") or {}
            estacao = station_objs.get(sd["external_id"])
            if not snap.get("referencia") or estacao is None:
                continue
            ref_hora = dt.datetime.fromisoformat(snap["referencia"]).replace(minute=0, second=0, microsecond=0)
            for janela in JANELAS_OFICIAIS_H:
                valor = (snap.get("acc") or {}).get(str(janela))
                if valor is not None:
                    AcumuladoOficial.objects.get_or_create(
                        station=estacao, janela_h=janela, referencia=ref_hora, defaults={"valor_mm": valor}
                    )

        # 2) Chuva real: histórico por minuto do portal.
        session = getattr(self, "_session", None)
        if session is None:
            return
        inicio_rodada = time.monotonic()
        for sd in station_dicts:
            if time.monotonic() - inicio_rodada > ORCAMENTO_HISTORICO_S:
                logger.warning("macae_ufrj: orçamento de histórico esgotado; o resto fica p/ a próxima rodada.")
                break
            meta = sd.get("raw_metadata") or {}
            snap = meta.get("acumulados_oficiais") or {}
            estacao = station_objs.get(sd["external_id"])
            if not snap.get("referencia") or estacao is None:
                continue  # estação sem nenhuma leitura no portal
            fim = dt.datetime.fromisoformat(snap["referencia"])
            ate = meta.get("historico_minuto_ate")
            if ate:
                ini = dt.datetime.fromisoformat(ate) - dt.timedelta(minutes=10)
            else:
                ini = fim - dt.timedelta(hours=BACKFILL_INICIAL_H)
            try:
                serie = _buscar_historico_minuto(session, sd["external_id"], ini, fim)
            except Exception as exc:  # noqa: BLE001 - uma estação com falha não derruba as outras
                logger.warning("macae_ufrj: histórico da estação %s falhou: %s", sd["external_id"], exc)
                continue
            if not serie:
                continue
            ultimo_minuto = max(serie)
            existentes = {}
            for r in Reading.objects.filter(
                station=estacao, reading_type=Reading.ReadingType.CHUVA_MM, timestamp__gte=ini - dt.timedelta(minutes=2)
            ):
                existentes.setdefault(r.timestamp.replace(second=0, microsecond=0), r)
            novas = []
            for minuto in sorted(serie):
                valor = serie[minuto]
                if valor <= 0 and minuto != ultimo_minuto:
                    continue  # minuto seco: não grava (não muda nenhuma soma)
                atual = existentes.get(minuto)
                if atual is not None:
                    if abs(atual.value - valor) > 1e-9:
                        atual.value = valor
                        atual.save(update_fields=["value"])
                    continue
                novas.append(
                    Reading(
                        station=estacao,
                        reading_type=Reading.ReadingType.CHUVA_MM,
                        timestamp=minuto,
                        value=valor,
                        raw_payload={"fonte": "historico_minuto"},
                    )
                )
            Reading.objects.bulk_create(novas, ignore_conflicts=True)
            for r in Reading.objects.filter(
                station=estacao, reading_type=Reading.ReadingType.CHUVA_MM, timestamp__gte=ini, value__gt=LIMITE_SUSPEITO_MM
            ):
                q = qualificar_chuva_intervalo(r.value, r.timestamp, agora)
                if q:
                    LeituraQualidade.objects.get_or_create(reading=r, defaults={"qualidade": q[0], "motivo": q[1][:120]})
            estacao.raw_metadata = {**(estacao.raw_metadata or {}), "historico_minuto_ate": ultimo_minuto.isoformat()}
            estacao.save(update_fields=["raw_metadata"])


def _num(valor) -> float | None:
    if valor is None or valor == "":
        return None
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def _buscar_historico_minuto(session: requests.Session, estacao_id: str, ini: dt.datetime, fim: dt.datetime) -> dict:
    """{minuto (datetime UTC): mm} da escala de minuto do portal (chaves em hora local)."""
    fmt = "%Y-%m-%d %H:%M:%S"
    resp = session.post(
        HISTORICO_URL,
        data={
            "estacao_selecionada": estacao_id,
            "data_inicial": ini.astimezone(TZ_RJ).strftime(fmt),
            "data_final": (fim.astimezone(TZ_RJ) + dt.timedelta(minutes=1)).strftime(fmt),
            "escala": "ESCALA_MINUTO",
            "tipo_dados": "TIPO_VOLUME_CHUVA",
        },
        timeout=40,
    )
    resp.raise_for_status()
    bruto = resp.json()
    serie = {}
    if isinstance(bruto, dict):
        for chave, valor in bruto.items():
            try:
                minuto = dt.datetime.strptime(chave, "%Y-%m-%d %H:%M").replace(tzinfo=TZ_RJ).astimezone(dt.timezone.utc)
                serie[minuto] = float(valor)
            except (TypeError, ValueError):
                continue
    return serie


def _parse_data_hora(valor: str | None) -> dt.datetime | None:
    if not valor:
        return None
    try:
        naive = dt.datetime.strptime(valor, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        logger.warning("Data/hora Macaé (UFRJ) inesperada: %r", valor)
        return None
    return naive.replace(tzinfo=TZ_RJ).astimezone(dt.timezone.utc)
