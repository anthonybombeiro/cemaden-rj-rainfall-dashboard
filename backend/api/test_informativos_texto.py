"""Geração do texto do informativo: reproduz o estilo dos informativos reais nº 168 a 193/2026 (modelo do grupo de operadores)."""

import datetime as dt

from django.test import SimpleTestCase

from core import informativos as inf


def item(regiao, atual="", prevista="", raios_atual=False, raios=False, vento="", isolada=False, granizo=False):
    return {"regiao": regiao, "chuva_atual": atual, "raios_atual": raios_atual, "chuva_prevista": prevista, "raios": raios, "vento_previsto": vento, "isolada": isolada, "granizo": granizo}


def todas(**kw):
    return [item(r, **kw) for r in inf.REGIOES]


class FrasesTest(SimpleTestCase):
    def test_onde(self):
        self.assertEqual(inf.onde(["SUL I"]), "na região Sul I")
        self.assertEqual(inf.onde(["NORTE", "NOROESTE"]), "nas regiões Norte e Noroeste")
        self.assertEqual(inf.onde(["SERRANA I", "COSTA VERDE", "SUL I"]), "nas regiões Costa Verde, Sul I e Serrana I")  # ordem canônica
        self.assertEqual(inf.onde(inf.REGIOES), "em todo o estado")
        self.assertEqual(inf.onde([r for r in inf.REGIOES if r not in ("NORTE", "NOROESTE")]), "em todas as regiões, exceto Norte e Noroeste")
        self.assertEqual(inf.onde([r for r in inf.REGIOES if r != "NORTE"]), "em todas as regiões, exceto Norte")


class TextoRealTest(SimpleTestCase):
    def texto(self, itens, **kw):
        return inf.montar_texto(kw.pop("numero", 1), 2026, dt.datetime(2026, 10, 25, 6, 37), itens, **kw)

    def test_cabecalho_do_modelo(self):
        t = self.texto(todas(atual="moderada", prevista="moderada"), numero=193)
        self.assertEqual(t.splitlines()[:5], ["CEMADEN-RJ", "INFORMATIVO METEOROLÓGICO n°193/2026", "📅 Data: 25/10/2026", "⏰ Horário: 06:37", ""])
        self.assertIn("CENÁRIO ATUAL", t)
        self.assertIn("PREVISÃO PARA AS PRÓXIMAS 06 HORAS", t)

    def test_n187_pancadas_com_raios_em_todo_o_estado(self):
        t = self.texto(todas(atual="moderada_forte", prevista="moderada", raios=True))
        self.assertIn("⛈️ Pancadas de chuva moderada, com raios, em todo o estado.", t)

    def test_n188_cenario_com_raios_em_duas_regioes(self):
        itens = [item("BAIXADA LITORÂNEA", atual="moderada_forte", raios_atual=True), item("SERRANA II", atual="moderada_forte", raios_atual=True)]
        t = self.texto(itens)
        self.assertIn("⛈️ Núcleos de chuva moderada a forte, com raios, atuam nas regiões Serrana II e Baixada Litorânea.", t)

    def test_n189_todas_exceto_norte_e_noroeste(self):
        itens = [item(r, atual="moderada", raios_atual=True) for r in inf.REGIOES if r not in ("NORTE", "NOROESTE")]
        self.assertIn("⛈️ Núcleos de chuva moderada, com raios, atuam em todas as regiões, exceto Norte e Noroeste.", self.texto(itens))

    def test_n190_isolada_com_raios_e_demais(self):
        itens = [item(r, prevista="moderada_ocasion_forte", raios=True, isolada=True) if r in ("NORTE", "NOROESTE") else item(r, prevista="fraca_moderada", isolada=True, raios=True) for r in inf.REGIOES]
        t = self.texto(itens)
        self.assertIn("⛈️ Pancadas isoladas de chuva moderada a ocasionalmente forte, com raios, nas regiões Norte e Noroeste.", t)
        self.assertIn("⛈️ Chuva fraca a moderada isolada, com raios, nas demais regiões.", t)

    def test_n191_demais_regioes_chuva_fraca_isolada(self):
        fortes = ["SUL I", "SUL II", "SERRANA I", "SERRANA II", "BAIXADA FLUMINENSE", "CAPITAL", "METROPOLITANA", "NORTE", "NOROESTE"]
        itens = [item(r, prevista="moderada_ocasion_forte", isolada=True) if r in fortes else item(r, prevista="fraca", isolada=True) for r in inf.REGIOES]
        t = self.texto(itens)
        self.assertIn("⛈️ Pancadas isoladas de chuva moderada a ocasionalmente forte em todas as regiões, exceto Costa Verde e Baixada Litorânea.", t)
        self.assertIn("🌧 Chuva fraca isolada nas demais regiões.", t)

    def test_n170_duas_faixas_na_previsao(self):
        fortes = ["SERRANA I", "SERRANA II", "BAIXADA LITORÂNEA", "NORTE", "NOROESTE"]
        itens = [item(r, atual="fraca_moderada", prevista="moderada_forte" if r in fortes else "fraca_moderada") for r in inf.REGIOES]
        t = self.texto(itens)
        self.assertIn("🌧 Núcleos de chuva fraca a moderada atuam em todo o estado.", t)
        self.assertIn("⛈️ Pancadas de chuva moderada a forte nas regiões Serrana I, Serrana II, Baixada Litorânea, Norte e Noroeste.", t)
        self.assertIn("🌧 Chuva fraca a moderada nas demais regiões.", t)

    def test_n184_rajadas_e_granizo_pontual(self):
        itens = [item(r, atual="fraca_moderada", prevista="moderada_ocasion_forte", raios=True, vento="moderado_ocasion_forte", granizo=r in ("SUL I", "NORTE")) for r in inf.REGIOES]
        t = self.texto(itens)
        self.assertIn("⛈️ Pancadas de chuva moderada a ocasionalmente forte, com raios e rajadas de vento moderado a ocasionalmente forte, em todo o estado.", t)
        self.assertIn("❄️ Possibilidade de granizo pontual nas regiões Sul I e Norte.", t)

    def test_aproximacao_por_minas_gerais(self):
        itens = [item("SUL I", atual="moderada_forte")]
        t = self.texto(itens, aproximacao={"regioes": ["SUL I"], "intensidade": "moderada_forte", "por": "Minas Gerais"})
        self.assertIn("⛈️ Núcleo de chuva moderada a forte atua na região Sul I.", t)
        self.assertIn("Núcleos de chuva moderada a forte se aproximam da região Sul I, por Minas Gerais.", t)

    def test_sem_chuva_tem_frase_padrao(self):
        t = self.texto([item("SUL I")])
        self.assertIn("Sem núcleos de chuva significativos no momento.", t)
        self.assertIn("Sem previsão de chuva significativa", t)

    def test_rodape_so_quando_configurado(self):
        self.assertTrue(self.texto(todas(prevista="fraca"), rodape="Sigam o perfil @defesacivil_rj.").endswith("Sigam o perfil @defesacivil_rj."))
        self.assertNotIn("Sigam", self.texto(todas(prevista="fraca")))


class ApoioTest(SimpleTestCase):
    def test_sugestao_de_nm(self):
        self.assertEqual(inf.nm_sugerido(item("X", prevista="fraca_moderada")), (0, False))
        self.assertEqual(inf.nm_sugerido(item("X", prevista="moderada")), (1, False))
        self.assertEqual(inf.nm_sugerido(item("X", prevista="moderada_forte")), (1, False))
        self.assertEqual(inf.nm_sugerido(item("X", prevista="moderada_forte", raios=True)), (2, False))
        self.assertEqual(inf.nm_sugerido(item("X", prevista="moderada_ocasion_forte", vento="moderado")), (2, False))
        self.assertEqual(inf.nm_sugerido(item("X", prevista="moderada_ocasion_muito_forte")), (3, True))
        self.assertEqual(inf.nm_sugerido(item("X", prevista="moderada", granizo=True)), (3, True))

    def test_cadencia_do_radar(self):
        self.assertEqual(inf.intervalo_radar_min(5, False, 15), (30, "intenso"))
        self.assertEqual(inf.intervalo_radar_min(3, True, 15), (30, "intenso"))
        self.assertEqual(inf.intervalo_radar_min(3, False, 15), (60, "moderada"))
        self.assertEqual(inf.intervalo_radar_min(2, False, 23), (180, "noite_fraca"))
        self.assertEqual(inf.intervalo_radar_min(5, False, 3), (120, "noite"))
        self.assertEqual(inf.intervalo_radar_min(5, False, 15, {"intenso": 20}), (20, "intenso"))  # configurável

    def test_lacunas(self):
        self.assertEqual(inf.lacunas([1, 2, 5, 6, 9]), [3, 4, 7, 8])
        self.assertEqual(inf.lacunas([]), [])

    def test_sms_e_tv(self):
        s = inf.texto_sms([item("SUL I", prevista="moderada_forte"), item("NORTE", prevista="fraca")])
        self.assertTrue(s["aplicavel"] and s["sms_cabe"] and s["tv_cabe"])
        self.assertEqual(s["regioes"], ["SUL I"])
        self.assertLessEqual(len(s["sms"]), 146)
        self.assertFalse(inf.texto_sms([item("SUL I", prevista="moderada")])["aplicavel"])  # só severidade moderada a forte ou mais

    def test_livro_de_ocorrencias(self):
        itens = [item("SUL I", atual="moderada", prevista="moderada_forte"), item("NORTE", prevista="moderada")]
        itens[0]["sms_enviado"] = True
        f = inf.frase_livro_ocorrencias(194, 2026, dt.datetime(2026, 10, 25, 15, 20), itens)
        self.assertEqual(f, "Informativo meteorológico n° 194/2026 enviado às 15h20 para as regiões Sul I e Norte. SMS enviado via IDAP para a região Sul I.")


class NormalizacaoTest(SimpleTestCase):
    def test_regioes(self):
        self.assertEqual(inf.normalizar_regiao("BAIXADA FLUMINESE"), ["BAIXADA FLUMINENSE"])
        self.assertEqual(inf.normalizar_regiao("SIL II"), ["SUL II"])
        self.assertEqual(inf.normalizar_regiao("serrana"), ["SERRANA I", "SERRANA II"])
        self.assertEqual(inf.normalizar_regiao("NORTE / NOROESTE"), ["NORTE", "NOROESTE"])
        self.assertEqual(inf.normalizar_regiao("Baixada Litoranea"), ["BAIXADA LITORÂNEA"])
        self.assertEqual(inf.normalizar_regiao("xyz"), [])

    def test_intensidades(self):
        casos = {
            "Fraca / Moderada": "fraca_moderada",
            "fraca/moderada": "fraca_moderada",
            "chuva fraca a moderada": "fraca_moderada",
            "Moderada": "moderada",
            "moderada a forte": "moderada_forte",
            "chuva moderada a ocasionalmente forte": "moderada_ocasion_forte",
            "moderada a ocasionalmente muito forte": "moderada_ocasion_muito_forte",
            "Forte": "moderada_forte",
            "": "",
            "granizo": "",
        }
        for texto, esperado in casos.items():
            self.assertEqual(inf.normalizar_intensidade(texto), esperado, texto)
