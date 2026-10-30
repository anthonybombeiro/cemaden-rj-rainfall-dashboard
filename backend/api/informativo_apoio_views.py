"""Apoio ao plantão do informativo (sugestões a partir de estações e previsão, verificação, fila de revisão da importação).

Só leitura e sugestão, exceto `resolver` (completa um informativo antigo da fila). Documentação: docs/informativo-meteorologico.md."""

from __future__ import annotations

import datetime as dt

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from core import importacao_informativos as imp
from core import informativo_apoio as apoio
from core import informativos as inf
from core.models import InformativoMeteorologico

from .informativo_views import _itens, _serializa, _usuario
from .inea_radar_views import _get_com_retentativa

MAX_DIAS_VERIFICACAO = 90
MAX_INFORMATIVOS_VERIFICACAO = 40


class InformativoApoioView(APIView):
    """GET /api/informativos/apoio/ — o que as estações e a previsão do dia sugerem para a matriz (F9, F10) e as regiões descobertas (F12)."""

    def get(self, request):
        agora = timezone.now()
        chuva = apoio.chuva_atual_cacheada()
        previsao = apoio.previsao_do_dia_por_redec()
        ultimo = InformativoMeteorologico.objects.filter(estado="enviado").order_by("-enviado_em").first()
        sugestao = []
        for regiao in inf.ORDEM_TEXTO:
            c, p = chuva.get(regiao), previsao.get(regiao)
            if not c and not p:
                continue
            item = {"regiao": regiao, "chuva_atual": c["intensidade_sugerida"] if c else "", "raios_atual": False, "chuva_prevista": "", "raios": False, "motivos": []}
            if c:
                item["motivos"].append(f"{c['rotulo']} agora: {c['max_1h_mm']} mm/h em {c['estacao']} ({c['municipio']})")
            if p:
                item["chuva_prevista"], item["raios"] = p["chuva_prevista"], p["raios"]
                item["motivos"].append(f"Previsão do dia: {p['icone']}")
            if c and inf.gravidade(item["chuva_prevista"]) < inf.gravidade(item["chuva_atual"]) and apoio.ORDEM_CLASSE[c["classe"]] >= 2:
                item["chuva_prevista"] = item["chuva_atual"]  # a chuva já está acima do que o ícone da previsão sugere: não propor menos
                item["motivos"].append("Previsão sugerida igual à chuva atual (continuidade).")
            sugestao.append(item)
        vigente = _vigente(agora)
        descobertas = apoio.regioes_descobertas(vigente["itens"], chuva) if vigente else []
        return Response(
            {
                "gerado_em": agora,
                "chuva_atual": chuva,
                "previsao_do_dia": previsao,
                "sugestao": sugestao,
                "descobertas": descobertas,
                "ultimo": {"numero": ultimo.numero, "ano": ultimo.ano, "emitido_em": ultimo.emitido_em, "itens": _itens(ultimo)} if ultimo else None,
                "aviso": "Sugestão: confirme cada região antes de gerar o texto. A chuva vem das estações com leitura dos últimos 90 min (escala única de chuva em 1 h).",
            }
        )


def _vigente(agora: dt.datetime) -> dict | None:
    from .informativo_views import _vigente_ate

    i = InformativoMeteorologico.objects.filter(estado="enviado").order_by("-enviado_em").first()
    ate = _vigente_ate(i) if i else None
    if not i or not ate or ate <= agora:
        return None
    return {"numero": i.numero, "ano": i.ano, "vigente_ate": ate, "itens": _itens(i)}


class InformativoVerificacaoView(APIView):
    """GET /api/informativos/verificacao/?dias=30 — F26: previsão do informativo × chuva medida nas 6 h seguintes (só janelas já fechadas)."""

    def get(self, request):
        try:
            dias = max(1, min(int(request.query_params.get("dias") or 30), MAX_DIAS_VERIFICACAO))
        except ValueError:
            dias = 30
        desde = timezone.now() - dt.timedelta(days=dias)
        qs = (
            InformativoMeteorologico.objects.filter(estado="enviado", importado=False, emitido_em__gte=desde)
            .order_by("-emitido_em").prefetch_related("regioes")[:MAX_INFORMATIVOS_VERIFICACAO]
        )
        r = apoio.verificar([{"numero": i.numero, "ano": i.ano, "emitido_em": i.emitido_em, "itens": _itens(i)} for i in qs])
        r["dias"] = dias
        r["observacao"] = "Informativos importados da planilha ficam de fora (a planilha não tem a hora exata de cada região). Só entram janelas de 6 h já encerradas."
        return Response(r)


class ImportacaoRevisaoView(APIView):
    """GET /api/informativos/importacao-revisao/ — fila F24: informativos da planilha sem data utilizável, ainda fora do banco. POST `resolver`
    ({ano, numero, data AAAA-MM-DD, hora HH:MM}) completa um deles."""

    def get(self, request):
        return Response({"pendentes": imp.pendentes_do_arquivo()})

    def post(self, request):
        d = request.data or {}
        try:
            ano, numero = int(d["ano"]), int(d["numero"])
            dia = dt.date.fromisoformat(str(d["data"]))
            h, m = str(d["hora"]).split(":")[:2]
            quando = timezone.make_aware(dt.datetime.combine(dia, dt.time(int(h), int(m))))
        except (KeyError, ValueError, TypeError):
            return Response({"detail": "Informe ano, número, data (AAAA-MM-DD) e hora (HH:MM) válidos."}, status=400)
        if dia.year not in (ano, ano - 1, ano + 1) or quando > timezone.now():
            return Response({"detail": "Data fora do esperado para esse informativo."}, status=400)
        try:
            i = imp.completar_pendente(ano, numero, quando)
        except ValueError as e:
            return Response({"detail": str(e)}, status=409)
        i.observacao = f"{i.observacao} Data/hora informadas por {_usuario(request)} na fila de revisão da importação."
        i.save(update_fields=["observacao"])
        return Response(_serializa(i, detalhe=False), status=201)


PREFIXO_RADAR_INEA = "https://radartool.inea.rj.gov.br/radar-tool/img/"
MAX_BYTES_RADAR = 6 * 1024 * 1024
ASSINATURA_PNG = bytes([0x89]) + b"PNG"


class InformativoRadarImagemView(APIView):
    """GET /api/informativos/radar/imagem/?url=… — F14: entrega pelo nosso servidor o quadro de radar do INEA, para o navegador poder recortar o estado e
    escrever a legenda num canvas (a imagem do INEA não libera CORS, o canvas ficaria "contaminado" e não poderia ser exportado). Só aceita PNG do Radar Tool do
    INEA (lista fechada: nunca busca outro endereço)."""

    def get(self, request):
        url = str(request.query_params.get("url") or "")
        if not url.startswith(PREFIXO_RADAR_INEA) or not url.endswith(".png") or ".." in url or "?" in url or "#" in url:
            return Response({"detail": "Endereço de radar inválido."}, status=400)
        try:
            r = _get_com_retentativa(url, {}, tries=2, timeout=20)
        except Exception:  # rede/INEA fora do ar: o compositor mostra a mensagem
            return Response({"detail": "Falha ao baixar o quadro de radar do INEA."}, status=502)
        if len(r.content) > MAX_BYTES_RADAR or not r.content.startswith(ASSINATURA_PNG):
            return Response({"detail": "Resposta inesperada do INEA."}, status=502)
        resp = HttpResponse(r.content, content_type="image/png")
        resp["Cache-Control"] = "private, max-age=120"
        return resp
