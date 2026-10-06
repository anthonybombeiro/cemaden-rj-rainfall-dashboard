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
3. Investigar por que o intervalo mediano do CEMADEN é de 60 min.
4. Quem reescreve o cron de sirenes para `*/20`? (a faixa de saúde/sirenes avisa; reconferir
   o crontab periodicamente).
5. Tabela própria do INEA (se desejado).
