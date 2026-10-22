"""
Conector da ANA — API HidroWebService (Hidrotelemetria): estações pluviométricas e fluviométricas telemétricas do RJ.

Levantamento completo (OpenAPI `https://www.ana.gov.br/hidrowebservice/api-docs`, manual oficial v20.02.2026 e a resposta da ANA
ao pedido de acesso do CEMADEN-RJ) em docs/ana-hidrowebservice.md. Resumo do que o código respeita:

* Autenticação: `GET /EstacoesTelemetricas/OAUth/v1` com os cabeçalhos `Identificador` e `Senha`; devolve
  `items.tokenautenticacao` (JWT), usado como `Authorization: Bearer <token>`. A validade informada pela ANA é de **10 minutos**
  (o manual diz 60): renovamos com 8 min e nunca fazemos login "à toa" — autenticação em alta frequência é monitorada e pode
  bloquear o IP. O token fica num arquivo (`cache_ana/estado.json`) para as execuções do cron o reaproveitarem.
* Consulta: **uma estação por requisição** (pedido da ANA, para não sobrecarregar), no máximo 30 dias por consulta; não há rate
  limit formal, então: chamadas em série, pausa entre elas e novas tentativas com espera progressiva.
* Estações: `HidroInventarioEstacoes/v1?Unidade Federativa=RJ` (guardado 24 h em disco). Entram as que operam, são telemétricas e
  são pluviométricas ou fluviométricas.
* Leituras: `HidroinfoanaSerieTelemetricaAdotada/v1` → chuva (mm), cota (cm → m) e vazão (m³/s) "adotadas", cada uma com status de
  qualidade (0 ok, 1 suspeito, 2 ruim — as ruins não são gravadas).

Credenciais ficam só no `.env` do servidor (`ANA_HIDRO_IDENTIFICADOR`, `ANA_HIDRO_SENHA`), nunca no código nem em log.

ATENÇÃO — pontos que dependem de teste com a credencial (não havia acesso à API quando este arquivo foi escrito; o manual traz só a
resposta, não o nome exato dos parâmetros de consulta):
  1. nomes dos parâmetros (`PARAMETROS_SERIE`: o exemplo em Java do manual usa CodigoDaEstacao/TipoFiltroData/RangeIntervaloDeBusca;
     o OpenAPI mostra os rótulos com espaço e acento);
  2. fuso horário de `Data_Hora_Medicao` (assumido horário de Brasília, `ANA_HIDRO_FUSO`);
  3. se `Chuva_Adotada` é a chuva do intervalo (balde) — tratada assim, como no INMET e no INEA.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import time
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from core.models import Reading, Station

from .base import BaseConnector

logger = logging.getLogger("ingestion")

BASE_URL = "https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas"
TOKEN_VALIDADE_S = 8 * 60  # a ANA informa 10 min; renovamos antes
PAUSA_ENTRE_CHAMADAS_S = 0.5
TENTATIVAS = 3
INVENTARIO_VALIDADE_S = 24 * 3600

# Nomes dos parâmetros de consulta da série adotada (ver "ATENÇÃO" acima — a confirmar com a credencial).
PARAMETROS_SERIE = {"estacao": "CodigoDaEstacao", "filtro": "TipoFiltroData", "data": "DataDeBusca", "intervalo": "RangeIntervaloDeBusca"}
PARAMETRO_UF = "Unidade Federativa"


class AnaErro(RuntimeError):
    pass


def _dir_cache() -> Path:
    from django.conf import settings

    d = Path(getattr(settings, "BASE_DIR", ".")) / "cache_ana"
    d.mkdir(exist_ok=True)
    return d


def _ler_json(nome: str) -> dict:
    p = _dir_cache() / nome
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _gravar_json(nome: str, dados: dict) -> None:
    (_dir_cache() / nome).write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


class ClienteAna:
    """Autenticação com token em cache, chamadas em série e novas tentativas. Não guarda nem loga credenciais."""

    def __init__(self, identificador: str, senha: str, sessao: requests.Session | None = None):
        if not identificador or not senha:
            raise AnaErro("Credenciais da ANA não configuradas (ANA_HIDRO_IDENTIFICADOR / ANA_HIDRO_SENHA).")
        self._id, self._senha = identificador, senha
        self.http = sessao or requests.Session()
        self._ultimo_uso = 0.0

    # -- token
    def token(self, forcar: bool = False) -> str:
        estado = _ler_json("estado.json")
        if not forcar and estado.get("token") and time.time() - float(estado.get("token_em", 0)) < TOKEN_VALIDADE_S:
            return estado["token"]
        r = self.http.get(f"{BASE_URL}/OAUth/v1", headers={"Identificador": self._id, "Senha": self._senha}, timeout=30)
        if r.status_code != 200:
            raise AnaErro(f"Autenticação recusada pela ANA (HTTP {r.status_code}).")
        itens = (r.json() or {}).get("items") or {}
        token = itens.get("tokenautenticacao") or itens.get("token")
        if not token:
            raise AnaErro(f"Resposta de autenticação sem token ({str(itens.get('retorno') or itens.get('respostaautenticacao') or '')[:120]}).")
        estado.update({"token": token, "token_em": time.time()})
        _gravar_json("estado.json", estado)
        return token

    # -- chamadas
    def get(self, rota: str, params: dict) -> list[dict]:
        """GET autenticado → lista `items`. Uma nova autenticação se o token for recusado; espera progressiva em falhas."""
        ultimo: Exception | None = None
        renovou = False
        for tentativa in range(TENTATIVAS):
            espera = PAUSA_ENTRE_CHAMADAS_S - (time.time() - self._ultimo_uso)
            if espera > 0:
                time.sleep(espera)
            try:
                r = self.http.get(f"{BASE_URL}{rota}", params=params, headers={"Authorization": f"Bearer {self.token()}"}, timeout=60)
                self._ultimo_uso = time.time()
                if r.status_code == 401 and not renovou:
                    renovou = True
                    self.token(forcar=True)
                    continue
                if r.status_code >= 500 or r.status_code == 429:
                    raise AnaErro(f"HTTP {r.status_code}")
                if r.status_code != 200:
                    raise AnaErro(f"HTTP {r.status_code} em {rota}")
                corpo = r.json() or {}
                itens = corpo.get("items")
                if isinstance(itens, list):
                    return itens
                if corpo.get("code") not in (None, 200):
                    raise AnaErro(f"{corpo.get('status')} {corpo.get('code')}: {str(corpo.get('message'))[:120]}")
                return []
            except (requests.RequestException, AnaErro, ValueError) as exc:
                ultimo = exc
                time.sleep(2 ** tentativa)  # 1 s, 2 s, 4 s
        raise AnaErro(f"Falha em {rota}: {ultimo}")

    # -- rotas
    def inventario(self, uf: str) -> list[dict]:
        return self.get("/HidroInventarioEstacoes/v1", {PARAMETRO_UF: uf})

    def serie_adotada(self, codigo: str, data: dt.date, intervalo: str = "HORA_6") -> list[dict]:
        p = PARAMETROS_SERIE
        return self.get("/HidroinfoanaSerieTelemetricaAdotada/v1", {p["estacao"]: codigo, p["filtro"]: "DATA_LEITURA", p["data"]: data.isoformat(), p["intervalo"]: intervalo})


def estacao_de_inventario(item: dict) -> dict | None:
    """Item do inventário → estação normalizada (ver `BaseConnector`); None se não serve (sem coordenada, não opera etc.)."""
    from core.municipios import canonico_ou_original, municipio_por_coordenada

    lat, lon = _num(item.get("Latitude")), _num(item.get("Longitude"))
    codigo = str(item.get("codigoestacao") or "").strip()
    if not codigo or lat is None or lon is None:
        return None
    if str(item.get("Operando", "1")) != "1":
        return None
    # só telemétricas: com início de período telemétrico e sem fim
    if "Data_Periodo_Telemetrica_Inicio" in item and not item.get("Data_Periodo_Telemetrica_Inicio"):
        return None
    if item.get("Data_Periodo_Telemetrica_Fim"):
        return None
    tipo = str(item.get("Tipo_Estacao") or "").lower()
    if tipo.startswith("fluvi"):
        tipo_estacao = Station.StationType.HIDROLOGICA
    elif tipo.startswith("pluvi"):
        tipo_estacao = Station.StationType.PLUVIOMETRICA
    else:
        return None
    municipio = municipio_por_coordenada(lat, lon) or canonico_ou_original(str(item.get("Municipio_Nome") or "").title())
    return {
        "external_id": codigo,
        "name": str(item.get("Estacao_Nome") or codigo).title(),
        "municipality": municipio,
        "station_type": tipo_estacao,
        "status": Station.Status.ATIVA,
        "latitude": lat,
        "longitude": lon,
        "altitude_m": _num(item.get("Altitude")),
        "raw_metadata": {
            "ana_codigo": codigo,
            "tipo_ana": item.get("Tipo_Estacao"),
            "bacia": item.get("Bacia_Nome"),
            "operadora": item.get("Operadora_Sigla"),
            "responsavel": item.get("Responsavel_Sigla"),
            "municipio_hidro": item.get("Municipio_Nome"),
            "uf": item.get("UF_Estacao"),
        },
    }


def leituras_da_serie(codigo: str, itens: list[dict], fuso: ZoneInfo) -> list[dict]:
    """Itens da série adotada → leituras normalizadas. Cota em cm vira m; status 2 ("ruim") é descartado."""
    out: list[dict] = []
    for it in itens:
        quando = str(it.get("Data_Hora_Medicao") or "")[:19]
        try:
            instante = dt.datetime.strptime(quando, "%Y-%m-%d %H:%M:%S").replace(tzinfo=fuso).astimezone(dt.timezone.utc)
        except ValueError:
            continue
        campos = (
            (Reading.ReadingType.CHUVA_MM, "Chuva_Adotada", 1.0),
            (Reading.ReadingType.NIVEL_M, "Cota_Adotada", 0.01),
            (Reading.ReadingType.VAZAO_M3S, "Vazao_Adotada", 1.0),
        )
        for tipo, campo, fator in campos:
            valor = _num(it.get(campo))
            if valor is None or str(it.get(f"{campo}_Status", "0")) == "2":
                continue
            out.append(
                {
                    "external_id": codigo,
                    "reading_type": tipo,
                    "value": round(valor * fator, 4),
                    "timestamp": instante,
                    "raw_payload": {"status_qc": it.get(f"{campo}_Status"), "bruto": it.get(campo), "atualizado": it.get("Data_Atualizacao")},
                }
            )
    return out


class AnaHidroWebConnector(BaseConnector):
    slug = "ana"
    name = "ANA — Hidrotelemetria (HidroWebService)"
    website = "https://www.ana.gov.br/hidrowebservice/swagger-ui/index.html"
    description = "Estações pluviométricas e fluviométricas telemétricas da ANA no RJ (chuva, cota e vazão)."

    def __init__(self, cliente: ClienteAna | None = None):
        self._cliente = cliente
        self.uf = os.environ.get("ANA_HIDRO_UF", "RJ")
        self.max_por_execucao = int(os.environ.get("ANA_HIDRO_MAX_POR_EXECUCAO", "25"))
        self.fuso = ZoneInfo(os.environ.get("ANA_HIDRO_FUSO", "America/Sao_Paulo"))
        self.excluir = {c.strip() for c in os.environ.get("ANA_HIDRO_EXCLUIR", "").split(",") if c.strip()}
        self.extras = [c.strip() for c in os.environ.get("ANA_HIDRO_INCLUIR", "").split(",") if c.strip()]

    @property
    def cliente(self) -> ClienteAna:
        if self._cliente is None:
            from django.conf import settings

            self._cliente = ClienteAna(getattr(settings, "ANA_HIDRO_IDENTIFICADOR", ""), getattr(settings, "ANA_HIDRO_SENHA", ""))
        return self._cliente

    def _inventario(self) -> list[dict]:
        cache = _ler_json("inventario.json")
        if cache.get("uf") == self.uf and time.time() - float(cache.get("em", 0)) < INVENTARIO_VALIDADE_S:
            return cache["itens"]
        itens = self.cliente.inventario(self.uf)
        for codigo in self.extras:  # estações de outros estados/UF a incluir à mão
            if not any(str(i.get("codigoestacao")) == codigo for i in itens):
                itens += self.cliente.get("/HidroInventarioEstacoes/v1", {"Código da Estação": codigo})
        _gravar_json("inventario.json", {"uf": self.uf, "em": time.time(), "itens": itens})
        return itens

    def fetch_stations(self) -> list[dict]:
        estacoes = [e for e in (estacao_de_inventario(i) for i in self._inventario()) if e and e["external_id"] not in self.excluir]
        return sorted(estacoes, key=lambda e: e["external_id"])

    def fetch_readings(self, stations: list[dict]) -> list[dict]:
        """Lê no máximo `max_por_execucao` estações por rodada, em rodízio (cursor em disco): com ~100 estações o ciclo completo
        leva poucas execuções do cron e cada uma cabe no tempo do servidor compartilhado."""
        if not stations:
            return []
        estado = _ler_json("estado.json")
        inicio = int(estado.get("cursor", 0)) % len(stations)
        lote = [stations[(inicio + k) % len(stations)] for k in range(min(self.max_por_execucao, len(stations)))]
        hoje = dt.datetime.now(self.fuso).date()
        leituras: list[dict] = []
        for est in lote:
            try:
                leituras += leituras_da_serie(est["external_id"], self.cliente.serie_adotada(est["external_id"], hoje), self.fuso)
            except AnaErro as exc:
                logger.warning("ANA %s: %s", est["external_id"], exc)
        estado = _ler_json("estado.json")
        estado["cursor"] = (inicio + len(lote)) % len(stations)
        _gravar_json("estado.json", estado)
        return leituras
