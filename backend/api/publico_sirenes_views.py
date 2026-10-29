"""Situação das sirenes para a página pública e o modo TV (sem login, só leitura)."""

from __future__ import annotations

from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import AlertEvent, SireneAcaoTipo, Station
from core.municipios import canonico_ou_original

LIMITE_TOCANDO = 60


class PublicoSirenesView(APIView):
    """GET /api/publico/sirenes/ — SEM login: quantas sirenes estão online/offline e quais estão tocando agora (nome, município, bairro, ação e desde quando).
    Não expõe endereço completo, coordenadas, telefones nem dados de manutenção."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        sirenes = list(Station.objects.filter(station_type=Station.StationType.SIRENE).only("id", "name", "municipality", "status", "raw_metadata"))
        offline = sum(1 for s in sirenes if s.status == Station.Status.INATIVA)
        ativos = {
            e["station_id"]: e
            for e in AlertEvent.objects.filter(rule__name="Sirene de alarme tocando", resolved_at__isnull=True, station_id__in=[s.id for s in sirenes])
            .order_by("-triggered_at").values("station_id", "value", "triggered_at")
        }
        tipos = {t.codigo: t.nome for t in SireneAcaoTipo.objects.all()}
        tocando = []
        for s in sirenes:
            ev = ativos.get(s.id)
            if ev is None:
                continue
            codigo = int(ev["value"]) if ev["value"] is not None else None
            tocando.append(
                {
                    "nome": s.name,
                    "municipio": canonico_ou_original(s.municipality),
                    "bairro": (s.raw_metadata or {}).get("bairro") or "",
                    "acao": (tipos.get(codigo) or "").replace(" (nome a confirmar)", "") or (f"Acionamento código {codigo}" if codigo is not None else "Acionamento"),
                    "desde": ev["triggered_at"],
                }
            )
        tocando.sort(key=lambda t: t["desde"], reverse=True)
        resposta = Response(
            {
                "gerado_em": timezone.now(),
                "total": len(sirenes),
                "online": len(sirenes) - offline,
                "offline": offline,
                "tocando_total": len(tocando),
                "tocando": tocando[:LIMITE_TOCANDO],
            }
        )
        resposta["Cache-Control"] = "public, max-age=30"
        return resposta
