"""
Proxy para o "Radar Tool" do INEA (radartool.inea.rj.gov.br) — pedido do
usuário (02/10/2026): imagens de radar de Guaratiba e Macaé. Achado ao
investigar: esse site é um AGREGADOR que já re-hospeda os 6 radares
meteorológicos do estado (Guaratiba, Macaé, Mendanha, Niterói, Pico do
Couto/REDEMET, Sumaré) e ainda tem um mosaico combinando todos — então
também resolve o pedido anterior (radares de Sumaré/Mendanha do site
próprio do Alerta Rio, `sistema-alerta-rio.com.br`), que não dava pra
integrar direto: aquele site tem proteção anti-robô (Cloudflare
"js-challenge", confirmado navegando — nosso backend não executa
JavaScript pra resolver o desafio) e, pelo navegador, CORS bloqueado.

Por que passa pelo BACKEND e não direto do navegador (como o radar de
Niterói em `MapView.tsx`): testado em produção — `frames.php` BLOQUEIA
CORS cross-origin (erro "Failed to fetch" direto do navegador), mas aceita
numa chamada servidor-a-servidor normal. As imagens PNG em si (sem essa
restrição, confirmado) o frontend carrega direto da URL, só os METADADOS
(lista de quadros/timestamps) passam por aqui — mesmo padrão do proxy da
REDEMET/Niterói.

Endpoint real (achado inspecionando o JS do site, NÃO documentado):
GET /radar-tool/frames.php?type=mosaic&product=zh&hours=N&max=M
GET /radar-tool/frames.php?type=radar&radar={gua|mac|mdn|nit|sumare|picocouto}&product=zh&hours=N&max=M
Devolve `{"images": [...], "labels": [...], "step_min": N}` — `images` são
caminhos relativos (prefixar com o host), `labels` são "DD/MM/AAAA HH:MM"
em hora LOCAL (BRT, UTC-3). Confirmado: tentar `type={codigo}` direto
(sem o `type=radar&radar=`) devolve 400 — é fácil errar isso lendo só o
código-fonte do app (o comentário no `radar-tool.js` fala de um esquema
de nome de arquivo "chutado" que é só um fallback antigo/não usado pelo
fluxo real do seletor de radar).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta
from pathlib import Path

import requests
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("ingestion")

BASE_URL = "https://radartool.inea.rj.gov.br/radar-tool"

# Bounds de cada radar — extraídos do objeto `radars = {...}` em
# radar-tool.js (02/10/2026). Formato Leaflet
# [[lat_min, lon_min], [lat_max, lon_max]].
RADARS_INDIVIDUAIS = {
    "gua": {"nome": "Guaratiba", "bounds": [[-25.245533, -46.027562], [-20.741028, -41.148357]]},
    "mac": {"nome": "Macaé", "bounds": [[-24.658085, -44.289624], [-20.153580, -39.431300]]},
    "mdn": {"nome": "Mendanha", "bounds": [[-23.902436, -44.690795], [-21.745924, -42.355785]]},
    "sumare": {"nome": "Sumaré", "bounds": [[-24.431567, -45.336972], [-21.478793, -41.159092]]},
}
MOSAICO_BOUNDS = [[-25.4953147027027, -45.81454047058824], [-20.089909297297297, -39.93218752941176]]

CACHE_TTL_SEGUNDOS = 120
CACHE_TTL_ANIMACAO_SEGUNDOS = 120

# Alguns backends PHP de órgão público bloqueiam/falham com o User-Agent
# padrão do `requests` ("python-requests/x.x") — um User-Agent e Referer
# de navegador normal (a mesma página pública que qualquer visitante
# acessa) resolve.
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://radartool.inea.rj.gov.br/radar-tool/",
}


# O servidor do INEA NÃO envia o certificado intermediário (Sectigo Public
# Server Authentication CA DV R36) — navegadores o buscam sozinhos via AIA,
# o Python/`requests` não, e dá "unable to get local issuer certificate"
# (reproduzido local e em produção; atualizar o certifi não resolve).
# Bundle = CAs do certifi + esse intermediário, só pra esta origem.
_CA_BUNDLE = str(Path(__file__).parent / "certs" / "inea-ca-bundle.pem")


def _get_com_retentativa(url: str, params: dict, tries: int = 3, timeout: int = 20) -> requests.Response:
    """Mesmo padrão de retry usado pra REDEMET/Niterói."""
    ultimo_erro: Exception | None = None
    for tentativa in range(tries):
        try:
            resp = requests.get(url, params=params, headers=_HEADERS, timeout=timeout, verify=_CA_BUNDLE)
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            ultimo_erro = exc
            time.sleep(1.5 * (tentativa + 1))
    raise ultimo_erro  # type: ignore[misc]


class INEARadarImageryView(APIView):
    """GET /api/imagery/radar-inea/?tipo=mosaic|gua|mac|mdn|sumare&anima=1..15"""

    def get(self, request):
        tipo = request.query_params.get("tipo", "mosaic")
        if tipo != "mosaic" and tipo not in RADARS_INDIVIDUAIS:
            opcoes = ["mosaic", *RADARS_INDIVIDUAIS]
            return Response({"detail": f"tipo inválido, use um de: {opcoes}"}, status=400)

        anima_str = request.query_params.get("anima")
        animado = bool(anima_str)
        if animado:
            try:
                num_frames = int(anima_str)
            except ValueError:
                return Response({"detail": "anima deve ser um número inteiro"}, status=400)
            if num_frames < 1 or num_frames > 15:
                return Response({"detail": "anima deve estar entre 1 e 15"}, status=400)
        else:
            num_frames = 1

        cache_key = f"inea:radar:{tipo}:anima{num_frames}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        if tipo == "mosaic":
            params = {"type": "mosaic", "product": "zh"}
            bounds = MOSAICO_BOUNDS
        else:
            params = {"type": "radar", "radar": tipo, "product": "zh"}
            bounds = RADARS_INDIVIDUAIS[tipo]["bounds"]

        # `step_min` real varia (5 ou 10min conforme o radar) — pedimos uma
        # janela generosa (6h) e cortamos pros últimos N quadros depois,
        # em vez de calcular `hours` exato (evita pedir de menos se o passo
        # for maior que o esperado).
        params.update({"hours": 6, "max": 220})

        try:
            resp = _get_com_retentativa(f"{BASE_URL}/frames.php", params=params)
        except requests.RequestException as exc:
            logger.warning("Falha ao buscar radar do INEA (tipo=%s): %s", tipo, exc)
            return Response({"detail": "Falha ao consultar o Radar Tool do INEA."}, status=502)

        data = resp.json()
        imagens = data.get("images") or []
        labels = data.get("labels") or []
        if not imagens:
            return Response({"detail": "Nenhuma imagem de radar disponível no momento."}, status=502)

        todos = list(zip(imagens, labels))
        pares = todos[-num_frames:] if animado else todos[-1:]
        frames = [
            {"data": _label_br_para_timestamp_utc(label), "path": f"https://radartool.inea.rj.gov.br{path}"}
            for path, label in pares
        ]

        if animado:
            payload = {"tipo": tipo, "frames": frames, "bounds": bounds, "total_frames": len(frames)}
        else:
            ultimo = frames[-1]
            payload = {"tipo": tipo, "timestamp": ultimo["data"], "image_url": ultimo["path"], "bounds": bounds}

        cache.set(cache_key, payload, CACHE_TTL_ANIMACAO_SEGUNDOS if animado else CACHE_TTL_SEGUNDOS)
        return Response(payload)


def _label_br_para_timestamp_utc(label: str) -> str:
    """`frames.php` devolve o label já em hora LOCAL (BRT, UTC-3) formatado
    "DD/MM/AAAA HH:MM" — convertemos pro mesmo formato UTC "AAAA-MM-DD
    HH:MM:SS" que o frontend espera (`isoUtcFromRedemetTimestamp` em
    MapView.tsx assume UTC sem sufixo)."""
    try:
        dt_local = datetime.strptime(label, "%d/%m/%Y %H:%M")
        dt_utc = dt_local + timedelta(hours=3)
        return dt_utc.strftime("%Y-%m-%d %H:%M:%S")
    except ValueError:
        return label
