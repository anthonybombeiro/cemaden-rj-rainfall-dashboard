# Protocolos de Meteorologia — levantamento, lacunas e plano de implementação (28/10/2026)

Pedido do usuário: investigar o artefato "Protocolo Meteorologia CEMADEN-RJ" e as bases de conhecimento enviadas depois (planilhas, modelos de texto e artes), compará-los com o que o painel já faz, listar o que dá para implementar, **onde** encaixar no painel, **como**, **quais arquivos** e **em que ordem**, com exemplos de como ficaria.

Este documento **não altera código nem produção**: é levantamento e proposta. Nada aqui foi implementado ainda.

## 1. Fontes analisadas

| Fonte | O que é | Como foi lida |
|---|---|---|
| Artefato "Protocolo Meteorologia CEMADEN-RJ" | Texto 2026 (editado em 26/10/2026) + figuras do PDF 2025 (42 figuras, 10 tabelas transcritas) | Texto completo e as 42 figuras (vistas em folhas de contato) |
| Tabela de classificação do risco de incêndio — "Risco de fogo interpolado Nesterov" (jun/2026) | 3 abas: `Junho/2026` (classe por REDEC/dia), `dados_estações` (ΣG por estação INMET/dia), `Índice_medio_redec` (média por REDEC) | Valores **e fórmulas** (a API de planilhas devolveu `IFS(...)` e `AVERAGEIF(...)`) |
| Página INMET "Risco de incêndio" | Índice de Nesterov: fórmula, regras de chuva, classes; não há download nem API do índice | Página lida; **dados de entrada** (13 h) já existem no painel via INMET |
| `Informativos_meteorológicos_10_Outubro` (docx) | Modelo de texto dos informativos nº 168 a 193/2026 | Texto completo |
| `INFORMATIVOS METEOROLÓGICOS_CONTROLE` (xlsx) | Controle de 2020 a 2026: nº, ano, data, hora, REDEC, previsão de chuva/vento, SMS (SIM/NÃO) | Texto completo (≈ 9,3 mil linhas = informativo × REDEC) |
| `Previsão_diaria - 10 Outubro` (docx) | Texto da previsão diária enviado no Telegram (01 a 28/10) | Texto completo |
| `max_min_10_Outubro_2026` (xlsx) | Tmax/Tmin observadas por estação, por REDEC, mensal e verificação da previsão | Texto completo |
| `Verificação_precipitação_2026` (xlsx) | Previsto × observado por REDEC e dia (jan a out), tabela de contingência e índices (Wilks) | Texto completo |
| `Sistemas meteorológicos atuantes - 2026` (xlsx) | Um texto por dia (jan a out) | Texto completo |
| Imagens anexadas: acumulados 24 h (19/10), recorte de radar, tendência (nº 85/2026), avisos nº 07 e 08/2026 | Modelos visuais a reproduzir | Vistas |

Os links das planilhas ficam no chat e na memória do projeto (IDs do Drive); não foram copiados para este documento.

## 2. Resumo executivo

* O painel **já cobre o monitoramento** (radar, satélite, estações, sirenes, gatilhos, avisos da Marinha, previsão por REDEC com arte, resumo 24 h, NM). O que **falta** é a **produção documental do plantão**: informativos e avisos numerados, texto da previsão no formato do Telegram, tendência, acumulados, verificação mensal, risco de incêndio calculado, sistemas atuantes e livro de ocorrências. Hoje isso vive em planilhas do Drive preenchidas à mão.
* As bases enviadas **resolveram** o que estava em aberto: as faixas do Nesterov (§4.1) e o formato exato de cada produto. Também mostraram **inconsistências** do dia a dia (§6) que a automação corrige ou que precisam de decisão.
* Maior retorno: **Informativo meteorológico** (≈ 190 por ano, com texto padronizado, numeração, SMS por REDEC e histórico desde 2020) e **maiores acumulados** (sai à mão de 4 sites todo dia de chuva).
* Dá para reaproveitar muito do que existe: exportação de arte em PNG (`PrevisaoMapaCorpo`, `ShareModal`, `exportMapImage`), o padrão de sub-abas da aba Produção, o cálculo de precipitação (`_calcular_precipitacao`), os extremos de temperatura (`extremos_24h`), a validação previsão × observado (`resumo_views.py`) e os dados INMET horários.

## 3. O que já existe × o que falta

| Rotina do plantão | Hoje (painel) | Falta |
|---|---|---|
| Previsão diária por 11 REDECs | **Pronto**: cadastro (`PrevisaoForm`, aba Meteorologia → Cadastro), mapa, Story, Post, Tabela, texto copiável (`PrevisaoMapa.tsx`), nascer/pôr do sol | Texto **no formato do Telegram** (cabeçalho, texto geral, `T Max/T Min`, `U Max/U Min`, legenda); texto geral do dia; sistema atuante |
| Tendência (4 dias, segunda e quinta) | Não existe | Tudo (§5.4) |
| Informativo meteorológico | Não existe | Compositor, numeração, SMS por REDEC, histórico (§5.5) |
| Aviso meteorológico (arte nº/ano) | Existe só o aviso da **Marinha** (`AvisoMauTempo`) | Registro, numeração, vigência, arte (§5.6) |
| Maiores acumulados 24 h (arte) | Top 10 **por estação** no Resumo 24 h | Top 10 por **município**, 4+ fontes, arte (§5.1) |
| Alerta chuva > 25 mm/h; ≥ 3 estações > 30 mm/24 h | Os dados existem (tabela de precipitação) | Os dois alertas (§5.2) |
| Risco de incêndio (Nesterov) | Painel **espelha** o `RiskAlert` do portal | Cálculo automático e proposta de nível (§5.8) |
| Verificação de chuva e de temperatura | Existe ao vivo no Resumo 24 h | Registro diário, resumo mensal, índices (§5.9) |
| Sistemas atuantes | Não existe | Campo diário (§5.3) |
| Recorte de radar com legenda | Camadas de radar já existem | Botão "recorte + legenda" (§5.7) |
| Livro de ocorrências | Não existe | Registro (§5.10) |
| IDAP / Cell Broadcast da meteorologia | Só do NM (Guia do Plantão) | Seção de meteorologia no Suporte (§5.11) |
| Checklist por horário (07 h às 07 h) | Não existe | Checklist do turno (§5.12) |

## 4. O que as bases revelaram

### 4.1 Risco de incêndio (Nesterov) — **faixas resolvidas**
* **Entrada (INMET, 13 h local = 16 UTC):** temperatura do ar (T), temperatura do ponto de orvalho (Td) e precipitação. Já gravamos `TEM_INS`, `PTO_INS`, `UMD_INS` e `CHUVA` do INMET (`ingestion/connectors/inmet.py`).
* **Fórmula (página INMET):** `d = Es − E` (déficit de saturação, hPa); `G = d × T`; `ΣG` acumula dia a dia.
* **Regras da chuva (página INMET):** até 2,0 mm: soma `d·T`; 2,1 a 5,0 mm: `G = 0,75·G(ontem) + d·T`; 5,1 a 8,0 mm: `0,50·G(ontem) + d·T`; 8,1 a 10,0 mm: reinicia com `G = d·T`; acima de 10,0 mm: zera e recomeça no dia seguinte.
* **Classes usadas pela equipe (fórmula `IFS` da planilha):** ΣG ≤ 300 **Muito baixo**; 300–500 **Baixo**; 500–1000 **Moderado**; 1000–4000 **Alto**; > 4000 **Muito alto**. (A página do INMET usa os nomes Nenhum, Fraco, Médio, Grande, Perigosíssimo com os mesmos cortes.)
* **Cores da planilha:** Muito baixo verde `#6aa84f`, Baixo amarelo `#ffff00`, Moderado laranja `#ff9900`, Alto vermelho `#ff0000`, Muito alto roxo `#8e7cc3`.
* **Índice da REDEC = média do ΣG das estações INMET da região** (`AVERAGEIF` por REDEC, na aba `dados_estações`). A fórmula só cobre as linhas 2 a 29 da aba, que tem 45 linhas: **conferir se há estações fora da média** antes de reproduzir os números.
* **Defeitos da planilha que a automação corrige:** dias sem dado viram `0` e a classe sai "Muito baixo" (`IFERROR(...;0)`); há células com `-`, vírgula decimal como texto e uma aba `Índice_medio_redec` ainda com datas de 2022; os níveis são lançados à mão no painel legado (`painelcemadenrj.../mapa/redec.php?action=2`).
* **Pendência de validação:** a janela exata da chuva ("das 12 UTC") e a fórmula de `Es`. Antes de ligar, reproduzir **um dia conhecido** da planilha (ex.: ΣG de Resende em 03/06/2026 = 234,9) e conferir na página do INMET.

### 4.2 Informativo meteorológico
* **Texto padrão (docx):** `CEMADEN-RJ` / `INFORMATIVO METEOROLÓGICO nº N/AAAA` / `📅 Data` / `⏰ Horário` / `CENÁRIO ATUAL` (uma linha por grupo de regiões com a mesma condição) / `PREVISÃO PARA AS PRÓXIMAS 06 HORAS` (idem) / rodapé fixo ("Em caso de mudança de cenário…", "Fiquem atentos…", "Sigam o perfil defesacivil_rj…"). Os emojis marcam a classe: ⛈ forte/raios, 🌧 moderada, 🌦 fraca, ❄️ granizo.
* **Vocabulário real de intensidade (mais de 1.100 linhas só em "Moderada/Forte"):** fraca; fraca a moderada; moderada; moderada a forte; moderada a ocasionalmente forte; pontualmente muito forte. Complementos: "com raios", "rajadas de vento moderado a ocasionalmente forte", "possibilidade de granizo pontual", "de forma isolada", "se aproximam da região… por Minas Gerais".
* **Controle (xlsx):** uma linha por informativo × REDEC, com nº, ano, data, hora, REDEC, previsão de chuva, previsão de vento e **SMS (SIM/NÃO) por REDEC**. Volume: 2020–2026 ≈ 1.400 informativos (nº 193 em 25/10/2026; 2025 foi até o nº 184). A numeração **reinicia a cada ano**.
* **Qualidade do histórico (precisa de normalização na importação):** intensidades em texto livre ("Fraca / Moderada", "fraca/moderada", "chuva fraca a moderada"…); REDECs com erro de grafia ("BAIXADA FLUMINESE", "SIL II", "METROPOLITAA"); anos antigos usam REDECs agrupadas (SERRANA, SUL, "NORTE / NOROESTE"); datas com ano trocado (02/01/2025 dentro de 2026); formato de data misto.

### 4.3 Previsão diária (texto do Telegram)
Cabeçalho `SEDEC-RJ` / `CEMADEN-RJ` / `PREVISÃO METEOROLÓGICA PARA QUINTA-FEIRA (01/10)`, **texto geral do estado**, depois bloco por REDEC (`COSTA VERDE`, `T Max/T Min 34/19°C`, `U Max/U Min 99/60%`) e a legenda `TMax - Temperatura máxima; …`. Alguns dias usam `*NEGRITO*` do WhatsApp/Telegram nos nomes. O painel hoje gera outro formato (com emojis, sol, vento) e **não tem o texto geral do dia** (o `comentario` é por REDEC, 200 caracteres).

### 4.4 Tendência meteorológica
* **Quando:** os exemplos mostram **segunda e quinta** (nº 85/2026 sai quinta 22/10 e cobre sex 23 a seg 26; nº 86/2026 sai segunda 26/10 e cobre ter 27 a sex 30). O protocolo escrito diz "terças e sextas" — **divergência** (§6).
* **Estrutura do texto:** título `PREVISÃO E TENDÊNCIA METEOROLÓGICA PARA OS PRÓXIMOS DIAS N°86/2026`; parágrafo-resumo; 4 dias (`Terça-feira (27/10) – céu…; As temperaturas irão variar de 12 a 26°C; Os ventos…`); três linhas fixas de rodapé.
* **Arte (imagem 3):** cabeçalho laranja "TENDÊNCIA METEOROLÓGICA", faixa com período e nº, resumo, **4 cartões** (dia, texto, ícone do tempo, ↑Tmax vermelha, ↓Tmin azul), logos no rodapé.
* **Dá para pré-preencher a partir da `Previsao`:** faixa de temperatura = **menor Tmin e maior Tmax entre as 11 REDECs** (conferido: 23/10 → 13 a 26 °C; 27/10 → 12 a 26 °C), ícone = condição mais frequente/mais severa.

### 4.5 Aviso meteorológico (arte)
Campos da arte (imagens 4 e 5): `AVISO METEOROLÓGICO`, ícones (chuva, vento ou os dois), `Nº 08/2026`, `VÁLIDO A PARTIR DAS 09H DE 14/09/2026 ATÉ AS 09H DO DIA 15/09/2026`, `REGIÃO: TODO ESTADO DO RJ` (ou lista de REDECs), `Sistema atuante:` (um ou mais), **texto com trechos em negrito**, legenda fixa de chuva (0–4,9 chuvisco e chuva fraca; 5–24,9 moderada; 25–49,9 forte; ≥ 50 muito forte), `193 – Corpo de Bombeiros`, `199 – Defesa Civil`, `FONTE: SEDEC-RJ/CEMADEN-RJ`. Volume baixo (07/2026 em 01/09; 08/2026 em 14/09). Depois de enviado, é salvo em `avisos_emitidos`, publicado na Contingência Verão e acompanhado de SMS pelo IDAP.

### 4.6 Maiores acumulados (arte)
Modelo de 19/10/2026 05h30: colunas **Região, Município, Acumulado (mm/24h), Fonte**, 10 linhas, um município por linha, fontes misturadas (INMET, CEMADEN/MCTI, ANA, INEA, Alerta Rio e rede municipal "DC Guapimirim"). O protocolo de 2025 pedia só 5 no grupo e citava o 96 h — **a arte atual tem 10 e não mostra 96 h**.

### 4.7 Verificação mensal e Tmax/Tmin
* **Chuva:** por REDEC e dia, `Prev` (sim/não, feito às 16 h20) × `Obs` (sim/não, feito à meia-noite), com critério **"chuva significativa > 1,0 mm/h ou 24,0 mm/24h"** na planilha (o protocolo escrito diz "> 1 mm em 24 h" e o Resumo 24 h do painel usa ≥ 1 mm). Resumo mensal por grupo (Costa Verde, Sul, Capital, Baixada Fluminense, Serrana, Metropolitana, Litorânea, Norte/Noroeste) com tabela de contingência (acerto, falso alarme, erro, acerto negativo) e índices de Wilks: acurácia, threat score, razão de possibilidades, BIAS, FAR, POD.
* **Temperatura:** por dia, Tmax/Tmin **observadas por estação** (≈ 45 estações: INMET, aeroportos SBxx, Alerta Rio com o local), extremos por REDEC (maior Tmax e menor Tmin entre as estações da região), extremos mensais por estação e `Verificação_previsão` (Prev × Obs por REDEC). Problemas: dias sem preenchimento viram `0,0` e distorcem a verificação; há `#REF!`; Itatiaia e Forte de Copacabana sem dado.
* O painel **já calcula essa mesma verificação ao vivo** (`resumo_views.py`: Confere ≤ 2 °C, Atenção ≤ 4 °C); falta **gravar o resultado do dia** para ter histórico e resumo mensal.

### 4.8 Sistemas atuantes
Um texto por dia, livre, com variações de grafia ("Sistema de Alta Pressão", "alta pressão", "ZCAS", "Áreas de instabilidade (Zcas)", "frente fria + convergência de umidade"). Catálogo observado: **alta pressão, baixa pressão, frente fria (inclusive no oceano/pré-frontal), áreas de instabilidade, ZCAS, transporte/convergência de umidade**, mais combinações. A planilha de outubro está preenchida só até 22/10 (atraso manual). O mesmo dado aparece no **aviso** ("Sistema atuante:") e na previsão.

### 4.9 Recorte de radar
Legenda típica: `Radar Tool INEA (Pico do Couto)` + `Atualização de 03h16 (horário local).` O recorte enviado mostra o estado do RJ com divisas municipais sobre o mosaico. O painel já tem os radares (REDEMET, INEA, Niterói) e o contorno municipal; falta o botão que gera **PNG recortado + legenda** com a fonte e a hora do quadro.

## 5. Plano por módulo: onde entra, como, arquivos, exemplo

**Onde no painel:** a aba **Produção** (já criada para o NM) vira o balcão de produção de cada equipe. Proposta: um seletor de equipe no topo — **Nível de Monitoramento** (como está) | **Meteorologia** (novo) — e, dentro de Meteorologia, as sub-abas **Plantão · Produtos · Verificação · Incêndio · Ocorrências · Suporte**. O **cadastro da previsão** continua em Meteorologia → Cadastro (com atalho a partir de Produção). Leitura e mapas continuam onde estão (Alertas, Resumo 24 h, Meteorologia). Isso segue o pedido anterior: lançamento em aba própria "como as recomendações de sirenes"; visualização separada.

```
Produção ▸ [ Nível de Monitoramento ] [ Meteorologia ● ]
   Meteorologia ▸ Plantão | Produtos | Verificação | Incêndio | Ocorrências | Suporte
   Produtos ▸ Previsão · Tendência · Informativo · Aviso · Acumulados · Radar
```

Convenções para todos os módulos: componentes nativos no CSS do painel (sub-abas em pílulas `bg-blue-600`), `Etiqueta`/cores já existentes, **qualquer usuário logado** lança (como o NM) até decisão em contrário, texto sempre **editável antes de copiar**, botões **Copiar texto** e **Baixar PNG**, sem envio automático para Telegram/Instagram/IDAP.

### 5.1 Maiores acumulados 24 h (arte) — médio
* **Tela:** Produção → Meteorologia → Produtos → Acumulados. Tabela dos 10 maiores acumulados em 24 h, **um por município**, com região, estação, fonte e valor; botão "Gerar arte" (modelo 19/10) e "Copiar texto". Avisa "3 ou mais estações > 30 mm/24 h: fazer a tabela" (§5.2).
* **Como:** reutilizar `_calcular_precipitacao` (já tem o valor oficial da fonte quando existe) agrupando por município e fonte; endpoint `GET /api/meteorologia/acumulados/?janela=24h&n=10`; rótulos de fonte mapeados (INMET, CEMADEN/MCTI, ANA, INEA, Alerta Rio, "DC <município>" para redes municipais); hora cheia na arte ("05H30" = hora da geração arredondada; regra a confirmar).
* **Arquivos:** `backend/api/meteorologia_views.py` (novo) ou `resumo_views.py`; `backend/api/urls.py`; `frontend/src/components/producao/AcumuladosArte.tsx` (novo, base `PrevisaoMapaCorpo.tsx` e `exportMapImage.ts`); `frontend/src/lib/api.ts`.
* **Exemplo:**
```
Principais acumulados em 24 h — 19/10/2026 05h30        [Gerar arte] [Copiar] [Atualizar]
 #  Região              Município                       mm/24h  Fonte
 1  Serrana             Carmo                           42,4    INMET
 2  Baixada Litorânea   Rio Bonito                      39,6    CEMADEN/MCTI
 3  Baixada Fluminense  Guapimirim                      36,9    DC Guapimirim
 …  (um município por linha, fonte de maior valor)
⚠ 6 estações acima de 30 mm/24 h — tabela recomendada
```
* **Teste:** conferir a lista contra a arte de 19/10 com os dados do banco daquele dia; nenhum município repetido; valor com 1 casa decimal.

### 5.2 Alertas de limiar — fácil
* **Regras (protocolo):** chuva > 25 mm/h em qualquer estação → "reportar no 00"; ≥ 3 estações com ≥ 30 mm/24 h → "fazer a tabela de acumulados"; baixa umidade < 30 % no estado → SMS de umidade (Proc. 07).
* **Como:** faixa de avisos no topo de Produção → Meteorologia → Plantão e um selo na aba; texto pronto para copiar ("Chuva forte em 1 h: … estações …"). Dados já vêm de `/stations/precipitacao`.
* **Arquivos:** `ResumoPanel.tsx` (reuso) ou `ProducaoMeteorologia/Plantao.tsx`; constantes em `frontend/src/lib/limiares.ts` (novo, **uma única escala de chuva** — §6).
* **Teste:** simular com leituras de teste no banco local (nunca em produção).

### 5.3 Previsão: formato do Telegram, texto geral e sistema atuante — fácil/médio
* **Tela:** em Meteorologia → Cadastro e em Previsão (mapa): botão **"Texto do Telegram"** no formato exato da §4.3 (`SEDEC-RJ / CEMADEN-RJ / PREVISÃO METEOROLÓGICA PARA SEXTA-FEIRA (23/10)`, texto geral, 11 REDECs com `T Max/T Min` e `U Max/U Min`, legenda).
* **Dados novos:** `PrevisaoDia` (data única, `texto_geral`, `sistemas` lista, `observacao`) — modelo novo + migração 0026 (precisa de aprovação do usuário para migrar em produção). Sistemas num catálogo fixo: alta pressão, baixa pressão, frente fria, frente fria no oceano, pré-frontal, áreas de instabilidade, ZCAS, transporte de umidade, convergência de umidade, outro (texto livre).
* **Arquivos:** `backend/core/models.py` (+ migração), `serializers.py`, `views.py` (`PrevisaoDiaViewSet`), `PrevisaoForm.tsx` (campo texto geral + sistemas), `PrevisaoMapa.tsx` (novo texto), calendário anual de sistemas em Verificação.
* **Exemplo (saída):**
```
SEDEC-RJ
CEMADEN-RJ
PREVISÃO METEOROLÓGICA PARA SEXTA-FEIRA (23/10)

Céu encoberto a nublado com chuva fraca a moderada ao longo do dia, especialmente nas regiões ao sul do estado. Ventos fracos a moderados.

REDEC
COSTA VERDE
T Max/T Min 22/16°C
U Max/U Min 99/85%
SUL I … (11 blocos)
TMax - Temperatura máxima; TMin - Temperatura Mínima; UMax - …; UMin - ….
```
* **Teste:** gerar para 23/10 e 28/10 com os valores do docx e comparar caractere a caractere.

### 5.4 Tendência (segunda e quinta) — médio
* **Tela:** Produtos → Tendência. Abre pré-preenchida com os próximos 4 dias a partir da `Previsao` (faixa de temperatura = menor Tmin / maior Tmax entre as REDECs; ícone e texto editáveis), nº/ano sugerido (último + 1), parágrafo-resumo e rodapé fixo. Saídas: **texto** (formato do docx) e **arte** (imagem 3).
* **Como:** modelo `Tendencia` (numero, ano, emitida_em, dias[JSON: data, texto, tmax, tmin, icone], resumo) + migração; arte SVG→PNG no padrão do Story (`PrevisaoMapaCorpo`). Lembrete "hoje é dia de tendência" (seg/qui) na aba Plantão.
* **Arquivos:** `models.py`, `serializers.py`, `views.py`, `producao/Tendencia.tsx`, `producao/TendenciaArte.tsx`, ícones de `lib/meteorologia.ts`.
* **Exemplo:**
```
Tendência nº 86/2026 (segunda 26/10)       dias: 27/10 · 28/10 · 29/10 · 30/10
Resumo: [ Na terça-feira e quarta-feira o tempo estará estável… ]       [Copiar texto] [Baixar arte]
Ter 27/10  ☁ parcialmente nublado a nublado   ↑26° ↓12°   [texto editável]
Qua 28/10  ☁ nublado, pancadas isoladas…       ↑24° ↓12°
```

### 5.5 Informativo meteorológico — **maior valor**, médio/alto
* **Tela:** Produtos → Informativo, em duas colunas: **à esquerda o compositor**, **à direita o texto pronto**.
  * **Compositor:** matriz 11 REDECs × {cenário atual, previsão 6 h} com a intensidade (fraca, fraca a moderada, moderada, moderada a forte, moderada a ocasionalmente forte, pontualmente muito forte) e marcas "raios", "rajadas", "granizo". O painel **agrupa as REDECs com a mesma condição** e escreve as linhas como no modelo ("Núcleos de chuva moderada a forte nas regiões Sul I e Costa Verde."), com o emoji da classe.
  * **Registro:** nº automático (último do ano + 1), data/hora, **SMS enviado por REDEC (SIM/NÃO)**, quem emitiu; vira a linha de controle e **substitui** a planilha `INFORMATIVOS METEOROLÓGICOS_CONTROLE` e o docx.
  * **Apoio ao plantão:** alerta "surgiram núcleos em região **fora** do informativo vigente → avise a meteorologista" (comparando radar × regiões do último informativo — fase 2) e **relógio da cadência** do radar/imagem (30 min com núcleos intensos; 1 h; 2 h à noite — valor a decidir, §6).
* **Dados:** `InformativoMeteorologico` (numero, ano, emitido_em, cenario_atual, previsao_6h, texto, criado_por) + `InformativoRegiao` (informativo, regiao, chuva_atual, chuva_prevista, vento_previsto, raios, granizo, sms_enviado). **Importação do histórico** 2020–2026 por comando de gestão (`importar_informativos`) a partir do CSV exportado da planilha, normalizando REDEC e intensidade (§4.2); roda primeiro no banco local.
* **Arquivos:** `models.py` + migração; `serializers.py`; `views.py` (`InformativoViewSet`, `proximo-numero`); `core/management/commands/importar_informativos.py`; `frontend/src/lib/informativos.ts` (vocabulário, agrupamento de regiões, geração do texto); `producao/Informativo.tsx`, `producao/InformativoHistorico.tsx`.
* **Exemplo (saída gerada):**
```
CEMADEN-RJ
INFORMATIVO METEOROLÓGICO n°194/2026
📅 Data: 28/10/2026
⏰ Horário: 15:20
CENÁRIO ATUAL
🌧 Núcleos de chuva fraca a moderada nas regiões Sul I e Costa Verde.
PREVISÃO PARA AS PRÓXIMAS 06 HORAS
⛈ Pancadas isoladas de chuva moderada a ocasionalmente forte, com raios, nas regiões Sul I, Sul II e Serrana I.
🌦 Chuva fraca isolada nas demais regiões.
Em caso de mudança de cenário, a Defesa Civil Estadual atualizará as informações…
```
* **Testes:** gerar a partir do nº 190 e 193 do docx e comparar; importar o CSV no banco local e conferir contagens por ano (2026 = 193; 2025 = 184).

### 5.6 Aviso meteorológico (arte e registro) — médio
* **Tela:** Produtos → Aviso: nº/ano automático, **vigência** (início e fim com relógio local), região (todo o estado ou REDECs), **sistemas atuantes** (do catálogo), texto com **negrito** (marcadores simples `**…**`), ícone (chuva, vento ou ambos), **legenda de chuva fixa**. Saída: arte (imagens 4 e 5) e texto; pergunta "enviar SMS pelo IDAP?" abre o modelo de mensagem (146 e 62 caracteres, §5.11).
* **Dados:** `AvisoMeteorologico` (numero, ano, inicio, fim, regioes, sistemas, texto, icones, sms) — vigentes aparecem em Alertas e no Resumo 24 h junto com os avisos da Marinha.
* **Arquivos:** `models.py` + migração; `views.py`; `producao/Aviso.tsx`, `producao/AvisoArte.tsx`; `AvisosMapa.tsx` (mostrar também os avisos da meteorologia).

### 5.7 Recorte de radar com legenda — fácil/médio
* **Tela:** nos controles de radar (Mapa e Meteorologia), botão **"Recorte com legenda"**: baixa o quadro atual, recorta o estado com divisas municipais e escreve a legenda `Radar Tool INEA (Pico do Couto) / Atualização de 03h16 (horário local).` usando a fonte e a hora do quadro; "Copiar legenda".
* **Arquivos:** `MapView.tsx` (botão), `lib/exportMapImage.ts` (rótulo no rodapé), metadados de hora do quadro já vindos de `inea_radar_views.py` / `redemet_imagery_views.py`.

### 5.8 Risco de incêndio — Nesterov calculado — difícil
* **Tela:** Produção → Meteorologia → Incêndio: tabela REDEC × dias do mês (modelo da aba `Junho/2026`), com a **proposta calculada** (ΣG médio das estações INMET e a classe) e o **nível lançado** pela meteorologista (editável — o protocolo exige a avaliação humana, §4 do documento). Mostra por estação o ΣG e os dias sem dado (em cinza, **não** "Muito baixo").
* **Como:** comando diário às 13 h 30 (gancho no cron já existente) que lê T, Td e chuva das 13 h em `Reading` e grava `IndiceIncendioDia` (estação, data, d, G, ΣG, classe); média por REDEC com **número de estações usadas**; ao confirmar, grava/atualiza o `RiskAlert` do tipo incêndio (hoje espelhado do portal) — só com ação explícita.
* **Arquivos:** `backend/core/incendio.py` (novo; fórmula, regras da chuva, classes, testes), `models.py` + migração, `views.py`, `ingestion/…/inmet.py` (garantir 13 h local), `producao/Incendio.tsx`, `AlertsPanel.tsx` (mapa de risco).
* **Critério de aceite:** reproduzir os ΣG de uma semana da planilha de junho/2026 (diferença < 1 %) antes de ligar.

### 5.9 Verificação mensal — médio
* **Tela:** Produção → Meteorologia → Verificação: calendário mensal por REDEC (previsto × observado, chuva e Tmax/Tmin), tabelas de contingência por grupo e índices de Wilks (§4.7), extremos do mês por estação. Exporta XLSX/PNG.
* **Como:** comando às 00 h 20 grava `VerificacaoDia` (data, regiao, chuva_prevista, chuva_observada, tmax_prev/obs, tmin_prev/obs) reusando a lógica de `resumo_views.py`; critério de chuva **a decidir (§6)**; dias sem previsão ficam em branco, não zero.
* **Arquivos:** `models.py`, `management/commands/gravar_verificacao.py`, `resumo_views.py` (extrair função), `producao/Verificacao.tsx`.

### 5.10 Livro de ocorrências e passagem de plantão — médio
* **Tela:** Produção → Meteorologia → Ocorrências: formulário do turno (cabeçalho: data, plantão, operador; técnicos que encerram e iniciam; **informativos e avisos do turno preenchidos automaticamente**; SMS+TV por município; planilhas feitas; páginas fora do ar — vindo de `SaudeFontesBanner`; demandas), gera o texto no formato do protocolo e **copia para o e-mail/Livro**. Não envia e-mail.
* **Dados:** `OcorrenciaPlantao`. Os e-mails dos destinatários ficam em configuração, **não no código**.

### 5.11 Suporte de Meteorologia (IDAP, Cell Broadcast, severidade) — fácil
* **Tela:** Produção → Meteorologia → Suporte, no padrão do `GuiaPlantao.tsx`: passo a passo do IDAP (campos e limites de 146/62 caracteres, contador e botão copiar), Cell Broadcast (Severo e Extremo, critérios e exemplos, cenários 1 e 2), modelo Defesa Civil Alerta, **tabela de severidade meteorológica** com cores, legenda de chuva única, rotina das 07 h às 07 h. Só frontend.
* **Arquivos:** `components/producao/SuporteMeteorologia.tsx`; reaproveitar contador e cópia do `GuiaPlantao.tsx`.

### 5.12 Checklist do plantão (07 h → 07 h) — fácil/médio
* **Tela:** Produção → Meteorologia → Plantão: linha do tempo com os horários do protocolo (09 h 30, 10 h, 13 h, 15 h 30, 16 h, 16 h 20, 16 h 40, 18 h, 00 h, 05 h 30, 06 h…), o item atual em destaque, marcação "feito" com quem e quando (**compartilhado** entre os técnicos, não só no navegador), pendências herdadas do turno anterior e atalho para cada produto. Segunda e quinta mostra "Tendência"; dia 10 mostra "simulado das 10 h".
* **Dados:** `ItemPlantao` (data, codigo, feito_por, feito_em, observacao).

### 5.13 Fora do escopo (decisão de projeto)
IDAP (login por CPF, aval do diretor), Telegram "00" e Instagram: **sem automação**. O painel entrega texto e arte prontos para copiar/baixar. Briefings (manhã/noite, Canva) ficam para uma fase posterior: só fazem sentido depois dos módulos acima.

## 6. Inconsistências encontradas (precisam de decisão)

| # | Onde | Divergência | Sugestão |
|---|---|---|---|
| 1 | Tendência | Protocolo: terça e sexta. Exemplos reais: **segunda e quinta** | Usar segunda e quinta (confirmar) e corrigir o protocolo |
| 2 | Chuva significativa | Planilha: > 1,0 mm/h ou 24,0 mm/24 h. Protocolo: > 1 mm em 24 h. Resumo 24 h: ≥ 1 mm | Definir **um** critério; a verificação histórica usa o da planilha |
| 3 | Escalas de chuva | Aviso: 0–4,9 / 5–24,9 / 25–49,9 / ≥ 50. Sirenes: fraca 0,2–5 / moderada 5,1–25 / forte 25,1–50. Severidade: < 5 / 5–24,9 / 25–49,9 / > 50 (e > 70 no "muito alto") | Uma constante única em `lib/limiares.ts` |
| 4 | Rajada "muito forte" | 76 km/h (severidade) × 100 km/h (Cell Broadcast) | Decisão do usuário (já listada no PLANCON) |
| 5 | Cadência do radar/informativo | 30 min, 1 h, 2 h, 3 h em três trechos; informativo a cada 6 h só em um | Uma tabela de cadência por situação |
| 6 | Acumulados | Protocolo: top 5 no grupo, 96 h na planilha. Arte atual: **top 10, sem 96 h** | Seguir a arte (10), manter 96 h na tela |
| 7 | Regiões | Protocolo fala em 8 REDECs; previsão e informativo usam **11** | Padronizar nas 11 e mapear as antigas (SUL, SERRANA, NORTE/NOROESTE) na importação |
| 8 | Nesterov | Dias sem dado viram "Muito baixo" | Mostrar "sem dado" |
| 9 | Planilhas | Datas mistas, "Sim/sim/Não", `#REF!`, zeros | A gravação automática elimina |
| 10 | Pessoal | E-mails pessoais no texto do protocolo | Configuração, nunca no código |

Perguntas em aberto: **SRAAS** (tabela das 9 h 30; provavelmente status das sirenes — não confirmado); janela exata da chuva no Nesterov; hora de referência na arte de acumulados ("05H30"); se o lançamento será restrito a perfil (hoje qualquer usuário logado).

## 7. Ordem sugerida, dependências e esforço

| Fase | Módulos | Esforço | Migração em produção? | Observação |
|---|---|---|---|---|
| 1 | 5.2 alertas de limiar, 5.11 Suporte de Meteorologia, 5.7 recorte de radar, texto do Telegram (parte de 5.3) | P | Não | Só frontend/endpoint de leitura; entrega rápida |
| 2 | 5.1 acumulados (arte) | M | Não | Reaproveita o cálculo existente |
| 3 | 5.5 informativo + importação do histórico, 5.3 completo (texto geral e sistemas) | G | **Sim** (0026) | Maior valor; testar importação no banco local |
| 4 | 5.6 aviso, 5.4 tendência, 5.10 L.O., 5.12 checklist | M cada | **Sim** | Reusa o compositor e a arte |
| 5 | 5.9 verificação, 5.8 Nesterov | G | **Sim** | Pedem comando agendado (cron) e validação de números |
| 6 | Briefings, simulado do dia 10 | G | — | Depois de estabilizar as fases 1–5 |

Regras de execução (mantidas): testar tudo localmente com dados de teste (nunca gravar teste em dado real de produção), migrações só com autorização expressa do usuário, deploy pelo fluxo SFTP já documentado, Python 3.9 no servidor (sem `X | Y` em anotações), documentar cada passo em `registro-de-acoes.md`.

## 8. Resumo do que mudou em relação à análise anterior (mesmo dia)

* Resolvido: **faixas do Nesterov** e fórmula; **formato do texto** do informativo, da previsão e da tendência; **campos da arte** do aviso e dos acumulados.
* Novo: o histórico de 2020–2026 dos informativos (importável); a lógica de **verificação com índices de Wilks**; o catálogo de **sistemas atuantes**; a divergência **segunda/quinta**; a escala de chuva repetida em três lugares.
* Mantido em aberto: SRAAS, limite de rajada (76 × 100 km/h), critério de chuva significativa.
