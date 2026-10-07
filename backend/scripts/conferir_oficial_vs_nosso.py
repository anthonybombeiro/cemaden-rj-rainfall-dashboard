"""Conferência "oficial da fonte × nosso cálculo" de Alerta Rio e Niterói (06/10/2026).

Lê o feed OFICIAL de cada fonte, pede ao servidor os NOSSOS acumulados (ação somente leitura
`snapshot_precip` de /api/admin/run/) e imprime, por estação, o erro de 1 h / 24 h / 96 h
(nosso − oficial) e o resumo (média, máximo). Serve para confirmar, depois da troca de `m15`
por `m05` com cron de 5 min, que o excesso (Niterói +3-10% em 96 h) desapareceu.

Uso (na máquina do projeto, com `backend/.env` preenchido):
    python backend/scripts/conferir_oficial_vs_nosso.py [niteroi] [alerta_rio]

O segredo da rota administrativa NÃO fica no repositório: é lido do crontab pela API do
cPanel, cujo token vem da variável de ambiente CPANEL_API_TOKEN (nome da conta: CPANEL_USER,
padrão `prese257`). Nada de credencial é impresso.
"""

from __future__ import annotations

import json
import os
import re
import statistics
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parents[1]
SITE = "https://cemadenrj.preserve.rio.br"
UA_CURL = {"User-Agent": "curl/8.4.0", "Accept": "*/*"}  # o servidor responde 406 ao User-Agent padrão do Python


def _env() -> dict:
    out = {}
    for linha in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            out[k.strip()] = v.strip().strip('"')
    return out


def _segredo_admin() -> str:
    token = os.environ["CPANEL_API_TOKEN"]
    usuario = os.environ.get("CPANEL_USER", "prese257")
    url = (
        "https://preserve.rio.br:2083/json-api/cpanel?cpanel_jsonapi_apiversion=2"
        "&cpanel_jsonapi_module=Cron&cpanel_jsonapi_func=fetchcron"
    )
    req = urllib.request.Request(url, headers={**UA_CURL, "Authorization": f"cpanel {usuario}:{token}"})
    jobs = json.load(urllib.request.urlopen(req, timeout=30))["cpanelresult"]["data"]
    comando = next(j["command"] for j in jobs if j.get("command") and "ingest" in j["command"])
    return re.search(r'X-Admin-Secret: ([^"\s]+)', comando).group(1)


def _nossos(slug: str, segredo: str) -> dict[str, dict]:
    corpo = json.dumps({"action": "snapshot_precip", "source": slug}).encode()
    req = urllib.request.Request(
        f"{SITE}/api/admin/run/", data=corpo, headers={**UA_CURL, "X-Admin-Secret": segredo, "Content-Type": "application/json"}
    )
    saida = json.load(urllib.request.urlopen(req, timeout=280))["saida"]
    return {r["ext"]: r for r in json.loads(saida)}


def _norm(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().strip().casefold()


def _oficial_niteroi(env: dict) -> list[dict]:
    auth = (env["NITEROI_API_USERNAME"], env["NITEROI_API_PASSWORD"])
    ultimas = requests.get("http://alertanit.tecal.com.br/dados/rest/last_leituras/", auth=auth, timeout=30).json()
    return [{"ext": str(x["estacao"]), "nome": str(x["estacao"]), "1h": x["h01"], "24h": x["h24"], "96h": x["h96"]} for x in ultimas]


def _oficial_alerta_rio() -> list[dict]:
    h = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.sistema-alerta-rio.com.br/",
    }
    objs = requests.get("https://websempre.rio.rj.gov.br/json/chuvas", headers=h, timeout=30).json()["objects"]
    return [
        {"nome": o["name"], "1h": o["data"].get("h01"), "24h": o["data"].get("h24"), "96h": o["data"].get("h96")}
        for o in objs
    ]


def conferir(slug: str, env: dict, segredo: str) -> None:
    nossos = _nossos(slug, segredo)
    erros = {"1h": [], "24h": [], "96h": []}
    if slug == "niteroi":
        pares = [(o, nossos.get(o["ext"])) for o in _oficial_niteroi(env)]
    else:
        por_nome = {_norm(r["nome"].replace("Alerta Rio - ", "")): r for r in nossos.values()}
        por_nome["barra/barrinha"] = por_nome.get("barra/itanhanga")
        por_nome["barra/riocentro"] = por_nome.get("barra/rio centro")
        pares = [(o, por_nome.get(_norm(o["nome"]))) for o in _oficial_alerta_rio()]
    print(f"\n=== {slug}: {len(pares)} estações (erro = nosso − oficial, mm) ===")
    for o, n in pares:
        if n is None:
            print(f"  {o['nome']}: sem casamento com nossas estações")
            continue
        linha = []
        for j in ("1h", "24h", "96h"):
            if o[j] is None or o[j] < 0 or n[j] is None:
                linha.append(f"{j}: —")
                continue
            erros[j].append(n[j] - o[j])
            linha.append(f"{j}: {n[j]:.1f} × {o[j]:.1f} ({n[j] - o[j]:+.1f})")
        print(f"  {n['nome'][:30]:30} " + " | ".join(linha))
    for j, e in erros.items():
        if e:
            print(f"  RESUMO {j}: média {statistics.mean(e):+.2f} | máx abs {max(abs(x) for x in e):.1f} | |erro| > 2 mm: {sum(1 for x in e if abs(x) > 2)} de {len(e)}")


if __name__ == "__main__":
    fontes = sys.argv[1:] or ["niteroi", "alerta_rio"]
    ambiente = _env()
    segredo = _segredo_admin()
    for f in fontes:
        conferir(f, ambiente, segredo)
