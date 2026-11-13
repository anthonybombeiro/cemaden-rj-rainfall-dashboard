from django.contrib.auth import get_user_model
from django.test import TestCase


class UsuarioAdminTest(TestCase):
    def setUp(self):
        U = get_user_model()
        self.adm = U.objects.create_superuser("anthony", "a@x.org", "senha-teste-123")
        self.op = U.objects.create_user("guijarro", password="x", is_active=False)
        self.client.force_login(self.adm)

    def acao(self, nome, *usuarios):
        return self.client.post("/admin/auth/user/", {"action": nome, "_selected_action": [u.pk for u in usuarios]}, follow=True)

    def test_lista_mostra_papel_e_ativo(self):
        r = self.client.get("/admin/auth/user/")
        self.assertContains(r, "Operador")
        self.assertContains(r, "Administrador")

    def test_ativar_e_desativar(self):
        self.acao("ativar_usuarios", self.op)
        self.op.refresh_from_db()
        self.assertTrue(self.op.is_active)
        self.acao("desativar_usuarios", self.op)
        self.op.refresh_from_db()
        self.assertFalse(self.op.is_active)

    def test_nao_desativa_nem_rebaixa_a_propria_conta(self):
        self.acao("desativar_usuarios", self.adm)
        self.acao("tornar_operadores", self.adm)
        self.adm.refresh_from_db()
        self.assertTrue(self.adm.is_active and self.adm.is_superuser and self.adm.is_staff)

    def test_tornar_administrador_e_operador(self):
        self.acao("tornar_administradores", self.op)
        self.op.refresh_from_db()
        self.assertTrue(self.op.is_superuser and self.op.is_staff and self.op.is_active)
        self.acao("tornar_operadores", self.op)
        self.op.refresh_from_db()
        self.assertFalse(self.op.is_superuser or self.op.is_staff)
