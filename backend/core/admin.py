from django.contrib import admin

from .models import AlertEvent, AlertRule, GatilhoPluviometrico, Reading, RiskAlert, Source, Station


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "enabled", "last_ingested_at")
    list_filter = ("enabled",)
    readonly_fields = ("last_ingested_at", "last_ingest_error")


@admin.register(Station)
class StationAdmin(admin.ModelAdmin):
    list_display = (
        "name", "source", "external_id", "municipality", "station_type", "status",
        "tipo_sirene", "risco_sirene", "sirene_ref", "updated_at",
    )
    list_filter = ("source", "station_type", "status", "municipality", "tipo_sirene", "risco_sirene")
    # sirene_ref fica de fora do list_editable de propósito: como FK pra Station
    # (~700 linhas), o <select> da changelist ficaria pesado — edita pela ficha
    # da estação (onde autocomplete_fields já faz a busca por nome).
    list_editable = ("tipo_sirene", "risco_sirene")
    search_fields = ("name", "external_id", "municipality")
    autocomplete_fields = ("sirene_ref",)


@admin.register(Reading)
class ReadingAdmin(admin.ModelAdmin):
    list_display = ("station", "reading_type", "value", "timestamp")
    list_filter = ("reading_type", "station__source")
    date_hierarchy = "timestamp"
    search_fields = ("station__name",)


@admin.register(AlertRule)
class AlertRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "reading_type", "comparison", "threshold_value", "severity", "station", "municipality", "active")
    list_filter = ("severity", "active", "reading_type")


@admin.register(AlertEvent)
class AlertEventAdmin(admin.ModelAdmin):
    list_display = ("rule", "station", "value", "triggered_at", "resolved_at")
    list_filter = ("rule__severity",)
    date_hierarchy = "triggered_at"


@admin.register(RiskAlert)
class RiskAlertAdmin(admin.ModelAdmin):
    list_display = ("tipo", "redec", "municipio", "risco", "atualizado_em", "ingested_at")
    list_filter = ("tipo", "risco", "redec")
    search_fields = ("municipio", "redec")


from core.models import Previsao  # noqa: E402


@admin.register(Previsao)
class PrevisaoAdmin(admin.ModelAdmin):
    list_display = ("data", "regiao", "temperatura_maxima", "temperatura_minima", "icone", "origem", "atualizado_em")
    list_filter = ("regiao", "origem", "data")
    date_hierarchy = "data"


from core.models import PrevisaoDia  # noqa: E402


@admin.register(PrevisaoDia)
class PrevisaoDiaAdmin(admin.ModelAdmin):
    list_display = ("data", "texto_geral", "atualizado_por", "atualizado_em")
    date_hierarchy = "data"


from core.models import CotaHidrologica  # noqa: E402


@admin.register(CotaHidrologica)
class CotaHidrologicaAdmin(admin.ModelAdmin):
    list_display = ("station", "rio", "atencao_cm", "alerta_cm", "inundacao_cm", "extrema_cm", "responsavel", "atualizado_em")
    list_editable = ("atencao_cm", "alerta_cm", "inundacao_cm", "extrema_cm")
    search_fields = ("station__name", "rio", "station__municipality")
    list_filter = ("responsavel",)
    autocomplete_fields = ("station",)


from core.models import SireneAcaoTipo  # noqa: E402


@admin.register(SireneAcaoTipo)
class SireneAcaoTipoAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nome", "categoria", "observacao")
    list_editable = ("nome", "categoria")
    ordering = ("codigo",)


@admin.register(GatilhoPluviometrico)
class GatilhoPluviometricoAdmin(admin.ModelAdmin):
    list_display = (
        "municipio",
        "gatilho_i_1h_mm",
        "gatilho_ii_1h_mm", "gatilho_ii_24h_mm",
        "gatilho_iii_1h_mm", "gatilho_iii_96h_mm",
        "gatilho_iv_1h_mm", "gatilho_iv_30d_mm",
    )
    list_editable = (
        "gatilho_i_1h_mm",
        "gatilho_ii_1h_mm", "gatilho_ii_24h_mm",
        "gatilho_iii_1h_mm", "gatilho_iii_96h_mm",
        "gatilho_iv_1h_mm", "gatilho_iv_30d_mm",
    )
    search_fields = ("municipio",)
    ordering = ("municipio",)


from core.models import AvisoMauTempo  # noqa: E402


@admin.register(AvisoMauTempo)
class AvisoMauTempoAdmin(admin.ModelAdmin):
    list_display = ("numero_externo", "area", "tipo", "emitido_em", "valido_ate", "ingested_at")
    list_filter = ("area",)
    search_fields = ("numero_externo", "tipo", "descricao")
    date_hierarchy = "emitido_em"


from core.models import RecomendacaoAlarme  # noqa: E402


@admin.register(RecomendacaoAlarme)
class RecomendacaoAlarmeAdmin(admin.ModelAdmin):
    list_display = ("numero", "municipio", "data", "hora", "probabilidade", "gatilho", "acionaram", "responsavel")
    list_filter = ("acionaram", "probabilidade", "gatilho", "municipio")
    search_fields = ("numero", "municipio", "estacao", "observacao", "sirenes_acionadas")
    date_hierarchy = "data"


from core.models import AcionamentoMunicipio  # noqa: E402


@admin.register(AcionamentoMunicipio)
class AcionamentoMunicipioAdmin(admin.ModelAdmin):
    list_display = ("municipio", "data", "hora", "sirene", "tipo_alarme", "quantidade", "responsavel")
    list_filter = ("municipio", "tipo_alarme")
    search_fields = ("municipio", "sirene", "observacao")
    date_hierarchy = "data"


from core.models import MunicipioComSirene  # noqa: E402


@admin.register(MunicipioComSirene)
class MunicipioComSireneAdmin(admin.ModelAdmin):
    list_display = ("municipio", "ativo", "observacao")
    list_editable = ("ativo",)
    list_filter = ("ativo",)
    search_fields = ("municipio",)


from core.models import ConfiguracaoNm, NivelMonitoramento, NivelMonitoramentoRegistro  # noqa: E402


@admin.register(NivelMonitoramento)
class NivelMonitoramentoAdmin(admin.ModelAdmin):
    list_display = ("municipio", "nivel", "origem", "vigencia_ate", "atualizado_em")
    list_filter = ("nivel", "origem")
    search_fields = ("municipio",)


@admin.register(NivelMonitoramentoRegistro)
class NivelMonitoramentoRegistroAdmin(admin.ModelAdmin):
    list_display = ("registrado_em", "municipio", "nivel_anterior", "nivel", "equipe", "aprovado_por", "registrado_por", "origem", "encerramento")
    list_filter = ("nivel", "origem", "equipe", "encerramento")
    search_fields = ("municipio", "motivo", "registrado_por", "aprovado_por")
    date_hierarchy = "registrado_em"


@admin.register(ConfiguracaoNm)
class ConfiguracaoNmAdmin(admin.ModelAdmin):
    """Interruptor e teto da automação do NM (uma linha só)."""

    list_display = ("__str__", "ativo", "nivel_maximo_auto", "ultima_execucao")
    readonly_fields = ("ultima_execucao", "ultimo_resumo")

    def has_add_permission(self, request):
        return not ConfiguracaoNm.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

from core.models import ConfiguracaoInformativo, InformativoMeteorologico, InformativoRegiao  # noqa: E402


class InformativoRegiaoInline(admin.TabularInline):
    model = InformativoRegiao
    extra = 0


@admin.register(InformativoMeteorologico)
class InformativoMeteorologicoAdmin(admin.ModelAdmin):
    list_display = ("numero", "ano", "estado", "emitido_em", "enviado_por", "publico", "importado")
    list_filter = ("ano", "estado", "publico", "importado")
    inlines = [InformativoRegiaoInline]
    readonly_fields = ("historico",)


@admin.register(ConfiguracaoInformativo)
class ConfiguracaoInformativoAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not ConfiguracaoInformativo.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

