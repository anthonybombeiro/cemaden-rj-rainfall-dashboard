# Alerta Rio, Niterói e INEA — oficiais, sentinela −99,99, saúde das fontes e lacunas

Levantamento e correções de 06/10/2026 (mesmo ciclo do CEMADEN Nacional e das redes
sensíveis: comparar com o **valor oficial** da fonte, corrigir, qualificar, tabela
própria, testar, documentar). Relacionados: `fontes-de-dados.md`,
`redes-sensiveis-plugfield-macae-wunderground.md`, `operacao-cron-e-producao.md`,
`registro-de-acoes.md`.

## 1. Resumo

| Tema | Achado | Ação |
|---|---|---|
| **Alerta Rio — valor-sentinela** | O feed manda **−99,99** (estação sem dado). **235 leituras negativas** (21/09 a 06/10, 20+ estações; ex.: Tijuca 36, Anchieta 20, Irajá 19) entraram como chuva e **distorciam os acumulados**: Grota Funda 96 h = **−445,6 mm** (oficial 57,8), Grajaú 24 h = −191 mm, Santa Teresa 96 h = −633 mm | Chuva negativa nunca vira leitura (`BaseConnector.run`) e **todas as consultas de chuva ignoram valores < 0** (tabela de Precipitação, série, última chuva das sirenes). Após a correção: 0 janelas negativas, erro médio 24 h = −0,6 mm |
| **Alerta Rio — 2 estações sem chuva desde sempre** | `Barra/Barrinha` e `Barra/Riocentro` (nomes do feed) não casavam com o GeoJSON (`barra/itanhanga` — mesma coordenada — e `barra/rio centro`, a 1,5 km) | Apelidos em `_ALIASES_NOME`; passaram a gravar |
| **Alerta Rio — atualização a cada 10 min (correção de 06/10 noite)** | O `read_at` de cada estação só avança de 10 em 10 min; o `m05` cobre 5 dos 10 minutos: a 1ª troca (`m15`→`m05`) perdia ~metade da chuva (Bangu 1 h: 7,4 × 28,8 oficial) | Grava a janela que cobre o intervalo desde a última leitura gravada (`_valor_janela`: m05/m10/m15/m30; normalmente **m10**, vindo do portal). Efeito medido 14 min depois: erro médio de 1 h de −3,55 para −1,19 mm (máx 27,2 → 6,2 mm) |
| **Alerta Rio e Niterói — balde** | O `m15` é janela **deslizante**; com coleta de 15 min irregular sobrepunha/perdia baldes. Niterói: **25 de 30** estações com 96 h nossas 3-10% acima do oficial (Itaipú 70,0 × 64,2; Morro do Estado 73,4 × 67,2). Alerta Rio: 24 h dentro de ~1-3 mm | Passam a gravar **`m05`** (grade fixa de 5 min) com **cron de 5 min** (`2-59/5` Alerta Rio; `0-59/5` Niterói) |
| **Acumulados oficiais** (item 5) | Todas as três fontes entregam janelas prontas | Retrato em `raw_metadata["acumulados_oficiais"]` e, 1×/hora, **`AcumuladoOficial` de 1/24/96 h** (Alerta Rio, Niterói, INEA); Macaé e CEMADEN já faziam |
| **Saúde das fontes** (item 3) | O cron manda a saída para /dev/null: coleta que falha é silenciosa | `GET /api/fontes/saude/` + faixa laranja no topo da tela |
| **Lacunas — Wunderground** (item 4) | `observations/all/1day` traz ~5 min de `precipTotal` | Recupera baldes perdidos hoje quando a estação ficou > 45 min sem coleta nossa |
| **Lacunas — Plugfield** | `/data/hourly` **não bate** com `rainDay` (4,4 × 3,3 mm em Guapimirim) | **Não usado**; a diferença fica documentada |
| **Cron de sirenes** (item 1) | Estava de novo em `*/20` (a mesma linha de antes, `linekey` 2639992328; nada no repositório altera o cron — origem externa: cPanel/edição manual) | Reaplicado `*/2` e verificado (13 jobs, aspas íntegras); leitura mais recente de sirenes 22:45 UTC |

## 2. Alerta Rio (`alerta_rio`)

- **Feed:** `https://websempre.rio.rj.gov.br/json/chuvas` (exige User-Agent de navegador):
  33 estações, `read_at` em **grade de 5 min**, publicado com ~5-10 min de atraso;
  `data` = `m05`, `m15`, `h01`-`h04`, `h24`, `h96`, `mes`. Estações meteorológicas em
  `/json/dados_meteorologicos` (casadas por `cod`, só algumas têm T/UR/vento/P).
- **Sentinela:** `-99.99` em qualquer janela quando a estação está sem dado. Nos
  retratos oficiais, valores < 0 viram `None`.
- **Gravação (desde 06/10):** `chuva_mm` = `m05` por `read_at`; unicidade
  (estação, tipo, timestamp) garante idempotência. **Transição:** o último `m15` gravado
  cobre até T0; o 1º `m05` cobre (T−5, T] — até ~10 min de chuva podem ter ficado de fora
  uma única vez, na virada.
- **Chuva perdida nos períodos de sentinela:** as horas em que o feed disse −99,99 não
  têm dado (não há histórico para recuperar). É a causa dos déficits remanescentes de
  alguns pontos em 96 h (ex.: Av. Brasil/Mendanha −4,4 mm).
- **Validação pós-correção (06/10 ~19:50 BRT):** 24 h: erro médio −0,6 mm, máx 6,8;
  Barra/Barrinha e Barra/Riocentro aparecem com déficit grande em 96 h por terem
  acabado de começar a gravar (não é erro de cálculo).
- **Qualificação:** `registrar_qualidade_chuva` (negativo, > 20/50 mm no intervalo, hora no
  futuro); negativos nem chegam a ser gravados.

## 3. Niterói (`niteroi`, Defesa Civil/Alerta Nit/Tecal)

- **API (HTTP Basic, credencial no `.env`):** `/estacoes/rest/stations/` (30 estações,
  prefixos `[K]`/`[S]` no nome, código em `props.codigo`) e `/dados/rest/last_leituras/`
  (última leitura por estação: `horaLeitura` UTC em grade de 5 min, `m05`, `m10`, `m15`,
  `m30`, `h01`, `h06`, `h12`, `h24`, `h36`, `h48`, `h72`, `h96`, `h168`, `h720`, `mes`,
  `css_chuva`, `is_delay`). **Não há endpoint de histórico** (`/dados/rest/leituras/` 404).
- **Gravação:** `m05` por `horaLeitura` (cron 5 min). Retrato oficial + `is_delay` em
  `raw_metadata`.
- **Antes (medido 06/10):** 96 h nossas ≥ oficial em 25 de 30 estações (+3 a +10%);
  24 h praticamente iguais.

## 4. INEA (`inea`)

O XML público (`alertadecheias/dados.xml`) traz `chuva_1h`, `chuva_4h`, `chuva_24h`,
`chuva_96h` e `chuva_30d`; passam a ser guardados como retrato oficial (chaves
`1`, `4`, `24`, `96`, `720`) e 1/24/96 h em `AcumuladoOficial`. A gravação de chuva
(`dado_ultimo`) não mudou. Não há tabela própria para o INEA (não solicitada).

## 5. Tabelas na aba Dados

`GET /api/stations/rede/?source=alerta_rio|niteroi` → `RedeTable.tsx` (abas **Alerta Rio**
e **Niterói**), mesmo padrão das demais redes (ordenada por 1 h, cores de chuva do painel,
🕒 de atraso nas faixas da Rede Salvar, REDEC, atualização e código por último):

| Aba | Colunas de chuva (oficiais) | Controle | Outras |
|---|---|---|---|
| Alerta Rio | 5 min, 15 min, 1 h, 2 h, 3 h, 4 h, 24 h, 96 h, Mês | Calc 1/24/96 h | T, UR, vento, rajada, P (só estações meteorológicas); "Fonte" = — |
| Niterói | 5 min, 15 min, 1 h, 6 h, 12 h, 24 h, 48 h, 72 h, 96 h, 168 h, Mês | Calc 1/24/96 h | "Fonte" = `is_delay` da própria rede (ok/atraso) |

## 6. Saúde das fontes e estações paradas

`GET /api/fontes/saude/` (`api/saude_views.py`) e faixa `SaudeFontesBanner.tsx` (laranja,
só aparece com problema; clique em "detalhes"):

- **Coleta atrasada:** `Source.last_ingested_at` além de max(3 × cadência, 20 min). Cadências:
  CEMADEN, Alerta Rio, Niterói = 5 min; Plugfield, Wunderground, Macaé, INEA, INMET, REDEMET,
  Ecowitt = 15 min. Mostra também `last_ingest_error`. (As sirenes têm faixa própria.)
- **Estação parada:** tinha leitura (chuva/temperatura/nível) nas últimas 48 h e nenhuma
  há mais de 4 h. Estações sem nenhum dado em 48 h são contadas à parte
  (`estacoes_sem_dado_48h`) para não gerar alarme permanente (ex.: as 15 de Macaé).
- Atualiza a cada 5 min com o painel aberto.
- **Quem acende a faixa (ajuste de 06/10 à noite):** coleta atrasada de qualquer fonte, ou estações paradas das redes **sensíveis** (Plugfield, Macaé, Wunderground, Niterói, Alerta Rio, INEA, Ecowitt). O CEMADEN (27 paradas entre 4-48 h e 142 sem dado há > 48 h) aparece nos detalhes como "não dispara alerta" para a faixa não ficar sempre acesa.

## 7. Preenchimento de lacunas (Wunderground)

Em `fetch_readings`, antes de calcular o balde atual: se a estação já tem chuva gravada hoje e
a nova observação está > 45 min depois da última, baixa `observations/all/1day` e grava os
baldes intermediários (diferença de `precipTotal` consecutivos, timestamp da observação).
No máximo 12 estações por rodada. **Teste local:** lacuna simulada de 6 h em ITERES38 →
balde de 8,4 mm recuperado no horário real (13:44) e soma do dia = 9,4 mm = oficial;
segunda rodada idempotente.

**Plugfield:** `/data/hourly` (`rain`/`rainAccum`) soma 4,4 mm contra `rainDay` 3,3 mm no mesmo
dia (Defesa Civil de Guapimirim); a origem da diferença (corte de hora/fuso) não está
esclarecida — por isso não é misturado ao balde por diferença.

## 8. Verificação em produção (06/10/2026)

| Item | Resultado |
|---|---|
| Cron de sirenes | `*/2` reaplicado; leitura mais recente 22:45 UTC |
| Crontab final | 13 jobs; Alerta Rio `2-59/5`, Niterói `0-59/5` (`-m 25`/`-m 280`), CEMADEN `3-59/5` |
| CEMADEN Nacional | **392 de 392** estações com código oficial; intervalo mediano entre leituras gravadas = 60 min (muitas estações só atualizam o carimbo de hora em hora quando não há chuva — a investigar) |
| Macaé | acumulados continuam iguais aos oficiais (Córrego do Ouro 1 96 h: 83,6 × 84,0); **mais estações ficaram offline hoje** (Bicuda Grande desde 18:08, Bicuda pequena 18:15, CTR Macaé 14:47, Costa do Sol e Ajuda de Baixo desde 05/10) |
| Reingestões | Alerta Rio +63 leituras, Niterói +30, INEA +54, Wunderground +886, Macaé +30 — 0 erros |

## 9. Pendências

1. **Reconferir Alerta Rio e Niterói em 24-48 h** (96 h oficial × nosso) para confirmar que o
   `m05` + cron de 5 min eliminou os +3-10% — a validação final só é possível depois que a
   janela de 96 h for toda composta de baldes de 5 min.
2. Alerta Rio: as horas com −99,99 são perda definitiva; acompanhar se o feed continua
   mandando sentinela (hoje 0 negativos novos desde 21:35 UTC).
3. ~~Investigar o intervalo mediano de 60 min do CEMADEN~~ **Esclarecido em 06/10 (noite):** no feed `getJson2.php` os carimbos são múltiplos de 10 min, mas só **~200 de 389** estações atualizaram na última hora (76 em < 15 min; 124 entre 15-60 min), **158 estão com a última leitura > 6 h** e **142 de 392 não reportam há > 48 h** (27 entre 4 e 48 h). Ou seja: parte transmite de hora em hora e cerca de um terço da rede está parada (problema das estações, não nosso).
4. Quem reescreve o cron de sirenes para `*/20`? (a faixa de saúde/sirenes avisa; reconferir
   o crontab periodicamente).
5. Tabela própria do INEA (se desejado).

## 10. Atualização 06/10/2026 (noite) — portal do Alerta Rio, janela de 10 min e valor oficial

### 10.1 Feed com atualização de 10 em 10 minutos
Amostrando o feed a cada minuto (Bangu): `read_at` 21:10 → 21:20 e parado nos 9 minutos
seguintes; `m05` = só os últimos 5 min. Logo, com cron de 5 min só se captura 1 balde de 5 min a
cada 10 (−50%). Em produção, o intervalo mediano entre leituras gravadas era 10 min (99
instantes/24 h por estação). Correção: `_valor_janela` escolhe a maior janela (m05/m10/m15/m30)
que caiba no intervalo desde a última leitura gravada da estação; `m10` e `m30` só existem no
portal (HTML), por isso o conector lê **também** a página pública.

### 10.2 Portal do Alerta Rio (HTML) — colunas e Localização
`https://websempre.rio.rj.gov.br/estacoes/` (User-Agent de navegador): tabela "Dados
Pluviométricos" com N°, Estação, **Localização**, Hora Leitura, 05/10/15/30 min, 1/2/3/4/6/12/24/96
h, No Mês e **TX-15**; tabela meteorológica com Temp., Umi., P. Atm., P. Orvalho, Vel. do Vento,
**Dir. do Vento (°)**, Condições de Chuva e Probabilidade de Escorregamento (por região). **Não
há coluna de rajada.** TX-15 = taxa em mm/h (15 min × 4) — ver `tabelas-individuais-por-fonte.md`.

### 10.3 INEA — comparação oficial × nosso (06/10 ~21:30 BRT)
92 estações comparadas: 1 h média −0,18 mm (2 com |erro| > 2); 24 h média −1,69 (17); 96 h média
**−17,77 mm (73 de 92; máx 106 mm)**. Estações como Fazenda Escola UBM (24 h 1,6 × 30,6) mostram
que parte do dado oficial chega atrasado ou em lote. Efeito: a tabela de Precipitação exibe
o valor oficial (ver `tabelas-individuais-por-fonte.md` §5).

### 10.4 Baseline para as conferências agendadas (script `backend/scripts/conferir_oficial_vs_nosso.py`)
| Fonte | 1 h | 24 h | 96 h |
|---|---|---|---|
| Niterói (06/10 21:49 BRT) | média −0,07; 0 de 30 com |erro| > 2 | média −0,08; 0 de 30 | **+3,04; 24 de 30** (histórico do `m15` antigo) |
| Alerta Rio (21:49 BRT) | média −1,19; 4 de 32 | −4,83; 9 de 32 (perda do `m05` da tarde e horas de −99,99) | −9,13; 18 de 32 |

### 10.5 Conferências agendadas (item 4)
Tarefas únicas do app (rodam com o app aberto; se estiver fechado rodam ao abrir): **08/10 10:00
BRT** (`conferir-alerta-rio-niteroi-48h`, janelas de 1/24 h; critério: erro médio de 24 h entre −1 e
+1 mm e no máximo 3 estações com |erro| > 2 mm por fonte) e **10/10 22:00 BRT**
(`conferir-alerta-rio-niteroi-96h`, janela de 96 h; critério: média entre −2 e +2 mm e no máximo 4
estações com |erro| > 4 mm). Ambas reconferem o crontab, documentam aqui e fazem commit/push.
Execução manual: `python backend/scripts/conferir_oficial_vs_nosso.py [niteroi] [alerta_rio]`
com `CPANEL_API_TOKEN` no ambiente (o segredo administrativo é lido do crontab; nada é impresso).

### 10.6 Cron das sirenes — investigação de "trava da HostGator" (item 5)
Fatos levantados: (1) **não há acesso de shell** na conta (`Shell access is not enabled`); o crontab só se
altera pelo cPanel (UI ou API2); (2) **não existe limite de frequência**: o CEMADEN (`3-59/5`), Alerta
Rio (`2-59/5`), Niterói (`0-59/5`) e sirenes (`*/2`) permanecem; (3) a linha de sirenes voltou **duas
vezes ao mesmo valor `*/20`**, com o **mesmo `linekey` 2639992328** (o `linekey` é um hash do conteúdo
da linha, então foi restaurada exatamente a linha original); (4) nada no repositório altera o
cron e **nenhuma outra sessão do Claude** (nenhuma ativa; nenhum registro de `add_line`) nem tarefa
agendada o faz; (5) a conta guarda outro sistema (`monitoramento.preserve.rio.br`, PHP de 2021) e
WordPress, que podem ter seus próprios agendamentos fora do alcance da API; (6) o crontab tem linhas em
branco entre os jobs (efeito de add/remove da API), sem relação com o problema. **Hipóteses**
(sem prova): restauração do crontab por rotina/backup do provedor ou uma tela do cPanel aberta
com a versão antiga que salvou de volta. **Ação:** um monitor somente leitura registra o crontab a
cada 4 min em `C:\Users\antho\AppData\Local\Temp\cron_monitor.log` (3 h) para flagrar o horário exato da
mudança; as conferências agendadas reconferem o crontab; **recomendação** (não aplicada, depende
do usuário criar um segredo no GitHub): redundância independente do cPanel via workflow agendado
do GitHub Actions chamando `POST /api/admin/run/ {"action":"sync_sirenes"}` a cada 5 min (o
GitHub Actions garante no máximo 5 min e pode atrasar).

### 10.7 Resultado do monitor do crontab (07/10/2026)
O monitor somente leitura rodou ~3 h (00:48-03:45 UTC, 88 leituras a cada 4 min): **nenhuma mudança e nenhum erro**; o
`sync_sirenes` ficou em `*/2` e os 13 jobs permaneceram intactos. Conclusão: não é uma rotina frequente do provedor; as duas
reversões anteriores ocorreram em intervalos maiores (a 1ª em ~30 min após o ajuste; a 2ª em até ~3 dias). Hipóteses ainda
abertas: rotina diária/semanal do provedor ou tela do cPanel aberta com versão antiga. **Próximo passo sugerido:** repetir o
monitor por 24-48 h (somente leitura).
