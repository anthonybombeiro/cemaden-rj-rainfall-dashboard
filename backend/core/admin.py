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
