"""
Imagens de satélite do DSAT/CPTEC-INPE (GOES-19) para o mapa — pedido do usuário
(07/10/2026), principalmente a cor verdadeira (True Color).

Fonte: `https://satelite.cptec.inpe.br/repositoriogoes/goes19/goes19_web/<produto>/AAAA/MM/` — públicas,
sem login (o antigo ftp.cptec.inpe.br foi esvaziado em 08/10/2026). Cada quadro (a cada 10 min) tem um
`.jpg` e um world file `.jgw` (0,02°/pixel, origem -100°/12,52°). O backend só descobre
os quadros mais recentes (HEAD nos nomes previsíveis; o servidor não lista diretórios) e os limites geográficos;
o navegador baixa o JPG direto do CPTEC (não gastamos banda nem CPU do servidor).
"""

from __future__ import annotations

import datetime as dt
import logging
import struct

import requests
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("ingestion")

BASE = "https://satelite.cptec.inpe.br/repositoriogoes/goes19/goes19_web"
HEADERS = {"User-Agent": "Mozilla/5.0 (CEMADEN-RJ painel)"}
# tipo -> (diretório, prefixo do arquivo, descrição). O diretório do ftp.cptec.inpe.br foi esvaziado
# em 08/10/2026; os arquivos seguem em satelite.cptec.inpe.br/repositoriogoes (sem listagem de
# diretório), com nome previsível `<prefixo>_AAAAMMDDHHMM.jpg` a cada 10 min (UTC).
PRODUTOS = {
    "truecolor": ("ams_rgb_natcolor", "S11161220", "Cor verdadeira (True Color)"),
    "dsat_realcada": ("ams_realcada_alta", "S11161222", "Infravermelho realçado (DSAT)"),
    "dsat_ch13": ("ams_ret_ch13_alta", "S11161113", "Infravermelho canal 13 (DSAT)"),
    "dsat_ch02": ("ams_ret_ch02_alta", "S11161102", "Visível canal 02 (DSAT; só de dia)"),
}
MAX_QUADROS = 6  # ~2,5 MB cada: animação limitada a 1 h
BUSCA_HORAS = 4  # quanto tempo para trás procurar quadros
TTL_QUADROS_S = 240
TTL_BOUNDS_S = 86400


def _url(produto: str, prefixo: str, t: dt.datetime, ext: str = "jpg") -> str:
    return f"{BASE}/{produto}/{t:%Y}/{t:%m}/{prefixo}_{t:%Y%m%d%H%M}.{ext}"


def _existe(url: str) -> bool:
    try:
        return requests.head(url, headers=HEADERS, timeout=8, allow_redirects=True).status_code == 200
    except requests.RequestException:
        return False


def _quadros(produto: str, prefixo: str, n: int) -> list[dt.datetime]:
    """Últimos `n` quadros existentes (UTC, crescente): testa cada múltiplo de 10 min das últimas
    `BUSCA_HORAS` h, em paralelo (o servidor não lista diretórios)."""
    from concurrent.futures import ThreadPoolExecutor

    agora = dt.datetime.now(dt.timezone.utc).replace(second=0, microsecond=0)
    base = agora - dt.timedelta(minutes=agora.minute % 10)
    candidatos = [base - dt.timedelta(minutes=10 * i) for i in range(BUSCA_HORAS * 6)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        achou = list(pool.map(lambda t: _existe(_url(produto, prefixo, t)), candidatos))
    existentes = sorted(t for t, ok in zip(candidatos, achou) if ok)
    return existentes[-n:]


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


def _bounds(produto: str, prefixo: str, t: dt.datetime):
    chave = f"dsat:bounds:{produto}"
    b = cache.get(chave)
    if b is not None:
        return b
    jgw = requests.get(_url(produto, prefixo, t, "jgw"), headers=HEADERS, timeout=20).text.split()
    passo_x, passo_y, x0, y0 = float(jgw[0]), abs(float(jgw[3])), float(jgw[4]), float(jgw[5])
    largura, altura = _tamanho_jpeg(_url(produto, prefixo, t))
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

        produto, prefixo, _ = PRODUTOS[tipo]
        try:
            quadros = _quadros(produto, prefixo, n or 1)
            if not quadros:
                return Response({"detail": "Nenhuma imagem recente disponível para este produto (o visível só existe de dia)."}, status=502)
            bounds = _bounds(produto, prefixo, quadros[-1])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Falha ao consultar imagens do DSAT/CPTEC (%s): %s", tipo, exc)
            return Response({"detail": "Falha ao consultar o CPTEC/INPE."}, status=502)

        itens = [
            {"data": f"{t:%Y-%m-%d %H:%M}:00", "path": _url(produto, prefixo, t)}  # UTC, igual ao formato da REDEMET
            for t in quadros
        ]
        if n is not None:
            payload = {"tipo": tipo, "frames": itens, "bounds": bounds, "total_frames": len(itens)}
        else:
            payload = {"tipo": tipo, "timestamp": itens[-1]["data"], "image_url": itens[-1]["path"], "bounds": bounds}
        cache.set(chave, payload, TTL_QUADROS_S)
        return Response(payload)
