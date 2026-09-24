from core.municipios import normalizar_para_canonico


def corrigir_municipios(Station, AlertRule, RiskAlert, aplicar=True):
    """Unifica os nomes já gravados nos 92 canônicos. Devolve
    (alterados, invalidos) — invalidos = {nome: [tabelas]} que não mapeiam."""
    alterados = 0
    invalidos = {}

    def trata(model, campo, tabela):
        nonlocal alterados
        for nome in set(model.objects.exclude(**{campo: ""}).values_list(campo, flat=True)):
            canonico = normalizar_para_canonico(nome)
            if canonico is None:
                invalidos.setdefault(nome, []).append(tabela)
                continue
            if canonico == nome:
                continue
            if aplicar:
                if model is RiskAlert:
                    # unique (tipo, redec, municipio): se já existe a linha
                    # canônica, a variante é lixo duplicado -> apaga.
                    for ra in model.objects.filter(**{campo: nome}):
                        if model.objects.filter(tipo=ra.tipo, redec=ra.redec, municipio=canonico).exists():
                            ra.delete()
                        else:
                            model.objects.filter(pk=ra.pk).update(municipio=canonico)
                            alterados += 1
                    continue
                alterados += model.objects.filter(**{campo: nome}).update(**{campo: canonico})
            else:
                alterados += model.objects.filter(**{campo: nome}).count()

    trata(Station, "municipality", "Station")
    trata(AlertRule, "municipality", "AlertRule")
    trata(RiskAlert, "municipio", "RiskAlert")
    return alterados, invalidos
