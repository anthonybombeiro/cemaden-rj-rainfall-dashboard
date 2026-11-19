from django.test import SimpleTestCase

from core.gatilhos import aplicar_estado_real


class AcionadoSoNoGatilhoAtingidoTest(SimpleTestCase):
    """19/11/2026: sirene tocando marcava os 4 gatilhos como acionados e a recomendação saía com I+II+III+IV."""

    def test_so_o_obrigatorio_vira_acionado(self):
        r = aplicar_estado_real({"GI": "obrigatorio", "GII": "condicionado", "GIII": None, "GIV": None}, True, True)
        self.assertEqual(r, {"GI": "acionado", "GII": "condicionado", "GIII": None, "GIV": None})

    def test_tocando_sem_gatilho_atingido_nao_inventa_gatilho(self):
        base = {"GI": None, "GII": None, "GIII": None, "GIV": None}
        self.assertEqual(aplicar_estado_real(base, True, True), base)

    def test_nao_tocando_ou_sem_gestao_mantem(self):
        base = {"GI": "obrigatorio", "GII": None, "GIII": None, "GIV": None}
        self.assertEqual(aplicar_estado_real(base, False, True), base)
        self.assertEqual(aplicar_estado_real(base, True, False), base)
