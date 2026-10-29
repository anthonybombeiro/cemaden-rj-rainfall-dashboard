"""Previsão do tempo por REDEC para a página pública (sem login, só leitura)."""

import datetime

from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Previsao, PrevisaoDia

# Só o que o cidadão precisa ver: nada de quem cadastrou, quando ou de que origem.
CAMPOS = (
    "data", "regiao", "temperatura_maxima", "temperatura_minima", "umidade_maxima", "umidade_minima",
    "vento_velocidade", "vento_direcao", "nascer_sol", "por_sol", "comentario", "icone",
)
DIAS_PASSADO = 31
DIAS_FUTURO = 7


class PublicoPrevisaoView(APIView):
    """GET /api/publico/previsao/?data=AAAA-MM-DD — SEM login, só leitura: previsão das REDECs e texto geral do estado. Sem `data`, devolve o dia
    mais recente com previsão cadastrada. Datas explícitas ficam entre 31 dias atrás e 7 dias à frente."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        hoje = timezone.localdate()
        bruto = request.query_params.get("data")
        if bruto:
            try:
                dia = datetime.date.fromisoformat(bruto)
            except ValueError:
                return Response({"detail": "data inválida (use AAAA-MM-DD)."}, status=400)
            if not hoje - datetime.timedelta(days=DIAS_PASSADO) <= dia <= hoje + datetime.timedelta(days=DIAS_FUTURO):
                return Response({"detail": "data fora do período disponível."}, status=400)
        else:
            dia = Previsao.objects.order_by("-data").values_list("data", flat=True).first() or hoje
        previsoes = list(Previsao.objects.filter(data=dia).order_by("regiao").values(*CAMPOS))
        texto = PrevisaoDia.objects.filter(data=dia).values_list("texto_geral", flat=True).first() or ""
        resposta = Response({"data": dia.isoformat(), "texto_geral": texto, "previsoes": previsoes, "gerado_em": timezone.now()})
        resposta["Cache-Control"] = "public, max-age=60"
        return resposta
