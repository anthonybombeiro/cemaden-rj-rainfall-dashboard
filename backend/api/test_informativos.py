import datetime as dt

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from core.models import InformativoMeteorologico

U = "/api/informativos/"


def itens(*regioes, prevista="moderada", atual=""):
    return [{"regiao": r, "chuva_prevista": prevista, "chuva_atual": atual, "raios": True} for r in regioes]


class InformativosApiTest(APITestCase):
    def setUp(self):
        self.u1 = get_user_model().objects.create_user("ana", password="x")
        self.u2 = get_user_model().objects.create_user("beto", password="x")
        self.client.force_authenticate(self.u1)

    def cria(self, **kw):
        return self.client.post(U, {"itens": itens("SUL I", "NORTE"), **kw}, format="json")

    def test_exige_login(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(U).status_code, (401, 403))
        self.assertEqual(self.client.get("/api/publico/informativo/").status_code, 200)

    def test_numeracao_sequencial_e_reinicia_no_ano(self):
        a, b = self.cria().data, self.cria().data
        self.assertEqual(b["numero"], a["numero"] + 1)
        velho = self.client.post(U, {"emitido_em": "2025-12-31T10:00:00-03:00"}, format="json").data
        novo = self.client.post(U, {"emitido_em": "2024-01-01T10:00:00-03:00"}, format="json").data
        self.assertEqual((velho["ano"], velho["numero"], novo["ano"], novo["numero"]), (2025, 1, 2024, 1))

    def test_dois_usuarios_nao_repetem_numero(self):
        n1 = self.cria().data["numero"]
        self.client.force_authenticate(self.u2)
        n2 = self.cria().data["numero"]
        self.assertEqual(n2, n1 + 1)
        self.assertEqual(InformativoMeteorologico.objects.filter(numero=n1).count(), 1)

    def test_texto_gerado_e_ajuste_manual_preservado(self):
        i = self.cria().data
        self.assertIn("INFORMATIVO METEOROLÓGICO", i["texto"])
        self.assertIn("nas regiões Sul I e Norte", i["texto"])
        r = self.client.patch(f"{U}{i['id']}/", {"texto": i["texto"] + "\nNota do plantão."}, format="json").data
        self.assertTrue(r["editado_a_mao"])
        r = self.client.patch(f"{U}{i['id']}/", {"observacao": "x"}, format="json").data
        self.assertIn("Nota do plantão.", r["texto"])  # não sobrescreve texto ajustado
        r = self.client.patch(f"{U}{i['id']}/", {"regenerar_texto": True}, format="json").data
        self.assertNotIn("Nota do plantão.", r["texto"])

    def test_edicao_da_matriz_regenera_texto(self):
        i = self.cria().data
        r = self.client.patch(f"{U}{i['id']}/", {"itens": itens("SUL I", prevista="moderada_forte")}, format="json").data
        self.assertEqual([x["regiao"] for x in r["itens"]], ["SUL I"])
        self.assertIn("moderada a forte", r["texto"])

    def test_fluxo_revisar_enviar_cancelar(self):
        i = self.cria().data
        self.assertEqual(self.client.post(f"{U}{i['id']}/revisar/").data["estado"], "revisado")
        self.assertEqual(self.client.post(f"{U}{i['id']}/revisar/").status_code, 409)
        e = self.client.post(f"{U}{i['id']}/enviar/").data
        self.assertEqual((e["estado"], e["enviado_por"]), ("enviado", "ana"))
        self.assertEqual(self.client.post(f"{U}{i['id']}/enviar/").status_code, 409)
        self.assertEqual(self.client.patch(f"{U}{i['id']}/", {"itens": []}, format="json").status_code, 409)
        self.assertEqual(self.client.patch(f"{U}{i['id']}/", {"observacao": "ok"}, format="json").status_code, 200)
        self.assertEqual(self.client.post(f"{U}{i['id']}/cancelar/").status_code, 400)  # sem motivo
        c = self.client.post(f"{U}{i['id']}/cancelar/", {"motivo": "enviado por engano"}, format="json").data
        self.assertEqual(c["estado"], "cancelado")
        self.assertTrue(InformativoMeteorologico.objects.filter(pk=i["id"]).exists())  # nunca apaga
        self.assertEqual(c["historico"][-1]["acao"], "cancelar")

    def test_nao_envia_vazio(self):
        i = self.client.post(U, {}, format="json").data
        self.assertEqual(self.client.post(f"{U}{i['id']}/enviar/").status_code, 400)

    def test_sms_por_regiao_e_livro_de_ocorrencias(self):
        i = self.client.post(U, {"itens": itens("SUL I", "NORTE", prevista="moderada_forte")}, format="json").data
        r = self.client.post(f"{U}{i['id']}/sms/", {"regioes": ["Sul I"]}, format="json").data
        self.assertEqual(r["sms_regioes"], ["SUL I"])
        self.assertIn("SMS enviado via IDAP para a região Sul I", r["livro_ocorrencias"])
        self.assertTrue(r["sms"]["aplicavel"])

    def test_duplicar(self):
        i = self.client.post(U, {"itens": itens("SUL I", prevista="moderada_forte")}, format="json").data
        d = self.client.post(U, {"duplicar_de": i["id"]}, format="json").data
        self.assertEqual(d["numero"], i["numero"] + 1)
        self.assertEqual([x["chuva_prevista"] for x in d["itens"]], ["moderada_forte"])

    def test_previa_nao_salva(self):
        antes = InformativoMeteorologico.objects.count()
        r = self.client.post(U + "previa/", {"itens": itens("serrana")}, format="json").data
        self.assertIn("Serrana I e Serrana II", r["texto"])
        self.assertEqual(InformativoMeteorologico.objects.count(), antes)

    def test_acompanhamento_vigente_lacunas_e_radar(self):
        i = self.client.post(U, {"itens": itens("SUL I", prevista="moderada_forte")}, format="json").data
        self.client.post(f"{U}{i['id']}/enviar/")
        InformativoMeteorologico.objects.create(numero=i["numero"] + 2, ano=i["ano"], emitido_em=timezone.now())  # deixa lacuna
        a = self.client.get(U + "acompanhamento/").data
        self.assertEqual(a["lacunas"], [i["numero"] + 1])
        self.assertEqual(a["vigente"]["numero"], i["numero"])
        self.assertIn(a["vigente"]["radar_faixa"], ("intenso", "noite"))
        self.assertEqual(a["vigente"]["sms_pendentes"], ["SUL I"])
        self.assertEqual(len(a["vigente"]["regioes_sem_informacao"]), 10)

    def test_vigencia_expira_em_6h(self):
        i = self.client.post(U, {"itens": itens("SUL I")}, format="json").data
        self.client.post(f"{U}{i['id']}/enviar/")
        antigo = timezone.now() - dt.timedelta(hours=7)
        InformativoMeteorologico.objects.filter(pk=i["id"]).update(enviado_em=antigo, emitido_em=antigo)
        self.assertIsNone(self.client.get(U + "acompanhamento/").data["vigente"])

    def test_publico_so_se_marcado_enviado_e_vigente(self):
        i = self.client.post(U, {"itens": itens("SUL I")}, format="json").data
        self.client.post(f"{U}{i['id']}/enviar/")
        self.client.force_authenticate(None)
        self.assertIsNone(self.client.get("/api/publico/informativo/").data["informativo"])  # enviado mas não marcado público
        self.client.force_authenticate(self.u1)
        self.client.patch(f"{U}{i['id']}/", {"publico": True}, format="json")
        self.client.force_authenticate(None)
        p = self.client.get("/api/publico/informativo/").data["informativo"]
        self.assertEqual(p["numero"], i["numero"])
        self.assertNotIn("criado_por", p)

    def test_historico_filtros_exportar_estatisticas(self):
        i = self.client.post(U, {"itens": itens("SUL I", prevista="moderada_forte")}, format="json").data
        self.client.post(f"{U}{i['id']}/sms/", {"regioes": ["SUL I"]}, format="json")
        self.assertEqual(len(self.client.get(U, {"regiao": "SUL I"}).data["informativos"]), 1)
        self.assertEqual(len(self.client.get(U, {"regiao": "NORTE"}).data["informativos"]), 0)
        csv = self.client.get(U + "exportar/").content.decode("utf8")
        self.assertIn("SUL I;moderada a forte;;SIM", csv)
        e = self.client.get(U + "estatisticas/").data
        self.assertEqual((e["total"], e["por_regiao"]["SUL I"]["sms"]), (1, 1))
