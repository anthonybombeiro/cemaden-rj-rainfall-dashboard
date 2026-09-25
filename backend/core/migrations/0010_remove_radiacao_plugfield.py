from django.db import migrations


def apaga(apps, schema_editor):
    Reading = apps.get_model("core", "Reading")
    Reading.objects.filter(reading_type="radiacao_wm2", station__source__slug="plugfield").delete()


class Migration(migrations.Migration):
    dependencies = [("core", "0009_novos_tipos_leitura")]
    operations = [migrations.RunPython(apaga, migrations.RunPython.noop)]
