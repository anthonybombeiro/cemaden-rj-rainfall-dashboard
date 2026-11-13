from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase


class LoginUsuarioTest(APITestCase):
    def setUp(self):
        get_user_model().objects.create_user("guijarro", password="Senha-boa-123")

    def entrar(self, usuario, senha="Senha-boa-123"):
        return self.client.post("/api/auth/login/", {"username": usuario, "password": senha}, format="json")

    def test_login_normal(self):
        self.assertEqual(self.entrar("guijarro").status_code, 200)

    def test_maiuscula_e_espaco_nao_barram(self):
        self.assertEqual(self.entrar("Guijarro").status_code, 200)
        self.assertEqual(self.entrar("  guijarro ").status_code, 200)

    def test_senha_errada_continua_barrando(self):
        self.assertEqual(self.entrar("Guijarro", "outra").status_code, 401)

    def test_inativo_nao_entra(self):
        get_user_model().objects.filter(username="guijarro").update(is_active=False)
        self.assertEqual(self.entrar("guijarro").status_code, 401)
