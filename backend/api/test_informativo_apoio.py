import datetime as dt
import json
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from core import importacao_informativos as imp
from core import informativo_apoio as apoio
from core.models import InformativoMeteorologico, InformativoRegiao, Previsao, Reading, Source, Station


def estacao(nome="Est. Petrópolis", municipio="Petrópolis", slug="alerta_rio"):
    fonte, _ = Source.objects.get_or_create(slug=slug, defaults={"name": slug})
    return Station.objects.create(source=fonte, external_id=nome, name=nome, municipality=municipio, station_type=Station.StationType.PLUVIOMETRICA, latitude=-22.5, longitude=-43.1)


def chuva(est, mm, quando):
    return Reading.objects.create(station=est, reading_type=Reading.ReadingType.CHUVA_MM, value=mm, timestamp=quando)


def item(regiao, prevista="", atual="", **kw):
    return {"regiao": regiao, "chuva_prevista": prevista, "chuva_atual": atual, "raios": False, "raios_atual": False, "granizo": False, "vento_previsto": "", **kw}


class EscalaEClassesTest(APITestCase):
    def test_faixas_da_escala_unica(self):
        self.assertIsNone(apoio.classe_1h(0.1))
        self.assertEqual(apoio.classe_1h(0.2)[0], "fraca")
        self.assertEqual(apoio.classe_1h(5.1)[0], "moderada")
        self.assertEqual(apoio.classe_1h(25.1)[0], "forte")
        self.assertEqual(apoio.classe_1h(50)[0], "forte")
        self.assertEqual(apoio.classe_1h(50.1)[0], "muito_forte")


class RegrasDoPlantaoTest(APITestCase):
    agora = timezone.now()

    def chuva(self, **por_regiao):
        return {r: {"classe": c, "rotulo": apoio.classe_1h({"fraca": 1, "moderada": 10, "forte": 30, "muito_forte": 60}[c])[1], "max_1h_mm": 10.0, "estacao": "E", "municipio": "M"} for r, c in por_regiao.items()}

    def test_regiao_descoberta_so_com_chuva_moderada_fora_do_informativo(self):
        itens = [item("SUL I", prevista="moderada_forte"), item("NORTE", prevista="fraca")]
        chuva = self.chuva(**{"SUL I": "forte", "NORTE": "moderada", "CAPITAL": "fraca", "SERRANA I": "moderada"})
        d = apoio.regioes_descobertas(itens, chuva)
        self.assertEqual([x["regiao"] for x in d], ["NORTE", "SERRANA I"])  # NORTE: o informativo só prevê fraca; CAPITAL: chuva fraca não conta

    def test_quando_emitir(self):
        sem = apoio.quando_emitir(None, self.chuva(CAPITAL="forte"), self.agora)
        self.assertEqual((sem["emitir"], sem["urgencia"]), (True, "alta"))
        self.assertEqual(apoio.quando_emitir(None, self.chuva(CAPITAL="moderada"), self.agora)["urgencia"], "media")
        self.assertFalse(apoio.quando_emitir(None, self.chuva(CAPITAL="fraca"), self.agora)["emitir"])
        vig = {"numero": 194, "ano": 2026, "vigente_ate": self.agora + dt.timedelta(hours=3), "itens": [item("SUL I", prevista="moderada")]}
        self.assertFalse(apoio.quando_emitir(vig, self.chuva(**{"SUL I": "moderada"}), self.agora)["emitir"])
        desc = apoio.quando_emitir(vig, self.chuva(**{"SERRANA II": "forte"}), self.agora)
        self.assertTrue(desc["emitir"])
        self.assertIn("nº 194/2026", desc["motivo"])
        vencendo = {**vig, "vigente_ate": self.agora + dt.timedelta(minutes=20)}
        self.assertIn("renovar", apoio.quando_emitir(vencendo, self.chuva(**{"SUL I": "moderada"}), self.agora)["motivo"])

    def test_sugestao_de_nm_so_acima_do_vigente_e_marca_nm3(self):
        niveis = {"Petrópolis": {"regiao": "SERRANA I", "nivel": 0}, "Niterói": {"regiao": "METROPOLITANA", "nivel": 3}, "Macaé": {"regiao": "NORTE", "nivel": 0}}
        itens = [item("SERRANA I", prevista="moderada_forte", raios=True), item("METROPOLITANA", prevista="moderada_forte", raios=True), item("NORTE", prevista="moderada_muito_forte")]
        s = {x["municipio"]: x for x in apoio.sugestoes_nm(itens, 195, 2026, niveis)}
        self.assertEqual((s["Petrópolis"]["sugerido"], s["Petrópolis"]["so_a_pedido"]), (2, False))
        self.assertNotIn("Niterói", s)  # NM 3 vigente já está acima da sugestão (NM 2)
        self.assertEqual((s["Macaé"]["sugerido"], s["Macaé"]["so_a_pedido"]), (3, True))

    def test_indices(self):
        r = apoio.indices(6, 2, 2, 90)
        self.assertEqual((r["pod"], r["far"], r["csi"]), (0.75, 0.25, 0.6))
        self.assertIsNone(apoio.indices(0, 0, 0, 5)["pod"])


class ChuvaDasEstacoesTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.agora = timezone.now()

    def test_maior_chuva_de_1h_por_redec_na_escala_unica(self):
        a, b = estacao("Fraca", "Petrópolis"), estacao("Forte", "Petrópolis")
        c = estacao("Capital", "Rio de Janeiro")
        chuva(a, 1.0, self.agora - dt.timedelta(minutes=10))
        chuva(b, 20.0, self.agora - dt.timedelta(minutes=20))
        chuva(b, 8.0, self.agora - dt.timedelta(minutes=5))
        chuva(c, 0.0, self.agora - dt.timedelta(minutes=5))  # sem chuva: não entra
        r = apoio.chuva_atual_por_redec(self.agora)
        self.assertEqual(set(r), {"SERRANA I"})
        self.assertEqual((r["SERRANA I"]["classe"], r["SERRANA I"]["estacao"], r["SERRANA I"]["intensidade_sugerida"]), ("forte", "Forte", "moderada_forte"))
        self.assertEqual(r["SERRANA I"]["estacoes_com_chuva"], 2)

    def test_leitura_velha_nao_conta_como_chuva_agora(self):
        chuva(estacao("Velha", "Petrópolis"), 30.0, self.agora - dt.timedelta(hours=2))
        self.assertEqual(apoio.chuva_atual_por_redec(self.agora), {})

    def test_previsao_do_dia_so_com_chuva_no_icone(self):
        hoje = timezone.localdate()
        kw = dict(data=hoje, temperatura_maxima=25, temperatura_minima=15, umidade_maxima=90, umidade_minima=60)
        Previsao.objects.create(regiao="SUL I", icone="ceuNubladoChuvaRaios", **kw)
        Previsao.objects.create(regiao="NORTE", icone="ceuNubladoChuva", **kw)
        Previsao.objects.create(regiao="CAPITAL", icone="ceuNublado", **kw)
        p = apoio.previsao_do_dia_por_redec(hoje)
        self.assertEqual(set(p), {"SUL I", "NORTE"})
        self.assertEqual((p["SUL I"]["raios"], p["SUL I"]["chuva_prevista"], p["NORTE"]["chuva_prevista"]), (True, "moderada", "fraca_moderada"))


class VerificacaoTest(APITestCase):
    def test_acerto_falso_alarme_e_perda(self):
        emitido = timezone.now() - dt.timedelta(hours=9)
        peto = estacao("Petrópolis", "Petrópolis")  # SERRANA I: previsto e ocorreu
        rio = estacao("Rio", "Rio de Janeiro")  # CAPITAL: não previsto, mas ocorreu
        chuva(peto, 12.0, emitido + dt.timedelta(minutes=70))
        chuva(rio, 9.0, emitido + dt.timedelta(minutes=130))
        r = apoio.verificar([{"numero": 1, "ano": 2026, "emitido_em": emitido, "itens": [item("SERRANA I", prevista="moderada_forte"), item("NORTE", prevista="moderada_forte")]}])
        d = r["informativos"][0]
        res = {x["regiao"]: x["resultado"] for x in d["regioes"]}
        self.assertEqual(res, {"SERRANA I": "acerto", "NORTE": "falso alarme", "CAPITAL": "perda"})
        self.assertEqual((d["acertos"], d["falsos_alarmes"], d["perdas"], d["acertos_negativos"]), (1, 1, 1, 8))

    def test_janela_aberta_fica_de_fora(self):
        recente = timezone.now() - dt.timedelta(hours=2)
        self.assertEqual(apoio.verificar([{"numero": 1, "ano": 2026, "emitido_em": recente, "itens": []}])["informativos"], [])


class ApiApoioTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.client.force_authenticate(get_user_model().objects.create_user("ana", password="x"))

    def test_apoio_sugere_matriz_a_partir_de_estacoes_e_previsao(self):
        agora = timezone.now()
        chuva(estacao("Forte", "Petrópolis"), 30.0, agora - dt.timedelta(minutes=5))
        Previsao.objects.create(data=timezone.localdate(), regiao="SERRANA I", icone="ceuNubladoChuva", temperatura_maxima=25, temperatura_minima=15, umidade_maxima=90, umidade_minima=60)
        d = self.client.get("/api/informativos/apoio/").json()
        s = {x["regiao"]: x for x in d["sugestao"]}["SERRANA I"]
        self.assertEqual((s["chuva_atual"], s["chuva_prevista"]), ("moderada_forte", "moderada_forte"))  # a previsão do ícone (fraca a moderada) não fica abaixo da chuva atual
        self.assertTrue(any("Forte agora" in m for m in s["motivos"]))

    def test_acompanhamento_avisa_quando_emitir_e_lista_o_dia(self):
        chuva(estacao("Forte", "Petrópolis"), 30.0, timezone.now() - dt.timedelta(minutes=5))
        a = self.client.get("/api/informativos/acompanhamento/").json()
        self.assertTrue(a["emitir"]["emitir"])
        self.assertEqual(a["emitir"]["urgencia"], "alta")
        self.assertEqual(a["chuva_atual"]["SERRANA I"]["rotulo"], "Forte")
        self.assertEqual(a["hoje"], [])

    def test_sugestao_de_nm_do_informativo_aparece_nas_pendencias(self):
        i = InformativoMeteorologico.objects.create(numero=1, ano=timezone.localdate().year, estado="enviado", emitido_em=timezone.now(), enviado_em=timezone.now())
        InformativoRegiao.objects.create(informativo=i, regiao="SERRANA I", chuva_prevista="moderada_forte", raios=True)
        r = self.client.get("/api/monitoramento/sugestoes/").json()["sugestoes"]
        s = [x for x in r if x["tipo"] == "informativo" and x["municipio"] == "Petrópolis"]
        self.assertEqual(len(s), 1)
        self.assertEqual((s[0]["sugerido"], s[0]["fontes"][0]["numero"]), (2, 1))
        i.enviado_em = timezone.now() - dt.timedelta(hours=7)
        i.save()
        self.assertFalse([x for x in self.client.get("/api/monitoramento/sugestoes/").json()["sugestoes"] if x["tipo"] == "informativo"])  # vencido (6 h)

    def test_verificacao_endpoint(self):
        r = self.client.get("/api/informativos/verificacao/?dias=7").json()
        self.assertEqual((r["informativos"], r["dias"]), ([], 7))
        self.assertIn("criterio", r)


class FilaDeRevisaoTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user("ana", password="x"))
        pasta = Path(tempfile.mkdtemp())
        self.arq = pasta / "i.json"
        self.arq.write_text(json.dumps({"informativos": [], "revisao": [], "pendentes": [{"ano": 2022, "numero": 14, "linhas": [{"regiao": "NORTE", "chuva_prevista": "moderada", "vento_previsto": "", "sms_enviado": False}], "datas_texto": ["04/10/2022"], "horas": ["10:00"]}]}), encoding="utf-8")
        self.original, imp.ARQUIVO = imp.ARQUIVO, self.arq

    def tearDown(self):
        imp.ARQUIVO = self.original

    def test_lista_e_completa_um_pendente(self):
        self.assertEqual(self.client.get("/api/informativos/importacao-revisao/").json()["pendentes"][0]["numero"], 14)
        ruim = self.client.post("/api/informativos/importacao-revisao/", {"ano": 2022, "numero": 14, "data": "2030-01-01", "hora": "10:00"}, format="json")
        self.assertEqual(ruim.status_code, 400)
        ok = self.client.post("/api/informativos/importacao-revisao/", {"ano": 2022, "numero": 14, "data": "2022-04-10", "hora": "10:00"}, format="json")
        self.assertEqual(ok.status_code, 201)
        i = InformativoMeteorologico.objects.get(ano=2022, numero=14)
        self.assertTrue(i.importado and i.regioes.filter(regiao="NORTE", chuva_prevista="moderada").exists())
        self.assertEqual(self.client.get("/api/informativos/importacao-revisao/").json()["pendentes"], [])  # saiu da fila
        outra = self.client.post("/api/informativos/importacao-revisao/", {"ano": 2022, "numero": 14, "data": "2022-04-10", "hora": "10:00"}, format="json")
        self.assertEqual(outra.status_code, 409)


class RadarImagemTest(APITestCase):
    URL = "/api/informativos/radar/imagem/"
    OK = "https://radartool.inea.rj.gov.br/radar-tool/img/img-radar-mosaic-zh/INEA-1.png"

    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user("ana", password="x"))

    def test_so_aceita_png_do_radar_tool_do_inea(self):
        for ruim in ("", "http://localhost/x.png", "https://radartool.inea.rj.gov.br/outra/x.png", self.OK + "?a=1", self.OK.replace("INEA-1", "../INEA-1"), self.OK[:-4] + ".gif", "https://radartool.inea.rj.gov.br.evil.com/radar-tool/img/x.png"):
            self.assertEqual(self.client.get(self.URL, {"url": ruim}).status_code, 400, ruim)

    def test_entrega_o_png_e_recusa_resposta_estranha(self):
        from unittest import mock

        class R:
            def __init__(self, content):
                self.content = content

        with mock.patch("api.informativo_apoio_views._get_com_retentativa", return_value=R(bytes([0x89]) + b"PNG....")) as g:
            r = self.client.get(self.URL, {"url": self.OK})
            self.assertEqual((r.status_code, r["Content-Type"]), (200, "image/png"))
            self.assertEqual(g.call_args[0][0], self.OK)
        redemet = "https://estatico-redemet.decea.mil.br/radar/2026/10/02/pc/maxcappi/maps/2026-10-02--02:46:47.png"
        with mock.patch("api.informativo_apoio_views._get_com_retentativa", return_value=R(bytes([0x89]) + b"PNG....")):
            self.assertEqual(self.client.get(self.URL, {"url": redemet}).status_code, 200)  # radar da REDEMET (Pico do Couto)
            self.assertEqual(self.client.get(self.URL, {"url": redemet.replace("/radar/", "/satelite/")}).status_code, 200)  # satélite da REDEMET também
            self.assertEqual(self.client.get(self.URL, {"url": redemet.replace("/radar/", "/outra/")}).status_code, 400)
            goes = "https://satelite.cptec.inpe.br/repositoriogoes/goes19/goes19_web/ch13_baixa/2026/10/ch13_baixa_202610300900.jpg"
        with mock.patch("api.informativo_apoio_views._get_com_retentativa", return_value=R(bytes([0xFF, 0xD8, 0xFF]) + b"....")):
            r = self.client.get(self.URL, {"url": goes})  # GOES-19 do CPTEC (JPEG)
            self.assertEqual((r.status_code, r["Content-Type"]), (200, "image/jpeg"))
        with mock.patch("api.informativo_apoio_views._get_com_retentativa", return_value=R(b"<html>")):
            self.assertEqual(self.client.get(self.URL, {"url": self.OK}).status_code, 502)

    def test_exige_login(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(self.URL, {"url": self.OK}).status_code, (401, 403))


class ResumoComInformativosTest(APITestCase):
    def test_resumo_24h_lista_os_informativos_do_periodo(self):
        cache.clear()
        self.client.force_authenticate(get_user_model().objects.create_user("ana", password="x"))
        i = InformativoMeteorologico.objects.create(numero=7, ano=2026, estado="enviado", emitido_em=timezone.now() - dt.timedelta(hours=2), enviado_em=timezone.now())
        InformativoRegiao.objects.create(informativo=i, regiao="SUL I", chuva_prevista="moderada_forte")
        InformativoMeteorologico.objects.create(numero=8, ano=2026, estado="cancelado", emitido_em=timezone.now() - dt.timedelta(hours=1))
        InformativoMeteorologico.objects.create(numero=6, ano=2026, estado="enviado", emitido_em=timezone.now() - dt.timedelta(hours=40))
        r = self.client.get("/api/resumo/").json()
        self.assertEqual([(x["numero"], x["regioes"]) for x in r["informativos"]], [(7, ["SUL I"])])  # sem cancelado e sem o de 40 h atrás
