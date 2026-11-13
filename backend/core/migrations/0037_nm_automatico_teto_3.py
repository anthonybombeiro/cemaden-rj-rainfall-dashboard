from django.db import migrations, models


def teto_3(apps, schema_editor):
    """12/11/2026: o usuário definiu que o NM automático chega a NM 3 quando algum mapa de risco está em Alto (antes o teto era NM 2)."""
    ConfiguracaoNm = apps.get_model("core", "ConfiguracaoNm")
    ConfiguracaoNm.objects.filter(pk=1).update(nivel_maximo_auto=3)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0036_verificacao_diaria"),
    ]

    operations = [
        migrations.AlterField(
            model_name="configuracaonm",
            name="nivel_maximo_auto",
            field=models.PositiveSmallIntegerField(default=3, help_text="Maior NM que o sistema pode gerar sem validação (0 a 3; NM 4 e 5 nunca)."),
        ),
        migrations.RunPython(teto_3, migrations.RunPython.noop),
    ]
