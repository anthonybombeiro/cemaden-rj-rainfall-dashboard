"""Gera frontend/public/praias-rj.json: praias nomeadas do Estado do Rio de Janeiro (OpenStreetMap), com município e coordenadas.

Uso (fora do servidor, precisa de internet):
    python backend/scripts/gerar_praias_rj.py

Fonte: OpenStreetMap (natural=beach com nome) via Overpass API, licença ODbL — citar "© OpenStreetMap contributors".
O município vem do ponto-em-polígono com frontend/public/rj_municipios.geojson (malha do IBGE já usada no painel).
Mantém só nomes que começam por "Praia"/"Prainha(s)" (remove ilhas, clubes, nomes soltos) e junta duplicatas (mesmo nome e município),
ficando com a que tem mais detalhes no OSM. Pedido do usuário, 20/10/2026 (marés e condições para cada praia do Estado).
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "frontend" / "public" / "praias-rj.json"
MUNICIPIOS = RAIZ / "frontend" / "public" / "rj_municipios.geojson"
CONSULTA = '[out:json][timeout:90];area["ISO3166-2"="BR-RJ"]->.a;(nwr["natural"="beach"]["name"](area.a););out center tags;'


ESPELHOS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]


def baixar() -> list:
    """Tenta cada espelho do Overpass algumas vezes (o serviço público devolve 502/504 em horários de pico)."""
    dados = urllib.parse.urlencode({"data": CONSULTA}).encode()
    ultimo = None
    for tentativa in range(3):
        for url in ESPELHOS:
            req = urllib.request.Request(url, data=dados, headers={"User-Agent": "cemaden-rj-painel/1.0 (contato institucional)", "Accept": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    return json.load(r)["elements"]
            except Exception as e:  # noqa: BLE001
                ultimo = e
                print(f"falhou {url}: {e}", file=sys.stderr)
        time.sleep(10 * (tentativa + 1))
    raise RuntimeError(f"Overpass indisponível: {ultimo}")


def aneis(geom: dict):
    if geom["type"] == "Polygon":
        yield geom["coordinates"]
    else:
        yield from geom["coordinates"]


def dentro(lon: float, lat: float, anel: list) -> bool:
    ok = False
    j = len(anel) - 1
    for i in range(len(anel)):
        xi, yi = anel[i][0], anel[i][1]
        xj, yj = anel[j][0], anel[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            ok = not ok
        j = i
    return ok


def municipio_de(lon: float, lat: float, feats: list):
    for f in feats:
        for poligono in aneis(f["geometry"]):
            if dentro(lon, lat, poligono[0]) and not any(dentro(lon, lat, b) for b in poligono[1:]):
                return f["properties"]["nome"]
    # praia na linha de costa pode cair um pouco fora do polígono do IBGE: usa o município do vértice mais próximo (até ~4 km)
    melhor, dist = None, 0.04
    for f in feats:
        for poligono in aneis(f["geometry"]):
            for x, y in poligono[0]:
                d = ((x - lon) ** 2 + (y - lat) ** 2) ** 0.5
                if d < dist:
                    melhor, dist = f["properties"]["nome"], d
    return melhor


def main() -> int:
    feats = json.loads(MUNICIPIOS.read_text(encoding="utf-8"))["features"]
    brutos = baixar()
    por_chave = {}
    for e in brutos:
        nome = e["tags"]["name"].strip()
        if not re.match(r"^(Praia|Prainha|Prainhas)\b", nome):
            continue
        lat = e.get("lat") or e["center"]["lat"]
        lon = e.get("lon") or e["center"]["lon"]
        mun = municipio_de(lon, lat, feats)
        if mun is None:  # fora da malha (mar aberto/ilha sem município): descarta
            continue
        chave = (nome.lower(), mun)
        if chave not in por_chave or len(e["tags"]) > len(por_chave[chave][0]["tags"]):
            por_chave[chave] = (e, lat, lon, mun)
    praias = sorted(
        ({"n": e["tags"]["name"].strip(), "m": mun, "lat": round(lat, 5), "lon": round(lon, 5)} for e, lat, lon, mun in por_chave.values()),
        key=lambda x: (x["m"], x["n"]),
    )
    SAIDA.write_text(json.dumps(praias, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(praias)} praias em {len({p['m'] for p in praias})} municípios -> {SAIDA}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
