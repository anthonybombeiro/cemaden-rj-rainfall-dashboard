from django.db import migrations


def unifica(apps, schema_editor):
    from core.municipios_fix import corrigir_municipios

    corrigir_municipios(apps.get_model("core", "Station"), apps.get_model("core", "AlertRule"),
                        apps.get_model("core", "RiskAlert"))


class Migration(migrations.Migration):
    dependencies = [("core", "0004_alter_station_station_type")]
    operations = [migrations.RunPython(unifica, migrations.RunPython.noop)]
