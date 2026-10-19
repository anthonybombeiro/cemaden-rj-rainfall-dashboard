"""
Sondagem atmosférica NUMÉRICA (perfil + índices) da Universidade de Wyoming — pedido do usuário (19/10/2026):
"não descarte a parte textual da sondagem de Wyoming (CAPE/CIN)".

O site de Wyoming (weather.uwyo.edu) não libera CORS, então o navegador não consegue ler a página; este endpoint
baixa, interpreta e devolve JSON. As imagens (Skew-T) do INMET e do CPTEC continuam vindo direto dos servidores deles.

GET /api/sondagem/numerica/?estacao=83746&data=AAAA-MM-DD&hora=00|12
→ {"estacao","data","hora","fonte","indices":{SHOW:{"nome","valor","unidade"},...},"perfil":[{...}], "lat","lon"}

Cuidados: serviço externo sem garantia; cache em arquivo (o servidor é CGI: cache em memória não sobrevive) por 6 h
(resultado válido) ou 15 min (erro/sem dado), para não sobrecarregar a universidade.
Python 3.9: sem anotações `X | Y` em tempo de execução.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import html as html_mod
import json
import logging
import re
import time
from pathlib import Path

import requests
from django.conf import settings
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("ingestion")

URL = "https://weather.uwyo.edu/wsgi/sounding"
HEADERS = {"User-Agent": "Mozilla/5.0 (CEMADEN-RJ painel)"}
TTL_OK_S = 6 * 3600
TTL_ERRO_S = 15 * 60
RE_ESTACAO = re.compile(r"^\d{5}$")
RE_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")
COLUNAS = ["pres", "hght", "temp", "dwpt", "relh", "mixr", "drct", "sped", "thta", "thte", "thtv"]


def _dir_cache() -> Path:
    d = Path(getattr(settings, "BASE_DIR", ".")) / "cache_sondagem"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _arquivo(chave: str) -> Path:
    return _dir_cache() / (hashlib.md5(chave.encode("utf-8")).hexdigest() + ".json")


def _ler_cache(chave: str):
    p = _arquivo(chave)
    try:
        if p.exists():
            dados = json.loads(p.read_text(encoding="utf-8"))
            ttl = TTL_OK_S if dados.get("ok") else TTL_ERRO_S
            if time.time() - p.stat().st_mtime < ttl:
                return dados
    except Exception:  # noqa: BLE001
        logger.exception("Cache de sondagem ilegível")
    return None


def _gravar_cache(chave: str, dados: dict) -> None:
    try:
        _arquivo(chave).write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    except Exception:  # noqa: BLE001
        logger.exception("Falha ao gravar cache de sondagem")


def _num(txt: str):
    try:
        return float(txt)
    except (TypeError, ValueError):
        return None


def interpretar(html: str) -> dict:
    """Extrai perfil (linhas da tabela de texto) e índices (tabela HTML) da página do Wyoming."""
    out = {"indices": {}, "perfil": [], "lat": None, "lon": None}
    m = re.search(r"Latitude:\s*(-?\d+(?:\.\d+)?)\s*Longitude:\s*(-?\d+(?:\.\d+)?)", html)
    if m:
        out["lat"], out["lon"] = float(m.group(1)), float(m.group(2))
    pre = re.search(r"<PRE>(.*?)</PRE>", html, re.S | re.I)
    if pre:
        for linha in pre.group(1).splitlines():
            partes = linha.split()
            if len(partes) >= 3 and re.match(r"^\d+(\.\d+)?$", partes[0]) and re.match(r"^-?\d+(\.\d+)?$", partes[1]):
                # linhas incompletas (altos níveis sem vento) vêm com colunas em branco: alinhar pela largura fixa
                campos = [linha[i : i + 7].strip() for i in range(0, 77, 7)]
                valores = [_num(c) if c else None for c in campos[: len(COLUNAS)]]
                out["perfil"].append(dict(zip(COLUNAS, valores)))
    for tr in re.findall(r"<TR>(.*?)</TR>", html, re.S | re.I):
        tds = [html_mod.unescape(re.sub(r"<[^>]+>", "", td)).strip() for td in re.findall(r"<TD[^>]*>(.*?)</TD>", tr, re.S | re.I)]
        if len(tds) == 4 and re.match(r"^[A-Z0-9]{3,6}$", tds[0]) and _num(tds[2]) is not None:
            out["indices"][tds[0]] = {"nome": tds[1], "valor": _num(tds[2]), "unidade": tds[3]}
    return out


class SondagemNumericaView(APIView):
    def get(self, request):
        estacao = (request.query_params.get("estacao") or "83746").strip()
        data = (request.query_params.get("data") or "").strip()
        hora = (request.query_params.get("hora") or "").strip()
        if not RE_ESTACAO.match(estacao) or not RE_DATA.match(data) or hora not in ("00", "12"):
            return Response({"detail": "Parâmetros: estacao (5 dígitos), data (AAAA-MM-DD) e hora (00 ou 12)."}, status=400)
        try:
            dt.date.fromisoformat(data)
        except ValueError:
            return Response({"detail": "Data inválida."}, status=400)

        chave = "%s|%s|%s" % (estacao, data, hora)
        cache = _ler_cache(chave)
        if cache is not None:
            if cache.get("ok"):
                return Response(cache["dados"])
            return Response({"detail": cache.get("erro", "Sondagem indisponível.")}, status=404)

        params = {"datetime": "%s %s:00:00" % (data, hora), "id": estacao, "type": "TEXT:LIST"}
        try:
            r = requests.get(URL, params=params, headers=HEADERS, timeout=20)
            r.raise_for_status()
            dados = interpretar(r.text)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Sondagem Wyoming %s falhou: %s", chave, exc)
            _gravar_cache(chave, {"ok": False, "erro": "Wyoming indisponível no momento."})
            return Response({"detail": "Serviço da Universidade de Wyoming indisponível no momento."}, status=502)
        if not dados["perfil"]:
            _gravar_cache(chave, {"ok": False, "erro": "Sem sondagem para este local/horário."})
            return Response({"detail": "Sem sondagem para este local e horário."}, status=404)
        dados.update({"estacao": estacao, "data": data, "hora": hora, "fonte": "University of Wyoming (weather.uwyo.edu)"})
        _gravar_cache(chave, {"ok": True, "dados": dados})
        return Response(dados)
