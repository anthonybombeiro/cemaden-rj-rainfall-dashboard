"""Tira do informativo as duas frases finais pedidas pelo usuário (30/10/2026) — do rodapé configurado, dos textos já gravados — e devolve aos nº 193, 194 e 195
o texto exatamente como foi enviado (colado pelo usuário), porque o corte do MySQL (emoji de 4 bytes) tinha deixado 193 vazio e 194/195 só com o que a matriz regenera."""

from django.db import migrations, models

FRASES = (
    "Fiquem atentos aos informativos e alertas emitidos por nossas fontes oficiais.",
    "Sigam o perfil @defesacivil_rj para informações atualizadas.",
)

TEXTOS_ENVIADOS = {
    193: (
        "CEMADEN-RJ\nINFORMATIVO METEOROLÓGICO n°193/2026\n\n🗓 Data: 25/10/2026\n⏰ Horário: 06:37\n\nCENÁRIO ATUAL\n\n"
        "🌧 Núcleos de chuva moderada atuam nas regiões Costa Verde, Serrana I e Serrana II e Baixada Litorânea.\n\n"
        "PREVISÃO PARA AS PRÓXIMAS 06 HORAS\n\n"
        "🌧 Pancadas isoladas de chuva moderada a ocasionalmente forte nas regiões Sul I, Sul II, Serrana I, Serrana II, Costa Verde, Norte e Noroeste."
    ),
    194: (
        "CEMADEN-RJ\nINFORMATIVO METEOROLÓGICO n°194/2026\n\n🗓 Data: 29/10/2026\n⏰ Horário: 18:30\n\nCENÁRIO ATUAL\n\n"
        "🌧 Núcleos de chuva moderada atuam nas regiões Costa Verde, Sul I, Sul II, Serrana I, Capital, Baixada Fluminense e Metropolitana.\n\n"
        "PREVISÃO PARA AS PRÓXIMAS 06 HORAS\n\n"
        "🌧 Pancadas isoladas de chuva fraca a moderada em quase todo estado, com exceção as regiões Norte e Noroeste"
    ),
    195: (
        "CEMADEN-RJ\nINFORMATIVO METEOROLÓGICO n°195/2026\n📅 Data: 30/10/2026\n⏰ Horário: 00:29\n\nCENÁRIO ATUAL\n"
        "🌧 Núcleos de chuva fraca a moderada atuam nas regiões Costa Verde, Sul I, Sul II, Capital, Baixada Fluminense, Serrana I e Metropolitana.\n"
        "🌧 Núcleos de chuva fraca atuam nas regiões Serrana II e Baixada Litorânea.\n\n"
        "PREVISÃO PARA AS PRÓXIMAS 06 HORAS\n"
        "🌧 Pancadas isoladas de chuva moderada nas regiões Sul I, Sul II, Capital, Baixada Fluminense e Metropolitana.\n"
        "🌧 Chuva fraca a moderada isolada nas regiões Costa Verde, Serrana I, Serrana II e Baixada Litorânea.\n\n"
        "Em caso de mudança de cenário, a Defesa Civil Estadual atualizará as informações e emitirá os alertas necessários pelas equipes de monitoramento do CEMADEN-RJ."
    ),
}


def sem_frases(texto: str) -> str:
    linhas = [l for l in (texto or "").split("\n") if l.strip() not in FRASES]
    return "\n".join(linhas).rstrip("\n") if linhas != (texto or "").split("\n") else texto


def aplicar(apps, schema_editor):
    from core.models import TextFieldSeguro

    seguro = TextFieldSeguro().get_prep_value  # o modelo histórico é TextField comum: escapa os emojis de 4 bytes à mão
    Cfg = apps.get_model("core", "ConfiguracaoInformativo")
    for c in Cfg.objects.all():
        novo = sem_frases(c.rodape)
        if novo != c.rodape:
            Cfg.objects.filter(pk=c.pk).update(rodape=novo)
    Info = apps.get_model("core", "InformativoMeteorologico")
    for i in Info.objects.exclude(texto="").iterator():
        # o texto guardado vem com os emojis de 4 bytes escapados ({{u:HEX}}): as frases não os têm, então a comparação é direta
        novo, novo_g = sem_frases(i.texto), sem_frases(i.texto_gerado)
        if novo != i.texto or novo_g != i.texto_gerado:
            Info.objects.filter(pk=i.pk).update(texto=novo, texto_gerado=novo_g)
    for numero, texto in TEXTOS_ENVIADOS.items():
        Info.objects.filter(ano=2026, numero=numero, estado="enviado").update(texto=seguro(texto))


class Migration(migrations.Migration):
    dependencies = [("core", "0031_informativo_texto_refazer_cortados")]
    operations = [
        migrations.AlterField(
            model_name="configuracaoinformativo",
            name="rodape",
            field=models.TextField(blank=True, default="Em caso de mudança de cenário, a Defesa Civil Estadual atualizará as informações e emitirá os alertas necessários pelas equipes de monitoramento do CEMADEN-RJ."),
        ),
        migrations.RunPython(aplicar, migrations.RunPython.noop),
    ]
