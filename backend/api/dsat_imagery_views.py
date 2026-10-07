"""
Imagens de satélite do DSAT/CPTEC-INPE (GOES-19) para o mapa — pedido do usuário
(07/10/2026), principalmente a cor verdadeira (True Color).

Fonte: `https://ftp.cptec.inpe.br/goes/goes19/goes19_web/<produto>/AAAA/MM/` — públicas,
sem login, com `Access-Control-Allow-Origin: *`. Cada quadro (a cada 10 min) tem um
`.jpg` e um world file `.jgw` (0,02°/pixel, origem -100°/12,52°). O backend só descobre
os nomes dos quadros mais recentes (listagem do diretório) e os limites geográficos;
o navegador baixa o JPG direto do CPTEC (não gastamos banda nem CPU do servidor).
"""

from __future__ import annotations

import datetime as dt
import logging
import re
import struct

import requests
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("ingestion")

BASE = "https://ftp.cptec.inpe.br/goes/goes19/goes19_web"
HEADERS = {"User-Agent": "Mozilla/5.0 (CEMADEN-RJ painel)"}
# tipo -> (diretório no CPTEC, descrição)
PRODUTOS = {
    "truecolor": ("ams_rgb_natcolor", "Cor verdadeira (True Color)"),
    "dsat_realcada": ("ams_realcada_alta", "Infravermelho realçado (DSAT)"),
    "dsat_ch13": ("ams_ret_ch13_alta", "Infravermelho canal 13 (DSAT)"),
    "dsat_ch02": ("ams_ret_ch02_alta", "Visível canal 02 (DSAT)"),
}
MAX_QUADROS = 6  # ~4 MB cada: animação limitada a 1 h
TTL_QUADROS_S = 240
TTL_BOUNDS_S = 86400


def _listar(produto: str, ano: int, mes: int) -> list[tuple[str, str]]:
    """[(timestamp 'AAAAMMDDHHMM', nome do .jpg)] em ordem crescente."""
    url = f"{BASE}/{produto}/{ano}/{mes:02d}/"
    resp = requests.get(url, headers=HEADERS, timeout=20)
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    nomes = sorted(set(re.findall(r'href="(S\d+_(\d{12})\.jpg)"', resp.text)), key=lambda t: t[1])
    return [(ts, nome) for nome, ts in nomes]


def _tamanho_jpeg(url: str) -> tuple[int, int]:
    """(largura, altura) lendo só o cabeçalho (Range) do JPEG."""
    r = requests.get(url, headers={**HEADERS, "Range": "bytes=0-65535"}, timeout=20)
    d = r.content
    i = 2
    while i + 9 < len(d):
        marcador = d[i + 1]
        tam = struct.unpack(">H", d[i + 2 : i + 4])[0]
        if marcador in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", d[i + 5 : i + 9])
            return w, h
        i += 2 + tam
    raise ValueError("cabeçalho JPEG sem SOF")


def _bounds(produto: str, ano: int, mes: int, nome_jpg: str):
    chave = f"dsat:bounds:{produto}"
    b = cache.get(chave)
    if b is not None:
        return b
    base = f"{BASE}/{produto}/{ano}/{mes:02d}/{nome_jpg}"
    jgw = requests.get(base[:-4] + ".jgw", headers=HEADERS, timeout=20).text.split()
    passo_x, passo_y, x0, y0 = float(jgw[0]), abs(float(jgw[3])), float(jgw[4]), float(jgw[5])
    largura, altura = _tamanho_jpeg(base)
    oeste, norte = x0 - passo_x / 2, y0 + passo_y / 2
    b = [[norte - altura * passo_y, oeste], [norte, oeste + largura * passo_x]]  # [[sul, oeste], [norte, leste]]
    cache.set(chave, b, TTL_BOUNDS_S)
    return b


class DsatSateliteImageryView(APIView):
    """GET /api/imagery/dsat/?tipo=truecolor|dsat_realcada|dsat_ch13|dsat_ch02 &anima=1..6 (opcional).
    Mesmo formato de /api/imagery/satelite/ (REDEMET)."""

    def get(self, request):
        tipo = request.query_params.get("tipo", "truecolor")
        if tipo not in PRODUTOS:
            return Response({"detail": f"tipo inválido, use um de: {sorted(PRODUTOS)}"}, status=400)
        try:
            n = int(request.query_params["anima"]) if request.query_params.get("anima") else None
        except ValueError:
            return Response({"detail": "anima deve ser um número inteiro"}, status=400)
        n = None if n is None else max(1, min(n, MAX_QUADROS))
        chave = f"dsat:{tipo}:{n}"
        cached = cache.get(chave)
        if cached is not None:
            return Response(cached)

        produto = PRODUTOS[tipo][0]
        agora = dt.datetime.now(dt.timezone.utc)
        try:
            quadros = [(agora.year, agora.month, q) for q in _listar(produto, agora.year, agora.month)]
            if len(quadros) < (n or 1):
                ant = (agora.replace(day=1) - dt.timedelta(days=1))
                quadros = [(ant.year, ant.month, q) for q in _listar(produto, ant.year, ant.month)] + quadros
            if not quadros:
                return Response({"detail": "Nenhuma imagem disponível no momento."}, status=502)
            quadros = quadros[-(n or 1):]
            ano, mes, (_, nome) = quadros[-1]
            bounds = _bounds(produto, ano, mes, nome)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Falha ao consultar imagens do DSAT/CPTEC (%s): %s", tipo, exc)
            return Response({"detail": "Falha ao consultar o CPTEC/INPE."}, status=502)

        def item(a, m, q):
            ts, arq = q
            data = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]} {ts[8:10]}:{ts[10:12]}:00"  # UTC, igual ao formato da REDEMET
            return {"data": data, "path": f"{BASE}/{produto}/{a}/{m:02d}/{arq}"}

        itens = [item(a, m, q) for a, m, q in quadros]
        if n is not None:
            payload = {"tipo": tipo, "frames": itens, "bounds": bounds, "total_frames": len(itens)}
        else:
            payload = {"tipo": tipo, "timestamp": itens[-1]["data"], "image_url": itens[-1]["path"], "bounds": bounds}
        cache.set(chave, payload, TTL_QUADROS_S)
        return Response(payload)
