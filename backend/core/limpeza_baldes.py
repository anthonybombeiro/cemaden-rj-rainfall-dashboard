"""Limpeza dos baldes de chuva duplicados na virada do dia (17/11/2026).

Defeito (corrigido em `ingestion/connectors/base.py`): a leitura das 23:5x, coletada depois da meia-noite, gravava o total corrido do dia anterior como um balde
novo. Marca do duplicado: é a ÚLTIMA leitura de chuva do dia local da estação, feita a partir das 23:30, e seu valor é igual (±0,35 mm) à soma de todas as
leituras anteriores do mesmo dia (que já somam o total do dia) e essa soma é maior que 0,5 mm."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.utils import timezone

from core.models import Reading

FONTES_PERMITIDAS = ("plugfield", "ecowitt_paracambi", "wunderground")


def duplicados(slug: str, desde: dt.date | None = None) -> list[dict]:
    """Baldes duplicados de uma fonte, do mais antigo ao mais novo (sem apagar nada).

    Leve de propósito (a hospedagem compartilhada derruba requisições longas): em vez de ler todas as leituras, olha só a janela 23:30–24:00 de cada dia
    (intervalos explícitos, sem funções de fuso do banco) e, para cada candidato, soma as leituras anteriores do mesmo dia."""
    from django.db.models import Sum

    hoje = timezone.localdate()
    dia = desde or (hoje - dt.timedelta(days=60))
    achados = []
    while dia <= hoje:
        inicio_dia = timezone.make_aware(dt.datetime.combine(dia, dt.time.min))
        fim_dia = inicio_dia + dt.timedelta(days=1)
        base = Reading.objects.filter(station__source__slug=slug, reading_type=Reading.ReadingType.CHUVA_MM, value__gte=0)
        for cand in base.filter(timestamp__gte=fim_dia - dt.timedelta(minutes=30), timestamp__lt=fim_dia, value__gt=0.5).select_related("station"):
            if base.filter(station_id=cand.station_id, timestamp__gt=cand.timestamp, timestamp__lt=fim_dia).exists():
                continue  # não é a última leitura do dia
            antes = base.filter(station_id=cand.station_id, timestamp__gte=inicio_dia, timestamp__lt=cand.timestamp).aggregate(t=Sum("value"))["t"] or 0.0
            if antes > 0.5 and abs(cand.value - antes) <= 0.35:
                hora = timezone.localtime(cand.timestamp)
                achados.append({"id": cand.id, "estacao": cand.station.name, "municipio": cand.station.municipality, "dia": dia.isoformat(), "hora": hora.strftime("%H:%M:%S"),
                                "balde_mm": round(cand.value, 2), "soma_anterior_mm": round(antes, 2)})
        dia += dt.timedelta(days=1)
    return sorted(achados, key=lambda a: (a["dia"], a["estacao"]))


def limpar(slug: str, dry_run: bool = True, desde: dt.date | None = None) -> dict:
    if slug not in FONTES_PERMITIDAS:
        raise ValueError(f"fonte deve ser uma de {FONTES_PERMITIDAS}")
    achados = duplicados(slug, desde)
    apagados = 0
    if not dry_run and achados:
        with transaction.atomic():
            apagados = Reading.objects.filter(id__in=[a["id"] for a in achados]).delete()[0]
    return {"fonte": slug, "dry_run": dry_run, "encontrados": len(achados), "apagados_registros": apagados, "baldes": achados}
