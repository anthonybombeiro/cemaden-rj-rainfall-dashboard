"""
Login/logout do painel via sessão do Django (cookie), não JWT — o frontend
é um site estático (Next.js `output: "export"`) servido do MESMO domínio
que a API em produção (cemadenrj.preserve.rio.br), então cookie de sessão
comum funciona sem a complexidade de token em localStorage (e sem o risco
de XSS roubar um token de lá). Ver settings.py: `DEFAULT_AUTHENTICATION_
CLASSES` = SessionAuthentication, `DEFAULT_PERMISSION_CLASSES` =
IsAuthenticated (painel inteiro exige login, pedido do usuário 2026-09-23).

Papel do usuário (admin/operador) não é um campo novo — reaproveita
`is_superuser` do próprio Django: admin = `is_superuser=True` (também
consegue entrar no /admin/, que exige `is_staff`); operador = usuário
comum (`is_superuser=False`), só consegue entrar no painel via essas
views, não no /admin/. Contas são criadas pela ação `create_user` do
`/api/admin/run/` (ver admin_views.py) — sem HostGator, sem shell.

Fluxo CSRF: GET /auth/csrf/ garante o cookie `csrftoken` (chamado 1x pelo
frontend antes de mostrar a tela de login); POST /auth/login/ não exige
esse token (ainda não existe sessão pra "roubar" — é a troca de
usuário/senha por senha real que autentica, não o cookie); POST
/auth/logout/ exige (já é uma sessão autenticada, ação que muda estado) —
o frontend lê o cookie e manda de volta no header `X-CSRFToken`, padrão
documentado do próprio DRF pra SessionAuthentication + cliente JS.
"""

from __future__ import annotations

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _user_payload(user) -> dict:
    return {"username": user.username, "role": "admin" if user.is_superuser else "operador"}


class CsrfView(APIView):
    """GET /api/auth/csrf/ — só garante o cookie `csrftoken` (chamado antes
    de mostrar a tela de login; o valor em si não importa pra este GET,
    só precisa existir pro POST de logout mais tarde)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        get_token(request)
        return Response({"detail": "ok"})


class LoginView(APIView):
    """POST /api/auth/login/  {"username": ..., "password": ...}"""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data or {}).get("username", "")
        password = (request.data or {}).get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is None or not user.is_active:
            return Response({"detail": "Usuário ou senha inválidos."}, status=401)
        login(request, user)
        return Response(_user_payload(user))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({"detail": "ok"})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_user_payload(request.user))
