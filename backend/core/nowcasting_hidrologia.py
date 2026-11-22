"""Nowcasting da hidrologia (22/11/2026): informe operacional por município a partir do Monitoramento dos rios (`core/rios_monitoramento.py`).

Modelo de referência (usado pela equipe, REDEC 10):
    REDEC 10 – INFORME OPERACIONAL
    Município: Carapebus
    Data: 03/10/2026
    Evento: Alerta para inundação
    Lagoa de Carapebus (Régua 10), entrou em cota de Alerta!
    COMDEC e REDEC 10 seguem monitorando!

Regras desta 1ª versão:
- Entra no informe a estação cuja leitura atual (com no máx. 3 h) está em cota de ALERTA ou acima (alerta, transbordo, extrema). Atenção só entra se `incluir_atencao`.
- "entrou em" quando, nas leituras de 1 h a 3 h atrás, o nível estava numa cota MENOR; senão "permanece em".
- Um informe por município; várias estações do mesmo município viram várias linhas e o evento é o de maior gravidade.
- Texto só sugerido: o plantão edita e copia (nada é enviado sozinho)."""

from __future__ import annotations

import datetime as dt

from django.utils import timezone

from core import rios_monitoramento as rm

RANK = {"sem_cota": -1, "normal": 0, "atencao": 1, "alerta": 2, "transbordo": 3, "extrema": 4}
EVENTO = {
    "atencao": "Atenção para elevação do nível",
    "alerta": "Alerta para inundação",
    "transbordo": "Transbordamento (cota de transbordo atingida)",
    "extrema": "Cota extrema atingida",
}
# classe → (quando entra, quando já estava)
VERBO = {
    "atencao": ("entrou em cota de Atenção!", "permanece em cota de Atenção."),
    "alerta": ("entrou em cota de Alerta!", "permanece em cota de Alerta."),
    "transbordo": ("ultrapassou a cota de Transbordo!", "permanece acima da cota de Transbordo."),
    "extrema": ("atingiu a cota Extrema!", "permanece em cota Extrema."),
}
TENDENCIA_TXT = {"subindo": "subindo", "descendo": "descendo", "estavel": "estável"}
IDADE_MAX_H = 3  # leitura atual mais velha que isso não gera informe


def _fm(v: float | None) -> str:
    return "—" if v is None else f"{v:.2f}".replace(".", ",")


def _nome_com_rio(e: dict) -> str:
    rio = e["rio"]
    if rio and rio != rm.SEM_RIO and rio.lower() not in e["name"].lower():
        return f"{e['name']} ({rio})"
    return e["name"]


def _entrou(e: dict, classe_atual: str) -> bool:
    anteriores = [RANK.get(s["c"], -1) for s in e["serie"][:3] if s["v"] is not None and s["c"]]
    return bool(anteriores) and max(anteriores) < RANK[classe_atual]


def _linha_estacao(e: dict, classe: str) -> str:
    entrou, ja_estava = VERBO[classe]
    verbo = entrou if _entrou(e, classe) else ja_estava
    linha = f"{_nome_com_rio(e)}, {verbo}"
    detalhe = [f"nível {_fm(e['atual_m'])} m"]
    if e["transbordo_m"] is not None:
        detalhe.append(f"transbordo {_fm(e['transbordo_m'])} m")
    if e["tendencia"]:
        t = TENDENCIA_TXT[e["tendencia"]]
        if e["tendencia"] != "estavel" and e["variacao_cm"] is not None:
            t += f" ({e['variacao_cm']:+d} cm em {e['tendencia_h']} h)"
        detalhe.append(t)
    return f"{linha}\n   {' · '.join(detalhe)}"


def montar_texto(redec: int | None, municipio: str, quando: dt.datetime, evento: str, linhas: list[str]) -> str:
    rotulo = f"REDEC {redec}" if redec else "REDEC"
    return "\n".join(
        [
            f"{rotulo} – INFORME OPERACIONAL",
            f"Município: {municipio}",
            f"Data: {quando:%d/%m/%Y} – {quando:%H:%M}",
            f"Evento: {evento}",
            *linhas,
            f"COMDEC e {rotulo} seguem monitorando!",
        ]
    )


def gerar(dados: dict | None = None, agora: dt.datetime | None = None, incluir_atencao: bool = False) -> dict:
    """Devolve {gerado_em, informes:[{redec, regiao, municipio, classe, evento, estacoes:[{id,name,rio,classe,entrou}], texto}]}, do mais grave para o menos."""
    agora = agora or timezone.now()
    dados = dados or rm.montar(12, agora)
    minimo = RANK["atencao" if incluir_atencao else "alerta"]
    por_mun: dict[tuple, list[tuple[dict, str]]] = {}
    for e in dados["estacoes"]:
        classe = e["atual_classe"]
        if classe not in RANK or RANK[classe] < minimo or not e["atual_em"]:
            continue
        if agora - dt.datetime.fromisoformat(e["atual_em"]) > dt.timedelta(hours=IDADE_MAX_H):
            continue
        por_mun.setdefault((e["redec"], e["regiao"], e["municipality"]), []).append((e, classe))
    local = timezone.localtime(agora)
    informes = []
    for (redec, regiao, mun), itens in por_mun.items():
        itens.sort(key=lambda p: (-RANK[p[1]], p[0]["name"]))
        pior = itens[0][1]
        linhas = [_linha_estacao(e, c) for e, c in itens]
        informes.append(
            {
                "redec": redec,
                "regiao": regiao,
                "municipio": mun,
                "classe": pior,
                "evento": EVENTO[pior],
                "estacoes": [{"id": e["id"], "name": e["name"], "rio": e["rio"], "classe": c, "entrou": _entrou(e, c)} for e, c in itens],
                "texto": montar_texto(redec, mun, local, EVENTO[pior], linhas),
            }
        )
    informes.sort(key=lambda i: (-RANK[i["classe"]], i["redec"] or 99, i["municipio"]))
    return {"gerado_em": agora.isoformat(), "informes": informes}
