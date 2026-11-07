import datetime as dt

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from core import plantao
from core.models import ConfiguracaoPlantao, InformativoMeteorologico, ItemPlantao, Reading, RiskAlert, Source, Station


def local(ano, mes, dia, h=0, m=0):
    return timezone.make_aware(dt.datetime(ano, mes, dia, h, m))


class Base(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = get_user_model().objects.create_user("tecnico", password="x", first_name="Técnico")
        self.client.force_authenticate(self.user)
        RiskAlert.objects.create(tipo="meteorologico", redec="SUL II", municipio="Piraí", risco="baixo")
        RiskAlert.objects.create(tipo="meteorologico", redec="COSTA VERDE", municipio="Mangaratiba", risco="baixo")
        RiskAlert.objects.create(tipo="meteorologico", redec="CAPITAL", municipio="Rio de Janeiro", risco="baixo")

    def estacao(self, slug, nome, municipio):
        fonte, _ = Source.objects.get_or_create(slug=slug, defaults={"name": slug})
        return Station.objects.create(source=fonte, external_id=nome, name=nome, municipality=municipio, station_type=Station.StationType.PLUVIOMETRICA, latitude=-22.5, longitude=-43.1)

    def chuva(self, est, quando, mm, tipo=Reading.ReadingType.CHUVA_MM):
        return Reading.objects.create(station=est, reading_type=tipo, value=mm, timestamp=quando)


class AcumuladosTest(Base):
    def test_um_por_municipio_base_6h_e_sem_wunderground(self):
        a = self.estacao("cemaden_mctic", "Piraí A", "Piraí")
        b = self.estacao("inmet", "Piraí B", "Piraí")
        c = self.estacao("plugfield", "Mangaratiba P", "Mangaratiba")
        w = self.estacao("wunderground", "WU Rio", "Rio de Janeiro")
        mg = self.estacao("ana", "Carangola", "Carangola")  # fora do RJ: sem REDEC
        ref = local(2026, 11, 3, 6)
        dentro = ref - dt.timedelta(hours=3)
        fora = ref - dt.timedelta(hours=24, minutes=1)  # antes da janela
        self.chuva(a, dentro, 60.0)
        self.chuva(a, ref, 7.8)  # leitura das 06 h fecha o período
        self.chuva(a, ref + dt.timedelta(minutes=10), 99.0)  # depois da janela
        self.chuva(b, dentro, 30.0)
        self.chuva(c, dentro, 31.4)
        self.chuva(c, fora, 50.0)
        self.chuva(w, dentro, 90.0)
        self.chuva(mg, dentro, 80.0)
        r = self.client.get("/api/meteorologia/acumulados/", {"ref": "2026-11-03T06:00", "n": 10})
        self.assertEqual(r.status_code, 200, r.data)
        itens = r.data["itens"]
        self.assertEqual([(i["municipio"], i["valor"]) for i in itens], [("Piraí", 67.8), ("Mangaratiba", 31.4)])
        self.assertEqual(itens[0]["regiao_nome"], "Sul II")
        self.assertEqual(itens[0]["fonte_rotulo"], "CEMADEN/MCTI")
        self.assertEqual(itens[1]["fonte_rotulo"], "DC Mangaratiba")
        self.assertEqual(itens[0]["posicao"], 1)

    def test_tabela_recomendada_com_tres_estacoes_acima_de_40(self):
        ref = local(2026, 11, 3, 6)
        for i, mun in enumerate(["Piraí", "Mangaratiba", "Rio de Janeiro"]):
            self.chuva(self.estacao("inmet", f"E{i}", mun), ref - dt.timedelta(hours=2), 41 + i)
        r = self.client.get("/api/meteorologia/acumulados/", {"ref": "2026-11-03T06:00"})
        self.assertEqual(r.data["estacoes_acima_limiar"], 3)
        self.assertTrue(r.data["tabela_recomendada"])

    def test_ref_invalida(self):
        self.assertEqual(self.client.get("/api/meteorologia/acumulados/", {"ref": "ontem"}).status_code, 400)

    def test_exige_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/meteorologia/acumulados/").status_code, 403)


class CalendarioTest(Base):
    def test_dias_acima_de_10_mm_no_dia_civil_local(self):
        a = self.estacao("inmet", "Piraí A", "Piraí")
        b = self.estacao("inmet", "Mang", "Mangaratiba")
        # 02/11: 12 mm em Piraí (soma de 2 leituras no mesmo dia local); 03/11 às 00:30 local (= 03:30 UTC) cai em 03/11
        self.chuva(a, local(2026, 11, 2, 10), 7.0)
        self.chuva(a, local(2026, 11, 2, 22), 5.0)
        self.chuva(b, local(2026, 11, 2, 23, 50), 9.0)  # só 9 mm no dia 02
        self.chuva(b, local(2026, 11, 3, 0, 30), 11.0)  # 11 mm no dia 03
        self.chuva(a, local(2026, 11, 1, 12), 3.0)  # abaixo do limiar
        r = self.client.get("/api/resumo/chuva-calendario/", {"mes": "2026-11"})
        self.assertEqual(r.status_code, 200, r.data)
        dias = {d["data"]: d for d in r.data["dias"]}
        self.assertEqual(sorted(dias), ["2026-11-02", "2026-11-03"])
        self.assertEqual(dias["2026-11-02"]["max_mm"], 12.0)
        self.assertEqual(dias["2026-11-02"]["por_regiao"], {"SUL II": {"max_mm": 12.0, "n_estacoes": 1}})
        self.assertEqual(dias["2026-11-03"]["estacoes"][0]["municipio"], "Mangaratiba")

    def test_mes_invalido(self):
        self.assertEqual(self.client.get("/api/resumo/chuva-calendario/", {"mes": "2026-13"}).status_code, 400)


class LimiaresTest(Base):
    def test_alertas(self):
        agora = timezone.now()
        a = self.estacao("inmet", "A", "Piraí")
        b = self.estacao("inmet", "B", "Mangaratiba")
        c = self.estacao("inmet", "C", "Rio de Janeiro")
        self.chuva(a, agora - dt.timedelta(minutes=20), 26.0)  # > 25 mm em 1 h
        self.chuva(b, agora - dt.timedelta(minutes=30), 25.0)  # igual a 25: não passa
        self.chuva(b, agora - dt.timedelta(hours=5), 20.0)
        self.chuva(c, agora - dt.timedelta(hours=8), 41.0)
        self.chuva(a, agora - dt.timedelta(hours=9), 15.0)  # A: 41 em 24 h
        self.chuva(c, agora - dt.timedelta(minutes=50), 1.0)  # C: 42 em 24 h; B: 45 em 24 h
        self.chuva(self.estacao("inmet", "U", "Piraí"), agora - dt.timedelta(minutes=10), 28.0, Reading.ReadingType.UMIDADE_PCT)
        self.chuva(self.estacao("inmet", "V", "Piraí"), agora - dt.timedelta(minutes=10), 45.0, Reading.ReadingType.UMIDADE_PCT)
        r = self.client.get("/api/meteorologia/limiares/")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["chuva_1h"]["ativo"])
        self.assertEqual([e["estacao"] for e in r.data["chuva_1h"]["estacoes"]], ["A"])
        self.assertTrue(r.data["acumulado_24h"]["ativo"])
        self.assertEqual(r.data["acumulado_24h"]["n"], 3)
        self.assertTrue(r.data["umidade"]["ativo"])
        self.assertEqual([e["estacao"] for e in r.data["umidade"]["estacoes"]], ["U"])

    def test_sem_alerta(self):
        self.chuva(self.estacao("inmet", "A", "Piraí"), timezone.now() - dt.timedelta(minutes=5), 2.0)
        r = self.client.get("/api/meteorologia/limiares/")
        self.assertFalse(r.data["chuva_1h"]["ativo"])
        self.assertFalse(r.data["acumulado_24h"]["ativo"])
        self.assertFalse(r.data["umidade"]["ativo"])


class AvisoTest(Base):
    def novo(self, **extra):
        r = self.client.post("/api/avisos-meteorologicos/", {"texto": "Chuva **forte** no estado.", "icones": ["chuva"], **extra}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        return r.data

    def test_numeracao_por_ano_e_fluxo(self):
        a = self.novo()
        b = self.novo()
        self.assertEqual((a["numero"], b["numero"]), (1, 2))
        self.assertEqual(a["estado"], "rascunho")
        r = self.client.post(f"/api/avisos-meteorologicos/{a['id']}/emitir/")
        self.assertEqual(r.data["estado"], "emitido")
        self.assertEqual(r.data["emitido_por"], "Técnico")
        # emitido: só os dados do Idap mudam
        r = self.client.patch(f"/api/avisos-meteorologicos/{a['id']}/", {"texto": "outro", "idap_enviado": True, "idap_municipios": ["Piraí"]}, format="json")
        self.assertEqual(r.data["texto"], "Chuva **forte** no estado.")
        self.assertTrue(r.data["idap_enviado"])
        self.assertEqual(r.data["idap_municipios"], ["Piraí"])
        r = self.client.get("/api/avisos-meteorologicos/", {"vigentes": 1})
        self.assertEqual([x["id"] for x in r.data["avisos"]], [a["id"]])

    def test_validacoes(self):
        a = self.novo()
        url = f"/api/avisos-meteorologicos/{a['id']}/"
        self.assertEqual(self.client.patch(url, {"sms_texto": "x" * 147}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"tv_texto": "x" * 63}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"regioes": ["MARTE"]}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"sistemas": ["ufo"]}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"icones": ["neve"]}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"vigencia_fim": "2020-01-01T00:00"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"sms_texto": "x" * 146, "tv_texto": "y" * 62}, format="json").status_code, 200)

    def test_emitir_exige_texto_e_cancelar_exige_motivo(self):
        r = self.client.post("/api/avisos-meteorologicos/", {}, format="json")
        aid = r.data["id"]
        self.assertEqual(self.client.post(f"/api/avisos-meteorologicos/{aid}/emitir/").status_code, 400)
        self.assertEqual(self.client.post(f"/api/avisos-meteorologicos/{aid}/cancelar/", {}, format="json").status_code, 400)
        r = self.client.post(f"/api/avisos-meteorologicos/{aid}/cancelar/", {"motivo": "duplicado"}, format="json")
        self.assertEqual(r.data["estado"], "cancelado")
        self.assertEqual(self.client.patch(f"/api/avisos-meteorologicos/{aid}/", {"texto": "x"}, format="json").status_code, 409)
        # o número do cancelado não é reaproveitado
        self.assertEqual(self.novo()["numero"], 2)


class PlantaoTest(Base):
    def test_itens_do_turno_em_ordem_e_cruzando_a_meia_noite(self):
        itens = plantao.itens_do_turno(dt.date(2026, 11, 3))  # terça: sem tendência; dia 3: sem simulado
        codigos = [i["codigo"] for i in itens]
        self.assertEqual(codigos[0], "troca_inicio")
        self.assertEqual(codigos[-1], "passagem")
        self.assertNotIn("tendencia", codigos)
        self.assertNotIn("simulado", codigos)
        self.assertLess(codigos.index("briefing_noite_salvar"), codigos.index("verif_obs"))
        verif = next(i for i in itens if i["codigo"] == "verif_obs")
        self.assertEqual(timezone.localtime(verif["prazo"]).date(), dt.date(2026, 11, 4))
        self.assertEqual(timezone.localtime(next(i for i in itens if i["codigo"] == "passagem")["prazo"]).date(), dt.date(2026, 11, 4))

    def test_tendencia_na_segunda_e_simulado_no_dia_10(self):
        self.assertIn("tendencia", [i["codigo"] for i in plantao.itens_do_turno(dt.date(2026, 11, 2))])  # segunda
        self.assertIn("tendencia", [i["codigo"] for i in plantao.itens_do_turno(dt.date(2026, 11, 5))])  # quinta
        self.assertIn("simulado", [i["codigo"] for i in plantao.itens_do_turno(dt.date(2026, 11, 10))])

    def test_turno_antes_das_7h_ainda_e_o_de_ontem(self):
        self.assertEqual(plantao.turno_de(local(2026, 11, 3, 6, 59)), dt.date(2026, 11, 2))
        self.assertEqual(plantao.turno_de(local(2026, 11, 3, 7, 0)), dt.date(2026, 11, 3))

    def test_marcar_desmarcar_e_compartilhar(self):
        r = self.client.post("/api/plantao/checklist/", {"data": "2026-11-03", "codigo": "sraas", "feito": True, "observacao": "ok"}, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data["feito"]["por"], "Técnico")
        outro = get_user_model().objects.create_user("outro", password="x", first_name="Outro")
        self.client.force_authenticate(outro)
        g = self.client.get("/api/plantao/checklist/", {"data": "2026-11-03"})
        item = next(i for i in g.data["itens"] if i["codigo"] == "sraas")
        self.assertEqual(item["feito"]["por"], "Técnico")
        self.assertEqual(self.client.post("/api/plantao/checklist/", {"data": "2026-11-03", "codigo": "sraas", "feito": False}, format="json").data["feito"], None)
        self.assertFalse(ItemPlantao.objects.exists())

    def test_item_inexistente(self):
        r = self.client.post("/api/plantao/checklist/", {"data": "2026-11-03", "codigo": "tendencia"}, format="json")  # terça: não tem
        self.assertEqual(r.status_code, 400)

    def test_pendencias_do_turno_anterior(self):
        hoje = plantao.turno_de()
        ontem = hoje - dt.timedelta(days=1)
        ItemPlantao.objects.create(data=ontem, codigo="troca_inicio")
        g = self.client.get("/api/plantao/checklist/")
        cods = [p["codigo"] for p in g.data["pendencias_anteriores"]]
        self.assertNotIn("troca_inicio", cods)
        self.assertNotIn("passagem", cods)
        self.assertNotIn("acumulados_criar", cods)  # condicional não é pendência
        self.assertIn("sraas", cods)


class LivroTest(Base):
    def test_salva_e_recupera_com_destinatarios_da_configuracao(self):
        ConfiguracaoPlantao.obter().__class__.objects.filter(pk=1).update(destinatarios_lo="a@exemplo.org\n\nb@exemplo.org\n")
        g = self.client.get("/api/plantao/livro/", {"data": "2026-11-03"})
        self.assertEqual(g.status_code, 200, g.data)
        self.assertIsNone(g.data["registro"])
        self.assertEqual(g.data["destinatarios"], ["a@exemplo.org", "b@exemplo.org"])
        corpo = {"data": "2026-11-03", "operador": "Fulano", "tecnico_encerra": "A", "hora_encerra": "07:00", "texto": "texto final", "ocorrencias": [{"tipo": "radar", "texto": "Radar fora das 15h às 19h"}, {"tipo": "x", "texto": "  "}]}
        r = self.client.post("/api/plantao/livro/", corpo, format="json")
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data["criado"])
        self.assertEqual(len(r.data["registro"]["ocorrencias"]), 1)
        r = self.client.post("/api/plantao/livro/", {**corpo, "texto": "editado"}, format="json")
        self.assertFalse(r.data["criado"])
        g = self.client.get("/api/plantao/livro/", {"data": "2026-11-03"})
        self.assertEqual(g.data["registro"]["texto"], "editado")

    def test_preenche_informativos_do_turno(self):
        inf = InformativoMeteorologico.objects.create(numero=7, ano=2026, estado="enviado", emitido_em=local(2026, 11, 3, 13, 5), enviado_em=local(2026, 11, 3, 13, 5))
        inf.regioes.create(regiao="SUL II", chuva_atual="moderada")
        inf.regioes.create(regiao="CAPITAL")
        InformativoMeteorologico.objects.create(numero=8, ano=2026, estado="enviado", emitido_em=local(2026, 11, 2, 12), enviado_em=local(2026, 11, 2, 12))  # turno anterior
        g = self.client.get("/api/plantao/livro/", {"data": "2026-11-03"})
        self.assertEqual([(i["numero"], i["regioes"]) for i in g.data["automatico"]["informativos"]], [(7, ["SUL II"])])


class ImportacaoAvisosTest(Base):
    """O módulo de avisos entrou sem o histórico: o nº 1 foi reservado e cancelado, o nº 2 virou rascunho. A importação devolve os números reais."""

    def setUp(self):
        super().setUp()
        from core.models import AvisoMeteorologico

        self.AM = AvisoMeteorologico
        self.cancelado = AvisoMeteorologico.objects.create(numero=1, ano=2026, estado="cancelado", vigencia_inicio=local(2026, 11, 4, 16), vigencia_fim=local(2026, 11, 5, 16), motivo_cancelamento="gerado errado")
        self.rascunho = AvisoMeteorologico.objects.create(numero=2, ano=2026, vigencia_inicio=local(2026, 11, 7, 9), vigencia_fim=local(2026, 11, 8, 9), texto="meu texto")

    def test_importa_numeros_reais_e_renumera_o_rascunho(self):
        from core.importacao_avisos import importar

        r = importar()
        self.assertEqual(r["criados"], [1, 2, 3, 4, 5, 6, 7, 8])
        self.assertEqual(r["lacunas"], [])
        self.rascunho.refresh_from_db()
        self.cancelado.refresh_from_db()
        self.assertEqual((self.rascunho.numero, self.rascunho.estado, self.rascunho.texto), (9, "rascunho", "meu texto"))  # conteúdo preservado, número = max + 1
        self.assertEqual((self.cancelado.numero, self.cancelado.estado), (0, "cancelado"))  # nunca apagado
        self.assertEqual(self.AM.objects.filter(ano=2026, estado="emitido").count(), 8)
        self.assertEqual(self.AM.objects.get(ano=2026, numero=1).estado, "emitido")

    def test_repetir_nao_duplica(self):
        from core.importacao_avisos import importar

        importar()
        r = importar()
        self.assertEqual(r["criados"], [])
        self.assertEqual(r["ja_existiam"], [1, 2, 3, 4, 5, 6, 7, 8])
        self.assertEqual(self.AM.objects.filter(ano=2026).count(), 10)

    def test_corrige_sistemas_de_aviso_ja_importado(self):
        from core.importacao_avisos import importar

        importar()
        self.AM.objects.filter(ano=2026, numero=1).update(sistemas=["frente_fria", "transporte_umidade"])
        r = importar()
        self.assertEqual(r["atualizados"], [1])
        self.assertEqual(self.AM.objects.get(ano=2026, numero=1).sistemas, ["frente_fria", "canal_umidade"])

    def test_dry_run_nao_grava(self):
        from core.importacao_avisos import importar

        r = importar(dry_run=True)
        self.assertEqual(r["criados"], [1, 2, 3, 4, 5, 6, 7, 8])
        self.assertEqual(self.AM.objects.filter(ano=2026).count(), 2)
        self.rascunho.refresh_from_db()
        self.assertEqual(self.rascunho.numero, 2)

    def test_nao_sobrescreve_aviso_emitido_diferente(self):
        from core.importacao_avisos import importar

        self.rascunho.estado, self.rascunho.emitido_em = "emitido", timezone.now()
        self.rascunho.save()
        r = importar()
        self.assertTrue(any("nº 2/2026" in e for e in r["erros"]))
        self.rascunho.refresh_from_db()
        self.assertEqual((self.rascunho.numero, self.rascunho.texto), (2, "meu texto"))

    def test_proximo_aviso_depois_da_importacao(self):
        from core.importacao_avisos import importar

        importar()
        resp = self.client.post("/api/avisos-meteorologicos/", {}, format="json")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["numero"], 10)  # 9 é o rascunho de hoje


class ImportacaoHistoricoAvisosTest(Base):
    def test_importa_2024_e_2025_com_lacunas_e_e_repetivel(self):
        from core.importacao_avisos_historico import importar_historico
        from core.models import AvisoMeteorologico

        a = importar_historico(2024)
        self.assertEqual(len(a["criados"]), 20)
        self.assertEqual(a["lacunas"], [15, 16])
        b = importar_historico(2025)
        self.assertEqual(len(b["criados"]), 16)
        self.assertEqual(b["lacunas"], [1, 6, 17])
        self.assertEqual(importar_historico(2025)["criados"], [])  # repetir não duplica
        a3 = AvisoMeteorologico.objects.get(ano=2024, numero=3)
        self.assertIn("COSTA VERDE", a3.regioes)
        a19 = AvisoMeteorologico.objects.get(ano=2025, numero=19)
        self.assertEqual(a19.vigencia_fim.year, 2026)
        self.assertTrue(all(x.vigencia_fim > x.vigencia_inicio for x in AvisoMeteorologico.objects.all()))

    def test_dry_run_nao_grava(self):
        from core.importacao_avisos_historico import importar_historico
        from core.models import AvisoMeteorologico

        importar_historico(2024, dry_run=True)
        self.assertEqual(AvisoMeteorologico.objects.count(), 0)


class PublicoAvisosTest(Base):
    def test_publico_so_mostra_emitido_vigente_sem_login(self):
        from core.models import AvisoMeteorologico

        agora = timezone.now()
        base = dict(ano=agora.year, vigencia_inicio=agora - dt.timedelta(hours=1), vigencia_fim=agora + dt.timedelta(hours=5), texto="Texto **forte**", sistemas=["frente_fria"], icones=["chuva"])
        AvisoMeteorologico.objects.create(numero=1, estado="emitido", emitido_em=agora, **base)
        AvisoMeteorologico.objects.create(numero=2, estado="rascunho", **base)
        AvisoMeteorologico.objects.create(numero=3, estado="cancelado", **base)
        AvisoMeteorologico.objects.create(numero=4, estado="emitido", emitido_em=agora, **{**base, "vigencia_inicio": agora - dt.timedelta(days=3), "vigencia_fim": agora - dt.timedelta(days=2)})
        self.client.logout()
        r = self.client.get("/api/publico/avisos/")
        self.assertEqual(r.status_code, 200)
        av = r.json()["avisos"]
        self.assertEqual([a["numero"] for a in av], [1])
        self.assertEqual(av[0]["sistemas"], ["Frente fria"])
        self.assertNotIn("historico", av[0])
        self.assertNotIn("idap_protocolo", av[0])
