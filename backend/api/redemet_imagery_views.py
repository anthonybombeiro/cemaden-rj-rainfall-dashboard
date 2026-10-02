"""
Proxy para as camadas de imagem (satélite/radar) da API-REDEMET (DECEA) —
ver docs/fontes-de-dados.md (seção REDEMET) pro levantamento completo.

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

Cache curto (Django cache default, LocMemCache se nada mais configurado):
essas imagens não mudam a cada segundo, então cachear por alguns minutos
evita bater na API-REDEMET a cada abertura do mapa por usuários diferentes.
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


class RedemetSateliteImageryView(APIView):
    """GET /api/imagery/satelite/?tipo=realcada (default) | ir | vis"""

    def get(self, request):
        tipo = request.query_params.get("tipo", "realcada")
        if tipo not in TIPOS_SATELITE:
            return Response({"detail": f"tipo inválido, use um de: {sorted(TIPOS_SATELITE)}"}, status=400)

        cache_key = f"redemet:satelite:{tipo}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        if not settings.REDEMET_API_KEY:
            return Response({"detail": "REDEMET_API_KEY não configurado no servidor."}, status=503)

        try:
            resp = _get_com_retentativa("/produtos/satelite/" + tipo, params={})
        except requests.RequestException as exc:
            logger.warning("Falha ao buscar imagem de satélite da REDEMET: %s", exc)
            return Response({"detail": "Falha ao consultar a API-REDEMET."}, status=502)

        data = resp.json().get("data", {})
        imagens = data.get("satelite") or []
        if not imagens:
            return Response({"detail": "Nenhuma imagem de satélite disponível no momento."}, status=502)

        mais_recente = imagens[-1]
        limites = data.get("lat_lon") or {}
        payload = {
            "tipo": tipo,
            "timestamp": mais_recente.get("data"),
            "image_url": mais_recente.get("path"),
            "bounds": _bounds_leaflet(limites),
        }
        cache.set(cache_key, payload, CACHE_TTL_SEGUNDOS)
        return Response(payload)


class RedemetRadarImageryView(APIView):
    """GET /api/imagery/radar/?tipo=maxcappi (default)&area=pc (default —
    único radar que cobre o RJ, ver docs/fontes-de-dados.md)."""

    def get(self, request):
        tipo = request.query_params.get("tipo", "maxcappi")
        area = request.query_params.get("area", "pc")
        if tipo not in TIPOS_RADAR:
            return Response({"detail": f"tipo inválido, use um de: {sorted(TIPOS_RADAR)}"}, status=400)

        cache_key = f"redemet:radar:{tipo}:{area}"
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        if not settings.REDEMET_API_KEY:
            return Response({"detail": "REDEMET_API_KEY não configurado no servidor."}, status=503)

        try:
            resp = _get_com_retentativa("/produtos/radar/" + tipo, params={"area": area})
        except requests.RequestException as exc:
            logger.warning("Falha ao buscar imagem de radar da REDEMET: %s", exc)
            return Response({"detail": "Falha ao consultar a API-REDEMET."}, status=502)

        data = resp.json().get("data", {})
        # Formato real observado: "radar" é uma lista de listas (um grupo por
        # área pedida); como só pedimos uma área por vez, usamos radar[0].
        grupos = data.get("radar") or []
        imagens = grupos[0] if grupos else []
        if not imagens:
            return Response(
                {"detail": f"Nenhuma imagem de radar disponível para a área '{area}' no momento."}, status=502
            )

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
