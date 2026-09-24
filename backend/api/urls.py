from django.urls import path
from rest_framework.routers import DefaultRouter

from .admin_views import AdminOpsView
from .auth_views import ChangePasswordView, CsrfView, LoginView, LogoutView, MeView, ProfileUpdateView
from .ingest_views import RemoteReadingsIngestView
from .refresh_views import RefreshNowView
from .views import AlertEventViewSet, RiskAlertViewSet, SourceViewSet, StationViewSet

router = DefaultRouter()
router.register("sources", SourceViewSet, basename="source")
router.register("stations", StationViewSet, basename="station")
router.register("alerts", AlertEventViewSet, basename="alert")
router.register("risk-alerts", RiskAlertViewSet, basename="risk-alert")

urlpatterns = [
    path("ingest/readings/", RemoteReadingsIngestView.as_view(), name="ingest-readings"),
    path("admin/run/", AdminOpsView.as_view(), name="admin-run"),
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/profile/", ProfileUpdateView.as_view(), name="auth-profile"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("refresh/", RefreshNowView.as_view(), name="refresh-now"),
] + router.urls
