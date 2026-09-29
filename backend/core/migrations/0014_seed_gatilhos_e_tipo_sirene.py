# Gerado manualmente (2026-09-29) — dados vindos da planilha de gatilhos
# repassada pela Defesa Civil (gatilhos_pluviometricos_municipios.md) e
# preenchimento automático de tipo_sirene a partir de tem_pluviometro
# (já presente em raw_metadata desde o conector cemaden_rj_sirenes).

from django.db import migrations

# (município, GI-1h, GII-1h, GII-24h, GIII-1h, GIII-96h, GIV-1h, GIV-30d)
GATILHOS = [
    ("Areal", 45, 40, 105, 40, 140, 40, 400),
    ("Petrópolis", 45, 40, 105, 40, 140, 40, 400),
    ("Cachoeiras de Macacu", 45, 40, 105, 40, 140, 40, 400),
    ("Teresópolis", 45, 40, 105, 40, 140, 40, 400),
    ("Nova Friburgo", 45, 40, 105, 40, 140, 40, 400),
    ("Bom Jardim", 45, 40, 105, 40, 140, 40, 400),
    ("Barra Mansa", 45, 40, 85, 40, 100, 40, 270),
    ("Barra do Piraí", 45, 40, 85, 40, 100, 40, 270),
    ("Queimados", 55, 50, 100, 50, 120, 50, 270),
    ("São João de Meriti", 55, 50, 100, 50, 120, 50, 270),
    ("Magé", 55, 50, 100, 50, 120, 50, 270),
    ("Duque de Caxias", 55, 50, 100, 50, 120, 50, 270),
    ("São Gonçalo", 55, 45, 100, 45, 150, 45, 270),
]


def seed_gatilhos(apps, schema_editor):
    from core.municipios import canonico_ou_original

    GatilhoPluviometrico = apps.get_model("core", "GatilhoPluviometrico")
    for municipio, gi1h, gii1h, gii24h, giii1h, giii96h, giv1h, giv30d in GATILHOS:
        GatilhoPluviometrico.objects.update_or_create(
            municipio=canonico_ou_original(municipio),
            defaults={
                "gatilho_i_1h_mm": gi1h,
                "gatilho_ii_1h_mm": gii1h,
                "gatilho_ii_24h_mm": gii24h,
                "gatilho_iii_1h_mm": giii1h,
                "gatilho_iii_96h_mm": giii96h,
                "gatilho_iv_1h_mm": giv1h,
                "gatilho_iv_30d_mm": giv30d,
            },
        )


def unseed_gatilhos(apps, schema_editor):
    GatilhoPluviometrico = apps.get_model("core", "GatilhoPluviometrico")
    GatilhoPluviometrico.objects.filter(municipio__in=[m for m, *_ in GATILHOS]).delete()


def seed_tipo_sirene(apps, schema_editor):
    Station = apps.get_model("core", "Station")
    for station in Station.objects.filter(station_type="sirene"):
        tem_pluv = bool((station.raw_metadata or {}).get("tem_pluviometro"))
        station.tipo_sirene = "EAA+P" if tem_pluv else "EAA"
        station.save(update_fields=["tipo_sirene"])


def unseed_tipo_sirene(apps, schema_editor):
    Station = apps.get_model("core", "Station")
    Station.objects.filter(station_type="sirene").update(tipo_sirene="")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0013_sirene_gatilhos_tipo_risco_ref"),
    ]

    operations = [
        migrations.RunPython(seed_gatilhos, unseed_gatilhos),
        migrations.RunPython(seed_tipo_sirene, unseed_tipo_sirene),
    ]
