"""Informativo meteorológico do CEMADEN-RJ: vocabulário, geração do texto, regras de apoio ao plantão (relógio do radar, sugestão de NM, SMS, Livro de Ocorrências)
e normalização do histórico (2020–2026). Funções puras, testadas com os informativos reais nº 168 a 193/2026 (api/test_informativos.py).

Modelo de texto (grupo de operadores):
    CEMADEN-RJ
    INFORMATIVO METEOROLÓGICO n°193/2026
    📅 Data: 25/10/2026
    ⏰ Horário: 06:37

    CENÁRIO ATUAL
    🌧 Núcleos de chuva moderada atuam nas regiões Costa Verde, Serrana I e Serrana II.

    PREVISÃO PARA AS PRÓXIMAS 06 HORAS
    ⛈️ Pancadas isoladas de chuva moderada a ocasionalmente forte, com raios, nas regiões Norte e Noroeste.
    🌧 Chuva fraca isolada nas demais regiões.
Documentação: docs/informativo-meteorologico.md."""

from __future__ import annotations

import datetime as dt
import difflib
import re
import unicodedata
from typing import Iterable

# ---------------------------------------------------------------- vocabulário
# ordem canônica das regiões dentro das frases (a dos informativos reais)
ORDEM_TEXTO = ["COSTA VERDE", "SUL I", "SUL II", "CAPITAL", "BAIXADA FLUMINENSE", "SERRANA I", "SERRANA II", "METROPOLITANA", "BAIXADA LITORÂNEA", "NORTE", "NOROESTE"]
REGIOES = sorted(ORDEM_TEXTO)

# intensidade → (rótulo no texto, gravidade de 1 a 8)
INTENSIDADES: dict[str, tuple[str, int]] = {
    "fraca": ("fraca", 1),
    "fraca_moderada": ("fraca a moderada", 2),
    "moderada": ("moderada", 3),
    "moderada_ocasion_forte": ("moderada a ocasionalmente forte", 4),
    "moderada_forte": ("moderada a forte", 5),
    "moderada_ocasion_muito_forte": ("moderada a ocasionalmente muito forte", 6),
    "moderada_muito_forte": ("moderada a muito forte", 7),
    "pontual_muito_forte": ("pontualmente muito forte", 8),
}
RAJADAS = {"moderado": "moderado", "moderado_ocasion_forte": "moderado a ocasionalmente forte", "forte": "forte"}


def nome_bonito(regiao: str) -> str:
    return {"SUL I": "Sul I", "SUL II": "Sul II", "SERRANA I": "Serrana I", "SERRANA II": "Serrana II"}.get(regiao) or regiao.title().replace(" Da ", " da ")


def rotulo_intensidade(chave: str) -> str:
    return INTENSIDADES[chave][0] if chave in INTENSIDADES else chave


def gravidade(chave: str) -> int:
    return INTENSIDADES.get(chave, ("", 0))[1]


# ---------------------------------------------------------------- frases
def _ordenar(regioes: Iterable[str]) -> list[str]:
    return sorted(set(regioes), key=lambda r: ORDEM_TEXTO.index(r) if r in ORDEM_TEXTO else 99)


def lista_pt(nomes: list[str]) -> str:
    if len(nomes) <= 1:
        return "".join(nomes)
    return ", ".join(nomes[:-1]) + " e " + nomes[-1]


def onde(regioes: Iterable[str]) -> str:
    """"em todo o estado" (11), "em todas as regiões, exceto Norte e Noroeste" (8 a 10), "na região X" (1), "nas regiões A, B e C"."""
    rs = _ordenar(regioes)
    if len(rs) >= len(ORDEM_TEXTO):
        return "em todo o estado"
    if len(rs) >= 8:
        return "em todas as regiões, exceto " + lista_pt([nome_bonito(r) for r in ORDEM_TEXTO if r not in rs])
    if len(rs) == 1:
        return f"na região {nome_bonito(rs[0])}"
    return "nas regiões " + lista_pt([nome_bonito(r) for r in rs])


def objeto(regioes: Iterable[str]) -> str:
    """Complemento de "para …": "todo o estado", "todas as regiões, exceto X", "a região X", "as regiões A e B"."""
    rs = _ordenar(regioes)
    if len(rs) >= len(ORDEM_TEXTO):
        return "todo o estado"
    if len(rs) >= 8:
        return "todas as regiões, exceto " + lista_pt([nome_bonito(r) for r in ORDEM_TEXTO if r not in rs])
    if len(rs) == 1:
        return f"a região {nome_bonito(rs[0])}"
    return "as regiões " + lista_pt([nome_bonito(r) for r in rs])


def _grupos(itens: list[dict], chave) -> list[tuple[tuple, list[str]]]:
    por: dict[tuple, list[str]] = {}
    for it in itens:
        k = chave(it)
        if k is not None:
            por.setdefault(k, []).append(it["regiao"])
    return sorted(por.items(), key=lambda kv: (-gravidade(kv[0][0]), -len(kv[1])))


def _emoji(intensidade: str, raios: bool) -> str:
    return "⛈️" if raios or gravidade(intensidade) >= 4 else "🌧"


def gerar_cenario(itens: list[dict], aproximacao: dict | None = None) -> list[str]:
    """Linhas do CENÁRIO ATUAL: núcleos de chuva por intensidade (e raios) e os que se aproximam por outro estado."""
    grupos = _grupos(itens, lambda i: (i["chuva_atual"], bool(i.get("raios_atual"))) if i.get("chuva_atual") else None)
    todas = {r for _, rs in grupos for r in rs}
    linhas = []
    for n, ((inten, raios), regs) in enumerate(grupos):
        ultimo_demais = len(grupos) > 1 and n == len(grupos) - 1 and len(todas) >= len(ORDEM_TEXTO)
        unico = len(regs) == 1
        sujeito = ("Núcleo" if unico else "Núcleos") + f" de chuva {rotulo_intensidade(inten)}" + (", com raios," if raios else "")
        verbo = "atua" if unico else "atuam"
        local = "nas demais regiões" if ultimo_demais else onde(regs)
        linhas.append(f"{_emoji(inten, raios)} {sujeito} {verbo} {local}.")
    ap = aproximacao or {}
    if ap.get("regioes") and ap.get("intensidade"):
        rs = _ordenar(ap["regioes"])
        quem = "da região " + nome_bonito(rs[0]) if len(rs) == 1 else "das regiões " + lista_pt([nome_bonito(r) for r in rs])
        por = f", por {ap['por']}" if ap.get("por") else ""
        linhas.append(f"{_emoji(ap['intensidade'], False)} Núcleos de chuva {rotulo_intensidade(ap['intensidade'])} se aproximam {quem}{por}.")
    return linhas or ["🌧 Sem núcleos de chuva significativos no momento."]


def gerar_previsao(itens: list[dict]) -> list[str]:
    """Linhas da PREVISÃO PARA AS PRÓXIMAS 06 HORAS: pancadas/chuva por intensidade, com raios, rajadas e "de forma isolada"; granizo à parte."""
    chave = lambda i: (i["chuva_prevista"], bool(i.get("raios")), i.get("vento_previsto") or "", bool(i.get("isolada"))) if i.get("chuva_prevista") else None  # noqa: E731
    grupos = _grupos(itens, chave)
    todas = {r for _, rs in grupos for r in rs}
    linhas = []
    for n, ((inten, raios, vento, isolada), regs) in enumerate(grupos):
        ultimo_demais = len(grupos) > 1 and n == len(grupos) - 1 and len(todas) >= len(ORDEM_TEXTO)
        if gravidade(inten) <= 2:
            frase = f"Chuva {rotulo_intensidade(inten)}" + (" isolada" if isolada else "")
        else:
            frase = ("Pancadas isoladas" if isolada else "Pancadas") + f" de chuva {rotulo_intensidade(inten)}"
        extras = (["raios"] if raios else []) + ([f"rajadas de vento {RAJADAS[vento]}"] if vento in RAJADAS else [])
        if extras:
            frase += ", com " + " e ".join(extras) + ","
        local = "nas demais regiões" if ultimo_demais else onde(regs)
        linhas.append(f"{_emoji(inten, raios)} {frase} {local}.")
    granizo = [i["regiao"] for i in itens if i.get("granizo")]
    if granizo:
        linhas.append(f"❄️ Possibilidade de granizo pontual {onde(granizo)}.")
    return linhas or ["Sem previsão de chuva significativa para as próximas 6 horas."]


def montar_texto(numero: int, ano: int, emitido_em: dt.datetime, itens: list[dict], aproximacao: dict | None = None, rodape: str = "") -> str:
    """Texto completo no modelo do grupo (cabeçalho, cenário, previsão e rodapé). `emitido_em` já no fuso local."""
    partes = [
        "CEMADEN-RJ",
        f"INFORMATIVO METEOROLÓGICO n°{numero}/{ano}",
        f"📅 Data: {emitido_em:%d/%m/%Y}",
        f"⏰ Horário: {emitido_em:%H:%M}",
        "",
        "CENÁRIO ATUAL",
        *gerar_cenario(itens, aproximacao),
        "",
        "PREVISÃO PARA AS PRÓXIMAS 06 HORAS",
        *gerar_previsao(itens),
    ]
    if rodape.strip():
        partes += ["", *[linha.rstrip() for linha in rodape.strip().splitlines()]]
    return "\n".join(partes)


# ---------------------------------------------------------------- apoio ao plantão
def nm_sugerido(item: dict) -> tuple[int, bool]:
    """Sugestão de NM para os municípios da REDEC a partir da previsão do informativo (sempre só sugestão): fraca/fraca a moderada → 0; moderada → NM 1;
    até moderada a forte → NM 1, ou NM 2 com raios/rajadas; moderada a ocasionalmente muito forte ou mais, granizo ou rajada forte → NM 3 (só a pedido da
    meteorologia). Devolve (nível, "só a pedido da meteorologia")."""
    g = gravidade(item.get("chuva_prevista") or "")
    extras = bool(item.get("raios")) or bool(item.get("vento_previsto"))
    if g >= 6 or item.get("granizo") or item.get("vento_previsto") == "forte":
        return 3, True
    if g >= 4:
        return (2 if extras else 1), False
    if g == 3:
        return 1, False
    return 0, False


CADENCIA_PADRAO = {"intenso": 30, "moderada": 60, "noite": 120, "noite_fraca": 180}


def intervalo_radar_min(maior_gravidade: int, raios: bool, hora_local: int, cadencia: dict | None = None) -> tuple[int, str]:
    """Minutos até reenviar o radar (e a regra usada): noite (22 h a 6 h) 2 h, ou 3 h só com chuva fraca; de dia 30 min com núcleos intensos (moderada a forte ou mais)
    ou raios, 1 h com chuva moderada, 2 h nos demais casos. Valores configuráveis (ConfiguracaoInformativo.cadencia_radar_min) porque o protocolo traz números
    diferentes em três trechos."""
    c = {**CADENCIA_PADRAO, **(cadencia or {})}
    noite = hora_local >= 22 or hora_local < 6
    if noite:
        return (c["noite_fraca"], "noite_fraca") if maior_gravidade <= 2 and not raios else (c["noite"], "noite")
    if maior_gravidade >= 5 or raios:
        return c["intenso"], "intenso"
    if maior_gravidade >= 3:
        return c["moderada"], "moderada"
    return c["noite"], "fraca"


def maior_gravidade(itens: list[dict]) -> tuple[int, bool]:
    g = max([gravidade(i.get("chuva_atual") or "") for i in itens] + [gravidade(i.get("chuva_prevista") or "") for i in itens] + [0])
    raios = any(i.get("raios") or i.get("raios_atual") for i in itens)
    return g, raios


def texto_sms(itens: list[dict]) -> dict:
    """Modelo do SMS (IDAP, 146 caracteres) e da TV (62), só para previsão moderada a forte ou mais (severidade moderada ou acima). O painel NÃO envia."""
    afetadas = [i["regiao"] for i in itens if gravidade(i.get("chuva_prevista") or "") >= 4]
    if not afetadas:
        return {"aplicavel": False, "regioes": [], "sms": "", "tv": "", "sms_cabe": True, "tv_cabe": True}
    onde_txt = onde(afetadas).replace("em todas as regiões, exceto", "todas as regiões menos")
    sms = f"CEMADEN-RJ: chuva forte com raios prevista {onde_txt} nas proximas 6h. Procure local seguro. Emergencia: 199. Mais em defesacivil.rj.gov.br"
    sms_curto = sms if len(sms) <= 146 else f"CEMADEN-RJ: chuva forte prevista {onde_txt} nas proximas 6h. Procure local seguro. Emergencia 199."
    tv = "Chuva forte no RJ nas proximas 6h. Atencao. Ligue 199."
    return {
        "aplicavel": True,
        "regioes": _ordenar(afetadas),
        "sms": sms_curto,
        "tv": tv,
        "sms_cabe": len(sms_curto) <= 146,
        "tv_cabe": len(tv) <= 62,
        "aviso": "Só severidade moderada ou acima, com ok do diretor. O painel não envia o SMS: marque 'SMS enviado' por REDEC depois de enviar pelo IDAP.",
    }


def frase_livro_ocorrencias(numero: int, ano: int, enviado_em: dt.datetime, itens: list[dict]) -> str:
    """Frase do Livro de Ocorrências no padrão do protocolo."""
    regioes = [i["regiao"] for i in itens if i.get("chuva_atual") or i.get("chuva_prevista")]
    base = f"Informativo meteorológico n° {numero}/{ano} enviado às {enviado_em:%Hh%M} para {objeto(regioes) if regioes else 'o estado'}."
    com_sms = [i["regiao"] for i in itens if i.get("sms_enviado")]
    if com_sms:
        base += f" SMS enviado via IDAP para {objeto(com_sms)}."
    return base


def lacunas(numeros: Iterable[int], desde: int = 1) -> list[int]:
    """Números que faltam na sequência (de `desde` ao maior). Em 2024 a equipe continuou a contagem de 2023 (178 a 316): para o histórico use `desde=min(numeros)`."""
    ns = sorted(set(numeros))
    return [n for n in range(desde, ns[-1] + 1) if n not in set(ns)] if ns else []


# ---------------------------------------------------------------- normalização do histórico (planilha 2020-2026)
def _sem_acento(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


_ALIASES_REGIAO = {
    "SERRANA": ["SERRANA I", "SERRANA II"],
    "SUL": ["SUL I", "SUL II"],
    "NORTE / NOROESTE": ["NORTE", "NOROESTE"],
    "NORTE/NOROESTE": ["NORTE", "NOROESTE"],
    "SIL II": ["SUL II"],
    "SUL 1": ["SUL I"],
    "SUL 2": ["SUL II"],
    "SERRANA 1": ["SERRANA I"],
    "SERRANA 2": ["SERRANA II"],
}


def normalizar_regiao(texto: str) -> list[str]:
    """REDEC(s) canônica(s) a partir do texto livre da planilha: corrige grafias ("BAIXADA FLUMINESE", "SIL II") e abre os agrupamentos dos anos
    antigos (SERRANA, SUL, NORTE / NOROESTE). Vazio = não reconheceu (vai para a fila de revisão)."""
    t = re.sub(r"\s+", " ", _sem_acento(str(texto or "")).upper()).strip()
    if not t:
        return []
    if t in _ALIASES_REGIAO:
        return list(_ALIASES_REGIAO[t])
    candidatas = {_sem_acento(r): r for r in REGIOES}
    if t in candidatas:
        return [candidatas[t]]
    achou = difflib.get_close_matches(t, list(candidatas), n=1, cutoff=0.85)
    return [candidatas[achou[0]]] if achou else []


def normalizar_intensidade(texto: str) -> str:
    """Chave de intensidade a partir do texto livre ("Fraca / Moderada", "chuva fraca a moderada"). Vazio = não reconheceu."""
    t = _sem_acento(str(texto or "")).lower()
    t = re.sub(r"[^a-z ]", " ", t)
    t = re.sub(r"\b(chuva|de|e|com|pancadas?|nucleos?)\b", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return ""
    muito = "muito forte" in t
    ocasional = "ocasion" in t
    pontual = "pontual" in t
    if pontual and muito:
        return "pontual_muito_forte"
    if "moderad" in t and "forte" in t:
        if muito:
            return "moderada_ocasion_muito_forte" if ocasional else "moderada_muito_forte"
        return "moderada_ocasion_forte" if ocasional else "moderada_forte"
    if "fraca" in t and "moderad" in t:
        return "fraca_moderada"
    if "moderad" in t:
        return "moderada"
    if "fraca" in t:
        return "fraca"
    if "forte" in t:
        return "moderada_forte"
    return ""
