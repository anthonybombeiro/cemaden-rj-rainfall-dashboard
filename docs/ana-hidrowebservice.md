# ANA — API HidroWebService (Hidrotelemetria): levantamento e plano de integração (22/10/2026)

A ANA liberou o acesso (resposta do setor de Telemetria ao pedido do diretor do CEMADEN-RJ). **A senha chegou ao e-mail institucional e não foi vista por quem escreveu este documento**: o código só lê as credenciais do `.env` do servidor. Fontes lidas: OpenAPI público (`https://www.ana.gov.br/hidrowebservice/api-docs`), o **manual oficial v20.02.2026** ([PDF](https://www.gov.br/ana/pt-br/assuntos/monitoramento-e-eventos-criticos/monitoramento-hidrologico/orientacoes-manuais/manuais/manual-hidrowebservice_publica.pdf)) e a resposta da ANA.

## 1. O que a ANA respondeu (e como o código respeita)
| Pergunta | Resposta da ANA | No código |
|---|---|---|
| Validade do token | **10 minutos** (o manual diz 60) | renova com 8 min; reaproveita o token entre execuções do cron (arquivo `cache_ana/estado.json`) |
| Renovação | logar de novo | 1 login só quando vence ou quando a API devolve 401 |
| Limite de dados | **30 dias** por consulta | consultamos só as últimas horas |
| Estações por requisição | **uma por vez** | requisições em série, com pausa de 0,5 s |
| Rate limit | sem política formal; evitar excesso/simultaneidade, usar intervalos e espera progressiva | pausa + novas tentativas (1, 2 e 4 s) |
| `clientid` | não faz parte da API | não é usado |
| Ambiente de testes | não existe | validação por consultas de leitura (rota `/api/admin/ana/`, só leitura) |
| Credenciais | guardar seguro, fora do código/logs, HTTPS | só `.env`; nunca em log/commit |

O manual acrescenta: **autenticação em alta frequência é monitorada e pode bloquear o IP** (no HostGator o IP é compartilhado — por isso o token é reaproveitado).

## 2. Como a API funciona
* Base: `https://www.ana.gov.br/hidrowebservice/EstacoesTelemetricas`.
* **Login:** `GET /OAUth/v1` com os **cabeçalhos** `Identificador` (CPF/CNPJ) e `Senha`. Resposta `{status, code, message, items:{tokenautenticacao, token, validade, ...}}`. O JWT vai em `Authorization: Bearer <token>`.
* Todas as respostas têm o envelope `{status, code, message, items}`; códigos 200/201/401/406/417/500.
* **Rotas úteis** (todas GET):
  * `HidroInventarioEstacoes/v1` — inventário completo (filtros: código, **UF** = `RJ`, bacia). Campos: `codigoestacao`, `Estacao_Nome`, `Latitude`, `Longitude`, `Altitude`, `Tipo_Estacao` (Fluviométrica/Pluviométrica), `Operando` (1 = ativa), `Municipio_Nome` (código de município **da ANA, não IBGE**), `Bacia_Nome`, `Operadora_Sigla` (quem mantém: CPRM/SGB etc.), `Responsavel_Sigla`, `UF_Estacao`, `Data_Periodo_Telemetrica_Inicio/Fim`, `Data_Ultima_Atualizacao`…
  * `HidroinfoanaSerieTelemetricaAdotada/v1` (e `/v2`, até 10 estações por chamada — evitado a pedido da ANA) — série **telemétrica adotada**: `Chuva_Adotada` (mm), `Cota_Adotada` (**cm**), `Vazao_Adotada` (m³/s), cada uma com `*_Status` (**0 ok, 1 suspeito, 2 ruim**), `Data_Hora_Medicao`, `Data_Atualizacao`, `codigoestacao`. Parâmetros: estação, `TipoFiltroData` (`DATA_LEITURA` | `DATA_ULTIMA_ATUALIZACAO`), data de busca e `Range` (`MINUTO_5`…`HORA_24`, `DIAS_2…DIAS_30`).
  * `HidroinfoanaSerieTelemetricaDetalhada/v1|v2` — o mesmo, com os dados brutos.
  * Convencionais (coleta manual, séries até 366 dias): `HidroSerieChuva`, `HidroSerieCotas`, `HidroSerieVazao`, `HidroSerieQA`, `HidroSerieResumoDescarga`, `HidroSeriePerfilTransversal`, `HidroSerieCurvaDescarga`, `HidroSerieSedimentos`, `HidroSerieGranulometria`; tabelas auxiliares (`HidroRio`, `HidroBacia`, `HidroSubBacia`, `HidroMunicipio`, `HidroUF`, `HidroEntidade`) e **HidroSat** (estações virtuais por satélite).

## 3. Como entram no painel "igual às demais"
Padrão do painel: um **conector** por fonte → `Source` + `Station` + `Reading` (`BaseConnector.run()`), exibido nas abas Dados/Mapa/Hidrológicos.
* **Conector pronto:** `backend/ingestion/connectors/ana_hidroweb.py` (fonte `ana`, registrada em `REGISTRY`, ainda **sem cron**).
  * Estações = inventário do **RJ** (cache de 24 h) filtrado: operando, **telemétrica** (com início e sem fim de telemetria), tipo pluviométrica ou fluviométrica. Fluviométrica → `hidrologica` (nível), pluviométrica → `pluviometrica`. Município por ponto-no-polígono (malha do IBGE), como no INEA. Metadados: código ANA, bacia, operadora, responsável. Ajustes por variável de ambiente: `ANA_HIDRO_UF`, `ANA_HIDRO_EXCLUIR`, `ANA_HIDRO_INCLUIR` (inclui estações de outras UFs, ex.: bacia do Paraíba do Sul a montante), `ANA_HIDRO_MAX_POR_EXECUCAO` (25), `ANA_HIDRO_FUSO`.
  * Leituras: **chuva (mm, balde)**, **nível (cm → m, igual ao INEA)** e **vazão (novo tipo `vazao_m3s`, migração 0024)**; leitura com status 2 ("ruim") não é gravada, status 1 ("suspeito") entra com o status no `raw_payload`.
  * **Rodízio:** como a ANA pede uma estação por vez, cada execução lê até 25 estações (cursor em disco) com pausa entre elas — cabe no tempo do servidor compartilhado; ~100 estações = 4 execuções (15 min cada) por ciclo.
* **Rota de diagnóstico (só leitura):** `POST /api/admin/ana/` (superusuário logado) com `{"acao":"inventario"}` (lista o que entraria) ou `{"acao":"serie","codigo":"…"}` (itens brutos de uma estação, para conferir parâmetros, fuso e unidade). Não grava nada.
* **Testes automáticos** (5, sem rede, com a resposta do manual): conversão de unidades, descarte de status ruim, reaproveitamento do token e renovação no 401, rodízio do cursor, ingestão sem duplicar.

## 4. O que ainda não dá para fechar sem a credencial (e como será tirado)
1. **Nomes exatos dos parâmetros de consulta** — o manual só mostra a resposta; o exemplo em Java usa `CodigoDaEstacao`, `TipoFiltroData`, `RangeIntervaloDeBusca`, enquanto o OpenAPI mostra rótulos com espaço e acento. O código usa os do exemplo (`PARAMETROS_SERIE`); a rota de diagnóstico confirma.
2. **Fuso de `Data_Hora_Medicao`** (assumido horário de Brasília) e se `Chuva_Adotada` é a chuva do intervalo (tratada como balde) — conferir comparando com estações do INEA que também têm código ANA.
3. **Quais estações entram:** a rota `inventario` lista as do RJ; a equipe confirma (`ANA_HIDRO_EXCLUIR`/`INCLUIR`). Já temos o código ANA de ~63 estações do INEA (`ana_codigo_plu/flu`), que servem de conferência cruzada.

## 5. Passos para ligar (quando houver a credencial no servidor)
1. Colocar `ANA_HIDRO_IDENTIFICADOR` e `ANA_HIDRO_SENHA` no `backend/.env` local; o assistente envia ao `.env` do servidor (nunca no chat nem no git).
2. Rodar `inventario` e `serie` (diagnóstico), ajustar parâmetros/fuso se preciso.
3. Primeira ingestão manual (`ingest ana`) e conferência das leituras.
4. Cron de 15 min (`ingest ana`, minuto livre) e verificação do atraso por estação.
5. **Interface:** nova sub-aba **ANA** em Dados (tabela igual à do INEA: 15 min/1/3/6/12/24/48/72/96 h, última leitura, atraso), marcadores no mapa, nível das fluviométricas na aba **Hidrológico** (cotas editáveis no Admin, como as demais), vazão como coluna nova, e a fonte no painel de saúde das fontes (cadência esperada 15 min).
