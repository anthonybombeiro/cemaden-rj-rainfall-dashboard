from django.db import migrations


def semear_tipos(apps, schema_editor):
    T = apps.get_model("core", "SireneAcaoTipo")
    for codigo, nome, cat in [
        (4, "Retorno à normalidade", "normal"),
        (0, "Normal", "normal"),
        (1, "Mobilização", "mobilizacao"),
        (2, "Acionamento código 2 (nome a confirmar)", "outro"),
        (3, "Acionamento código 3 (nome a confirmar)", "outro"),
    ]:
        T.objects.get_or_create(
            codigo=codigo,
            defaults={
                "nome": nome,
                "categoria": cat,
                "observacao": "4/0 = normal e 1 = mobilizada, segundo o código do portal; demais nomes a confirmar." if codigo in (0, 1, 4) else "Editar nome/categoria no Admin.",
            },
        )


def niteroi_m15(apps, schema_editor):
    """Regrava as leituras de chuva de Niterói com o `m15` guardado no raw_payload
    (antes gravávamos `m05`, que captava só 1/3 de cada intervalo de coleta)."""
    Reading = apps.get_model("core", "Reading")
    qs = Reading.objects.filter(reading_type="chuva_mm", station__source__slug="niteroi")
    for r in qs.iterator():
        try:
            novo = float((r.raw_payload or {}).get("m15"))
        except (TypeError, ValueError):
            continue
        if r.value != novo:
            Reading.objects.filter(pk=r.pk).update(value=novo)


class Migration(migrations.Migration):
    dependencies = [("core", "0011_sirene_acao_tipo")]
    operations = [
        migrations.RunPython(semear_tipos, migrations.RunPython.noop),
        migrations.RunPython(niteroi_m15, migrations.RunPython.noop),
    ]
