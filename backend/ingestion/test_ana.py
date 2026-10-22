import datetime as dt
import tempfile
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

from django.test import TestCase

from core.models import Reading, Station
from ingestion.connectors import ana_hidroweb as ana

INVENTARIO = [
    # mesma estação física, duas linhas (fluviométrica de 8 dígitos e pluviométrica de 7) — vira uma só
    {"codigoestacao": "58880001", "Estacao_Nome": "PETROPOLIS - FAZENDA SAO JOAO", "Latitude": "-22.5113", "Longitude": "-43.1779", "Altitude": "810", "Tipo_Estacao": "Fluviometrica", "Operando": "1", "Tipo_Estacao_Telemetrica": "1", "Municipio_Nome": "PETROPOLIS", "Bacia_Nome": "RIO PARAIBA DO SUL", "Operadora_Sigla": "SGB-CPRM", "Responsavel_Sigla": "ANA", "UF_Estacao": "RJ", "Data_Periodo_Telemetrica_Inicio": "2012-01-01 00:00:00.0", "Data_Periodo_Telemetrica_Fim": None},
    {"codigoestacao": "2243001", "Estacao_Nome": "PETROPOLIS - FAZENDA SAO JOAO", "Latitude": "-22.5113", "Longitude": "-43.1779", "Tipo_Estacao": "Pluviometrica", "Operando": "1", "Tipo_Estacao_Telemetrica": "1", "Operadora_Sigla": "SGB-CPRM", "Data_Periodo_Telemetrica_Inicio": "2012-01-01 00:00:00.0", "Data_Periodo_Telemetrica_Fim": None},
    # pluviométrica telemétrica sozinha
    {"codigoestacao": "58880002", "Estacao_Nome": "TERESOPOLIS", "Latitude": "-22.4122", "Longitude": "-42.9658", "Tipo_Estacao": "Pluviometrica", "Operando": "1", "Tipo_Estacao_Telemetrica": "1", "Operadora_Sigla": "LIGHT", "Municipio_Nome": "TERESOPOLIS", "Data_Periodo_Telemetrica_Inicio": "2010-01-01 00:00:00.0", "Data_Periodo_Telemetrica_Fim": None},
    # já entra no painel por outra fonte (CEMADEN/INEA/INMET): fica de fora por padrão
    {"codigoestacao": "6", "Estacao_Nome": "DO CEMADEN", "Latitude": "-22.5", "Longitude": "-43.1", "Tipo_Estacao": "Pluviometrica", "Operando": "1", "Tipo_Estacao_Telemetrica": "1", "Operadora_Sigla": "CEMADEN"},
    # fora: não opera, convencional (sem telemetria), com fim de telemetria, sem coordenada, tipo desconhecido
    {"codigoestacao": "1", "Estacao_Nome": "PARADA", "Latitude": "-22.5", "Longitude": "-43.1", "Tipo_Estacao": "Fluviometrica", "Operando": "0", "Tipo_Estacao_Telemetrica": "1"},
    {"codigoestacao": "2", "Estacao_Nome": "MANUAL", "Latitude": "-22.5", "Longitude": "-43.1", "Tipo_Estacao": "Pluviometrica", "Operando": "1", "Tipo_Estacao_Telemetrica": "0"},
    {"codigoestacao": "3", "Estacao_Nome": "ENCERRADA", "Latitude": "-22.5", "Longitude": "-43.1", "Tipo_Estacao": "Pluviometrica", "Operando": "1", "Tipo_Estacao_Telemetrica": "1", "Data_Periodo_Telemetrica_Fim": "2020-01-01"},
    {"codigoestacao": "4", "Estacao_Nome": "SEM COORD", "Tipo_Estacao": "Pluviometrica", "Operando": "1"},
    {"codigoestacao": "5", "Estacao_Nome": "OUTRO", "Latitude": "-22.5", "Longitude": "-43.1", "Tipo_Estacao": "Sedimentometrica", "Operando": "1"},
]

# resposta do manual (Anexo I), com um valor "ruim" para testar o descarte
SERIE = [
    {"Chuva_Adotada": "0.00", "Chuva_Adotada_Status": "0", "Cota_Adotada": "781.00", "Cota_Adotada_Status": "0", "Data_Atualizacao": "2024-01-02 00:28:03.307", "Data_Hora_Medicao": "2024-01-01 23:00:00.0", "Vazao_Adotada": "13225.42", "Vazao_Adotada_Status": "0", "codigoestacao": "58880001"},
    {"Chuva_Adotada": "2.40", "Chuva_Adotada_Status": "1", "Cota_Adotada": "790.00", "Cota_Adotada_Status": "2", "Data_Atualizacao": "2024-01-02 00:28:03.317", "Data_Hora_Medicao": "2024-01-01 23:15:00.0", "Vazao_Adotada": None, "Vazao_Adotada_Status": "0", "codigoestacao": "58880001"},
]


class Resposta:
    def __init__(self, status=200, corpo=None):
        self.status_code, self._corpo = status, corpo

    def json(self):
        return self._corpo


class SessaoFalsa:
    """Simula a API: login por cabeçalhos, séries por estação; conta chamadas."""

    def __init__(self):
        self.logins = 0
        self.consultas = []
        self.token_recusado_uma_vez = False

    def get(self, url, params=None, headers=None, timeout=None):
        if url.endswith("/OAUth/v1"):
            assert headers["Identificador"] == "id" and headers["Senha"] == "senha"
            self.logins += 1
            return Resposta(200, {"status": "OK", "code": 200, "items": {"tokenautenticacao": f"tok{self.logins}", "sucesso": "true", "validade": "Thu Oct 22 12:48:12 GMT-03:00 2026"}})
        assert headers["Authorization"].startswith("Bearer tok")
        if self.token_recusado_uma_vez:
            self.token_recusado_uma_vez = False
            return Resposta(401, {})
        if url.endswith("/HidroInventarioEstacoes/v1"):
            assert params["Unidade Federativa"] == "RJ"
            return Resposta(200, {"status": "OK", "code": 200, "items": INVENTARIO})
        if url.endswith("/HidroinfoanaSerieTelemetricaAdotada/v1"):
            self.consultas.append(params["Código da Estação"])
            assert params["Tipo Filtro Data"] == "DATA_LEITURA" and "Range Intervalo de busca" in params and "Data de Busca (yyyy-MM-dd)" in params
            return Resposta(200, {"status": "OK", "code": 200, "items": SERIE if params["Código da Estação"] == "58880001" else []})
        raise AssertionError(url)


class AnaTest(TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        p = mock.patch.object(ana, "_dir_cache", lambda: Path(self.tmp.name))
        p.start()
        self.addCleanup(p.stop)
        self.addCleanup(self.tmp.cleanup)
        s = mock.patch.object(ana.time, "sleep", lambda *_: None)
        s.start()
        self.addCleanup(s.stop)

    def test_inventario_vira_estacoes_e_descarta_o_que_nao_serve(self):
        con = ana.AnaHidroWebConnector(ana.ClienteAna("id", "senha", SessaoFalsa()))
        est = con.fetch_stations()
        # o par pluviométrico+fluviométrico vira uma estação só; "do CEMADEN", parada, manual, encerrada, sem coordenada e tipo outro saem
        self.assertEqual([e["external_id"] for e in est], ["58880001", "58880002"])
        flu = est[0]
        self.assertEqual(flu["raw_metadata"]["codigos_ana"], ["2243001", "58880001"])
        self.assertEqual((flu["station_type"], flu["municipality"], flu["name"]), (Station.StationType.HIDROLOGICA, "Petrópolis", "Petropolis - Fazenda Sao Joao"))
        self.assertEqual(est[1]["station_type"], Station.StationType.PLUVIOMETRICA)

    def test_leituras_convertem_unidades_e_descartam_status_ruim(self):
        r = ana.leituras_da_serie("58880001", SERIE, ZoneInfo("America/Sao_Paulo"))
        por = {(x["reading_type"], x["timestamp"].strftime("%H:%M")): x["value"] for x in r}
        # 23:00 (UTC-3) = 02:00 UTC do dia seguinte
        self.assertEqual(por[(Reading.ReadingType.NIVEL_M, "02:00")], 7.81)
        self.assertEqual(por[(Reading.ReadingType.VAZAO_M3S, "02:00")], 13225.42)
        self.assertEqual(por[(Reading.ReadingType.CHUVA_MM, "02:00")], 0.0)
        # cota com status 2 (ruim) e vazão nula não entram; chuva suspeita (1) entra
        self.assertNotIn((Reading.ReadingType.NIVEL_M, "02:15"), por)
        self.assertNotIn((Reading.ReadingType.VAZAO_M3S, "02:15"), por)
        self.assertEqual(por[(Reading.ReadingType.CHUVA_MM, "02:15")], 2.4)

    def test_operadoras_ja_no_painel_so_entram_se_pedido(self):
        with mock.patch.dict("os.environ", {"ANA_HIDRO_EXCLUIR_OPERADORAS": ""}):
            con = ana.AnaHidroWebConnector(ana.ClienteAna("id", "senha", SessaoFalsa()))
            self.assertIn("6", [e["external_id"] for e in con.fetch_stations()])

    def test_validade_do_token_informada_pela_ana(self):
        self.assertEqual(ana._epoch_validade("Thu Oct 22 12:48:12 GMT-03:00 2026"), dt.datetime(2026, 10, 22, 15, 48, 12, tzinfo=dt.timezone.utc).timestamp())
        self.assertIsNone(ana._epoch_validade("lixo"))

    def test_token_e_reaproveitado_e_renovado_se_recusado(self):
        sessao = SessaoFalsa()
        cli = ana.ClienteAna("id", "senha", sessao)
        cli.inventario("RJ")
        cli.inventario("RJ")
        self.assertEqual(sessao.logins, 1)  # um login só, mesmo com 2 chamadas
        sessao.token_recusado_uma_vez = True
        cli.inventario("RJ")
        self.assertEqual(sessao.logins, 2)  # 401 -> renova uma vez e repete

    def test_sem_credencial_falha_com_mensagem_clara(self):
        with self.assertRaises(ana.AnaErro):
            ana.ClienteAna("", "")

    def test_ingestao_completa_em_rodizio_e_sem_duplicar(self):
        sessao = SessaoFalsa()
        con = ana.AnaHidroWebConnector(ana.ClienteAna("id", "senha", sessao))
        con.max_por_execucao = 1  # uma estação por rodada: testa o rodízio
        res = con.run()
        self.assertEqual((res.stations_created, res.errors), (2, []))
        self.assertEqual(sessao.consultas, ["58880001"])
        self.assertEqual(Reading.objects.filter(station__external_id="58880001").count(), 4)  # chuva×2 + cota×1 (a outra é "ruim") + vazão×1 (a outra é nula)
        con2 = ana.AnaHidroWebConnector(ana.ClienteAna("id", "senha", sessao))
        con2.max_por_execucao = 1
        con2.run()
        self.assertEqual(sessao.consultas, ["58880001", "58880002"])  # cursor avançou
        con3 = ana.AnaHidroWebConnector(ana.ClienteAna("id", "senha", sessao))
        con3.max_por_execucao = 1
        res3 = con3.run()  # volta à primeira: mesmas leituras → duplicadas ignoradas
        self.assertEqual(res3.readings_created, 0)
        self.assertEqual(sessao.logins, 1)
