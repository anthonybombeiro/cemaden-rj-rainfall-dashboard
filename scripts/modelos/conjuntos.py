"""Conjuntos (IFS ENS e GEFS): probabilidades, percentis e média a partir dos membros.

Para cada passo (6 em 6 h) baixa chuva (tp), temperatura a 2 m, vento a 10 m e rajada de todos os membros, e grava as mesmas
grades JSON dos determinísticos, mas com campos estatísticos: média/p50/p90 da chuva (acumulada desde o início e em janelas de
6/24/48/72 h), probabilidades de chuva acima de limiares, temperatura (p10/p50/p90, P(>=35 °C), P(<=12 °C)), vento e rajada.
Documentação: docs/modelos-numericos.md.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

import gerar_grades as G

PASSOS_ENS = G._passos((0, 240, 6))
CONJUNTOS: dict[str, dict] = {
    "ifsens": dict(dominio=G.SUDESTE, passos=PASSOS_ENS, teste=240),
    "gefs": dict(dominio=G.SUDESTE, passos=PASSOS_ENS, teste=240),
}
JANELAS = (6, 24, 48, 72)
LIMIARES_CHUVA = {6: (5, 15, 30), 24: (10, 25, 50, 100), 48: (25, 50, 100), 72: (50, 100, 150)}
KMH = 3.6


# ------------------------------------------------------------------ endereços
def _url_ens(rodada: str, passo: int) -> str:
    d, h = rodada[:8], rodada[8:]
    return f"https://data.ecmwf.int/forecasts/{d}/{h}z/ifs/0p25/enfo/{d}{h}0000-{passo}h-enfo-ef.grib2"


def _membros_gefs() -> list[str]:
    return ["gec00"] + [f"gep{i:02d}" for i in range(1, 31)]


def _url_gefs(rodada: str, membro: str, passo: int) -> str:
    d, h = rodada[:8], rodada[8:]
    return f"https://noaa-gefs-pds.s3.amazonaws.com/gefs.{d}/{h}/atmos/pgrb2sp25/{membro}.t{h}z.pgrb2s.0p25.f{passo:03d}"


def rodada_conjunto(modelo: str, teste: int) -> str | None:
    agora = dt.datetime.now(dt.timezone.utc)
    for atras in range(0, 72, 6):
        t = (agora - dt.timedelta(hours=atras)).replace(minute=0, second=0, microsecond=0)
        r = t.replace(hour=(t.hour // 6) * 6).strftime("%Y%m%d%H")
        u = _url_ens(r, teste).replace(".grib2", ".index") if modelo == "ifsens" else _url_gefs(r, "gep30", teste) + ".idx"
        if G.sessao.head(u, timeout=30).status_code == 200:
            return r
    return None


# ------------------------------------------------------------------ leitura dos membros
VARS = ("tp", "t2m", "u10", "v10", "gust")


def _ler_ens(rodada: str, passo: int, dom: dict):
    """({membro: {var: campo}}, (lats, lons)) de um passo do IFS ENS (um arquivo; o índice JSON traz o número do membro)."""
    url = _url_ens(rodada, passo)
    idx = G.http(url.replace(".grib2", ".index"))
    if not idx:
        return {}, None
    pedidos = {("tp", "sfc"): "tp", ("2t", "sfc"): "t2m", ("10u", "sfc"): "u10", ("10v", "sfc"): "v10", ("10fg", "sfc"): "gust"}
    alvos = []
    for l in idx.decode().splitlines():
        e = json.loads(l)
        v = pedidos.get((e["param"], e["levtype"]))
        if v and e.get("number") is not None:
            alvos.append((int(e["number"]), v, e["_offset"], e["_offset"] + e["_length"] - 1))

    def um(a):
        n, v, ini, fim = a
        b = G.http(url, (ini, fim))
        return n, v, (G.decodificar(b, dom) if b else None)

    out: dict[int, dict[str, np.ndarray]] = {}
    geo = None
    with ThreadPoolExecutor(max_workers=12) as ex:
        for n, v, dec in ex.map(um, alvos):
            if dec is None:
                continue
            vals = dec[0] * 1000 if v == "tp" else (dec[0] - 273.15 if v == "t2m" else dec[0])
            out.setdefault(n, {})[v] = vals
            geo = geo or (dec[1], dec[2])
    return out, geo


def _ler_gefs_membro(rodada: str, membro: str, passo: int, dom: dict):
    arq = _url_gefs(rodada, membro, passo)
    idx = G.http(arq + ".idx")
    if not idx:
        return None
    linhas = [l.split(":") for l in idx.decode().splitlines() if l]
    res: dict = {}
    geo = None
    for k, l in enumerate(linhas):
        ini = int(l[1])
        fim = int(linhas[k + 1][1]) - 1 if k + 1 < len(linhas) else ini + 3_000_000
        nome, nivel, tipo = l[3], l[4], l[5]
        v = None
        if nome == "TMP" and nivel == "2 m above ground":
            v = "t2m"
        elif nome == "UGRD" and nivel == "10 m above ground":
            v = "u10"
        elif nome == "VGRD" and nivel == "10 m above ground":
            v = "v10"
        elif nome == "GUST" and nivel == "surface":
            v = "gust"
        elif nome == "APCP" and nivel == "surface" and "hour acc fcst" in tipo and "day" not in tipo:
            v = "tp"
        if not v or v in res:
            continue
        b = G.http(arq, (ini, fim))
        if not b:
            continue
        vals, lats, lons = G.decodificar(b, dom)
        geo = (lats, lons)
        if v == "t2m":
            vals = vals - 273.15
        if v == "tp":
            a, bb = tipo.split()[0].split("-")
            res["tp_bloco"] = (int(a), int(bb))
        res[v] = vals
    if geo:
        res["_geo"] = geo
    return res or None


# ------------------------------------------------------------------ estatísticas
def _pct(a: np.ndarray, q: float) -> np.ndarray:
    return np.nanpercentile(a, q, axis=0)


def processar_conjunto(modelo: str, rodada: str, passos: list[int], saida: Path) -> dict:
    cfg = CONJUNTOS[modelo]
    dom = cfg["dominio"]
    t0 = time.time()
    # dados[v][passo] = lista de campos (um por membro)
    dados: dict[str, dict[int, list[np.ndarray]]] = {v: {p: [] for p in passos} for v in VARS}
    geo = None
    if modelo == "ifsens":
        def passo_ens(p):
            return p, _ler_ens(rodada, p, dom)

        with ThreadPoolExecutor(max_workers=5) as ex:
            for p, (membros, g) in ex.map(passo_ens, passos):
                geo = geo or g
                for n, campos in sorted(membros.items()):
                    for v in VARS:
                        if v in campos:
                            dados[v][p].append(campos[v])
                print(f"  [{modelo}] passo {p}: {len(membros)} membros", flush=True)
    else:
        tarefas = [(m, p) for m in _membros_gefs() for p in passos]
        brutos: dict = {}

        def tarefa(t):
            m, p = t
            return t, _ler_gefs_membro(rodada, m, p, dom)

        with ThreadPoolExecutor(max_workers=16) as ex:
            for (m, p), r in ex.map(tarefa, tarefas):
                if r:
                    brutos[(m, p)] = r
                    geo = geo or r.get("_geo")
        # chuva acumulada desde o início, membro a membro (blocos de 3/6 h)
        for m in _membros_gefs():
            cum: dict[int, np.ndarray] = {}
            for p in passos:
                r = brutos.get((m, p))
                if not r:
                    continue
                for v in ("t2m", "u10", "v10", "gust"):
                    if v in r:
                        dados[v][p].append(r[v])
                if "tp" in r:
                    a, _b = r["tp_bloco"]
                    base = np.zeros_like(r["tp"]) if a == 0 else cum.get(a)
                    if base is not None:
                        cum[p] = base + r["tp"]
                        dados["tp"][p].append(cum[p])
    print(f"[{modelo} {rodada}] membros lidos em {time.time()-t0:.0f} s", flush=True)
    if not geo:
        raise SystemExit("nenhum dado decodificado")
    lats, lons = geo
    shape = (len(lats), len(lons))
    if passos[0] == 0:
        n0 = max((len(dados["t2m"][0]), 1))
        dados["tp"][0] = [np.zeros(shape) for _ in range(n0)]

    saidas: list[dict] = []  # {id, rotulo, un, fator, grupo, paleta, faixa, campos{passo: array}}

    def novo(id_, rotulo, un, fator, grupo, paleta, faixa=None):
        d = dict(id=id_, rotulo=rotulo, un=un, fator=fator, grupo=grupo, paleta=paleta, faixa=faixa, campos={}, acumulada=False)
        saidas.append(d)
        return d["campos"]

    def pilha(v, p):
        l = dados[v][p]
        return np.stack(l) if len(l) >= 5 else None

    nome = "IFS ENS" if modelo == "ifsens" else "GEFS"
    # --- chuva acumulada desde o início e em janelas
    c = {s: novo(f"tp_{s}", f"Chuva total desde o início ({nome}, {r})", "mm", 10, "Chuva (conjunto)", "chuva", None) for s, r in (("media", "média"), ("p50", "mediana"), ("p90", "percentil 90 — cenário chuvoso"))}
    for p in passos:
        a = pilha("tp", p)
        if a is None:
            continue
        c["media"][p], c["p50"][p], c["p90"][p] = np.nanmean(a, axis=0), _pct(a, 50), _pct(a, 90)
    for w in JANELAS:
        cm = novo(f"chuva{w}_media", f"Chuva em {w} h, média do conjunto ({nome})", "mm", 10, "Chuva (conjunto)", "chuva")
        c50 = novo(f"chuva{w}_p50", f"Chuva em {w} h, mediana ({nome})", "mm", 10, "Chuva (conjunto)", "chuva")
        c90 = novo(f"chuva{w}_p90", f"Chuva em {w} h, percentil 90 — cenário chuvoso ({nome})", "mm", 10, "Chuva (conjunto)", "chuva")
        probs = {t: novo(f"pchuva{w}_{t}", f"Probabilidade de chuva ≥ {t} mm em {w} h ({nome})", "%", 10, "Probabilidades", "prob", [0, 100]) for t in LIMIARES_CHUVA[w]}
        for p in passos:
            if p < w or (p - w) not in passos:
                continue
            a, b = pilha("tp", p), pilha("tp", p - w)
            if a is None or b is None or a.shape[0] != b.shape[0]:
                continue
            jan = np.maximum(a - b, 0)
            cm[p], c50[p], c90[p] = np.nanmean(jan, axis=0), _pct(jan, 50), _pct(jan, 90)
            for t, campos in probs.items():
                campos[p] = 100 * np.mean(jan >= t, axis=0)
    # --- temperatura
    tp10, tp50, tp90, tmed = (novo(f"t2m_{s}", f"Temperatura a 2 m, {r} ({nome})", "°C", 100, "Temperatura (conjunto)", "temp", [5, 38]) for s, r in (("p10", "percentil 10"), ("p50", "mediana"), ("p90", "percentil 90"), ("media", "média")))
    pge35 = novo("pt_ge35", f"Probabilidade de temperatura ≥ 35 °C ({nome})", "%", 10, "Probabilidades", "prob", [0, 100])
    ple12 = novo("pt_le12", f"Probabilidade de temperatura ≤ 12 °C ({nome})", "%", 10, "Probabilidades", "prob", [0, 100])
    for p in passos:
        a = pilha("t2m", p)
        if a is None:
            continue
        tp10[p], tp50[p], tp90[p], tmed[p] = _pct(a, 10), _pct(a, 50), _pct(a, 90), np.nanmean(a, axis=0)
        pge35[p], ple12[p] = 100 * np.mean(a >= 35, axis=0), 100 * np.mean(a <= 12, axis=0)
    # --- vento e rajada (km/h)
    w50 = novo("ws10_p50", f"Vento a 10 m, mediana ({nome})", "km/h", 10, "Vento (conjunto)", "vento", [0, 72])
    w90 = novo("ws10_p90", f"Vento a 10 m, percentil 90 ({nome})", "km/h", 10, "Vento (conjunto)", "vento", [0, 72])
    pw40 = novo("pws10_ge40", f"Probabilidade de vento a 10 m ≥ 40 km/h ({nome})", "%", 10, "Probabilidades", "prob", [0, 100])
    g50 = novo("gust_p50", f"Rajada, mediana ({nome})", "km/h", 10, "Vento (conjunto)", "vento", [0, 90])
    g90 = novo("gust_p90", f"Rajada, percentil 90 ({nome})", "km/h", 10, "Vento (conjunto)", "vento", [0, 90])
    pg50 = novo("pgust_ge50", f"Probabilidade de rajada ≥ 50 km/h ({nome})", "%", 10, "Probabilidades", "prob", [0, 100])
    pg70 = novo("pgust_ge70", f"Probabilidade de rajada ≥ 70 km/h ({nome})", "%", 10, "Probabilidades", "prob", [0, 100])
    for p in passos:
        u, v = pilha("u10", p), pilha("v10", p)
        if u is not None and v is not None and u.shape == v.shape:
            ws = np.hypot(u, v) * KMH
            w50[p], w90[p], pw40[p] = _pct(ws, 50), _pct(ws, 90), 100 * np.mean(ws >= 40, axis=0)
        g = pilha("gust", p)
        if g is not None and p > 0:  # rajada não existe no passo 0
            gk = g * KMH
            g50[p], g90[p], pg50[p], pg70[p] = _pct(gk, 50), _pct(gk, 90), 100 * np.mean(gk >= 50, axis=0), 100 * np.mean(gk >= 70, axis=0)

    saida.mkdir(parents=True, exist_ok=True)
    catalogo = []
    for s in saidas:
        ps = [p for p in passos if p in s["campos"]]
        if not ps:
            continue
        dd = []
        for p in ps:
            a = np.round(s["campos"][p] * s["fator"])
            dd.append(np.where(np.isnan(a), G.NULO, np.clip(a, -32767, 32767)).astype(int).ravel().tolist())
        doc = {"v": 1, "modelo": modelo, "run": rodada, "var": s["id"], "un": s["un"], "nx": len(lons), "ny": len(lats), "lat0": float(lats[0]), "lon0": float(lons[0]),
               "dlat": float(round(lats[0] - lats[1], 4)), "dlon": float(round(lons[1] - lons[0], 4)), "passos": ps, "fator": s["fator"], "nulo": G.NULO, "dados": dd}
        (saida / f"{s['id']}.json").write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        e = {"id": s["id"], "rotulo": s["rotulo"], "un": s["un"], "grupo": s["grupo"], "paleta": s["paleta"], "acumulada": False, "passos": ps}
        if s["faixa"]:
            e["faixa"] = s["faixa"]
        catalogo.append(e)
    meta = {"modelo": modelo, "run": rodada, "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "dominio": dom, "passos": passos, "variaveis": catalogo,
            "membros": max((len(dados["t2m"][p]) for p in passos), default=0)}
    (saida / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[{modelo} {rodada}] {len(catalogo)} variáveis estatísticas, {meta['membros']} membros", flush=True)
    return meta


if __name__ == "__main__":
    sys.exit("use gerar_grades.py --modelo ifsens|gefs")
