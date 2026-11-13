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


from core.models import AvisoMeteorologico, ConfiguracaoPlantao, ItemPlantao, OcorrenciaPlantao  # noqa: E402


@admin.register(AvisoMeteorologico)
class AvisoMeteorologicoAdmin(admin.ModelAdmin):
    list_display = ("numero", "ano", "estado", "vigencia_inicio", "vigencia_fim", "idap_enviado", "emitido_por")
    list_filter = ("ano", "estado", "idap_enviado")
    readonly_fields = ("historico",)


@admin.register(OcorrenciaPlantao)
class OcorrenciaPlantaoAdmin(admin.ModelAdmin):
    list_display = ("data", "operador", "tecnico_encerra", "tecnico_inicia", "atualizado_por", "atualizado_em")


@admin.register(ItemPlantao)
class ItemPlantaoAdmin(admin.ModelAdmin):
    list_display = ("data", "codigo", "feito_por", "feito_em")
    list_filter = ("data",)


@admin.register(ConfiguracaoPlantao)
class ConfiguracaoPlantaoAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not ConfiguracaoPlantao.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


# ---------------------------------------------------------------------------------------------------------------------------
# Usuários (13/11/2026): ativar/desativar e trocar o papel direto na lista do Django admin.
# No painel só existem dois papéis: Administrador (is_superuser, que também precisa de is_staff para entrar no /admin/) e Operador (conta comum).
# "Ativo" é quem consegue entrar no painel; "Membro da equipe" (is_staff) só vale para entrar no /admin/ — operador não precisa dele.
# ---------------------------------------------------------------------------------------------------------------------------
from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin  # noqa: E402

_User = get_user_model()
try:
    admin.site.unregister(_User)
except admin.sites.NotRegistered:  # pragma: no cover
    pass


@admin.register(_User)
class UsuarioAdmin(BaseUserAdmin):
    list_display = ("username", "first_name", "email", "papel_no_painel", "is_active", "is_staff", "is_superuser", "last_login")
    list_display_links = ("username",)
    list_filter = ("is_active", "is_superuser", "is_staff")
    list_editable = ("is_active",)  # liga/desliga direto na lista (marque e use "Salvar" no fim da página)
    actions = ["ativar_usuarios", "desativar_usuarios", "tornar_administradores", "tornar_operadores"]

    @admin.display(description="Papel no painel", ordering="is_superuser")
    def papel_no_painel(self, obj):
        return "Administrador" if obj.is_superuser else "Operador"

    def _sem_voce(self, request, queryset, acao):
        """Ninguém tira o próprio acesso sem querer: o próprio usuário fica de fora de desativar/rebaixar."""
        proprio = queryset.filter(pk=request.user.pk)
        if proprio.exists():
            self.message_user(request, f"Sua própria conta foi ignorada em “{acao}” (para você não perder o acesso).", level="warning")
        return queryset.exclude(pk=request.user.pk)

    @admin.action(description="Ativar usuários selecionados (podem entrar no painel)")
    def ativar_usuarios(self, request, queryset):
        n = queryset.update(is_active=True)
        self.message_user(request, f"{n} usuário(s) ativado(s).")

    @admin.action(description="Desativar usuários selecionados (não entram mais; nada é apagado)")
    def desativar_usuarios(self, request, queryset):
        n = self._sem_voce(request, queryset, "desativar").update(is_active=False)
        self.message_user(request, f"{n} usuário(s) desativado(s).")

    @admin.action(description="Tornar administrador (superusuário + membro da equipe: entra no painel e no /admin/)")
    def tornar_administradores(self, request, queryset):
        n = queryset.update(is_superuser=True, is_staff=True, is_active=True)
        self.message_user(request, f"{n} usuário(s) agora são administradores.")

    @admin.action(description="Tornar operador (só entra no painel; sem /admin/)")
    def tornar_operadores(self, request, queryset):
        n = self._sem_voce(request, queryset, "tornar operador").update(is_superuser=False, is_staff=False)
        self.message_user(request, f"{n} usuário(s) agora são operadores.")
