# Dados entregues por fonte e tipo de estação

Levantamento de **2026-09-25**, feito em três frentes: (1) o código dos conectores, (2) os campos brutos que cada
fonte realmente devolveu (`raw_payload` guardado no banco) e (3) a contagem em produção do que cada tipo de estação
entrega hoje (904 estações cadastradas; "com leitura" = leitura nos últimos 3 dias).

> **Atualização de 2026-09-25 (implementado):** os dados marcados com ⚠️ nas seções 1 e 3 abaixo passaram a ser
> gravados, exceto onde indicado. Novos tipos de leitura: temperatura máx./mín., umidade máx./mín., pressão na
> estação, pressão ao nível do mar, ponto de orvalho, radiação solar, UV e sensação térmica. A tabela **Dados
> Meteorológicos** ganhou colunas de **Temp. Máx/Mín 24h** e **Umid. Máx/Mín 24h** (calculadas sobre as últimas 24 h
> a partir das leituras instantâneas **e** dos extremos que a fonte informa) e as colunas de pressão, orvalho,
> sensação térmica, radiação e UV. Exceções: **Plugfield não grava radiação** (a unidade do campo `radi` não é
> W/m², chegou ~10.000 às 7h); **Wunderground não traz máx./mín.** no endpoint usado (o 24h dele vem das leituras
> instantâneas); **INMET radiação** é convertida de kJ/m² acumulado na hora para W/m² médio (÷3,6) e negativos são
> descartados; **Wunderground pressão** é ao nível do mar e valores fora de 950-1060 hPa, ou orvalho fora de -15 a
> 32 °C / acima da temperatura, são descartados por implausíveis. O texto abaixo é o levantamento original.

## 1. Resposta curta: por que faltam Tmáx, Tmín e umidade mínima?

O painel só guarda **8 tipos de leitura** (`Reading.ReadingType`). Tudo que a fonte manda fora desses 8 não vira
coluna, mesmo quando ele chega:

| Tipo gravado | Coluna na tabela | Unidade |
|---|---|---|
| `chuva_mm` | Chuva | mm (por intervalo de leitura) |
| `temperatura_c` | Temperatura | °C (instantânea) |
| `umidade_pct` | Umidade | % (instantânea) |
| `vento_ms` | Vento | m/s |
| `vento_rajada_ms` | Rajada | m/s |
| `vento_dir_graus` | Direção do vento | graus |
| `nivel_m` | Nível do rio | m (só hidrológicas) |
| `mare_m` | Maré | m (previsto, **nenhum conector grava**) |

**Não existem tipos** para: temperatura máxima/mínima, umidade máxima/mínima, pressão, ponto de orvalho, sensação
térmica, radiação solar, UV. Os dados abaixo **chegam de algumas fontes e são descartados** (ou ficam só dentro do
`raw_payload` da leitura, sem coluna):

| Dado | Quem envia | Situação hoje |
|---|---|---|
| Temperatura máx./mín. | INMET (`TEM_MAX`, `TEM_MIN`), Alerta Rio (`max`, `min`), Plugfield (`tempMax`, `tempMin`) | chega, **não é gravado** como leitura |
| Umidade máx./mín. | INMET (`UMD_MAX`, `UMD_MIN`) | chega, **não é gravado** |
| Pressão atmosférica | INMET (`PRE_INS/MAX/MIN`), Alerta Rio (`pressure`), Plugfield (`pres`, `prre`), Wunderground (`metric.pressure`) | chega, **não é gravado** |
| Ponto de orvalho | INMET (`PTO_*`), Plugfield (`duep`), Wunderground (`metric.dewpt`) | chega, **não é gravado** |
| Radiação solar | INMET (`RAD_GLO`), Plugfield (`radi`), Wunderground (`solarRadiation`) | chega, **não é gravado** |
| UV | Plugfield (`uv`), Wunderground (`uv`) | chega, **não é gravado** |
| Sensação térmica | Plugfield (`feel`), Wunderground (`heatIndex`, `windChill`) | chega, **não é gravado** |

Atenção ao significado: no INMET, `TEM_MAX/TEM_MIN/UMD_MAX/UMD_MIN` são os extremos **dentro daquela hora**, não do
dia. A máxima/mínima do dia precisa ser calculada sobre as 24 h. O endpoint "current" do Wunderground que usamos não
traz máxima/mínima nenhuma.

## 2. O que cada tipo de estação entrega em produção

Número de estações com cada dado (leitura nos últimos 3 dias):

| Fonte | Tipo de estação | Cadastradas | Com leitura | Chuva | Temp. | Umidade | Vento | Direção | Rajada | Nível |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| INMET | Meteorológica | 26 | 26 | 26 | 25 | 25 | 22 | 22 | 22 | — |
| Wunderground | Meteorológica | 121 | 108 | 103 | 104 | 104 | 103 | 103 | 103 | — |
| Plugfield | Meteorológica | 19 | 17 | 17 | 17 | 17 | 17 | 17 | 17 | — |
| Alerta Rio | Pluviométrica | 33 | 32 | 31 | 6 | 6 | 3 | 3 | 0 | — |
| CEMADEN (MCTIC) | Pluviométrica | 356 | 227 | 227 | — | — | — | — | — | — |
| Niterói (Defesa Civil) | Pluviométrica | 30 | 30 | 30 | — | — | — | — | — | — |
| INEA | Pluviométrica | 21 | 21 | 21 | — | — | — | — | — | — |
| INEA | Hidrológica | 73 | 70 | 70 | — | — | — | — | — | 65 |
| CEMADEN-RJ Sirenes | Sirene | 225 | 85 | 85 | — | — | — | — | — | — |
| CEMADEN nacional | Pluvio./Hidro. | 0 | — | — | — | — | — | — | — | — |
| Rio Chuva por Bairro | Pluviométrica | 0 | — | — | — | — | — | — | — | — |

Leitura da tabela:
- **Só quem tem temperatura/umidade/vento** são as estações **meteorológicas** (INMET, Wunderground, Plugfield) e 6
  estações do Alerta Rio. As centenas de pluviométricas e as hidrológicas entregam **apenas chuva** (e nível de rio).
- Estações "cadastradas" > "com leitura" = estação sem dado recente (sensor parado, offline ou sem comunicação).
- INMET: 1 estação sem temperatura/umidade (Forte de Copacabana, A652) e 4 sem vento; INMET cadastra 26 estações do
  RJ, todas ativas.
- CEMADEN nacional e Rio Chuva por Bairro estão implementados mas **sem estações em produção** (endpoint antigo
  fora do ar / serviço fora do ar em 15/09).
- Sirenes: só as ~85 com pluviômetro acoplado geram chuva; as demais (140) só têm status/acionamento.

## 3. Matriz fonte × dado: o que a fonte tem e o que gravamos

Legenda: **✅** gravado · **⚠️** a fonte envia mas **não gravamos** · **—** a fonte não fornece.

| Dado | INMET | Wunderground | Plugfield | Alerta Rio | CEMADEN MCTIC | Niterói | INEA | Sirenes |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Chuva | ✅ (1 h) | ✅ (converte total do dia) | ✅ (converte total do dia) | ✅ (15 min) | ✅ (último valor) | ✅ (5 min) | ✅ (15 min) | ✅ (`tempo1`) |
| Chuva em outras janelas (1 h, 24 h…) | — | ⚠️ acumulados | ⚠️ `rainMonth` | ⚠️ h01…h96, mês | — | ⚠️ 10 janelas | ⚠️ 1 h, 4 h, 24 h, 96 h, 30 d | ⚠️ |
| Temperatura instantânea | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Temperatura máx./mín. | ⚠️ (na hora) | — (não no endpoint atual) | ⚠️ (dia) | ⚠️ | — | — | — | — |
| Umidade instantânea | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Umidade máx./mín. | ⚠️ (na hora) | — | — | — | — | — | — | — |
| Vento (velocidade) | ✅ | ✅ | ✅ | ✅ (ver §5) | — | — | — | — |
| Rajada | ✅ | ✅ | ✅ | — | — | — | — | — |
| Direção do vento | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Pressão | ⚠️ | ⚠️ | ⚠️ | ⚠️ | — | — | — | — |
| Ponto de orvalho | ⚠️ | ⚠️ | ⚠️ | — | — | — | — | — |
| Radiação solar | ⚠️ | ⚠️ | ⚠️ | — | — | — | — | — |
| UV | — | ⚠️ | ⚠️ | — | — | — | — | — |
| Sensação térmica | — | ⚠️ | ⚠️ | — | — | — | — | — |
| Nível do rio | — | — | — | — | — | — | ✅ (só "Plu/Flu") | — |

## 4. Detalhe por fonte

### INMET — estações meteorológicas automáticas (26 no RJ)
- **Como coleta:** API oficial com token, endpoint em lote por hora (`/token/estacao/dados/{data}/{HHMM}/{token}`),
  a cada 15 min; reserva por scraping (GitHub Actions) só se os dados ficarem defasados.
- **Campos brutos recebidos** (confirmados no banco): `CHUVA`, `TEM_INS`, `TEM_MAX`, `TEM_MIN`, `UMD_INS`, `UMD_MAX`,
  `UMD_MIN`, `PRE_INS`, `PRE_MAX`, `PRE_MIN`, `PTO_INS`, `PTO_MAX`, `PTO_MIN`, `RAD_GLO`, `VEN_VEL`, `VEN_RAJ`,
  `VEN_DIR`, mais identificação e hora UTC.
- **Gravados:** `CHUVA`, `TEM_INS`, `UMD_INS`, `VEN_VEL`, `VEN_RAJ`, `VEN_DIR`. **Descartados:** todos os máx./mín., pressão,
  orvalho e radiação.
- **Observações:** dados horários em UTC; `CHUVA` é a chuva da hora; valores impossíveis (ex.: temperatura fora de
  −10 a 50 °C) são descartados.

### Wunderground — estações pessoais (~130 cadastradas)
- **Endpoint usado:** `observations/current` (métrico). **Campos:** `metric.temp`, `humidity`, `metric.precipTotal`,
  `winddir`, `metric.windSpeed`, `metric.windGust`, além de `metric.pressure`, `metric.dewpt`, `metric.heatIndex`,
  `metric.windChill`, `metric.precipRate`, `solarRadiation`, `uv`.
- **Gravados:** temperatura, umidade, chuva, direção, vento e rajada (km/h ÷ 3,6).
- **Observação:** `precipTotal` é o **total do dia**; o sistema converte em "chuva por intervalo" subtraindo o que já
  gravou hoje (meia-noite local) e descarta saltos > 150 mm (sensor com defeito).

### Plugfield — estações municipais integradas (19)
- **Campos:** `temp`, `tempMax`, `tempMin`, `humi`, `pres`, `prre`, `duep` (orvalho), `wind`, `winb` (rajada), `dire`,
  `rain`, `rainDay`, `rainMonth`, `radi`, `uv`, `feel`, entre outros.
- **Gravados:** `temp`, `humi`, `rainDay` (convertido em intervalo), `dire`, `wind`, `winb` (km/h ÷ 3,6).
- **Observação:** a hora vem de `lastUpdateTimestamp`; o campo `updateDateTime` da API vem rotulado como UTC mas é hora
  local (defasagem de 3 h), por isso não é usado.

### Alerta Rio (Prefeitura do Rio) — 33 estações pluviométricas
- **Chuva** (`chuvas`): `m05`, `m15`, `h01`…`h04`, `h24`, `h96`, `mes`. Grava só `m15`.
- **Meteorologia** (`dados_meteorologicos`, só ~6 estações): temperatura atual, `min`, `max`, umidade, pressão e vento
  em texto ("0,0 (N/NE)"). Grava temperatura, umidade, vento e direção.
- **Observação:** não fornece rajada.

### CEMADEN (MCTIC) — 356 pluviômetros
- **Campo:** `ultimovalor` (chuva), por estação, com hora. Só chuva. Coordenadas são o centro do município (aproximadas).

### CEMADEN-RJ pluviômetros (tabela do portal, ~85) e Sirenes (225)
- O portal mostra 3 min, 15 min, 1 h, 4 h, 12 h, 24 h, 48 h, 72 h, 96 h e 1 mês; o sistema grava **só 15 min**.
- **Sirenes:** grava `tempo1` das ~85 que têm pluviômetro; o restante entrega apenas **status online/offline e
  acionamento (tocando)**, que não são "leituras".

### Niterói (Defesa Civil) — 30 pluviômetros
- Fornece `m05`, `m10`, `m15`, `m30`, `h01`…`h168`, `h720` e mês; grava só `m05` (5 min). Só chuva.

### INEA (Alerta de Cheias) — 94 estações
- Por estação: `dado_ultimo` (chuva 15 min), `chuva_1h`, `chuva_4h`, `chuva_24h`, `chuva_96h`, `chuva_30d`, `nivel_rio`.
- Grava chuva (`dado_ultimo`) e, **só nas "Plu/Flu"**, o nível do rio. Nas "Plu" o `nivel_rio` vem como texto e é ignorado.
- Tipos: 73 hidrológicas (com nível) e 21 pluviométricas.

### CEMADEN nacional e Rio Chuva por Bairro
- Implementados, **sem estações hoje** (endpoint nacional antigo fora do ar; serviço do Rio fora do ar em 15/09).

## 5. Pontos de atenção para fidelidade dos dados

Observados no código; alguns dependem de validação com a fonte:
1. **Niterói (CORRIGIDO em 2026-09-25):** o sistema gravava só a janela de 5 min (`m05`) numa coleta de 15 em 15
   min, captando 1/3 da chuva (ex.: Engenho do Mato informava 2,2 mm na última hora e o painel mostrava 0,0). Passou a
   gravar `m15` (janela igual ao intervalo de coleta) e o histórico foi regravado a partir do `raw_payload`.
2. **Alerta Rio, unidade do vento:** o código assume km/h e divide por 3,6, mas isso está anotado como não confirmado.
3. **Acumulados por janela** (1 h, 24 h…) das tabelas de Precipitação são **calculados somando as leituras** que
   gravamos. As janelas maiores que as fontes entregam prontas (24 h, 96 h, mês) não são usadas para conferência.
4. **Extremos do INMET são por hora**, não do dia.

## 6. Sugestão (a decidir)

Para ter Tmáx/Tmín e umidade mín./máx. no painel, o caminho é criar novos tipos de leitura e gravar o que já chega:
- **INMET, Plugfield, Alerta Rio:** gravar temperatura máx./mín., umidade máx./mín., pressão, ponto de orvalho,
  radiação e UV (sem chamada nova à API — os campos já vêm na resposta).
- **Tabela Dados Meteorológicos:** colunas de **Tmáx do dia / Tmín do dia** (calculadas sobre as últimas 24 h) e
  Umidade mín./máx., mais Pressão.
- **Wunderground:** exigiria consumir o endpoint de resumo diário (chamada adicional).
- **Chuva:** para redes com janela mais longa disponível (Niterói, CEMADEN-RJ, INEA), gravar também o acumulado
  pronto da fonte para conferir contra o nosso cálculo.
