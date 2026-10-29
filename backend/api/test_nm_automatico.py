import datetime as dt

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from core import nm_automatico
from core.models import ConfiguracaoNm, NivelMonitoramento, NivelMonitoramentoRegistro, RiskAlert

M = "Petrópolis"  # Serrana I
REDEC = "SERRANA I"


def risco(tipo, nivel, municipio=M):
    RiskAlert.objects.update_or_create(tipo=tipo, redec=REDEC, municipio=municipio if tipo != "meteorologico" else "", defaults={"risco": nivel, "atualizado_em": timezone.now()})


class NmAutomaticoTest(APITestCase):
    def setUp(self):
        self.agora = timezone.now()

    def nm(self, m=M):
        return NivelMonitoramento.objects.filter(municipio=m).first()

    def test_sem_dado_de_risco_nao_mexe(self):
        r = nm_automatico.sincronizar(self.agora)
        self.assertEqual(NivelMonitoramento.objects.count(), 0)
        self.assertEqual(r["sem_dado"], 92)

    def test_baixo_vira_nm1_e_moderado_nm2_com_vigencia_24h(self):
        risco("geologico", "baixo")
        nm_automatico.sincronizar(self.agora)
        n = self.nm()
        self.assertEqual((n.nivel, n.origem, n.vigencia_ate), (1, "automatico", None))
        risco("geologico", "moderado")
        nm_automatico.sincronizar(self.agora)
        n = self.nm()
        self.assertEqual((n.nivel, n.origem), (2, "automatico"))
        self.assertAlmostEqual((n.vigencia_ate - self.agora).total_seconds() / 3600, 24, delta=0.1)
        reg = NivelMonitoramentoRegistro.objects.filter(municipio=M).first()
        self.assertEqual((reg.nivel_anterior, reg.nivel, reg.registrado_por, reg.origem, reg.equipe), (1, 2, nm_automatico.SISTEMA, "automatico", "geo"))
        self.assertTrue(reg.sinais and reg.sinais[0]["risco"] == "moderado")

    def test_teto_padrao_nm2_alto_vira_nm2_e_vira_sugestao_de_nm3(self):
        risco("hidrologico", "alto")
        nm_automatico.sincronizar(self.agora)
        self.assertEqual(self.nm().nivel, 2)
        self.client.force_authenticate(get_user_model().objects.create_user("p", password="x"))
        s = self.client.get("/api/monitoramento/sugestoes/").data["sugestoes"]
        sug = [x for x in s if x["municipio"] == M and x["tipo"] == "risco_tecnico"]
        self.assertEqual(sug[0]["sugerido"], 3)
        self.assertEqual(sug[0]["atual"], 2)

    def test_teto_3_configurado_e_nunca_acima_de_3(self):
        cfg = ConfiguracaoNm.obter()
        cfg.nivel_maximo_auto = 9
        cfg.save()
        self.assertEqual(ConfiguracaoNm.obter().nivel_maximo_auto, 3)
        risco("geologico", "muito_alto")
        nm_automatico.sincronizar(self.agora)
        self.assertEqual(self.nm().nivel, 3)

    def test_nunca_gera_nm4_nem_nm5(self):
        for tipo in ("geologico", "hidrologico", "meteorologico"):
            risco(tipo, "muito_alto")
        nm_automatico.sincronizar(self.agora)
        self.assertLessEqual(self.nm().nivel, 3)

    def test_nao_sobrescreve_nivel_humano_ativo(self):
        NivelMonitoramento.objects.create(municipio=M, nivel=4, vigencia_ate=self.agora + dt.timedelta(hours=5), origem="humano")
        risco("geologico", "baixo")
        r = nm_automatico.sincronizar(self.agora)
        self.assertEqual((self.nm().nivel, self.nm().origem), (4, "humano"))
        self.assertEqual(r["bloqueados_por_humano"], 1)

    def test_nm1_humano_recente_protege_e_antigo_libera(self):
        n = NivelMonitoramento.objects.create(municipio=M, nivel=1, origem="humano")
        risco("geologico", "moderado")
        nm_automatico.sincronizar(self.agora)
        self.assertEqual(self.nm().origem, "humano")
        NivelMonitoramento.objects.filter(pk=n.pk).update(atualizado_em=self.agora - dt.timedelta(hours=7))
        nm_automatico.sincronizar(self.agora)
        self.assertEqual((self.nm().nivel, self.nm().origem), (2, "automatico"))

    def test_humano_vencido_e_assumido_pelo_sistema(self):
        NivelMonitoramento.objects.create(municipio=M, nivel=3, vigencia_ate=self.agora - dt.timedelta(hours=1), origem="humano")
        risco("geologico", "moderado")
        nm_automatico.sincronizar(self.agora)
        self.assertEqual((self.nm().nivel, self.nm().origem), (2, "automatico"))

    def test_histerese_so_desce_depois_de_3h(self):
        risco("geologico", "moderado")
        nm_automatico.sincronizar(self.agora)
        risco("geologico", "muito_baixo")
        nm_automatico.sincronizar(self.agora + dt.timedelta(hours=1))
        self.assertEqual(self.nm().nivel, 2)  # ainda segura
        NivelMonitoramento.objects.filter(municipio=M).update(atualizado_em=self.agora - dt.timedelta(hours=4))
        nm_automatico.sincronizar(self.agora + dt.timedelta(hours=4))
        n = self.nm()
        self.assertEqual((n.nivel, n.origem), (0, "automatico"))
        self.assertTrue(NivelMonitoramentoRegistro.objects.filter(municipio=M, nivel=0, encerramento=True).exists())

    def test_renova_quando_restam_menos_de_6h_e_nao_gera_registro_a_toa(self):
        risco("geologico", "moderado")
        nm_automatico.sincronizar(self.agora)
        total = NivelMonitoramentoRegistro.objects.filter(municipio=M).count()
        nm_automatico.sincronizar(self.agora + dt.timedelta(hours=1))
        self.assertEqual(NivelMonitoramentoRegistro.objects.filter(municipio=M).count(), total)  # nada mudou
        r = nm_automatico.sincronizar(self.agora + dt.timedelta(hours=19))  # restam 5 h
        self.assertEqual(r["renovados"], 1)
        self.assertGreater(self.nm().vigencia_ate, self.agora + dt.timedelta(hours=40))

    def test_interruptor_desligado(self):
        cfg = ConfiguracaoNm.obter()
        cfg.ativo = False
        cfg.save()
        risco("geologico", "moderado")
        self.assertEqual(nm_automatico.sincronizar(self.agora)["ativo"], False)
        self.assertIsNone(nm_automatico.sincronizar_se_vencido(0))
        self.assertEqual(NivelMonitoramento.objects.count(), 0)

    def test_severidade_meteorologica_vale_para_a_redec(self):
        risco("meteorologico", "moderado")
        nm_automatico.sincronizar(self.agora)
        self.assertEqual(self.nm().nivel, 2)
        self.assertEqual(self.nm("Teresópolis").nivel, 2)  # mesma REDEC (Serrana I)

    def test_carona_respeita_o_intervalo(self):
        risco("geologico", "moderado")
        self.assertIsNotNone(nm_automatico.sincronizar_se_vencido(10))
        self.assertIsNone(nm_automatico.sincronizar_se_vencido(10))

    def test_api_estado_e_publica_com_origem(self):
        risco("geologico", "moderado")
        self.client.force_authenticate(get_user_model().objects.create_user("p", password="x"))
        self.client.post("/api/monitoramento/automatico/")
        e = self.client.get("/api/monitoramento/automatico/").data
        self.assertTrue(e["ativo"] and e["nivel_maximo_auto"] == 2 and e["vigentes_automaticos"]["2"] >= 1 and e["ultima_execucao"])
        self.client.force_authenticate(None)
        pub = self.client.get("/api/publico/monitoramento/").data["niveis"]
        self.assertEqual([n["origem"] for n in pub if n["municipio"] == M], ["automatico"])
