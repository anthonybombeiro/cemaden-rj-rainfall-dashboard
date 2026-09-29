from django.core.management.base import BaseCommand

from core.models import Station


class Command(BaseCommand):
    help = (
        "Preenche risco_sirene em massa pras sirenes que ainda estão em branco (2026-09-29, "
        "pedido do usuário: classificação real ainda não foi feita por sirene, então começa "
        "tudo como 'geo' por padrão e vai sendo ajustado depois, uma a uma, no Admin). "
        "Não sobrescreve quem já tem valor definido — use --forcar pra isso."
    )

    def add_arguments(self, parser):
        parser.add_argument("--valor", default=Station.RiscoSirene.GEO, choices=[c for c, _ in Station.RiscoSirene.choices])
        parser.add_argument("--forcar", action="store_true", help="sobrescreve mesmo quem já tem risco_sirene definido")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        qs = Station.objects.filter(station_type=Station.StationType.SIRENE)
        if not opts["forcar"]:
            qs = qs.filter(risco_sirene="")
        total = qs.count()
        if not opts["dry_run"]:
            qs.update(risco_sirene=opts["valor"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{'seriam atualizadas' if opts['dry_run'] else 'atualizadas'}: {total} sirenes -> risco_sirene={opts['valor']!r}"
            )
        )
