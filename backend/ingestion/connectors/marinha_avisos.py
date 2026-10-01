"""
Avisos de mau tempo do Serviço Meteorológico Marinho (SMM), operado pelo
Centro de Hidrografia da Marinha (CHM) — METAREA V (Atlântico Sul, área de
responsabilidade do Brasil). Ver docs/fontes-de-dados.md (seção "Avisos de
mau tempo") para o levantamento completo.

Achado em 01/10/2026: a página é protegida por um desafio anti-robô do
Cloudflare que bloqueia `curl` (HTTP 403 "Just a moment..."), mas **não**
bloqueia a biblioteca Python `requests` pura — nenhum header especial,
nenhum Selenium, nenhuma automação de navegador foi necessária. Testado de
forma reproduzível (isolado, com espera entre chamadas). Outras páginas do
mesmo site (tábua de maré, BNDO, cartas sinóticas) continuam bloqueadas
mesmo com `requests` — é proteção configurada por página, não pelo domínio
inteiro, então essa mesma técnica NÃO deve ser assumida como válida para
outras rotas do `marinha.mil.br` sem testar de novo.

Só ingerimos as ÁREAS CHARLIE e DELTA da METAREA V — juntas cobrem o
litoral do RJ (DELTA confirmado por teste real: "ÁREA COSTEIRA ENTRE
ARRAIAL DO CABO/RJ E VITÓRIA/ES"; CHARLIE confirmado pelo diretor do
CEMADEN-RJ, usuário deste projeto). Outras áreas (ALFA, BRAVO, SUL
OCEÂNICA, etc.) aparecem na mesma página mas não são relevantes aqui e são
ignoradas.

Formato da página: um `<div id="block-govbr-govbr-theme-system-main">` com
uma sequência de `<p>`: um parágrafo só com o nome da área (ex: "ÁREA
DELTA"), seguido de um `<p>` por aviso dentro dela — primeiro em
português, depois a mesma sequência se repete em inglês (ignorada aqui,
preferimos sempre o texto em português). Exemplo real de um `<p>` de
aviso:

    AVISO NR 716/2026AVISO DE VENTO FORTEEMITIDO ÀS 1200Z - SEG -
    28/SET/2026ÁREA COSTEIRA ENTRE ARRAIAL DO CABO/RJ E VITÓRIA/ES ATÉ 300
    MN DA COSTA A PARTIR DE 291800Z. VENTO NE FORÇA 7 COM
    RAJADAS.VÁLIDO ATÉ 010000Z.

Não é HTML estruturado (não tem tag por campo) — os campos são extraídos
desse texto corrido por regex. O número do aviso (`numero_externo`) é
sequencial em toda a METAREA V, não reinicia por área, então serve como
chave única de upsert mesmo que um aviso apareça listado em mais de uma
área (raro, mas o `update_or_create` por número cobre isso sem duplicar).

"VÁLIDO ATÉ DDHHMMZ" só traz dia+hora, sem mês/ano explícitos — inferimos
o mês a partir da data de emissão: se o dia de validade é >= dia de
emissão, mesmo mês; senão, mês seguinte (com rollover de ano em
dezembro→janeiro). Avisos desse tipo são sempre de curta duração (poucos
dias), então essa heurística é segura dentro do intervalo observado.
"""

from __future__ import annotations

import datetime as dt
import logging
import re
from dataclasses import dataclass, field

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger("ingestion")

URL = "https://www.marinha.mil.br/chm/dados-do-smm-avisos-de-mau-tempo/avisos-de-mau-tempo"
TZ_UTC = dt.timezone.utc

# Só essas duas áreas cobrem o litoral do RJ — ver docstring do módulo.
AREAS_RELEVANTES = {"CHARLIE", "DELTA"}

_MESES = {
    "JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6,
    "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12,
}

# Casa um `<p>` de aviso em português, ex:
#   "AVISO NR 716/2026AVISO DE VENTO FORTEEMITIDO ÀS 1200Z - SEG -
#    28/SET/2026ÁREA COSTEIRA ENTRE ... VÁLIDO ATÉ 010000Z."
_AVISO_RE = re.compile(
    r"AVISO\s+NR\s+(?P<numero>\d+/\d+)\s*"
    r"AVISO\s+DE\s+(?P<tipo>.+?)\s*"
    r"EMITIDO\s+ÀS\s+(?P<emit_hora>\d{2})(?P<emit_min>\d{2})Z\s*-\s*\w+\s*-\s*"
    r"(?P<emit_dia>\d{2})/(?P<emit_mes>\w{3})/(?P<emit_ano>\d{4})\s*"
    r"(?P<descricao>.+?)\s*"
    r"VÁLIDO\s+ATÉ\s+(?P<val_dia>\d{2})(?P<val_hora>\d{2})(?P<val_min>\d{2})Z\.?\s*$",
    re.IGNORECASE | re.DOTALL,
)


def _parse_emitido_em(match: re.Match) -> dt.datetime | None:
    mes = _MESES.get(match.group("emit_mes").upper())
    if mes is None:
        return None
    try:
        return dt.datetime(
            int(match.group("emit_ano")), mes, int(match.group("emit_dia")),
            int(match.group("emit_hora")), int(match.group("emit_min")),
            tzinfo=TZ_UTC,
        )
    except ValueError:
        return None


def _parse_valido_ate(match: re.Match, emitido_em: dt.datetime | None) -> dt.datetime | None:
    if emitido_em is None:
        return None
    dia = int(match.group("val_dia"))
    hora = int(match.group("val_hora"))
    minuto = int(match.group("val_min"))
    ano, mes = emitido_em.year, emitido_em.month
    if dia < emitido_em.day:
        mes += 1
        if mes > 12:
            mes = 1
            ano += 1
    try:
        return dt.datetime(ano, mes, dia, hora, minuto, tzinfo=TZ_UTC)
    except ValueError:
        return None


def _parse_avisos_pt(texto_paragrafos: list[str]) -> list[dict]:
    """Recebe a lista de textos de `<p>` (área + avisos, só a parte em
    português — ver `fetch_avisos`) e devolve uma lista de dicts, um por
    aviso, já filtrada pelas áreas relevantes."""
    avisos: list[dict] = []
    area_atual: str | None = None

    for texto in texto_paragrafos:
        texto_limpo = texto.strip()
        if not texto_limpo:
            continue

        m_area = re.fullmatch(r"ÁREA\s+(\w+(?:\s+\w+)?)", texto_limpo, re.IGNORECASE)
        if m_area:
            area_atual = m_area.group(1).upper().strip()
            continue

        if area_atual not in AREAS_RELEVANTES:
            continue

        match = _AVISO_RE.search(texto_limpo)
        if match is None:
            logger.warning("Aviso de mau tempo não casou com o regex esperado (área %s): %r", area_atual, texto_limpo[:200])
            continue

        emitido_em = _parse_emitido_em(match)
        avisos.append({
            "numero_externo": match.group("numero"),
            "area": area_atual,
            "tipo": match.group("tipo").strip(" -"),
            "descricao": match.group("descricao").strip(" -"),
            "emitido_em": emitido_em,
            "valido_ate": _parse_valido_ate(match, emitido_em),
            "raw_payload": {"texto_pt": texto_limpo},
        })

    return avisos


def fetch_avisos() -> list[dict]:
    resp = requests.get(URL, timeout=30)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    bloco = soup.find("div", id="block-govbr-govbr-theme-system-main")
    if bloco is None:
        raise ValueError("Bloco de conteúdo principal não encontrado na página de avisos de mau tempo.")

    paragrafos = [p.get_text(" ", strip=True) for p in bloco.find_all("p")]

    # A página repete a mesma sequência de áreas/avisos primeiro em
    # português, depois em inglês ("ALPHA AREA", "WARNING NR ..."). Paramos
    # de considerar parágrafos assim que a seção em inglês começa, pra não
    # tentar casar o regex de avisos (que é específico de português) contra
    # o bloco em inglês.
    fim_pt = len(paragrafos)
    for i, p in enumerate(paragrafos):
        if re.fullmatch(r"\w+\s+AREA", p.strip(), re.IGNORECASE):
            fim_pt = i
            break

    return _parse_avisos_pt(paragrafos[:fim_pt])


@dataclass
class AvisosSyncResult:
    upserted: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return f"avisos de mau tempo atualizados: {self.upserted} | erros: {len(self.errors)}"


def sync() -> AvisosSyncResult:
    from core.models import AvisoMauTempo

    result = AvisosSyncResult()
    try:
        avisos = fetch_avisos()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha ao buscar avisos de mau tempo da Marinha")
        result.errors.append(str(exc))
        return result

    for dados in avisos:
        AvisoMauTempo.objects.update_or_create(
            numero_externo=dados["numero_externo"],
            defaults={k: v for k, v in dados.items() if k != "numero_externo"},
        )
        result.upserted += 1

    return result
