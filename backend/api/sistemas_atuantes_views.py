import datetime

from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import SistemaAtuanteDia
from core.sistemas_atuantes import CATALOGO, IDS


def _item(o):
    return {"data": o.data.isoformat(), "sistemas": o.sistemas, "outro": o.outro, "atualizado_por": o.atualizado_por, "atualizado_em": o.atualizado_em}


class SistemasAtuantesView(APIView):
    """GET `?data=AAAA-MM-DD` (padrão: hoje) → registro do dia + o último registro anterior (para repetir); GET `?mes=AAAA-MM` → os dias do mês;
    PUT/POST `{data, sistemas:[códigos], outro}` grava (lista e texto vazios apagam o registro do dia)."""

    def get(self, request):
        if mes := request.query_params.get("mes"):
            try:
                ano, m = (int(x) for x in mes.split("-"))
                ini = datetime.date(ano, m, 1)
            except ValueError:
                return Response({"detail": "mês inválido (use AAAA-MM)."}, status=400)
            fim = datetime.date(ano + (m == 12), m % 12 + 1, 1)
            dias = [_item(o) for o in SistemaAtuanteDia.objects.filter(data__gte=ini, data__lt=fim).order_by("data")]
            return Response({"mes": mes, "dias": dias, "catalogo": CATALOGO})
        from django.utils import timezone

        bruto = request.query_params.get("data") or timezone.localdate().isoformat()
        try:
            dia = datetime.date.fromisoformat(bruto)
        except ValueError:
            return Response({"detail": "data inválida (use AAAA-MM-DD)."}, status=400)
        atual = SistemaAtuanteDia.objects.filter(data=dia).first()
        anterior = SistemaAtuanteDia.objects.filter(data__lt=dia).order_by("-data").first()
        base = _item(atual) if atual else {"data": dia.isoformat(), "sistemas": [], "outro": "", "atualizado_por": "", "atualizado_em": None}
        return Response({**base, "anterior": _item(anterior) if anterior else None, "catalogo": CATALOGO})

    def put(self, request):
        try:
            dia = datetime.date.fromisoformat(str(request.data.get("data", "")))
        except ValueError:
            return Response({"detail": "data inválida (use AAAA-MM-DD)."}, status=400)
        sistemas = request.data.get("sistemas") or []
        if not isinstance(sistemas, list) or any(x not in IDS for x in sistemas):
            return Response({"detail": "sistema fora do catálogo."}, status=400)
        sistemas = list(dict.fromkeys(sistemas))
        outro = " ".join(str(request.data.get("outro") or "").split())
        if len(outro) > 80:
            return Response({"detail": "O sistema em texto livre aceita até 80 caracteres."}, status=400)
        if not sistemas and not outro:
            SistemaAtuanteDia.objects.filter(data=dia).delete()
            return Response({"data": dia.isoformat(), "sistemas": [], "outro": "", "atualizado_por": "", "atualizado_em": None})
        quem = request.user
        nome = quem.first_name or quem.username
        obj, criado = SistemaAtuanteDia.objects.get_or_create(data=dia, defaults={"sistemas": sistemas, "outro": outro, "criado_por": nome, "atualizado_por": nome})
        if not criado:
            obj.sistemas, obj.outro, obj.atualizado_por = sistemas, outro, nome
            obj.save()
        return Response(_item(obj), status=201 if criado else 200)

    post = put
