"""Saúde das fontes de dados (06/10/2026).

O cron do cPanel redireciona a saída para /dev/null: se uma coleta falha, ninguém
vê. Este endpoint resume, por fonte, (1) há quanto tempo foi a última coleta e se
está além do limite esperado e (2) quantas estações pararam de reportar (tinham
leitura nas últimas 48 h e nenhuma nas últimas 4 h). A tela mostra uma faixa
quando algo está atrasado/parado.
"""

from __future__ import annotations

import datetime as dt

from django.db.models import Max
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import Reading, Source, Station

# Cadência esperada de cada fonte (min) -> limite de atraso = 3x, no mínimo 20 min.
CADENCIA_MIN = {
    "cemaden_mctic": 5,
    "alerta_rio": 5,
    "niteroi": 5,
    "plugfield": 15,
    "wunderground": 15,
    "macae_ufrj": 15,
    "inea": 15,
    "inmet": 15,
    "redemet": 15,
    "ecowitt_paracambi": 15,
}
# Sirenes têm faixa própria (`SirenesStatusView`); estas não têm coleta periódica de estações.
IGNORAR = {"cemaden_rj_sirenes", "cemaden_rj", "cemaden_nacional", "rio_chuva_bairro", "marinha_avisos"}

# Redes onde cada estação importa (sem outra rede por perto): só as paradas delas acendem a
# faixa. As demais (ex.: CEMADEN, onde ~36% das estações ficam dias sem reportar) aparecem
# nos detalhes mas não disparam o alerta — senão a faixa ficaria sempre acesa.
SENSIVEIS = {"plugfield", "macae_ufrj", "wunderground", "niteroi", "alerta_rio", "inea", "ecowitt_paracambi"}

PARADA_APOS_H = 4
JANELA_PARADA_H = 48
TIPOS_ATIVIDADE = ("chuva_mm", "temperatura_c", "nivel_m")


class FontesSaudeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        agora = timezone.now()
        fontes = {s.slug: s for s in Source.objects.filter(enabled=True)}
        estacoes = list(Station.objects.filter(source__slug__in=[s for s in fontes if s not in IGNORAR]))
        ids = [e.id for e in estacoes]

        ultima = {
            r["station_id"]: r["m"]
            for r in Reading.objects.filter(
                station_id__in=ids,
                reading_type__in=TIPOS_ATIVIDADE,
                timestamp__gte=agora - dt.timedelta(hours=JANELA_PARADA_H),
            )
            .values("station_id")
            .annotate(m=Max("timestamp"))
        }

        slug_por_id = {s.id: slug for slug, s in fontes.items()}
        por_fonte: dict[str, dict] = {}
        for e in estacoes:
            f = por_fonte.setdefault(slug_por_id[e.source_id], {"total": 0, "ativas": 0, "paradas": [], "sem_dado": 0})
            f["total"] += 1
            m = ultima.get(e.id)
            if m is None:
                f["sem_dado"] += 1
            else:
                idade_h = (agora - m).total_seconds() / 3600
                if idade_h <= PARADA_APOS_H:
                    f["ativas"] += 1
                else:
                    f["paradas"].append(
                        {"id": e.id, "nome": e.name, "municipio": e.municipality, "idade_h": round(idade_h, 1)}
                    )

        saida = []
        for slug, src in sorted(fontes.items(), key=lambda kv: kv[1].name):
            if slug in IGNORAR:
                continue
            cad = CADENCIA_MIN.get(slug, 15)
            limite = max(3 * cad, 20)
            ult = src.last_ingested_at
            idade_min = (agora - ult).total_seconds() / 60 if ult else None
            f = por_fonte.get(slug, {"total": 0, "ativas": 0, "paradas": [], "sem_dado": 0})
            paradas = sorted(f["paradas"], key=lambda p: p["idade_h"])
            saida.append(
                {
                    "slug": slug,
                    "nome": src.name,
                    "ultima_coleta": ult,
                    "idade_min": round(idade_min, 1) if idade_min is not None else None,
                    "limite_min": limite,
                    "atrasada": idade_min is None or idade_min > limite,
                    "erro": (src.last_ingest_error or "")[:200],
                    "estacoes_total": f["total"],
                    "estacoes_ativas": f["ativas"],
                    "estacoes_paradas": len(paradas),
                    "sensivel": slug in SENSIVEIS,
                    "estacoes_sem_dado_48h": f["sem_dado"],
                    "paradas": paradas[:15],
                }
            )
        return Response(
            {
                "gerado_em": agora,
                "parada_apos_h": PARADA_APOS_H,
                "resumo": {
                    "fontes_atrasadas": sum(1 for f in saida if f["atrasada"]),
                    "estacoes_paradas": sum(f["estacoes_paradas"] for f in saida if f["sensivel"]),
                    "estacoes_paradas_outras": sum(f["estacoes_paradas"] for f in saida if not f["sensivel"]),
                },
                "fontes": saida,
            }
        )
