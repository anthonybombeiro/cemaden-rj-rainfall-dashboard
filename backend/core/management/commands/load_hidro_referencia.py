from django.core.management.base import BaseCommand

from core.hidro_ref import carregar_referencia
from core.models import CotaHidrologica, Station


class Command(BaseCommand):
    help = "Carrega cotas e inventário hidrológico de ingestion/data/hidro_referencia.json."

    def add_arguments(self, parser):
        parser.add_argument("--sobrescrever", action="store_true", help="reaplica tudo, inclusive cotas editadas")

    def handle(self, *args, **opts):
        atualizadas, criadas, faltando = carregar_referencia(Station, CotaHidrologica, sobrescrever=opts["sobrescrever"])
        self.stdout.write(f"estações com inventário atualizado: {atualizadas}; cotas criadas: {criadas}")
        if faltando:
            self.stdout.write(f"estações do arquivo não encontradas no banco: {faltando}")
