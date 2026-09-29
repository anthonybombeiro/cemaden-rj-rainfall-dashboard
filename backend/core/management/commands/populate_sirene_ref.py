import math

from django.core.management.base import BaseCommand

from core.models import Station

# Fontes cujas estações reportam chuva de forma confiável o bastante pra
# servir de referência a uma sirene sem pluviômetro próprio — mesmo
# critério usado no endpoint `proximas` (StationViewSet), mas restrito a
# quem realmente tem CHUVA_MM (pluviométrica/meteorológica, ou sirene com
# pluviômetro acoplado).
RAIO_KM_PADRAO = 2.0


def _distancia_km(lat0, lon0, lat1, lon1):
    lat0, lon0, lat1, lon1 = map(math.radians, (lat0, lon0, lat1, lon1))
    dlat, dlon = lat1 - lat0, lon1 - lon0
    a = math.sin(dlat / 2) ** 2 + math.cos(lat0) * math.cos(lat1) * math.sin(dlon / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


class Command(BaseCommand):
    help = (
        "Preenche automaticamente o campo REF (sirene_ref) das sirenes SEM pluviômetro "
        "próprio com a estação pluviométrica/meteorológica (ou sirene+pluviômetro) mais "
        "próxima dentro de um raio (padrão 2km). Não sobrescreve REF já definido manualmente "
        "— use --forcar pra recalcular mesmo assim."
    )

    def add_arguments(self, parser):
        parser.add_argument("--raio-km", type=float, default=RAIO_KM_PADRAO)
        parser.add_argument("--forcar", action="store_true", help="recalcula mesmo quem já tem REF definido")
        parser.add_argument("--dry-run", action="store_true", help="só relata, não grava")

    def handle(self, *args, **opts):
        raio_km = opts["raio_km"]

        candidatas = list(
            Station.objects.filter(
                station_type__in=[Station.StationType.PLUVIOMETRICA, Station.StationType.METEOROLOGICA]
            ).only("id", "name", "latitude", "longitude")
        ) + list(
            Station.objects.filter(
                station_type=Station.StationType.SIRENE, tipo_sirene=Station.TipoSirene.EAA_P
            ).only("id", "name", "latitude", "longitude")
        )

        sirenes = Station.objects.filter(station_type=Station.StationType.SIRENE).exclude(
            tipo_sirene=Station.TipoSirene.EAA_P
        )
        if not opts["forcar"]:
            sirenes = sirenes.filter(sirene_ref__isnull=True)

        preenchidas = 0
        sem_candidata = 0
        for sirene in sirenes:
            melhor = None
            melhor_dist = None
            for cand in candidatas:
                if cand.id == sirene.id:
                    continue
                d = _distancia_km(sirene.latitude, sirene.longitude, cand.latitude, cand.longitude)
                if d <= raio_km and (melhor_dist is None or d < melhor_dist):
                    melhor, melhor_dist = cand, d
            if melhor is None:
                sem_candidata += 1
                self.stdout.write(f"SEM CANDIDATA (<{raio_km}km): {sirene.name}")
                continue
            preenchidas += 1
            self.stdout.write(f"{sirene.name} -> REF {melhor.name} ({melhor_dist:.2f}km)")
            if not opts["dry_run"]:
                sirene.sirene_ref_id = melhor.id
                sirene.save(update_fields=["sirene_ref"])

        self.stdout.write(
            self.style.SUCCESS(
                f"{'seriam preenchidas' if opts['dry_run'] else 'preenchidas'}: {preenchidas} · sem candidata: {sem_candidata}"
            )
        )
