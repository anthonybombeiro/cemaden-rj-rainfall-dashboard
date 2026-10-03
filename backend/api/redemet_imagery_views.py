"""
Proxy para as camadas de imagem (satélite/radar) da API-REDEMET (DECEA) —
ver docs/redemet-api-completa.md pro levantamento completo.

Só repassamos o JSON de METADADOS (pequeno, poucos KB) — as imagens em si
(PNG, até ~1,3MB pro satélite) ficam num host estático público
(estatico-redemet.decea.mil.br) que NÃO exige a api_key; confirmado
baixando uma imagem real sem nenhum header de autenticação em 02/10/2026.
Por isso o frontend carrega o PNG direto dessa URL (fica fora do nosso
servidor, sem gastar banda/CPU nossa) — só o passo de "qual é a imagem mais
recente e quais são os limites geográficos dela" precisa da chave, então só
esse passo passa pelo backend.

`X-Api-Key` nunca é exposta ao navegador do usuário final — é lida de
`settings.REDEMET_API_KEY` (variável de ambiente) e usada só nesta chamada
servidor-a-servidor.

IMPORTANTE sobre animação: o parâmetro `anima` precisa ser repassado pra
PRÓPRIA API-REDEMET upstream (`/produtos/satelite/{tipo}?anima=N`) — é ela
quem devolve os N quadros históricos, não nós. Bug corrigido em 02/10/2026:
a primeira versão buscava sempre sem `anima` (1 imagem só) e tentava fatiar
esse resultado de 1 item em "N frames", por isso a animação sempre vinha
com 1 único quadro desatualizado.

Cache curto (Django cache default, LocMemCache se nada mais configurado):
essas imagens não mudam a cada segundo, então cachear por alguns minutos
evita bater na API-REDEMET a cada abertura do mapa por usuários diferentes.
Cache de animação tem TTL menor (mesmo intervalo de atualização do radar,
~5min) pra não prender o usuário numa sequência de quadros velha.
"""

from __future__ import annotations

import logging
import time

import requests
from django.conf import settings
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("ingestion")

BASE_URL = "https://api-redemet.decea.mil.br"
CACHE_TTL_SEGUNDOS = 300
CACHE_TTL_ANIMACAO_SEGUNDOS = 120

TIPOS_SATELITE = {"ir", "realcada", "vis"}
TIPOS_RADAR = {"maxcappi", "10km", "07km", "05km", "03km"}


def _get_com_retentativa(path: str, params: dict, tries: int = 3, timeout: int = 30) -> requests.Response:
    """Mesma instabilidade de conexão já documentada no RedemetConnector
    (ingestion/connectors/redemet.py) — retry simples resolve na prática."""
    ultimo_erro: Exception | None = None
    for tentativa in range(tries):
        try:
            resp = requests.get(
                f"{BASE_URL}{path}",
                params=params,
                headers={"X-Api-Key": settings.REDEMET_API_KEY},
                timeout=timeout,
            )
            resp.raise_for_status()
            return resp
        except requests.RequestException as exc:
            ultimo_erro = exc
            time.sleep(1.5 * (tentativa + 1))
    raise ultimo_erro  # type: ignore[misc]


def _parse_anima(anima_str: str | None) -> tuple[int | None, Response | None]:
    """Valida o parâmetro `anima` vindo do cliente. Retorna (num_frames, erro)."""
    if not anima_str:
        return None, None
    try:
        num_frames = int(anima_str)
    except ValueError:
        return None, Response({"detail": "anima deve ser um número inteiro"}, status=400)
    if num_frames < 1 or num_frames > 15:
        return None, Response({"detail": "anima deve estar entre 1 e 15"}, status=400)
    return num_frames, None


class RedemetSateliteImageryView(APIView):
    """GET /api/imagery/satelite/?tipo=realcada (default) | ir | vis &anima=1..15 (opcional)"""

    def get(self, request):
        tipo = request.query_params.get("tipo", "realcada")
        if tipo not in TIPOS_SATELITE:
            return Response({"detail": f"tipo inválido, use um de: {sorted(TIPOS_SATELITE)}"}, status=400)

        num_frames, erro = _parse_anima(request.query_params.get("anima"))
        if erro is not None:
            return erro

        if not settings.REDEMET_API_KEY:
            return Response({"detail": "REDEMET_API_KEY não configurado no servidor."}, status=503)

        animado = num_frames is not None
        cache_key = f"redemet:satelite:{tipo}:anima{num_frames}" if animado else f"redemet:satelite:{tipo}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        params = {"anima": num_frames} if animado else {}
        try:
            resp = _get_com_retentativa("/produtos/satelite/" + tipo, params=params)
        except requests.RequestException as exc:
            logger.warning("Falha ao buscar imagem de satélite da REDEMET: %s", exc)
            return Response({"detail": "Falha ao consultar a API-REDEMET."}, status=502)

        data = resp.json().get("data", {})
        imagens = data.get("satelite") or []
        if not imagens:
            return Response({"detail": "Nenhuma imagem de satélite disponível no momento."}, status=502)

        limites = data.get("lat_lon") or {}
        bounds = _bounds_leaflet(limites)

        if animado:
            payload = {
                "tipo": tipo,
                "frames": [{"data": img.get("data"), "path": img.get("path")} for img in imagens],
                "bounds": bounds,
                "total_frames": len(imagens),
            }
            cache.set(cache_key, payload, CACHE_TTL_ANIMACAO_SEGUNDOS)
        else:
            mais_recente = imagens[-1]
            payload = {
                "tipo": tipo,
                "timestamp": mais_recente.get("data"),
                "image_url": mais_recente.get("path"),
                "bounds": bounds,
            }
            cache.set(cache_key, payload, CACHE_TTL_SEGUNDOS)

        return Response(payload)


class RedemetRadarImageryView(APIView):
    """GET /api/imagery/radar/?tipo=maxcappi (default)&area=pc (default)&anima=1..15 (opcional)"""

    def get(self, request):
        tipo = request.query_params.get("tipo", "maxcappi")
        area = request.query_params.get("area", "pc")
        if tipo not in TIPOS_RADAR:
            return Response({"detail": f"tipo inválido, use um de: {sorted(TIPOS_RADAR)}"}, status=400)

        num_frames, erro = _parse_anima(request.query_params.get("anima"))
        if erro is not None:
            return erro

        if not settings.REDEMET_API_KEY:
            return Response({"detail": "REDEMET_API_KEY não configurado no servidor."}, status=503)

        animado = num_frames is not None
        cache_key = f"redemet:radar:{tipo}:{area}:anima{num_frames}" if animado else f"redemet:radar:{tipo}:{area}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        params: dict = {"area": area}
        if animado:
            params["anima"] = num_frames
        try:
            resp = _get_com_retentativa("/produtos/radar/" + tipo, params=params)
        except requests.RequestException as exc:
            logger.warning("Falha ao buscar imagem de radar da REDEMET: %s", exc)
            return Response({"detail": "Falha ao consultar a API-REDEMET."}, status=502)

        data = resp.json().get("data", {})
        # "radar" vem como lista de listas, mas a forma do aninhamento muda
        # conforme o pedido (confirmado em produção 02/10/2026 — sem
        # `anima`, ou com `anima=1`, só existe 1 grupo com 1 quadro, então
        # não dava pra notar a diferença):
        #   - SEM anima (ou anima=1): [[{quadro único}]] — 1 grupo, 1 quadro.
        #   - COM anima>1: cada grupo passou a ser 1 QUADRO NO TEMPO, com 1
        #     entrada por ÁREA pedida dentro dele — não 1 grupo por área
        #     contendo N quadros, como a doc da REDEMET dava a entender. Com
        #     uma área só (`pc`), `radar[0]` sozinho pegava só o quadro mais
        #     antigo (1 frame) e descartava os outros 14 grupos — por isso a
        #     animação de radar sempre vinha "1/1" mesmo com o satélite
        #     (estruturado diferente, 1 grupo só com N quadros dentro) já
        #     funcionando. Com várias áreas pedidas isso mudaria de novo,
        #     mas hoje só pedimos uma (`area=pc`, cobre o RJ), então "pegar o
        #     índice 0 de cada grupo" funciona pros dois formatos: quando há
        #     1 grupo com N quadros, vira 1 único "quadro" (igual antes);
        #     quando há N grupos com 1 quadro cada, vira os N quadros certos.
        grupos = data.get("radar") or []
        if len(grupos) > 1:
            imagens = [g[0] for g in grupos if g]
        else:
            imagens = grupos[0] if grupos else []
        if not imagens:
            return Response(
                {"detail": f"Nenhuma imagem de radar disponível para a área '{area}' no momento."}, status=502
            )

        if animado:
            payload = {
                "tipo": tipo,
                "area": area,
                "frames": [{"data": img.get("data"), "path": img.get("path")} for img in imagens],
                "bounds": _bounds_leaflet(imagens[-1]),
                "total_frames": len(imagens),
            }
            cache.set(cache_key, payload, CACHE_TTL_ANIMACAO_SEGUNDOS)
        else:
            mais_recente = imagens[-1]
            payload = {
                "tipo": tipo,
                "area": area,
                "timestamp": mais_recente.get("data"),
                "image_url": mais_recente.get("path"),
                "bounds": _bounds_leaflet(mais_recente),
            }
            cache.set(cache_key, payload, CACHE_TTL_SEGUNDOS)

        return Response(payload)


def _bounds_leaflet(limites: dict) -> list[list[float]] | None:
    """Converte os limites geográficos que a API-REDEMET devolve (campos
    lon_min/lon_max/lat_min/lat_max) pro formato que o Leaflet espera em
    `ImageOverlay`: [[lat_min, lon_min], [lat_max, lon_max]]."""
    try:
        return [
            [float(limites["lat_min"]), float(limites["lon_min"])],
            [float(limites["lat_max"]), float(limites["lon_max"])],
        ]
    except (KeyError, TypeError, ValueError):
        return None
