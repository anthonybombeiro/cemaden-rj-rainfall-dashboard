"""Refaz o texto dos informativos cujo texto foi CORTADO pelo MySQL em utf8 de 3 bytes (parava no primeiro emoji de 4 bytes, "📅"): só sobrava o cabeçalho.
Regenera pela matriz (mesmo gerador do painel) os que não são texto livre nem importados e perderam o cenário/previsão."""

import zoneinfo

from django.db import migrations


def refazer(apps, schema_editor):
    from core import informativos as inf
    from core.models import TextFieldSeguro

    Info = apps.get_model("core", "InformativoMeteorologico")
    Cfg = apps.get_model("core", "ConfiguracaoInformativo")
    cfg = Cfg.objects.first()
    rodape = cfg.rodape if cfg else Cfg._meta.get_field("rodape").get_default()
    fuso = zoneinfo.ZoneInfo("America/Sao_Paulo")
    for i in Info.objects.filter(texto_livre=False, importado=False).iterator():
        if "PREVISÃO PARA AS PRÓXIMAS" in (i.texto or "") or not i.emitido_em:
            continue
        itens = [
            {"regiao": r.regiao, "chuva_atual": r.chuva_atual, "raios_atual": r.raios_atual, "chuva_prevista": r.chuva_prevista, "vento_previsto": r.vento_previsto,
             "raios": r.raios, "granizo": r.granizo, "isolada": r.isolada}
            for r in i.regioes.all()
        ]
        aprox = {"regioes": i.aproximacao_regioes, "intensidade": i.aproximacao_intensidade, "por": i.aproximacao_por} if i.aproximacao_regioes else None
        novo = inf.montar_texto(i.numero, i.ano, i.emitido_em.astimezone(fuso), itens, aprox, rodape)
        seguro = TextFieldSeguro().get_prep_value(novo)  # o modelo histórico é TextField comum: escapa os emojis de 4 bytes à mão
        Info.objects.filter(pk=i.pk).update(texto=seguro, texto_gerado=seguro)


class Migration(migrations.Migration):
    dependencies = [("core", "0030_informativo_publico_padrao")]
    operations = [migrations.RunPython(refazer, migrations.RunPython.noop)]
