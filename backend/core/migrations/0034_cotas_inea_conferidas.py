"""Cotas conferidas com a página oficial do INEA (Alerta de Cheias, 03/11/2026).

Cada estação do INEA traz no gráfico (graficos<código>.html) a "Cota de 80%" (alerta) e a "Cota de transbordamento". A planilha de
referência divergia em Rio das Flores (355 cm; INEA: 287) e Unifeso (297 cm; INEA: 196) e não tinha cota para São José do Ribeirão, Comari
e Acari. Atenção = 60% do transbordo (mesma proporção da planilha). Só atualiza se a cota ainda é a da planilha (ou não existe): nada
que alguém já tenha editado no Admin é sobrescrito."""
from django.db import migrations

# (external_id do INEA, transbordo anterior da planilha ou None, transbordo oficial em cm, rio)
COTAS = [
    ("RIO DAS FLORES", 355.0, 287.0, "Ribeirão Manoel Pereira"),
    ("UNIFESO", 297.0, 196.0, "Meudon"),
    ("SAO JOSE DO RIBEIRAO", None, 540.0, ""),
    ("COMARI", None, 380.0, ""),
    ("ACARI", None, 440.0, ""),
]


def aplicar(apps, schema_editor):
    Station = apps.get_model("core", "Station")
    Cota = apps.get_model("core", "CotaHidrologica")
    for ext, antigo, transbordo, rio in COTAS:
        est = Station.objects.filter(source__slug="inea", external_id__iexact=ext).first()
        if est is None:
            continue
        cota = Cota.objects.filter(station=est).first()
        if cota is not None and cota.inundacao_cm is not None and cota.inundacao_cm != antigo:
            continue  # já foi ajustada à mão
        valores = {
            "atencao_cm": round(transbordo * 0.6, 1),
            "alerta_cm": round(transbordo * 0.8, 1),
            "inundacao_cm": transbordo,
            "extrema_cm": None,
            "responsavel": "INEA",
            "observacao": "Conferida com a página do INEA em 03/11/2026 (alerta = cota de 80%; atenção = 60% do transbordo).",
        }
        if cota is None:
            Cota.objects.create(station=est, rio=rio, **valores)
        else:
            for campo, valor in valores.items():
                setattr(cota, campo, valor)
            cota.save()


class Migration(migrations.Migration):
    dependencies = [("core", "0033_sistema_atuante_dia")]
    operations = [migrations.RunPython(aplicar, migrations.RunPython.noop)]
