from django.core.management.base import BaseCommand

from core.models import AlertRule, RiskAlert, Station
from core.municipios_fix import corrigir_municipios


class Command(BaseCommand):
    help = "Unifica os nomes de município do banco nos 92 canônicos do RJ (Capital = Rio de Janeiro)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="só relata, não grava")

    def handle(self, *args, **opts):
        alterados, invalidos = corrigir_municipios(Station, AlertRule, RiskAlert, aplicar=not opts["dry_run"])
        self.stdout.write(f"registros {'a corrigir' if opts['dry_run'] else 'corrigidos'}: {alterados}")
        for nome, tabelas in sorted(invalidos.items()):
            self.stdout.write(f"NAO MAPEADO: {nome!r} em {', '.join(tabelas)}")
