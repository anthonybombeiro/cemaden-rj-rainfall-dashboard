"""2026-10-01: corrige o acumulado de chuva das sirenes com pluviômetro
(`cemaden_rj_sirenes`), inflado por leituras `tempo1` sobrepostas (ver
docstring de INTERVALO_MINIMO_LEITURA_CHUVA em
ingestion/connectors/cemaden_rj_sirenes.py — o fix em si só vale pra
leituras NOVAS; este comando reaplica a mesma regra no histórico já
gravado, removendo as leituras que ficaram sobrepostas."""

import datetime as dt

from django.core.management.base import BaseCommand

from core.models import Reading, Station
from ingestion.connectors.cemaden_rj_sirenes import INTERVALO_MINIMO_LEITURA_CHUVA, SOURCE_SLUG


class Command(BaseCommand):
    help = (
        "Remove leituras de chuva (CHUVA_MM) das sirenes com pluviômetro que ficaram "
        "sobrepostas (ver cemaden_rj_sirenes.INTERVALO_MINIMO_LEITURA_CHUVA). Por padrão só "
        "mostra o que seria removido (dry-run) — use --aplicar pra remover de verdade."
    )

    def add_arguments(self, parser):
        parser.add_argument("--aplicar", action="store_true", help="remove de verdade (sem isso, só simula)")

    def handle(self, *args, **opts):
        aplicar = opts["aplicar"]
        estacoes = Station.objects.filter(
            source__slug=SOURCE_SLUG, station_type=Station.StationType.SIRENE
        ).filter(raw_metadata__tem_pluviometro=True)

        total_removidas = 0
        total_estacoes_afetadas = 0
        ids_para_remover: list[int] = []

        for estacao in estacoes:
            leituras = list(
                Reading.objects.filter(station=estacao, reading_type=Reading.ReadingType.CHUVA_MM).order_by(
                    "timestamp"
                )
            )
            ultima: dt.datetime | None = None
            removidas_desta = 0
            for leitura in leituras:
                if ultima is not None and leitura.timestamp < ultima + INTERVALO_MINIMO_LEITURA_CHUVA:
                    ids_para_remover.append(leitura.id)
                    removidas_desta += 1
                    continue
                ultima = leitura.timestamp
            if removidas_desta:
                total_estacoes_afetadas += 1
                total_removidas += removidas_desta
                self.stdout.write(f"  {estacao.name} ({estacao.municipality}): -{removidas_desta} leituras")

        if aplicar and ids_para_remover:
            Reading.objects.filter(id__in=ids_para_remover).delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"{'REMOVIDAS' if aplicar else 'SERIAM REMOVIDAS (dry-run, use --aplicar pra confirmar)'}: "
                f"{total_removidas} leituras em {total_estacoes_afetadas} estações."
            )
        )
