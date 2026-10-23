"""ICON global (DWD, Alemanha): grade icosaédrica (triangular) -> grade regular de 0,125° sobre o Sudeste.

Os dados abertos do DWD vêm um arquivo (.grib2.bz2) por variável, passo e nível, na grade nativa de 2.949.120 células (~13 km),
mais as coordenadas CLAT/CLON (graus). Aqui: baixa, descomprime, recorta as células ao redor do domínio e interpola para uma
grade regular por ponderação pelo inverso da distância (3 células mais próximas; pesos calculados uma vez). ICON-EU e ICON-D2
não cobrem o Brasil. Atribuição: Deutscher Wetterdienst (DWD), dados abertos.
"""
from __future__ import annotations

import bz2
import datetime as dt
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

import gerar_grades as G

BASE = "https://opendata.dwd.de/weather/nwp/icon/grib"
RES = 0.125
PASSOS_ICON = G._passos((0, 120, 3), (126, 180, 6))
CFG = dict(dominio=G.SUDESTE, passos=PASSOS_ICON, teste=120)

I: list[dict] = []


def v(id_, rotulo, un, fator, grupo, paleta, dir_, nome, fn=lambda x: x, nivel=None, acumulada=False):
    I.append(dict(id=id_, rotulo=rotulo, un=un, fator=fator, grupo=grupo, paleta=paleta, dir=dir_, nome=nome, fn=fn, nivel=nivel, acumulada=acumulada))


K = G._k
v("tp", "Chuva acumulada desde o início da rodada", "mm", 10, "Superfície", "chuva", "tot_prec", "TOT_PREC", acumulada=True)
v("cp", "Chuva convectiva acumulada desde o início da rodada", "mm", 10, "Superfície", "chuva", "rain_con", "RAIN_CON", acumulada=True)
v("t2m", "Temperatura a 2 m", "°C", 100, "Superfície", "temp", "t_2m", "T_2M", K)
v("td2m", "Ponto de orvalho a 2 m", "°C", 100, "Superfície", "temp", "td_2m", "TD_2M", K)
v("rh2m", "Umidade relativa a 2 m", "%", 10, "Superfície", "umid", "relhum_2m", "RELHUM_2M")
v("u10", "Vento a 10 m (componente u, leste)", "m/s", 10, "Superfície", "vento", "u_10m", "U_10M")
v("v10", "Vento a 10 m (componente v, norte)", "m/s", 10, "Superfície", "vento", "v_10m", "V_10M")
v("gust", "Rajada de vento", "m/s", 10, "Superfície", "vento", "vmax_10m", "VMAX_10M")
v("msl", "Pressão ao nível do mar", "hPa", 10, "Superfície", "pressao", "pmsl", "PMSL", lambda x: x / 100)
v("sp", "Pressão à superfície", "hPa", 10, "Superfície", "pressao", "ps", "PS", lambda x: x / 100)
v("cape", "CAPE (camada mais instável de 50 hPa)", "J/kg", 1, "Instabilidade", "cape", "cape_ml", "CAPE_ML")
v("tcwv", "Água precipitável (coluna)", "mm", 10, "Superfície", "agua", "tqv", "TQV")
v("tcc", "Nuvens totais", "%", 10, "Nuvens", "nuvem", "clct", "CLCT")
v("lcc", "Nuvens baixas", "%", 10, "Nuvens", "nuvem", "clcl", "CLCL")
v("mcc", "Nuvens médias", "%", 10, "Nuvens", "nuvem", "clcm", "CLCM")
v("hcc", "Nuvens altas", "%", 10, "Nuvens", "nuvem", "clch", "CLCH")
v("hzerocl", "Altura da isoterma de 0 °C", "m", 1, "Superfície", "altura", "hzerocl", "HZEROCL")
for n in (850, 700, 500, 250):
    v(f"gh{n}", f"Altura geopotencial {n} hPa", "m", 1, "Altitude", "altura", "fi", "FI", lambda x: x / 9.80665, nivel=n)
for n in (925, 850, 700, 500):
    v(f"t{n}", f"Temperatura {n} hPa", "°C", 100, "Altitude", "temp", "t", "T", K, nivel=n)
    v(f"r{n}", f"Umidade relativa {n} hPa", "%", 10, "Altitude", "umid", "relhum", "RELHUM", nivel=n)
for n in (925, 850, 700, 500, 250):
    v(f"u{n}", f"Vento {n} hPa (componente u)", "m/s", 10, "Altitude", "vento", "u", "U", nivel=n)
    v(f"v{n}", f"Vento {n} hPa (componente v)", "m/s", 10, "Altitude", "vento", "v", "V", nivel=n)


def _url(rodada: str, passo: int, it: dict) -> str:
    hh = rodada[8:]
    if it["nivel"] is None:
        return f"{BASE}/{hh}/{it['dir']}/icon_global_icosahedral_single-level_{rodada}_{passo:03d}_{it['nome']}.grib2.bz2"
    return f"{BASE}/{hh}/{it['dir']}/icon_global_icosahedral_pressure-level_{rodada}_{passo:03d}_{it['nivel']}_{it['nome']}.grib2.bz2"


def rodada_icon(teste: int) -> str | None:
    agora = dt.datetime.now(dt.timezone.utc)
    for atras in range(0, 72, 6):
        t = (agora - dt.timedelta(hours=atras)).replace(minute=0, second=0, microsecond=0)
        r = t.replace(hour=(t.hour // 6) * 6).strftime("%Y%m%d%H")
        if G.sessao.head(_url(r, teste, I[2]), timeout=30).status_code == 200:
            return r
    return None


def _valores(bz: bytes) -> np.ndarray:
    from eccodes import codes_get_array, codes_new_from_message, codes_release

    h = codes_new_from_message(bz2.decompress(bz))
    try:
        return codes_get_array(h, "values")
    finally:
        codes_release(h)


def _preparar_grade(rodada: str):
    """Pesos de interpolação (3 células mais próximas, inverso da distância) para a grade regular do domínio."""
    hh = rodada[8:]
    coords = {}
    for nome in ("clat", "clon"):
        b = G.http(f"{BASE}/{hh}/{nome}/icon_global_icosahedral_time-invariant_{rodada}_{nome.upper()}.grib2.bz2")
        if not b:
            raise SystemExit(f"sem {nome} do ICON")
        coords[nome] = _valores(b)
    clat, clon = coords["clat"], coords["clon"]
    dom = G.SUDESTE
    m = 1.0
    sel = np.where((clat > dom["lat_s"] - m) & (clat < dom["lat_n"] + m) & (clon > dom["lon_w"] - m) & (clon < dom["lon_e"] + m))[0]
    lats = np.arange(dom["lat_n"], dom["lat_s"] - 1e-6, -RES)
    lons = np.arange(dom["lon_w"], dom["lon_e"] + 1e-6, RES)
    xyz = lambda la, lo: np.column_stack([np.cos(np.radians(la)) * np.cos(np.radians(lo)), np.cos(np.radians(la)) * np.sin(np.radians(lo)), np.sin(np.radians(la))])  # noqa: E731
    arvore = cKDTree(xyz(clat[sel], clon[sel]))
    gl, go = np.meshgrid(lats, lons, indexing="ij")
    dist, ind = arvore.query(xyz(gl.ravel(), go.ravel()), k=3)
    w = 1 / np.maximum(dist, 1e-9)
    w /= w.sum(axis=1, keepdims=True)
    return sel, ind, w, lats, lons


def processar_icon(rodada: str, passos: list[int], saida: Path) -> dict:
    t0 = time.time()
    sel, ind, w, lats, lons = _preparar_grade(rodada)
    shape = (len(lats), len(lons))
    print(f"[icon {rodada}] grade pronta: {len(sel)} células -> {shape[0]}x{shape[1]}", flush=True)

    def tarefa(a):
        passo, it = a
        if passo == 0 and it["id"] in ("gust",):
            return a[0], it["id"], None
        b = G.http(_url(rodada, passo, it))
        if not b:
            return passo, it["id"], None
        try:
            vals = it["fn"](_valores(b)[sel])
            return passo, it["id"], (vals[ind] * w).sum(axis=1).reshape(shape)
        except Exception as exc:  # noqa: BLE001
            print(f"  falha {it['id']} f{passo}: {exc}", file=sys.stderr)
            return passo, it["id"], None

    grade: dict[str, dict[int, np.ndarray]] = {it["id"]: {} for it in I}
    tarefas = [(p, it) for p in passos for it in I]
    with ThreadPoolExecutor(max_workers=10) as ex:
        for p, vid, arr in ex.map(tarefa, tarefas):
            if arr is not None:
                grade[vid][p] = arr
    print(f"[icon {rodada}] baixado e interpolado em {time.time()-t0:.0f} s", flush=True)

    saida.mkdir(parents=True, exist_ok=True)
    catalogo = []
    for it in I:
        g = grade[it["id"]]
        if not g:
            continue
        ps = [p for p in passos if p in g]
        dados = []
        for p in ps:
            a = np.round(g[p] * it["fator"])
            dados.append(np.where(np.isnan(a), G.NULO, np.clip(a, -32767, 32767)).astype(int).ravel().tolist())
        doc = {"v": 1, "modelo": "icon", "run": rodada, "var": it["id"], "un": it["un"], "nx": len(lons), "ny": len(lats), "lat0": float(lats[0]), "lon0": float(lons[0]),
               "dlat": RES, "dlon": RES, "passos": ps, "fator": it["fator"], "nulo": G.NULO, "dados": dados}
        (saida / f"{it['id']}.json").write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        catalogo.append({"id": it["id"], "rotulo": it["rotulo"], "un": it["un"], "grupo": it["grupo"], "paleta": it["paleta"], "acumulada": it["acumulada"], "passos": ps})
    meta = {"modelo": "icon", "run": rodada, "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "dominio": G.SUDESTE, "passos": passos, "variaveis": catalogo}
    (saida / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[icon {rodada}] {len(catalogo)} variáveis, {len(passos)} passos", flush=True)
    return meta
