#!/usr/bin/env python3
"""Gera grades recortadas de modelos numéricos abertos para o painel CEMADEN-RJ.

Modelos determinísticos: gfs (NOAA/AWS), ifs e ifs01 (ECMWF Open Data 0,25° e 0,1°) e aifs (ECMWF, IA).
Conjuntos (probabilidades e percentis): ifsens (ECMWF ENS) e gefs (NOAA) — ver conjuntos.py.
Baixa só as mensagens GRIB2 necessárias (byte-range pelo índice), recorta o domínio e grava um JSON por variável (inteiros
escalados em int16) mais `meta.json` com o catálogo. O painel lê direto do navegador (docs/modelos-numericos.md).

Uso: python gerar_grades.py --modelo gfs|ifs|ifs01|aifs|ifsens|gefs --saida DIR [--rodada AAAAMMDDHH] [--max-passos N]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from eccodes import codes_get, codes_get_array, codes_new_from_message, codes_release

NULO = -32768
SUDESTE = dict(lat_n=-17.0, lat_s=-26.0, lon_w=-50.0, lon_e=-38.0)  # 0,25°: 37 x 49
RJ = dict(lat_n=-20.2, lat_s=-24.2, lon_w=-45.2, lon_e=-40.6)  # 0,1°: 41 x 47

sessao = requests.Session()
sessao.headers["User-Agent"] = "cemaden-rj-painel/modelos (defesa civil RJ)"


def _k(x):
    return x - 273.15


def _ident(x):
    return x


def rh_td(t_c, td_c):
    """Umidade relativa (%) pela fórmula de Magnus a partir de T e Td em °C."""
    a, b = 17.625, 243.04
    return np.clip(100 * np.exp(a * td_c / (b + td_c) - a * t_c / (b + t_c)), 0, 100)


def rh_q(t_c, q, p_hpa):
    """Umidade relativa (%) a partir de T (°C), umidade específica (kg/kg) e pressão (hPa)."""
    e = q * p_hpa / (0.622 + 0.378 * q)
    es = 6.112 * np.exp(17.67 * t_c / (t_c + 243.5))
    return np.clip(100 * e / es, 0, 100)


# ------------------------------------------------------------------ catálogo de variáveis
# ifs/aifs: (param, levtype, levelist|None, função); gfs: (VAR, nível, função). `aifs` ausente = igual ao `ifs`.
V: list[dict] = []


def var(id_, rotulo, un, fator, grupo, paleta, ifs=None, gfs=None, aifs=None, acumulada=False):
    V.append(dict(id=id_, rotulo=rotulo, un=un, fator=fator, grupo=grupo, paleta=paleta, ifs=ifs, gfs=gfs, aifs=aifs if aifs is not None else ifs, acumulada=acumulada))


var("tp", "Chuva acumulada desde o início da rodada", "mm", 10, "Superfície", "chuva", ifs=("tp", "sfc", None, lambda x: x * 1000), aifs=("tp", "sfc", None, _ident), gfs=("APCP", "surface", _ident), acumulada=True)
var("cp", "Chuva convectiva acumulada desde o início da rodada", "mm", 10, "Superfície", "chuva", ifs=("cp", "sfc", None, lambda x: x * 1000), aifs=("cp", "sfc", None, _ident), gfs=("ACPCP", "surface", _ident), acumulada=True)
var("tprate", "Taxa de chuva (instantânea)", "mm/h", 100, "Superfície", "chuva", ifs=("tprate", "sfc", None, lambda x: x * 3600), gfs=("PRATE", "surface", lambda x: x * 3600))
var("t2m", "Temperatura a 2 m", "°C", 100, "Superfície", "temp", ifs=("2t", "sfc", None, _k), gfs=("TMP", "2 m above ground", _k))
var("td2m", "Ponto de orvalho a 2 m", "°C", 100, "Superfície", "temp", ifs=("2d", "sfc", None, _k), gfs=("DPT", "2 m above ground", _k))
var("rh2m", "Umidade relativa a 2 m", "%", 10, "Superfície", "umid", ifs="derivada", gfs=("RH", "2 m above ground", _ident))
var("aptmp", "Sensação térmica a 2 m (NOAA)", "°C", 100, "Superfície", "temp", gfs=("APTMP", "2 m above ground", _k))
var("u10", "Vento a 10 m (componente u, leste)", "m/s", 10, "Superfície", "vento", ifs=("10u", "sfc", None, _ident), gfs=("UGRD", "10 m above ground", _ident))
var("v10", "Vento a 10 m (componente v, norte)", "m/s", 10, "Superfície", "vento", ifs=("10v", "sfc", None, _ident), gfs=("VGRD", "10 m above ground", _ident))
var("u100", "Vento a 100 m (IFS/AIFS) ou 80 m (GFS), componente u", "m/s", 10, "Superfície", "vento", ifs=("100u", "sfc", None, _ident), gfs=("UGRD", "80 m above ground", _ident))
var("v100", "Vento a 100 m (IFS/AIFS) ou 80 m (GFS), componente v", "m/s", 10, "Superfície", "vento", ifs=("100v", "sfc", None, _ident), gfs=("VGRD", "80 m above ground", _ident))
var("gust", "Rajada de vento", "m/s", 10, "Superfície", "vento", ifs=("10fg", "sfc", None, _ident), aifs=False, gfs=("GUST", "surface", _ident))
var("msl", "Pressão ao nível do mar", "hPa", 10, "Superfície", "pressao", ifs=("msl", "sfc", None, lambda x: x / 100), gfs=("PRMSL", "mean sea level", lambda x: x / 100))
var("sp", "Pressão à superfície", "hPa", 10, "Superfície", "pressao", ifs=("sp", "sfc", None, lambda x: x / 100), gfs=("PRES", "surface", lambda x: x / 100))
var("cape", "CAPE (IFS: parcela mais instável; GFS: de superfície)", "J/kg", 1, "Instabilidade", "cape", ifs=("mucape", "sfc", None, _ident), aifs=False, gfs=("CAPE", "surface", _ident))
var("cape_ml", "CAPE da camada de 180 hPa (NOAA)", "J/kg", 1, "Instabilidade", "cape", gfs=("CAPE", "180-0 mb above ground", _ident))
var("cin", "CIN (inibição convectiva, NOAA)", "J/kg", 1, "Instabilidade", "cin", gfs=("CIN", "surface", np.abs))
var("lftx", "Índice de elevação (Lifted Index, NOAA)", "K", 10, "Instabilidade", "li", gfs=("LFTX", "surface", _ident))
var("hlcy", "Helicidade relativa à tempestade 0–3 km (NOAA)", "m²/s²", 1, "Instabilidade", "cape", gfs=("HLCY", "3000-0 m above ground", _ident))
var("tcwv", "Água precipitável (coluna)", "mm", 10, "Superfície", "agua", ifs=("tcwv", "sfc", None, _ident), aifs=("tcw", "sfc", None, _ident), gfs=("PWAT", "entire atmosphere (considered as a single layer)", _ident))
var("tcc", "Nuvens totais", "%", 10, "Nuvens", "nuvem", ifs=("tcc", "sfc", None, lambda x: x * 100), gfs=("TCDC", "entire atmosphere", _ident))
var("lcc", "Nuvens baixas", "%", 10, "Nuvens", "nuvem", ifs=("lcc", "sfc", None, lambda x: x * 100), gfs=("LCDC", "low cloud layer", _ident))
var("mcc", "Nuvens médias", "%", 10, "Nuvens", "nuvem", ifs=("mcc", "sfc", None, lambda x: x * 100), gfs=("MCDC", "middle cloud layer", _ident))
var("hcc", "Nuvens altas", "%", 10, "Nuvens", "nuvem", ifs=("hcc", "sfc", None, lambda x: x * 100), gfs=("HCDC", "high cloud layer", _ident))
var("refc", "Refletividade composta simulada (NOAA)", "dBZ", 10, "Superfície", "refl", gfs=("REFC", "entire atmosphere", _ident))
var("vis", "Visibilidade (NOAA)", "km", 10, "Superfície", "vis", gfs=("VIS", "surface", lambda x: x / 1000))
var("hpbl", "Altura da camada limite (NOAA)", "m", 1, "Superfície", "altura", gfs=("HPBL", "surface", _ident))
var("ro", "Escoamento superficial acumulado (IFS)", "mm", 100, "Superfície", "chuva", ifs=("ro", "sfc", None, lambda x: x * 1000), aifs=False)
var("soilw", "Umidade do solo (0–10 cm)", "%", 10, "Superfície", "solo", ifs=("vsw", "sol", 1, lambda x: x * 100), gfs=("SOILW", "0-0.1 m below ground", lambda x: x * 100))
for n in (850, 700, 500, 250):
    var(f"gh{n}", f"Altura geopotencial {n} hPa", "m", 1, "Altitude", "altura", ifs=("gh", "pl", n, _ident), gfs=("HGT", f"{n} mb", _ident))
for n in (925, 850, 700, 500):
    var(f"t{n}", f"Temperatura {n} hPa", "°C", 100, "Altitude", "temp", ifs=("t", "pl", n, _k), gfs=("TMP", f"{n} mb", _k))
    var(f"r{n}", f"Umidade relativa {n} hPa", "%", 10, "Altitude", "umid", ifs=("r", "pl", n, _ident), aifs="derivada_r", gfs=("RH", f"{n} mb", _ident))
for n in (925, 850, 700):
    var(f"q{n}", f"Umidade específica {n} hPa", "g/kg", 100, "Altitude", "agua", ifs=("q", "pl", n, lambda x: x * 1000), gfs=("SPFH", f"{n} mb", lambda x: x * 1000))
for n in (925, 850, 700, 500, 250):
    var(f"u{n}", f"Vento {n} hPa (componente u)", "m/s", 10, "Altitude", "vento", ifs=("u", "pl", n, _ident), gfs=("UGRD", f"{n} mb", _ident))
    var(f"v{n}", f"Vento {n} hPa (componente v)", "m/s", 10, "Altitude", "vento", ifs=("v", "pl", n, _ident), gfs=("VGRD", f"{n} mb", _ident))
for n in (700, 500):
    var(f"w{n}", f"Velocidade vertical {n} hPa (negativa = ascendente)", "Pa/s", 1000, "Altitude", "omega", ifs=("w", "pl", n, _ident), gfs=("VVEL", f"{n} mb", _ident))

# subconjunto do IFS 0,1° (arquivos 6x maiores: só superfície, só o essencial)
VARS_IFS01 = {"tp", "cp", "tprate", "t2m", "td2m", "rh2m", "u10", "v10", "u100", "v100", "gust", "msl", "sp", "cape", "tcwv", "tcc", "lcc", "mcc", "hcc"}


# ------------------------------------------------------------------ modelos determinísticos
def _passos(*faixas):
    out: list[int] = []
    for a, b, c in faixas:
        out += list(range(a, b + 1, c))
    return out


MODELOS: dict[str, dict] = {
    "gfs": dict(tipo="gfs", dominio=SUDESTE, passos=_passos((0, 120, 3), (126, 240, 6)), teste=240),
    "ifs": dict(tipo="ecmwf", base="ifs/0p25/oper", stream="oper-fc", sufixos=None, dominio=SUDESTE, passos=_passos((0, 144, 3), (150, 240, 6)), teste=144),
    "ifs01": dict(tipo="ecmwf", base="ifs/0p1/oper", stream="oper-fc", sufixos={"sfc": "-sfc", "sol": "-sfc", "pl": "-pl"}, dominio=RJ, passos=_passos((0, 144, 3)), teste=144, vars=VARS_IFS01),
    "aifs": dict(tipo="ecmwf", base="aifs-single/0p25/oper", stream="oper-fc", sufixos=None, dominio=SUDESTE, passos=_passos((0, 360, 6)), teste=360),
}


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
def decodificar(msg: bytes, dom: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(valores recortados [norte→sul, oeste→leste], lats, lons)."""
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
    ol, oc = np.argsort(-lats), np.argsort(lons)
    vals, lats, lons = vals[ol][:, oc], lats[ol], lons[oc]
    il = np.where((lats <= dom["lat_n"] + 1e-6) & (lats >= dom["lat_s"] - 1e-6))[0]
    jc = np.where((lons >= dom["lon_w"] - 1e-6) & (lons <= dom["lon_e"] + 1e-6))[0]
    return vals[np.ix_(il, jc)], lats[il], lons[jc]


# ------------------------------------------------------------------ endereços e índices
def url_gfs(rodada: str, passo: int) -> str:
    d, h = rodada[:8], rodada[8:]
    return f"https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.{d}/{h}/atmos/gfs.t{h}z.pgrb2.0p25.f{passo:03d}"


def url_ecmwf(cfg: dict, rodada: str, passo: int, levtype: str = "sfc") -> str:
    d, h = rodada[:8], rodada[8:]
    suf = cfg["sufixos"][levtype] if cfg["sufixos"] else ""
    return f"https://data.ecmwf.int/forecasts/{d}/{h}z/{cfg['base']}/{d}{h}0000-{passo}h-{cfg['stream']}{suf}.grib2"


def url_indice(modelo: str, rodada: str, passo: int, levtype: str = "sfc") -> str:
    cfg = MODELOS[modelo]
    return url_gfs(rodada, passo) + ".idx" if cfg["tipo"] == "gfs" else url_ecmwf(cfg, rodada, passo, levtype).replace(".grib2", ".index")


def rodada_mais_recente(modelo: str, passo_teste: int) -> str | None:
    """Última rodada cujo índice do passo de teste já existe (rodada completa o bastante para publicar)."""
    agora = dt.datetime.now(dt.timezone.utc)
    for atras in range(0, 72, 6):
        t = (agora - dt.timedelta(hours=atras)).replace(minute=0, second=0, microsecond=0)
        r = t.replace(hour=(t.hour // 6) * 6).strftime("%Y%m%d%H")
        if sessao.head(url_indice(modelo, r, passo_teste), timeout=30).status_code == 200:
            return r
    return None


def spec_var(v: dict, modelo: str):
    tipo = MODELOS[modelo]["tipo"]
    s = v["gfs"] if tipo == "gfs" else (v["aifs"] if modelo == "aifs" else v["ifs"])
    return None if s is False else s


def mensagens(modelo: str, rodada: str, passo: int, escolhidas: list[dict]) -> dict[str, tuple[str, tuple[int, int], tuple[int, int] | None]]:
    """id da variável -> (endereço do GRIB, faixa de bytes, (a, b) da acumulação quando houver)."""
    cfg = MODELOS[modelo]
    out: dict = {}
    if cfg["tipo"] == "gfs":
        arq = url_gfs(rodada, passo)
        idx = http(arq + ".idx")
        if not idx:
            return {}
        linhas = [l.split(":") for l in idx.decode().splitlines() if l]
        for k, l in enumerate(linhas):
            ini = int(l[1])
            fim = int(linhas[k + 1][1]) - 1 if k + 1 < len(linhas) else ini + 8_000_000
            nome, nivel, tipo = l[3], l[4], l[5]
            for v in escolhidas:
                s = spec_var(v, modelo)
                if not s or v["id"] in out or nome != s[0] or nivel != s[1]:
                    continue
                if v["acumulada"]:
                    if "hour acc fcst" in tipo and "-" in tipo.split()[0] and "day" not in tipo:
                        a, b = tipo.split()[0].split("-")
                        out[v["id"]] = (arq, (ini, fim), (int(a), int(b)))
                elif (tipo.endswith("hour fcst") or tipo == "anl") and "-" not in tipo.split()[0]:
                    out[v["id"]] = (arq, (ini, fim), None)
        return out
    # ECMWF: índice JSON por arquivo (0,1° tem arquivos separados de superfície e de níveis de pressão)
    levtypes = sorted({(spec_var(v, modelo) or (0, "sfc"))[1] for v in escolhidas})
    entradas: dict[str, list[dict]] = {}
    for lt in {("pl" if x == "pl" else "sfc") for x in levtypes}:
        idx = http(url_indice(modelo, rodada, passo, lt))
        if idx:
            entradas[lt] = [json.loads(l) for l in idx.decode().splitlines() if l]
    for v in escolhidas:
        s = spec_var(v, modelo)
        if not s or not isinstance(s, tuple):
            continue
        p, lt, nivel, _ = s
        for e in entradas.get("pl" if lt == "pl" else "sfc", []):
            if e["param"] == p and e["levtype"] == lt and (nivel is None or str(e.get("levelist")) == str(nivel)):
                out[v["id"]] = (url_ecmwf(cfg, rodada, passo, lt), (e["_offset"], e["_offset"] + e["_length"] - 1), None)
                break
    return out


# ------------------------------------------------------------------ processamento
def processar(modelo: str, rodada: str, passos: list[int], saida: Path) -> dict:
    cfg = MODELOS[modelo]
    dom = cfg["dominio"]
    permitidas = cfg.get("vars")
    escolhidas = [v for v in V if spec_var(v, modelo) and (permitidas is None or v["id"] in permitidas)]
    grade: dict[str, dict[int, np.ndarray]] = {v["id"]: {} for v in escolhidas}
    geometria: dict = {}

    def trabalho(passo: int):
        res = {}
        for vid, (arq, faixa, intervalo) in mensagens(modelo, rodada, passo, escolhidas).items():
            bruto = http(arq, faixa)
            if bruto:
                try:
                    res[vid] = (decodificar(bruto, dom), intervalo)
                except Exception as exc:  # noqa: BLE001
                    print(f"  falha decodificando {vid} f{passo}: {exc}", file=sys.stderr)
        return passo, res

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=10) as ex:
        resultados = dict(ex.map(trabalho, passos))
    print(f"[{modelo} {rodada}] baixado e decodificado em {time.time()-t0:.0f} s", flush=True)

    por_id = {v["id"]: v for v in escolhidas}
    for passo in passos:
        for vid, ((vals, lats, lons), intervalo) in resultados.get(passo, {}).items():
            geometria = geometria or {"lats": lats, "lons": lons}
            v = por_id[vid]
            fn = spec_var(v, modelo)[2] if MODELOS[modelo]["tipo"] == "gfs" else spec_var(v, modelo)[3]
            arr = fn(vals)
            if v["acumulada"] and cfg["tipo"] == "gfs":  # blocos de 3/6 h do GFS -> acumulado desde o início
                a, _b = intervalo
                base = grade[vid].get(a) if a > 0 else np.zeros_like(arr)
                if base is None:
                    continue
                arr = base + arr
            grade[vid][passo] = arr
    if not geometria:
        raise SystemExit("nenhum dado decodificado")
    shape = (len(geometria["lats"]), len(geometria["lons"]))
    for vid in ("tp", "cp"):  # sem acumulado no passo 0
        if vid in grade and passos[0] == 0:
            grade[vid][0] = np.zeros(shape)
    # derivadas do ECMWF
    if cfg["tipo"] == "ecmwf":
        if "rh2m" in grade:
            for p in passos:
                if p in grade["t2m"] and p in grade["td2m"]:
                    grade["rh2m"][p] = rh_td(grade["t2m"][p], grade["td2m"][p])
        for n in (925, 850, 700, 500):  # AIFS não publica umidade relativa em níveis: calcula de T e q
            vid = f"r{n}"
            if vid in grade and not grade[vid] and f"t{n}" in grade and f"q{n}" in grade:
                for p in passos:
                    if p in grade[f"t{n}"] and p in grade[f"q{n}"]:
                        grade[vid][p] = rh_q(grade[f"t{n}"][p], grade[f"q{n}"][p] / 1000, n)

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
            dados.append(np.where(np.isnan(a), NULO, np.clip(a, -32767, 32767)).astype(int).ravel().tolist())
        doc = {
            "v": 1, "modelo": modelo, "run": rodada, "var": v["id"], "un": v["un"], "nx": len(lons), "ny": len(lats),
            "lat0": float(lats[0]), "lon0": float(lons[0]), "dlat": float(round(lats[0] - lats[1], 4)), "dlon": float(round(lons[1] - lons[0], 4)),
            "passos": ps, "fator": v["fator"], "nulo": NULO, "dados": dados,
        }
        (saida / f"{v['id']}.json").write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        catalogo.append({"id": v["id"], "rotulo": v["rotulo"], "un": v["un"], "grupo": v["grupo"], "paleta": v["paleta"], "acumulada": v["acumulada"], "passos": ps})
    meta = {"modelo": modelo, "run": rodada, "gerado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "dominio": dom, "passos": passos, "variaveis": catalogo}
    (saida / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"[{modelo} {rodada}] {len(catalogo)} variáveis, {len(passos)} passos", flush=True)
    return meta


def main() -> int:
    from conjuntos import CONJUNTOS, processar_conjunto  # noqa: PLC0415
    from icon import CFG as CFG_ICON  # noqa: PLC0415

    ap = argparse.ArgumentParser()
    ap.add_argument("--modelo", choices=sorted(list(MODELOS) + list(CONJUNTOS) + ["icon"]), required=True)
    ap.add_argument("--saida", required=True)
    ap.add_argument("--rodada")
    ap.add_argument("--max-passos", type=int)
    ap.add_argument("--so-se-nova", help="pasta publicada: não faz nada se já tem esta rodada")
    a = ap.parse_args()
    ens = a.modelo in CONJUNTOS
    cfg = CONJUNTOS[a.modelo] if ens else (CFG_ICON if a.modelo == "icon" else MODELOS[a.modelo])
    passos = cfg["passos"][: a.max_passos] if a.max_passos else cfg["passos"]
    teste = min(cfg["teste"], passos[-1])
    rodada = a.rodada or (CONJUNTOS_RODADA(a.modelo, teste) if ens else (RODADA_ICON(teste) if a.modelo == "icon" else rodada_mais_recente(a.modelo, teste)))
    if not rodada:
        print("nenhuma rodada completa encontrada", file=sys.stderr)
        return 1
    if a.so_se_nova:
        m = Path(a.so_se_nova) / a.modelo / "meta.json"
        if m.exists() and json.loads(m.read_text(encoding="utf-8")).get("run") == rodada:
            print(f"[{a.modelo}] rodada {rodada} já publicada; nada a fazer")
            return 0
    if ens:
        processar_conjunto(a.modelo, rodada, passos, Path(a.saida) / a.modelo)
    elif a.modelo == "icon":
        from icon import processar_icon  # noqa: PLC0415

        processar_icon(rodada, passos, Path(a.saida) / "icon")
    else:
        processar(a.modelo, rodada, passos, Path(a.saida) / a.modelo)
    return 0


def RODADA_ICON(teste: int) -> str | None:  # noqa: N802
    from icon import rodada_icon  # noqa: PLC0415

    return rodada_icon(teste)


def CONJUNTOS_RODADA(modelo: str, teste: int) -> str | None:  # noqa: N802
    from conjuntos import rodada_conjunto  # noqa: PLC0415

    return rodada_conjunto(modelo, teste)


if __name__ == "__main__":
    sys.exit(main())
