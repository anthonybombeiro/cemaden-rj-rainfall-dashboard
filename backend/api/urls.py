from django.urls import path
from rest_framework.routers import DefaultRouter

from .admin_views import (
    AdminOpsView,
    EnvCheckView,
    FixSirenesChuvaSobrepostaSuperuserView,
    MigrateSuperuserView,
    PopulateSireneRefSuperuserView,
    SetRiscoSireneSuperuserView,
    SyncAvisosMauTempoSuperuserView,
)
from .auth_views import ChangePasswordView, CsrfView, LoginView, LogoutView, MeView, ProfileUpdateView
from .inea_radar_views import INEARadarImageryView
from .ingest_views import IngestStatusView, RemoteReadingsIngestView
from .redemet_imagery_views import RedemetRadarImageryView, RedemetSateliteImageryView
from .refresh_views import RefreshNowView, RefreshRedemetView
from .views import (
    AlertEventViewSet,
    AvisoMauTempoViewSet,
    PrevisaoViewSet,
    RiskAlertViewSet,
    SourceViewSet,
    StationViewSet,
)

router = DefaultRouter()
router.register("sources", SourceViewSet, basename="source")
router.register("stations", StationViewSet, basename="station")
router.register("alerts", AlertEventViewSet, basename="alert")
router.register("previsoes", PrevisaoViewSet, basename="previsao")
router.register("risk-alerts", RiskAlertViewSet, basename="risk-alert")
router.register("avisos-mau-tempo", AvisoMauTempoViewSet, basename="aviso-mau-tempo")

urlpatterns = [
    path("ingest/status/", IngestStatusView.as_view(), name="ingest-status"),
    path("ingest/readings/", RemoteReadingsIngestView.as_view(), name="ingest-readings"),
    path("admin/env-check/", EnvCheckView.as_view(), name="admin-env-check"),
    path("admin/migrate/", MigrateSuperuserView.as_view(), name="admin-migrate"),
    path("admin/populate-sirene-ref/", PopulateSireneRefSuperuserView.as_view(), name="admin-populate-sirene-ref"),
    path("admin/set-risco-sirene/", SetRiscoSireneSuperuserView.as_view(), name="admin-set-risco-sirene"),
    path(
        "admin/sync-avisos-mau-tempo/",
        SyncAvisosMauTempoSuperuserView.as_view(),
        name="admin-sync-avisos-mau-tempo",
    ),
    path(
        "admin/fix-sirenes-chuva-sobreposta/",
        FixSirenesChuvaSobrepostaSuperuserView.as_view(),
        name="admin-fix-sirenes-chuva-sobreposta",
    ),
    path("admin/run/", AdminOpsView.as_view(), name="admin-run"),
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/profile/", ProfileUpdateView.as_view(), name="auth-profile"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("refresh/", RefreshNowView.as_view(), name="refresh-now"),
    path("refresh/redemet/", RefreshRedemetView.as_view(), name="refresh-redemet"),
    path("imagery/satelite/", RedemetSateliteImageryView.as_view(), name="imagery-satelite"),
    path("imagery/radar/", RedemetRadarImageryView.as_view(), name="imagery-radar"),
    path("imagery/radar-inea/", INEARadarImageryView.as_view(), name="imagery-radar-inea"),
] + router.urls
