#!/usr/bin/env python3
"""Gera grades recortadas (Sudeste) de modelos numéricos globais abertos para o painel CEMADEN-RJ.

Modelos: gfs (NOAA, AWS Open Data) e ifs (ECMWF Open Data). Baixa só as mensagens GRIB2 necessárias (byte-range pelo
índice), recorta o domínio e grava um JSON por variável (inteiros em int16 escalados), mais `meta.json` com o catálogo.
O painel lê esses arquivos direto do navegador (ver docs/modelos-numericos.md). Roda no GitHub Actions; local serve para teste.

Uso: python gerar_grades.py --modelo gfs|ifs --saida DIR [--rodada AAAAMMDDHH] [--max-passos N]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from eccodes import (
    codes_get,
    codes_get_array,
    codes_new_from_message,
    codes_release,
)

# Domínio (graus). Linhas de norte para sul, colunas de oeste para leste. Cobre o RJ com folga e o Sudeste.
LAT_N, LAT_S, LON_W, LON_E = -17.0, -26.0, -50.0, -38.0
NULO = -32768
NIVEIS_RELEVANTES = (925, 850, 700, 500, 250)

sessao = requests.Session()
sessao.headers["User-Agent"] = "cemaden-rj-painel/modelos (defesa civil RJ)"


def _k(x: np.ndarray) -> np.ndarray:
    return x - 273.15


def _rh(t_c: np.ndarray, td_c: np.ndarray) -> np.ndarray:
    """Umidade relativa (%) pela fórmula de Magnus a partir de T e Td em °C."""
    a, b = 17.625, 243.04
    return np.clip(100 * np.exp(a * td_c / (b + td_c) - a * t_c / (b + t_c)), 0, 100)


def _ident(x):
    return x


# ------------------------------------------------------------------ catálogo
# id, rótulo, unidade, fator (inteiro = valor*fator), grupo, paleta (definida no front), fonte por modelo.
# ifs: (param, levtype, levelist|None, função); gfs: (VAR, nível, função)
V: list[dict] = []


def var(id_, rotulo, un, fator, grupo, paleta, ifs=None, gfs=None, acumulada=False):
    V.append(dict(id=id_, rotulo=rotulo, un=un, fator=fator, grupo=grupo, paleta=paleta, ifs=ifs, gfs=gfs, acumulada=acumulada))


var("tp", "Chuva acumulada desde o início da rodada", "mm", 10, "Superfície", "chuva", ifs=("tp", "sfc", None, lambda x: x * 1000), gfs=("APCP", "surface", lambda x: x), acumulada=True)
var("t2m", "Temperatura a 2 m", "°C", 100, "Superfície", "temp", ifs=("2t", "sfc", None, _k), gfs=("TMP", "2 m above ground", _k))
var("td2m", "Ponto de orvalho a 2 m", "°C", 100, "Superfície", "temp", ifs=("2d", "sfc", None, _k), gfs=("DPT", "2 m above ground", _k))
var("rh2m", "Umidade relativa a 2 m", "%", 10, "Superfície", "umid", ifs="derivada", gfs=("RH", "2 m above ground", _ident))
var("u10", "Vento a 10 m (componente u, leste)", "m/s", 10, "Superfície", "vento", ifs=("10u", "sfc", None, _ident), gfs=("UGRD", "10 m above ground", _ident))
var("v10", "Vento a 10 m (componente v, norte)", "m/s", 10, "Superfície", "vento", ifs=("10v", "sfc", None, _ident), gfs=("VGRD", "10 m above ground", _ident))
var("gust", "Rajada de vento", "m/s", 10, "Superfície", "vento", ifs=("10fg", "sfc", None, _ident), gfs=("GUST", "surface", _ident))
var("msl", "Pressão ao nível do mar", "hPa", 10, "Superfície", "pressao", ifs=("msl", "sfc", None, lambda x: x / 100), gfs=("PRMSL", "mean sea level", lambda x: x / 100))
var("cape", "CAPE (energia convectiva)", "J/kg", 1, "Instabilidade", "cape", ifs=("mucape", "sfc", None, _ident), gfs=("CAPE", "surface", _ident))
var("cin", "CIN (inibição convectiva)", "J/kg", 1, "Instabilidade", "cin", gfs=("CIN", "surface", lambda x: np.abs(x)))
var("tcwv", "Água precipitável (coluna)", "mm", 10, "Superfície", "agua", ifs=("tcwv", "sfc", None, _ident), gfs=("PWAT", "entire atmosphere (considered as a single layer)", _ident))
var("tcc", "Nuvens totais", "%", 10, "Nuvens", "nuvem", ifs=("tcc", "sfc", None, lambda x: x * 100), gfs=("TCDC", "entire atmosphere", _ident))
var("lcc", "Nuvens baixas", "%", 10, "Nuvens", "nuvem", ifs=("lcc", "sfc", None, lambda x: x * 100), gfs=("LCDC", "low cloud layer", _ident))
var("mcc", "Nuvens médias", "%", 10, "Nuvens", "nuvem", ifs=("mcc", "sfc", None, lambda x: x * 100), gfs=("MCDC", "middle cloud layer", _ident))
var("hcc", "Nuvens altas", "%", 10, "Nuvens", "nuvem", ifs=("hcc", "sfc", None, lambda x: x * 100), gfs=("HCDC", "high cloud layer", _ident))
var("refc", "Refletividade composta simulada", "dBZ", 10, "Superfície", "refl", gfs=("REFC", "entire atmosphere", _ident))
var("vis", "Visibilidade", "km", 10, "Superfície", "vis", gfs=("VIS", "surface", lambda x: x / 1000))
var("hpbl", "Altura da camada limite", "m", 1, "Superfície", "altura", gfs=("HPBL", "surface", _ident))
var("soilw", "Umidade do solo (0–7/10 cm)", "%", 10, "Superfície", "solo", ifs=("vsw", "sol", 1, lambda x: x * 100), gfs=("SOILW", "0-0.1 m below ground", lambda x: x * 100))
for n in (850, 500, 250):
    var(f"gh{n}", f"Altura geopotencial {n} hPa", "m", 1, "Altitude", "altura", ifs=("gh", "pl", n, _ident), gfs=("HGT", f"{n} mb", _ident))
for n in (850, 700, 500):
    var(f"t{n}", f"Temperatura {n} hPa", "°C", 100, "Altitude", "temp", ifs=("t", "pl", n, _k), gfs=("TMP", f"{n} mb", _k))
    var(f"r{n}", f"Umidade relativa {n} hPa", "%", 10, "Altitude", "umid", ifs=("r", "pl", n, _ident), gfs=("RH", f"{n} mb", _ident))
for n in NIVEIS_RELEVANTES:
    var(f"u{n}", f"Vento {n} hPa (componente u)", "m/s", 10, "Altitude", "vento", ifs=("u", "pl", n, _ident), gfs=("UGRD", f"{n} mb", _ident))
    var(f"v{n}", f"Vento {n} hPa (componente v)", "m/s", 10, "Altitude", "vento", ifs=("v", "pl", n, _ident), gfs=("VGRD", f"{n} mb", _ident))
for n in (700, 500):
    var(f"w{n}", f"Velocidade vertical {n} hPa (negativa = ascendente)", "Pa/s", 1000, "Altitude", "omega", ifs=("w", "pl", n, _ident), gfs=("VVEL", f"{n} mb", _ident))


# ------------------------------------------------------------------ rede
def http(url: str, faixa: tuple[int, int] | None = None, tentativas: int = 4) -> bytes | None:
    h = {"Range": f"bytes={faixa[0]}-{faixa[1]}"} if faixa else {}
    for k in range(tentativas):
        try:
            r = sessao.get(url, headers=h, timeout=90)
            if r.status_code in (200, 206):
                return r.content
            if r.status_code in (403, 404):
                return None
        except requests.RequestException:
            pass
        time.sleep(1.5 * (k + 1))
    return None


# ------------------------------------------------------------------ GRIB
def decodificar(msg: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """(valores recortados [norte→sul, oeste→leste], lats, lons) ou None."""
    h = codes_new_from_message(msg)
    try:
        lats = codes_get_array(h, "distinctLatitudes")
        lons = codes_get_array(h, "distinctLongitudes")
        ni, nj = int(codes_get(h, "Ni")), int(codes_get(h, "Nj"))
        vals = codes_get_array(h, "values").reshape(nj, ni)
        miss = float(codes_get(h, "missingValue"))
    finally:
        codes_release(h)
    vals = np.where(vals == miss, np.nan, vals)
    lons = np.where(lons > 180, lons - 360, lons)
    ordem_lat = np.argsort(-lats)
    ordem_lon = np.argsort(lons)
    vals, lats, lons = vals[ordem_lat][:, ordem_lon], lats[ordem_lat], lons[ordem_lon]
    il = np.where((lats <= LAT_N + 1e-6) & (lats >= LAT_S - 1e-6))[0]
    jc = np.where((lons >= LON_W - 1e-6) & (lons <= LON_E + 1e-6))[0]
    return vals[np.ix_(il, jc)], lats[il], lons[jc]


# ------------------------------------------------------------------ passos por modelo
def passos_gfs(maximo: int | None) -> list[int]:
    p = list(range(0, 121, 3)) + list(range(126, 241, 6))
    return p[:maximo] if maximo else p


def passos_ifs(maximo: int | None) -> list[int]:
    p = list(range(0, 145, 3)) + list(range(150, 241, 6))
    return p[:maximo] if maximo else p


def url_gfs(rodada: str, passo: int) -> str:
    d, h = rodada[:8], rodada[8:]
    return f"https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.{d}/{h}/atmos/gfs.t{h}z.pgrb2.0p25.f{passo:03d}"


def url_ifs(rodada: str, passo: int) -> str:
    d, h = rodada[:8], rodada[8:]
    return f"https://data.ecmwf.int/forecasts/{d}/{h}z/ifs/0p25/oper/{d}{h}0000-{passo}h-oper-fc.grib2"


def rodada_mais_recente(modelo: str, passo_teste: int) -> str | None:
    """Última rodada cujo arquivo do passo de teste já existe (rodada completa o bastante para publicar)."""
    agora = dt.datetime.now(dt.timezone.utc)
    f = url_gfs if modelo == "gfs" else url_ifs
    for atras in range(0, 60, 6):
        t = (agora - dt.timedelta(hours=atras)).replace(minute=0, second=0, microsecond=0)
        t = t.replace(hour=(t.hour // 6) * 6)
        r = t.strftime("%Y%m%d%H")
        u = f(r, passo_teste)
        u = u + ".idx" if modelo == "gfs" else u.replace(".grib2", ".index")
        if sessao.head(u, timeout=30).status_code == 200:
            return r
    return None


def mensagens_gfs(rodada: str, passo: int, escolhidas: list[dict]) -> dict[str, tuple[tuple[int, int], tuple[int, int] | None]]:
    """id da variável -> (faixa de bytes, (a, b) do intervalo de acumulação quando houver)."""
    idx = http(url_gfs(rodada, passo) + ".idx")
    if not idx:
        return {}
    linhas = [l.split(":") for l in idx.decode().splitlines() if l]
    out: dict = {}
    for k, l in enumerate(linhas):
        ini = int(l[1])
        fim = int(linhas[k + 1][1]) - 1 if k + 1 < len(linhas) else None
        nome, nivel, tipo = l[3], l[4], l[5]
        for v in escolhidas:
            if not v["gfs"] or v["id"] in out:
                continue
            vn, vl = v["gfs"][0], v["gfs"][1]
            if nome != vn or nivel != vl:
                continue
            if v["acumulada"]:
                if "hour acc fcst" in tipo and "-" in tipo.split()[0] and "day" not in tipo:
                    a, b = tipo.split()[0].split("-")
                    out[v["id"]] = ((ini, fim if fim is not None else ini + 5_000_000), (int(a), int(b)))
            elif tipo.endswith("hour fcst") or tipo == "anl":
                if "-" not in tipo.split()[0]:
                    out[v["id"]] = ((ini, fim if fim is not None else ini + 5_000_000), None)
    return out


def mensagens_ifs(rodada: str, passo: int, escolhidas: list[dict]) -> dict[str, tuple[tuple[int, int], None]]:
    idx = http(url_ifs(rodada, passo).replace(".grib2", ".index"))
    if not idx:
        return {}
    entradas = [json.loads(l) for l in idx.decode().splitlines() if l]
    out: dict = {}
    for v in escolhidas:
        if not v["ifs"] or v["ifs"] == "derivada":
            continue
        p, lt, nivel, _ = v["ifs"]
        for e in entradas:
            if e["param"] == p and e["levtype"] == lt and (nivel is None or str(e.get("levelist")) == str(nivel)):
                out[v["id"]] = ((e["_offset"], e["_offset"] + e["_length"] - 1), None)
                break
    return out


# ------------------------------------------------------------------ principal
def processar(modelo: str, rodada: str, passos: list[int], saida: Path) -> dict:
    escolhidas = [v for v in V if (v["gfs"] if modelo == "gfs" else v["ifs"])]
    url = url_gfs if modelo == "gfs" else url_ifs
    mens = mensagens_gfs if modelo == "gfs" else mensagens_ifs
    grade: dict[str, dict[int, np.ndarray]] = {v["id"]: {} for v in escolhidas}
    geometria: dict = {}
    cum_ini: dict[int, np.ndarray] = {}  # GFS: chuva acumulada no início de cada bloco

    def trabalho(passo: int):
        m = mens(rodada, passo, escolhidas)
        arquivo = url(rodada, passo)
        res = {}
        for vid, (faixa, intervalo) in m.items():
            bruto = http(arquivo, faixa)
            if bruto:
                dec = decodificar(bruto)
                if dec:
                    res[vid] = (dec, intervalo)
        return passo, res

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=10) as ex:
        resultados = list(ex.map(trabalho, passos))
    print(f"[{modelo} {rodada}] baixado e decodificado em {time.time()-t0:.0f} s", flush=True)

    dados_passo: dict[int, dict] = {p: r for p, r in resultados}
    for passo in passos:
        for vid, ((vals, lats, lons), intervalo) in dados_passo.get(passo, {}).items():
            geometria = geometria or {"lats": lats, "lons": lons}
            v = next(x for x in escolhidas if x["id"] == vid)
            fn = (v["gfs"][2] if modelo == "gfs" else v["ifs"][3])
            arr = fn(vals)
            if v["acumulada"] and modelo == "gfs":
                a, _b = intervalo
                base = grade["tp"].get(a) if a > 0 else np.zeros_like(arr)
                if base is None:
                    continue
                arr = base + arr
            grade[vid][passo] = arr
    # chuva no passo 0 (ainda sem acumulado): zero
    if "tp" in grade and passos and passos[0] == 0 and geometria:
        grade["tp"][0] = np.zeros((len(geometria["lats"]), len(geometria["lons"])))
    # umidade relativa derivada (IFS)
    if modelo == "ifs":
        for passo in passos:
            if passo in grade["t2m"] and passo in grade["td2m"]:
                grade["rh2m"][passo] = _rh(grade["t2m"][passo], grade["td2m"][passo])
    if not geometria:
        raise SystemExit("nenhum dado decodificado")

    lats, lons = geometria["lats"], geometria["lons"]
    saida.mkdir(parents=True, exist_ok=True)
    catalogo = []
    for v in escolhidas:
        g = grade[v["id"]]
        if not g:
            continue
        ps = [p for p in passos if p in g]
        dados = []
        for p in ps:
            a = np.round(g[p] * v["fator"])
            a = np.where(np.isnan(a), NULO, np.clip(a, -32767, 32767)).astype(int)
            dados.append(a.ravel().tolist())
        doc = {
            "v": 1, "modelo": modelo, "run": rodada, "var": v["id"], "un": v["un"], "nx": len(lons), "ny": len(lats),
            "lat0": float(lats[0]), "lon0": float(lons[0]), "dlat": float(round(lats[0] - lats[1], 4)), "dlon": float(round(lons[1] - lons[0], 4)),
            "passos": ps, "fator": v["fator"], "nulo": NULO, "dados": dados,
        }
        (saida / f"{v['id']}.json").write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        catalogo.append({"id": v["id"], "rotulo": v["rotulo"], "un": v["un"], "grupo": v["grupo"], "paleta": v["paleta"], "acumulada": v["acumulada"], "passos": ps})
    meta = {
        "modelo": modelo, "run": rodada, "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "dominio": {"lat_n": LAT_N, "lat_s": LAT_S, "lon_w": LON_W, "lon_e": LON_E}, "passos": passos, "variaveis": catalogo,
    }
    (saida / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[{modelo} {rodada}] {len(catalogo)} variáveis, {len(passos)} passos", flush=True)
    return meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo", choices=["gfs", "ifs"], required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--rodada")
    ap.add_argument("--max-passos", type=int)
    ap.add_argument("--so-se-nova", help="pasta publicada: não faz nada se já tem esta rodada")
    a = ap.parse_args()
    passos = (passos_gfs if a.modelo == "gfs" else passos_ifs)(a.max_passos)
    teste = passos[-1] if a.modelo == "gfs" else min(passos[-1], 144)  # IFS 06/18 só vão até 144 h
    rodada = a.rodada or rodada_mais_recente(a.modelo, teste)
    if not rodada:
        print("nenhuma rodada completa encontrada", file=sys.stderr)
        return 1
    if a.so_se_nova:
        m = Path(a.so_se_nova) / a.modelo / "meta.json"
        if m.exists() and json.loads(m.read_text(encoding="utf-8")).get("run") == rodada:
            print(f"rodada {rodada} já publicada; nada a fazer")
            return 0
    processar(a.modelo, rodada, passos, Path(a.saida) / a.modelo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
