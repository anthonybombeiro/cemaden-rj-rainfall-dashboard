from django.core.management.base import BaseCommand

from core.importacao_recomendacoes import importar


class Command(BaseCommand):
    help = "Importa a planilha de recomendações 2020-2026 (core/data/recomendacoes_planilha.json). Idempotente; --dry-run só conta."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        self.stdout.write(str(importar(dry_run=opts["dry_run"])))
