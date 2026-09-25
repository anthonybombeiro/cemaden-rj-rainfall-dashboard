from django.db import migrations


def carregar(apps, schema_editor):
    from core.hidro_ref import carregar_referencia

    carregar_referencia(apps.get_model("core", "Station"), apps.get_model("core", "CotaHidrologica"))


class Migration(migrations.Migration):
    dependencies = [("core", "0007_hidro_cotas_inventario")]
    operations = [migrations.RunPython(carregar, migrations.RunPython.noop)]
