# Redes sensíveis — Plugfield, Macaé (UFRJ) e Wunderground

Levantamento de funcionamento, validação dos dados e tabelas individuais
(03/10/2026). Essas três redes são as **mais sensíveis para o monitoramento**
porque cobrem locais onde nenhuma outra rede opera (Plugfield: Guapimirim,
Areal, Paracambi, Cordeiro, Mendes, Engenheiro Paulo de Frontin, Rio Claro e
Cambuci; Macaé: rede própria da UFRJ/Defesa Civil; Wunderground: 121 estações
pessoais em dezenas de municípios). Por isso foi feito o mesmo ciclo da fonte
CEMADEN Nacional (`fontes-de-dados.md`): comparar com o **valor oficial** da
fonte, corrigir o que divergia, qualificar o dado, criar uma tabela própria na
aba Dados e testar.

Documentos relacionados: `fontes-de-dados.md` (catálogo geral e CEMADEN
Nacional), `operacao-cron-e-producao.md` (cron/servidor),
`registro-de-acoes.md` (diário), `dados-por-fonte-e-estacao.md`.

## 1. Resumo executivo

| Rede | Estações | Situação **antes** | Situação **depois** |
|---|---|---|---|
| **Macaé (UFRJ)** | 26 "internas" (11 com dado hoje, 15 sem/paradas) | **Grave:** gravávamos ~3-4% da chuva. Ex.: Bicuda Grande, 24 h = **3,4 mm** gravados × **90,8 mm** oficiais; 96 h = 3,4 × 139,1 | **Corrigido:** histórico por minuto do portal + acumulados oficiais. Bicuda Grande 24 h = **89,1** × 89,1 oficial; 96 h = 139,4 × 139,4 |
| **Plugfield** | 19 (17 ativas, 2 paradas há meses) | Correta: total do dia gravado = `rainDay` oficial em 17/17 estações | Mantida; acrescentados totais oficiais (dia/mês/ano), qualificação e tabela |
| **Wunderground** | 121 (106 respondem, 15 sem dado) | Correta em 95 de 96 comparáveis; 1 contador regrediu (IMARIC14: 31,5 gravados × 6,35 oficial) | Mantida; acrescentados `precipTotal`, `qcStatus`, qualificação (inclui regressão do total) e tabela |

**Causa do problema de Macaé:** o portal informa em `ultimaLeitura.volume_chuva`
o volume de **um único minuto** (basculador de 0,34 mm por pulso). O conector
gravava só esse número a cada 15 min (cron), descartando 14 dos 15 minutos.
Plugfield e Wunderground informam um **total corrido do dia**, que o
conector transforma em balde por diferença (`bucket_from_running_daily`): se uma
coleta falha, a seguinte absorve a diferença — método robusto, por isso a
divergência era nula.

## 2. Método e validação

1. Leitura de cada fonte direto na origem (credenciais do `.env`, nunca em
   documento): campos, endpoints, histórico, unidades, cadência.
2. Comparação, estação a estação, do **oficial** da fonte com **nosso** acumulado
   (mesma função da tabela de Precipitação, `_calcular_precipitacao`) em
   produção. Ações administrativas **somente leitura** criadas para isso em
   `POST /api/admin/run/`: `snapshot_precip` (nossos acumulados por estação),
   `analise_funcionamento` (cobertura, lacunas, variáveis) e, antes,
   `analise_chuva_qc`.
3. Correção em código + **teste local** em SQLite temporário com as credenciais
   reais (1ª e 2ª rodadas: a 2ª não duplica nada) + teste do endpoint e das
   tabelas (servidor local + login de teste, banco local).
4. Publicação em produção, nova ingestão e nova comparação.

Validação em produção após a correção do Macaé (1 h / 24 h / 96 h, oficial ×
nosso; pequenas diferenças vêm de janelas que "andam" entre a leitura do
oficial e a do nosso cálculo):

| Estação | Oficial | Nosso |
|---|---|---|
| Ajuda de Baixo | 0,3 / 4,1 / 9,5 | 0,3 / 4,1 / 9,5 |
| Bicuda Grande | 0,7 / 89,1 / 139,4 | 0,7 / 89,1 / 139,4 |
| Bicuda pequena | 0,7 / 22,1 / 45,2 | 0,7 / 22,1 / 45,2 |
| Centro | 2,4 / 24,8 / 31,6 | 2,4 / 24,8 / 31,6 |
| Córrego do Ouro 1 | 0,7 / 90,8 / 102,7 | 0,7 / 90,8 / 102,7 |
| Frade | 1,0 / 35,4 / 75,8 | 1,0 / 35,4 / 75,8 |
| Imboassica, Novo Horizonte, Parque Aeroporto | iguais | iguais |
| Costa do Sol | 3,7 / 76,8 / 102,7 | 2,7 / 76,8 / 102,7 (1 h difere: janela móvel) |
| CTR Macaé | 1,7 / 82,6 / 88,7 | 2,0 / 83,0 / 89,1 (janela móvel) |

## 3. Macaé — Rede de Telemetria UFRJ/Defesa Civil (`macae_ufrj`)

**Acesso** (login institucional de serviço, `MACAE_UFRJ_USERNAME/PASSWORD`):

| Passo | Chamada | Uso |
|---|---|---|
| 1 | `POST /Login` | sessão por cookie |
| 2 | `GET /Estacoes/visualizarEstacoes` | IDs das estações (44 no cadastro: 26 `interna` + 18 `weather.com`) |
| 3 | `GET /Estacoes/getEstacoesGeoJson/volume_chuva/?ids=...&ativa=true` | estações + **última leitura** (`ultimaLeitura`) com **acumulados oficiais** `volume_acumulado_1h/24h/96h` |
| 4 | `POST /Leituras/getEstatisticasLeiturasJson` | **histórico**: `estacao_selecionada`, `data_inicial`, `data_final` (`AAAA-MM-DD HH:MM:SS`, hora local), `escala` = `ESCALA_MINUTO`/`ESCALA_HORA`/`ESCALA_DIA`/`ESCALA_SEMANA`/`ESCALA_MES`, `tipo_dados` = `TIPO_VOLUME_CHUVA`, `TIPO_TEMPERATURA`, `TIPO_UMIDADE_AR`, `TIPO_VELOCIDADE_VENTO`, `TIPO_RAJADA_VENTO`, `TIPO_PRESSAO_ATMOSFERICA` (`TIPO_VOLUME_ACC_CHUVA` dá erro 500) → `{"AAAA-MM-DD HH:MM": "valor"}` (soma do período) |
| 5 | `POST /Leituras/getUltimaLeituraRegistrada` | última leitura de um tipo (não usado) |

- **Resolução:** o basculador marca 0,34 mm por pulso (valores 0,34 / 0,68 / 1,02...);
  o histórico tem 1 ponto por minuto nas estações online.
- **Campos da `ultimaLeitura`:** `datahora` (hora local), `temperatura`,
  `umidade_ar`, `velocidade_vento`/`velocidade_vento_kmh`, `dir_vento`,
  `volume_chuva` (1 min), `volume_acumulado_1h/24h/96h` (oficiais) e `payload`
  (JSON aninhado com `rajada_vento` em m/s e `pressao`).
- **Tipos de estação:** `interna` (sensor da rede; as que usamos) e `weather.com`
  (PWS do Wunderground redirecionada pelo portal, com `weathercom_station_id`;
  18 no cadastro, ignoradas para não duplicar).
- **Funcionamento:** só **11 das 26 internas** tinham dado em 03/10/2026; 15 estavam
  sem nenhuma leitura ou paradas (lista no inventário §6.1). O portal marca
  `online=false` nessas e em algumas que ainda têm leitura velha (Ajuda de
  Baixo parou 15:59; Imboassica 08:59; Novo Horizonte 07:19).
- **Correção aplicada (conector `macae_ufrj.py`):**
  1. a chuva **deixou de vir de `volume_chuva`**; `pos_ingestao` baixa o histórico
     por minuto (`ESCALA_MINUTO`) desde a última posição gravada
     (`raw_metadata["historico_minuto_ate"]`, 1ª rodada = 96 h) e grava só os
     minutos com chuva + o último minuto observado (minuto seco não altera
     nenhuma soma). **Idempotente:** minuto já gravado é atualizado, não duplicado
     (a leitura antiga de segundos de precisão cai no mesmo minuto e é corrigida);
  2. acumulados oficiais 1/24/96 h: retrato em `raw_metadata["acumulados_oficiais"]`
     e histórico 1×/hora em `AcumuladoOficial`;
  3. o código da estação (`identificador`, ex.: `est021`) fica em `raw_metadata`;
  4. leituras de chuva > 20 mm por minuto passam por `qualificar_chuva_intervalo`.
- **Custo:** ~4-10 s por rodada (1ª rodada com 96 h de histórico: ~10 s); cron `5-59/15`
  (`-m 120`) é suficiente porque o histórico por minuto recupera o que houver
  entre as coletas.
- **Riscos/pendências:** (a) as 15 estações sem dado dependem da UFRJ/Defesa Civil;
  (b) o portal não tem API documentada — mudança de layout/login pode
  quebrar o conector (o status da fonte fica em `Source.last_ingest_error`);
  (c) credencial única de serviço.

## 4. Plugfield (`plugfield`) — estações das Defesas Civis

**API** (documentação Swagger em `https://wdg.plugfield.com.br/doc-api/`,
spec em `spec.js`; servidor real `https://prod-api.plugfield.com.br`):

| Endpoint | Uso |
|---|---|
| `POST /login` (header `x-api-key`) | token que não expira |
| `GET /device?page=` | lista (19 estações) + `dashboard` com a última leitura **(usado)** |
| `GET /device/{id}` | estação + `sensorList` |
| `GET /data/hourly?device=&begin=DD/MM/AAAA HH&end=` | dados por hora (chuva `rain`, `rainAccum`; máx. 30 dias) — **não usado ainda** |
| `GET /data/daily?device=&begin=&end=` | dados por dia (`rainAccum`) — não usado |
| `GET /data/sensor?device=&sensor=&time=&timeMax=&groupedBy=` | leituras brutas por sensor (chuva = sensor 35) — não usado |

- Limites documentados: 5.000 requisições/mês por estação, 5 req/s.
- **Campos do `dashboard`** (chuva): `rainDay` (total do dia, mm), `rainMonth`,
  `rainYear`, `rain` (balde atual), `lastRainfall` (lista dos últimos
  pulsos de chuva, cada um com `time`, `period` = 300 s e `dataValue`); demais:
  `temp`, `tempMax/Min`, `humi`, `wind`/`winb` (km/h), `dire`, `pres`/`prre`, `uv`,
  `feel`, `duep`, `bat` (bateria %), `refreshInterval` = 600 s (a estação envia
  a cada 10 min).
- **Resolução do pluviômetro:** 0,11 mm por pulso.
- **Defeito conhecido do portal:** `dashboard.updateDateTime` vem com sufixo `Z`
  mas é hora local (3 h de erro); usamos `lastUpdateTimestamp` (epoch).
- **Validação em produção:** total do dia nosso = `rainDay` oficial em **17 de 17**
  estações ativas (Guapimirim 56,0 × 56,0; Areal 56,1 × 56,1; Paracambi 45,2 ×
  45,2...). Em 2 estações a diferença é de 0,1 mm (arredondamento). A janela de 24 h soma
  os baldes: ex. Guapimirim 194 mm em 24 h.
- **Estações paradas:** `Defesa Civil Cambuci RJ Jacuti` (última leitura 12/05/2026) e
  `.Município Cambuci - Pitiribote` (29/06/2026): sem dado há meses — **precisam
  de manutenção** (aparecem com 🕒 roxo/oliva na tabela).
- **Lacunas:** Defesa Civil Areal ficou 20,3 h sem dado na semana; Centro Eng.
  Paulo de Frontin 3,8 h; Rio Claro 2,1 h; as demais < 1 h. Cobertura (instantes
  gravados em 7 d): 90-107% do esperado a cada 15 min.
- **Aprimoramentos possíveis (não feitos):** usar `/data/hourly` para recuperar
  buracos de coleta e conferir janelas; `lastRainfall` traz pulsos de 5 min
  com horário exato dentro de cada coleta.
- **Unidade da radiação** (`radi` ≈ 10.000 às 7 h): desconhecida → não gravada.

## 5. Wunderground / Weather Underground (`wunderground`) — estações pessoais

**API** (`api.weather.com/v2/pws`, chave própria `WUNDERGROUND_API_KEY`):

| Endpoint | Conteúdo |
|---|---|
| `/observations/current?stationId=` | **usado:** observação atual + `metric` (`precipTotal` total do dia, `precipRate`, `temp`, `windSpeed`/`windGust` em km/h, `pressure` ao nível do mar, `dewpt`...), `qcStatus`, `softwareType`, `neighborhood` |
| `/observations/all/1day` | observações de ~5 min do dia (197 pontos em 16 h) — **não usado** |
| `/history/hourly?date=AAAAMMDD`, `/history/daily`, `/dailysummary/7day` | resumos por hora/dia — não usados |

- **Cadastro:** 121 estações em `STATIONS_RJ` (Defesas Civis + lista de terceiros, ≤ 40 km
  de cada município). Em 03/10/2026: **106 responderam** (HTTP 200) e **15 devolveram 204**
  (sem dado recente): IRIODA5, INOVAF41, ICABOF8, IMACA31, IMINASGE43, INOVAF23,
  INOVAF42, INOVAI19, INOVAI21, IPETRP36, IPETRP7, IRIODE159, IRIODE81, ITERES23,
  IVALEN520. Das 106, **105 estavam com observação < 15 min** e 1 < 1 h.
- **`qcStatus`** (controle de qualidade do Weather Company): 1 = aprovado (39
  estações), -1 = não avaliado (67), 0 = reprovado (nenhuma no momento). É **dado
  de terceiro sem calibração** — redes pessoais podem ter sensores fora de padrão
  (histórico: 60 °C, pressão 900 hPa, contador de chuva que não zera).
- **Softwares** mais comuns: EasyWeatherPro (v5.x), GW1100B/GW1200B (Ecowitt),
  AMBWeather, myAcuRite — diversidade de equipamentos.
- **Validação em produção:** total do dia nosso = `precipTotal` oficial em **95 de 96**
  estações comparáveis (10 estações vêm sem `precipTotal`). Exceção: **IMARIC14**
  (nosso 31,5 × oficial 6,35): o total da própria estação **diminuiu**
  (contador reiniciou); nossa soma mantém o que já tinha registrado. A partir de
  03/10/2026 esse caso é **qualificado como suspeito** ("total do dia regrediu").
- **Lacunas na semana (instantes de 15 min):** estações como IRIODE90 (58,6 h), ISEROP9
  (48,9 h), IRIODA16 (41,9 h), INOVAF18 (39,4 h) ficaram longos períodos fora do ar
  (inventário em §6.3).
- **Limites de uso:** 121 chamadas por rodada (~50 s), sem limite atingido
  nos testes; a chave gratuita do Weather Company costuma ter cota diária — se
  surgirem respostas 429, reduzir a frequência.

## 6. Inventário de funcionamento por estação (7 dias até 03/10/2026 ~16:40 BRT)

Cobertura* = instantes distintos (chuva/temperatura) gravados em 7 dias ÷ 672
(coleta de 15 min). Plugfield pode passar de 100% (a estação envia a cada 10 min).
"Idade" = tempo desde a última leitura gravada em qualquer momento. **Os números
de chuva de Macaé deste inventário são os do conector antigo (antes da
correção).**

### 6.1 Macaé (UFRJ) — última leitura: < 1 h: **9**, 4-24 h: **2**, 1-7 d: **1**, sem leitura: **14**

| Estação | Município | Cód. | Última leitura (BRT) | Idade | Instantes 7 d (cobertura*) | Maior lacuna | Variáveis (7 d) |
|---|---|---|---|---|---|---|---|
| Bicuda Grande | Macaé | 46 | 03/10 16:34 | 0.0 h | 61 (9%) | 16.7 h | chuva, P, T, UR, dir, vento, rajada |
| Costa do Sol | Macaé | 38 | 03/10 16:34 | 0.0 h | 50 (7%) | 45.2 h | chuva, P, T, UR, dir, vento, rajada |
| Bicuda pequena | Macaé | 41 | 03/10 16:34 | 0.1 h | 48 (7%) | 23.6 h | chuva, P, T, UR, dir, vento, rajada |
| Centro | Macaé | 94 | 03/10 16:33 | 0.1 h | 52 (8%) | 20.6 h | chuva, P, T, UR, dir, vento, rajada |
| Córrego do Ouro 1 | Macaé | 8 | 03/10 16:34 | 0.1 h | 67 (10%) | 22.1 h | chuva, T, UR, dir, vento, rajada |
| CTR MACAÉ | Macaé | 77 | 03/10 16:34 | 0.1 h | 65 (10%) | 52.0 h | chuva, P, T, UR, dir, vento, rajada |
| Frade | Macaé | 69 | 03/10 16:34 | 0.1 h | 55 (8%) | 16.7 h | chuva, P, T, UR, dir, vento, rajada |
| Parque Aeroporto | Macaé | 27 | 03/10 16:34 | 0.1 h | 58 (9%) | 17.6 h | chuva, P, T, UR, dir, vento, rajada |
| Ajuda de Baixo | Macaé | 24 | 03/10 15:59 | 0.6 h | 26 (4%) | 24.2 h | chuva, T, UR, dir, vento, rajada |
| Imboassica | Macaé | 92 | 03/10 08:59 | 7.6 h | 19 (3%) | 19.9 h | chuva, dir, vento, rajada |
| Novo Horizonte  | Macaé | 95 | 03/10 07:19 | 9.3 h | 16 (2%) | 19.5 h | chuva, P, T, dir, vento, rajada |
| Cabiúnas | Macaé | 67 | 28/09 13:09 | 5 d | 1 (0%) | — | chuva, P, T, UR, dir, vento, rajada |
| Aterrado do Imburo | Macaé | 12 | nunca | — | 0 (0%) | — | — |
| Bairro da Glória | Macaé | 9 | nunca | — | 0 (0%) | — | — |
| Campo d’ Oeste | Macaé | 93 | nunca | — | 0 (0%) | — | — |
| Estação Defesa Civil | Macaé | 39 | nunca | — | 0 (0%) | — | — |
| Granja dos Cavaleiros | Macaé | 88 | nunca | — | 0 (0%) | — | — |
| Jardim Vitória | Macaé | 16 | nunca | — | 0 (0%) | — | — |
| Lagomar II | Macaé | 96 | nunca | — | 0 (0%) | — | — |
| Malvinas | Macaé | 18 | nunca | — | 0 (0%) | — | — |
| Miramar | Macaé | 14 | nunca | — | 0 (0%) | — | — |
| Morro de São Jorge | Macaé | 17 | nunca | — | 0 (0%) | — | — |
| Trapiche 1 | Macaé | 11 | nunca | — | 0 (0%) | — | — |
| UFRJ - BLOCO B (Estação em teste) | Macaé | 42 | nunca | — | 0 (0%) | — | — |
| UFRJ - Macaé | Macaé | 91 | nunca | — | 0 (0%) | — | — |
| Virgem Santa II | Macaé | 90 | nunca | — | 0 (0%) | — | — |

### 6.2 Plugfield — última leitura: < 1 h: **17**, > 7 d: **2**

| Estação | Município | Cód. | Última leitura (BRT) | Idade | Instantes 7 d (cobertura*) | Maior lacuna | Variáveis (7 d) |
|---|---|---|---|---|---|---|---|
| 2065 - PAROQUIA NOSSA SENHORA DA AJUDA GUAPIMIRIM | Guapimirim | 10864 | 03/10 16:34 | 0.0 h | 709 (106%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| DEFESA CIVIL AREAL | Areal | 2016 | 03/10 16:35 | 0.0 h | 620 (92%) | 20.3 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| 2055 - PATIO DA CAMARA MUNICIPAL GUAPIMIRIM | Guapimirim | 10889 | 03/10 16:31 | 0.1 h | 607 (90%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| CANAL DO PAIOL GUAPIMIRIM | Guapimirim | 11303 | 03/10 16:30 | 0.1 h | 721 (107%) | 0.7 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| DEFESA CIVIL GUAPIMIRIM | Guapimirim | 10899 | 03/10 16:31 | 0.1 h | 714 (106%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| E.M Nelson Costa Mello VALE DAS PEDRINHAS  GUAPIMIRIM | Guapimirim | 11328 | 03/10 16:32 | 0.1 h | 710 (106%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| ESCOLA CASTRO ALVES CANECA FINA GUAPIMIRIM | Guapimirim | 11329 | 03/10 16:33 | 0.1 h | 711 (106%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| ESTAÇÃO CENTRO - ENGENHEIRO PAULO DE FRONTIN | Engenheiro Paulo de Frontin | 4419 | 03/10 16:31 | 0.1 h | 696 (104%) | 3.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| ESTAÇÃO MENDES CENTRO (CIEP 288) - Defesa Civil | Mendes | 9496 | 03/10 16:30 | 0.1 h | 712 (106%) | 0.7 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| Estação Meteorológica Cordeiro Centro | Cordeiro | 1884 | 03/10 16:32 | 0.1 h | 720 (107%) | 0.7 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| ESTACÃO PALMAS EPF | Engenheiro Paulo de Frontin | 4636 | 03/10 16:33 | 0.1 h | 714 (106%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| Estação Rio Claro Defesa Civil | Rio Claro | 2112 | 03/10 16:30 | 0.1 h | 698 (104%) | 2.1 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| ESTAÇÃO SACRA FAMÍLIA EPF | Engenheiro Paulo de Frontin | 3281 | 03/10 16:31 | 0.1 h | 717 (107%) | 0.7 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| LAGES - PARACAMBI - DEFESA CIVIL | Paracambi | 10192 | 03/10 16:31 | 0.1 h | 718 (107%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| RAIA - PARACAMBI - DEFESA CIVIL | Paracambi | 10995 | 03/10 16:33 | 0.1 h | 719 (107%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| SÃO LOURENÇO - PARACAMBI - DEFESA CIVIL | Paracambi | 10989 | 03/10 16:31 | 0.1 h | 716 (107%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| CANAL MAGEMIRIM | Guapimirim | 11330 | 03/10 16:27 | 0.2 h | 715 (106%) | 0.8 h | chuva, Td, P, Pnm, ST, T, Tmax, Tmin, UR, UV, dir, vento, rajada |
| .Município Cambuci - Pitiribote | Cambuci | 3307 | 28/06 23:53 | 97 d | 0 (0%) | — | — |
| Defesa Civil Cambuci RJ Jacutinga  | Cambuci | 3097 | 12/05 10:51 | 509 d | 0 (0%) | — | — |

### 6.3 Wunderground — última leitura: < 1 h: **105**, 1-4 h: **2**, 4-24 h: **2**, 1-7 d: **4**, > 7 d: **2**, sem leitura: **6**

| Estação | Município | Cód. | Última leitura (BRT) | Idade | Instantes 7 d (cobertura*) | Maior lacuna | Variáveis (7 d) |
|---|---|---|---|---|---|---|---|
| Angra dos Reis | Angra dos Reis | IANGRA31 | 03/10 16:33 | 0.1 h | 738 (110%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Angra dos Reis | Angra dos Reis | IANGRA34 | 03/10 16:33 | 0.1 h | 656 (98%) | 2.0 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Areal | Areal | IAREAL7 | 03/10 16:34 | 0.1 h | 738 (110%) | 0.5 h | chuva, Pnm, rad, UV, dir, vento, rajada |
| Armação dos Búzios | Armação dos Búzios | IARMAO4 | 03/10 16:34 | 0.1 h | 738 (110%) | 0.5 h | chuva, Pnm, rad, UV, dir, vento, rajada |
| Armação dos Búzios | Armação dos Búzios | IARMAO9 | 03/10 16:33 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Armação dos Búzios | Armação dos Búzios | IARMAO3 | 03/10 16:33 | 0.1 h | 736 (110%) | 0.5 h | chuva, Pnm, rad, UV, dir, vento, rajada |
| Arraial do Cabo | Arraial do Cabo | IARRAI26 | 03/10 16:34 | 0.1 h | 0 (0%) | — | Pnm |
| Barra de São João | Casimiro de Abreu | ICASIM5 | 03/10 16:33 | 0.1 h | 578 (86%) | 15.0 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Barra do Piraí | Barra do Piraí | IBARRA22 | 03/10 16:34 | 0.1 h | 737 (110%) | 0.5 h | Td, Pnm, T, UR |
| Barra do Piraí | Barra do Piraí | IBARRA57 | 03/10 16:33 | 0.1 h | 740 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Barra do Piraí | Barra do Piraí | IBARRA79 | 03/10 16:33 | 0.1 h | 674 (100%) | 13.4 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Barra do Piraí | Barra do Piraí | IBARRA88 | 03/10 16:33 | 0.1 h | 720 (107%) | 2.9 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Barra Do Piraí | Barra do Piraí | IBARRADO2 | 03/10 16:33 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Bocaina de Minas | Itatiaia | IBOCAI22 | 03/10 16:33 | 0.1 h | 694 (103%) | 7.0 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Cabo Frio | Cabo Frio | ICABOF4 | 03/10 16:33 | 0.1 h | 738 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Casimiro de Abreu | Casimiro de Abreu | ICASIM3 | 03/10 16:33 | 0.1 h | 741 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Casimiro de Abreu | Casimiro de Abreu | ICASIM4 | 03/10 16:34 | 0.1 h | 707 (105%) | 3.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Cunha | Paraty | ICUNHA2 | 03/10 16:34 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Cunha | Paraty | ICUNHA4 | 03/10 16:34 | 0.1 h | 578 (86%) | 0.7 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Cunha | Paraty | ICUNHA6 | 03/10 16:33 | 0.1 h | 738 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Cunha | Paraty | ICUNHA7 | 03/10 16:34 | 0.1 h | 696 (104%) | 9.4 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Cunha | Paraty | ICUNHA8 | 03/10 16:34 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Cunha | Paraty | ICUNHA9 | 03/10 16:33 | 0.1 h | 738 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Itaguaí | Itaguaí | IITAGU8 | 03/10 16:33 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Itatiaia | Itatiaia | IITATI13 | 03/10 16:33 | 0.1 h | 735 (109%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Itatiaia | Itatiaia | IITATI4 | 03/10 16:34 | 0.1 h | 689 (103%) | 7.4 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Juiz de Fora | Comendador Levy Gasparian | IJUIZD29 | 03/10 16:33 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Juiz de Fora | Comendador Levy Gasparian | IJUIZD31 | 03/10 16:30 | 0.1 h | 681 (101%) | 0.8 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Juiz de Fora | Comendador Levy Gasparian | IJUIZD37 | 03/10 16:33 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Juiz de Fora | Comendador Levy Gasparian | IJUIZD39 | 03/10 16:33 | 0.1 h | 741 (110%) | 0.5 h | Td, Pnm, T, UR |
| Juiz de Fora | Comendador Levy Gasparian | IJUIZD9 | 03/10 16:33 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Macaé | Macaé | IMACA15 | 03/10 16:33 | 0.1 h | 731 (109%) | 2.2 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA30 | 03/10 16:34 | 0.1 h | 758 (113%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA32 | 03/10 16:33 | 0.1 h | 549 (82%) | 3.3 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA44 | 03/10 16:34 | 0.1 h | 654 (97%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA46 | 03/10 16:33 | 0.1 h | 0 (0%) | — | Pnm |
| Macaé | Macaé | IMACA51 | 03/10 16:34 | 0.1 h | 734 (109%) | 0.8 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA52 | 03/10 16:34 | 0.1 h | 740 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA56 | 03/10 16:34 | 0.1 h | 734 (109%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA58 | 03/10 16:34 | 0.1 h | 664 (99%) | 12.3 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA6 | 03/10 16:33 | 0.1 h | 721 (107%) | 2.2 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA7 | 03/10 16:33 | 0.1 h | 740 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Mangaratiba | Mangaratiba | IMANGA43 | 03/10 16:33 | 0.1 h | 741 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Maricá | Maricá | IMARIC14 | 03/10 16:34 | 0.1 h | 689 (103%) | 6.0 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Maricá | Maricá | IMARIC16 | 03/10 16:33 | 0.1 h | 730 (109%) | 1.7 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Mimoso do Sul | Bom Jesus do Itabapoana | IMIMOS4 | 03/10 16:33 | 0.1 h | 0 (0%) | — | Pnm |
| Nova Friburgo | Nova Friburgo | INOVAF18 | 03/10 16:33 | 0.1 h | 567 (84%) | 39.4 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Nova Friburgo | Nova Friburgo | INOVAF27 | 03/10 16:33 | 0.1 h | 730 (109%) | 1.3 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Nova Friburgo | Nova Friburgo | INOVAF28 | 03/10 16:33 | 0.1 h | 735 (109%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Nova Friburgo | Nova Friburgo | INOVAF30 | 03/10 16:33 | 0.1 h | 735 (109%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Nova Friburgo | Nova Friburgo | INOVAF31 | 03/10 16:33 | 0.1 h | 737 (110%) | 0.5 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Paraíba do Sul | Paraíba do Sul | IPARAB10 | 03/10 16:33 | 0.1 h | 730 (109%) | 0.9 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Paraíba do Sul | Paraíba do Sul | IPARAB14 | 03/10 16:33 | 0.1 h | 741 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Passa-Vinte | Barra Mansa | IPASSA105 | 03/10 16:33 | 0.1 h | 728 (108%) | 0.6 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Petrópolis | Petrópolis | IPETRP11 | 03/10 16:33 | 0.1 h | 737 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Petrópolis | Petrópolis | IPETRP17 | 03/10 16:33 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Petrópolis | Petrópolis | IPETRP21 | 03/10 16:34 | 0.1 h | 713 (106%) | 4.0 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Petrópolis | Petrópolis | IPETRP25 | 03/10 16:33 | 0.1 h | 728 (108%) | 2.8 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Petrópolis | Petrópolis | IPETRP35 | 03/10 16:33 | 0.1 h | 672 (100%) | 7.6 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Petrópolis | Petrópolis | IPETRP37 | 03/10 16:33 | 0.1 h | 640 (95%) | 22.0 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| REBIO União | Casimiro de Abreu | IRIODA15 | 03/10 16:33 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Resende | Resende | IRESEN10 | 03/10 16:33 | 0.1 h | 709 (106%) | 6.6 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Resende | Resende | IRESEN13 | 03/10 16:30 | 0.1 h | 323 (48%) | 23.0 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Resende | Resende | IRESEN15 | 03/10 16:33 | 0.1 h | 727 (108%) | 2.3 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Resende | Resende | IRESEN17 | 03/10 16:34 | 0.1 h | 590 (88%) | 6.2 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Resende | Resende | IRESEN20 | 03/10 16:33 | 0.1 h | 734 (109%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio Bonito | Rio Bonito | IRIOBO1 | 03/10 16:33 | 0.1 h | 642 (96%) | 4.2 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio Claro | Rio Claro | IRIOCL8 | 03/10 16:31 | 0.1 h | 584 (87%) | 8.9 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio das Ostras | Rio das Ostras | IRIODA6 | 03/10 16:33 | 0.1 h | 448 (67%) | 28.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio das Ostras | Rio das Ostras | IRIODA16 | 03/10 16:33 | 0.1 h | 475 (71%) | 41.9 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE105 | 03/10 16:30 | 0.1 h | 709 (106%) | 0.5 h | chuva, Td, Pnm, T, UR |
| Rio de Janeiro | Rio de Janeiro | IRIODE108 | 03/10 16:34 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE109 | 03/10 16:33 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE112 | 03/10 16:33 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE113 | 03/10 16:34 | 0.1 h | 625 (93%) | 9.6 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE114 | 03/10 16:33 | 0.1 h | 740 (110%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE122 | 03/10 16:34 | 0.1 h | 737 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE130 | 03/10 16:33 | 0.1 h | 738 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE135 | 03/10 16:33 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE144 | 03/10 16:33 | 0.1 h | 715 (106%) | 0.5 h | Td, Pnm, T, UR |
| Rio de Janeiro | Rio de Janeiro | IRIODE146 | 03/10 16:34 | 0.1 h | 737 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE149 | 03/10 16:34 | 0.1 h | 735 (109%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE150 | 03/10 16:34 | 0.1 h | 740 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE157 | 03/10 16:34 | 0.1 h | 734 (109%) | 1.1 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE165 | 03/10 16:34 | 0.1 h | 601 (89%) | 6.8 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE170 | 03/10 16:34 | 0.1 h | 0 (0%) | — | Pnm |
| Rio de Janeiro | Rio de Janeiro | IRIODE85 | 03/10 16:33 | 0.1 h | 739 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE90 | 03/10 16:34 | 0.1 h | 474 (71%) | 58.6 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE96 | 03/10 16:33 | 0.1 h | 735 (109%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Rio De Janeiro | Rio de Janeiro | IRIODEJA96 | 03/10 16:30 | 0.1 h | 636 (95%) | 0.8 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Sana | Macaé | IMACA53 | 03/10 16:34 | 0.1 h | 737 (110%) | 0.8 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| São José Do Barreiro | Angra dos Reis | ISOPAULO82 | 03/10 16:34 | 0.1 h | 734 (109%) | 0.8 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| São Pedro Da Serra | Nova Friburgo | INOVAF35 | 03/10 16:33 | 0.1 h | 735 (109%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Seropédica | Seropédica | ISEROP9 | 03/10 16:33 | 0.1 h | 501 (75%) | 48.9 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Tamoios | Cabo Frio | ICABOF7 | 03/10 16:33 | 0.1 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Teresópolis | Teresópolis | ITERES38 | 03/10 16:33 | 0.1 h | 692 (103%) | 9.6 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Teresópolis | Teresópolis | ITERES48 | 03/10 16:33 | 0.1 h | 737 (110%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Teresópolis | Teresópolis | ITERES52 | 03/10 16:33 | 0.1 h | 737 (110%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Valença | Valença | IVALEN530 | 03/10 16:33 | 0.1 h | 732 (109%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Volta Redonda | Volta Redonda | IVOLTA15 | 03/10 16:28 | 0.1 h | 688 (102%) | 1.0 h | Td, Pnm, T, UR |
| Barra do Piraí | Barra do Piraí | IBARRA137 | 03/10 16:25 | 0.2 h | 615 (92%) | 9.1 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Barra do Piraí | Barra do Piraí | IBARRA138 | 03/10 16:26 | 0.2 h | 736 (110%) | 0.5 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Macaé | Macaé | IMACA26 | 03/10 16:26 | 0.2 h | 669 (100%) | 2.0 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Valença | Valença | IVALEN513 | 03/10 16:25 | 0.2 h | 707 (105%) | 6.3 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Rio de Janeiro | Rio de Janeiro | IRIODE89 | 03/10 16:16 | 0.4 h | 517 (77%) | 37.9 h | chuva, Pnm, rad, UV, dir, vento, rajada |
| Nova Friburgo | Nova Friburgo | INOVAF23 | 03/10 15:15 | 1.4 h | 490 (73%) | 3.3 h | chuva, Td, Pnm, T, UR, dir, vento, rajada |
| Petrópolis | Petrópolis | IPETRP27 | 03/10 13:34 | 3.1 h | 570 (85%) | 12.5 h | chuva, Td, rad, T, UR, UV, dir, vento, rajada |
| Teresópolis | Teresópolis | ITERES23 | 03/10 11:53 | 4.7 h | 631 (94%) | 0.7 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Nova Friburgo | Nova Friburgo | INOVAF42 | 03/10 04:39 | 12.0 h | 634 (94%) | 2.8 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Lumiar | Nova Friburgo | INOVAF41 | 01/10 20:56 | 43.7 h | 550 (82%) | 0.5 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Tamoios | Cabo Frio | ICABOF8 | 01/10 12:41 | 2 d | 500 (74%) | 0.9 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Pequeri | Comendador Levy Gasparian | IMINASGE43 | 30/09 16:24 | 3 d | 164 (24%) | 12.8 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Macaé | Macaé | IMACA31 | 30/09 15:18 | 3 d | 17 (3%) | 0.3 h | chuva, Td, Pnm, rad, T, UR, UV, dir, vento, rajada |
| Nova Iguaçu | Nova Iguaçu | INOVAI19 | 22/09 20:30 | 11 d | 0 (0%) | — | — |
| Nova Iguaçu | Nova Iguaçu | INOVAI21 | 21/09 09:15 | 12 d | 0 (0%) | — | — |
| Petrópolis | Petrópolis | IPETRP36 | nunca | — | 0 (0%) | — | — |
| Petrópolis | Petrópolis | IPETRP7 | nunca | — | 0 (0%) | — | — |
| Rio das Ostras | Rio das Ostras | IRIODA5 | nunca | — | 0 (0%) | — | — |
| Rio de Janeiro | Rio de Janeiro | IRIODE159 | nunca | — | 0 (0%) | — | — |
| Rio de Janeiro | Rio de Janeiro | IRIODE81 | nunca | — | 0 (0%) | — | — |
| Valença | Valença | IVALEN520 | nunca | — | 0 (0%) | — | — |

## 7. Qualificação do dado (válido / suspeito / inválido)

Mesma infraestrutura do CEMADEN Nacional (`core/qualidade.py`,
`LeituraQualidade`; só a **exceção** é gravada; ausência = válida), aplicada às
leituras de chuva **novas** das três redes:

| Regra | Redes | Resultado |
|---|---|---|
| valor negativo | todas | inválido |
| balde > 50 mm no intervalo | todas | inválido |
| hora da leitura > 10 min no futuro | todas | inválido |
| balde > 20 mm no intervalo | todas | suspeito |
| **total do dia regrediu** (> 0,5 mm) | Plugfield, Wunderground | suspeito ("contador reiniciou?") |
| `qcStatus == 0` (Weather Company) | Wunderground | suspeito |
| 1ª leitura do dia (balde = total desde 00h) | Plugfield, Wunderground | **não avaliada** (o total do dia não é um balde de intervalo) |

O teto de 150 mm por balde (`bucket_from_running_daily`) continua descartando
leituras absurdas de PWS. **Limites:** não há comparação com estações vizinhas
nem checagem de sensor travado; a calibração dos limites de 20/50 mm segue a
análise de 03/10/2026 (`fontes-de-dados.md`), com reavaliação prevista para o verão.

## 8. Tabelas na aba Dados

`GET /api/stations/rede/?source=plugfield|macae_ufrj|wunderground` →
`RedeTable.tsx` (uma aba por rede: **Plugfield**, **Macaé**, **Wunderground**).
Mesmo padrão da tabela do CEMADEN Nacional: linhas ordenadas pela **chuva de
1 h** (maior primeiro), cor da linha pelas faixas de chuva do painel (Atrasada/
Fraca/Moderada/Forte/Muito Forte), atraso da hora com 🕒 nas faixas da Rede Salvar
(>4 h, >120 h, >30 dias, futuro), estação e município clicáveis (histórico),
**REDEC**, **Atualizado em** e **Código** por último, exportação CSV e filtros
globais Município/REDEC.

| Aba | Colunas de chuva | Outras | Código |
|---|---|---|---|
| Macaé | **1h, 24h, 96h oficiais do portal** + 3 colunas "Calc" (cinza, nosso cálculo, para conferir) | T, UR, vento, rajada, P; **Status** online/offline | `identificador` (ex.: `est021`) |
| Plugfield | 1h, 3h, 6h, 12h, 24h, 48h, 72h, 96h (soma dos baldes) + **Hoje, Mês, Ano oficiais** | T, UR, vento, rajada, P; **Bat.** (bateria %) | número de série |
| Wunderground | 1h a 96h (soma dos baldes) + **Hoje oficial** + "Calc Hoje" + mm/h | T, UR, vento, rajada, P; **QC** (✓/✗/—) | ID da PWS (ex.: `ITERES38`) |

O ⚠ ao lado do nome indica leitura de chuva suspeita/inválida nas últimas 24 h.

## 9. Pendências e recomendações

1. Contatar a UFRJ/Defesa Civil de Macaé sobre as **15 estações sem leitura** e as que
   ficam offline (Ajuda de Baixo, Imboassica, Novo Horizonte).
2. Plugfield: **manutenção das 2 estações de Cambuci** (paradas há meses); investigar a
   lacuna de 20 h da Defesa Civil de Areal.
3. Wunderground: tratar IMARIC14 e estações com contador que regride; avaliar
   `observations/all/1day` para recuperar lacunas de coleta.
4. Alerta automático de **estação parada** (> 4 h sem leitura) para essas redes.
5. Usar `/data/hourly` (Plugfield) e `observations/all/1day` (Wunderground) para
   conferir as janelas de 1-96 h contra o histórico das próprias fontes.
6. Reavaliar os limites de qualificação no verão (ver `fontes-de-dados.md`).
