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
  1. (CONFIRMADO em 22/10/2026) os parâmetros são os rótulos do OpenAPI, com acento e espaço; o exemplo em Java do manual dá HTTP 400;
  2. (CONFIRMADO) `Data_Hora_Medicao` está em horário de Brasília (última medição 11:15 atualizada às 11:22, com a hora local 11:49);
  3. (A VERIFICAR com chuva real) se `Chuva_Adotada` é a chuva do intervalo (balde) — tratada assim, como no INMET e no INEA.
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
TOKEN_VALIDADE_S = 8 * 60  # padrão conservador (a ANA respondeu 10 min) quando a resposta não traz a validade
PAUSA_ENTRE_CHAMADAS_S = 0.5
TENTATIVAS = 3
INVENTARIO_VALIDADE_S = 24 * 3600

# Nomes dos parâmetros de consulta, CONFIRMADOS em 22/10/2026 com a credencial: são os rótulos do OpenAPI (com acento e espaço);
# os nomes do exemplo em Java do manual (CodigoDaEstacao etc.) devolvem HTTP 400.
PARAMETROS_SERIE = {"estacao": "Código da Estação", "filtro": "Tipo Filtro Data", "data": "Data de Busca (yyyy-MM-dd)", "intervalo": "Range Intervalo de busca"}
PARAMETRO_UF = "Unidade Federativa"
# Quem opera a estação: estas redes já entram no painel pelas suas próprias fontes (CEMADEN, INEA e a empresa que o mantém, INMET);
# a ANA só as republica. Ficam de fora por padrão (ANA_HIDRO_EXCLUIR_OPERADORAS troca a lista; vazio = entram todas).
OPERADORAS_JA_NO_PAINEL = "CEMADEN,INEA-RJ,INFOPER,INMET"


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


def _epoch_validade(texto: str) -> float | None:
    """'Thu Oct 22 12:48:12 GMT-03:00 2026' -> epoch (None se não reconhecer)."""
    import re

    m = re.match(r"\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) GMT([+-])(\d{2}):?(\d{2}) (\d{4})", texto)
    if not m:
        return None
    meses = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}
    mes, dia, hh, mm_, ss, sinal, oh, om, ano = m.groups()
    if mes not in meses:
        return None
    desloc = dt.timedelta(hours=int(oh), minutes=int(om)) * (1 if sinal == "+" else -1)
    return dt.datetime(int(ano), meses[mes], int(dia), int(hh), int(mm_), int(ss), tzinfo=dt.timezone(desloc)).timestamp()


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
        if not forcar and estado.get("token") and time.time() < float(estado.get("token_ate", 0)):
            return estado["token"]
        r = self.http.get(f"{BASE_URL}/OAUth/v1", headers={"Identificador": self._id, "Senha": self._senha}, timeout=30)
        if r.status_code != 200:
            raise AnaErro(f"Autenticação recusada pela ANA (HTTP {r.status_code}).")
        itens = (r.json() or {}).get("items") or {}
        token = itens.get("tokenautenticacao") or itens.get("token")
        if not token:
            raise AnaErro(f"Resposta de autenticação sem token ({str(itens.get('retorno') or itens.get('respostaautenticacao') or '')[:120]}).")
        # a ANA informa a validade ("Thu Oct 22 12:48:12 GMT-03:00 2026" — medido: 60 min; a resposta por e-mail disse 10 min): usamos o
        # menor entre a validade informada menos 2 min e 25 min, e nunca menos de 5 min
        ate = time.time() + TOKEN_VALIDADE_S
        validade = _epoch_validade(str(itens.get("validade") or ""))
        if validade:
            ate = min(max(validade - 120, time.time() + 300), time.time() + 25 * 60)
        estado.update({"token": token, "token_ate": ate})
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
    # só telemétricas: a flag Tipo_Estacao_Telemetrica = 1 (no RJ, 704 das 1.967 do inventário) e sem fim do período telemétrico
    if "Tipo_Estacao_Telemetrica" in item and str(item.get("Tipo_Estacao_Telemetrica")) != "1":
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


def consolidar_pares(estacoes: list[dict]) -> list[dict]:
    """A mesma estação física aparece duas vezes no inventário — código pluviométrico (7 dígitos) e fluviométrico (8 dígitos), mesmo
    nome e coordenadas — e a série devolve os dois juntos (chuva + cota + vazão) por qualquer dos códigos. Fica UMA: a fluviométrica
    (tipo hidrológica), com o código pluviométrico anotado nos metadados."""
    def chave(e):
        return (e["name"].strip().lower(), e["raw_metadata"].get("operadora"), round(e["latitude"], 1), round(e["longitude"], 1))

    grupos: dict = {}
    for e in estacoes:
        grupos.setdefault(chave(e), []).append(e)
    out = []
    for g in grupos.values():
        flu = [e for e in g if e["station_type"] == Station.StationType.HIDROLOGICA]
        base = (flu or g)[0]
        base["raw_metadata"]["codigos_ana"] = sorted(e["external_id"] for e in g)
        out.append(base)
    return out


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
        self.max_por_execucao = int(os.environ.get("ANA_HIDRO_MAX_POR_EXECUCAO", "40"))
        self.orcamento_s = float(os.environ.get("ANA_HIDRO_ORCAMENTO_S", "80"))  # tempo máximo lendo estações por rodada
        self.fuso = ZoneInfo(os.environ.get("ANA_HIDRO_FUSO", "America/Sao_Paulo"))
        self.excluir = {c.strip() for c in os.environ.get("ANA_HIDRO_EXCLUIR", "").split(",") if c.strip()}
        operadoras = os.environ.get("ANA_HIDRO_EXCLUIR_OPERADORAS", OPERADORAS_JA_NO_PAINEL)
        self.excluir_operadoras = {o.strip().upper() for o in operadoras.split(",") if o.strip()}
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
        estacoes = [e for e in (estacao_de_inventario(i) for i in self._inventario()) if e]
        estacoes = [e for e in estacoes if str(e["raw_metadata"].get("operadora") or "").upper() not in self.excluir_operadoras]
        estacoes = [e for e in consolidar_pares(estacoes) if e["external_id"] not in self.excluir]
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
        limite = time.time() + self.orcamento_s
        feitas = 0
        for est in lote:
            if feitas and time.time() > limite:
                break  # sem estourar o tempo do CGI: o que faltou fica para a próxima rodada (cursor)
            feitas += 1
            try:
                leituras += leituras_da_serie(est["external_id"], self.cliente.serie_adotada(est["external_id"], hoje), self.fuso)
            except AnaErro as exc:
                logger.warning("ANA %s: %s", est["external_id"], exc)
        estado = _ler_json("estado.json")
        estado["cursor"] = (inicio + feitas) % len(stations)
        _gravar_json("estado.json", estado)
        return leituras
