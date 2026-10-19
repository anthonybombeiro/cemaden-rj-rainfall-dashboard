# Produtos do INMET (VIME, Sondagem, Meteogramas, Avisos) — levantamento de 18/10/2026

Pedido do usuário: ver o que dá para extrair de `vime.inmet.gov.br`, `tempo.inmet.gov.br/Sondagem/…` e `meteograma.inmet.gov.br`, no estilo do que foi feito com a Marinha
(`produtos-marinha.md`), aglutinando o que for semelhante. Levantamento de 18/10 e **implementação de 19/10/2026** (seção 9).

## 1. Achados técnicos
Os três sites são aplicativos React que consomem **APIs abertas** (sem login, sem token; `GET`), todas com `Access-Control-Allow-Origin` igual à origem de quem pergunta
(testado com `Origin: https://cemadenrj.preserve.rio.br`) — o navegador do painel pode chamá-las **direto**, sem passar pelo servidor. Imagens vêm em **base64** dentro do JSON.
O HTML dos sites tem proteção F5 (`/TSbd/`) e reCAPTCHA, mas as APIs respondem normalmente.

| API | Para quê |
|---|---|
| `apivime.inmet.gov.br` | VIME: modelos numéricos COSMO |
| `apitempo.inmet.gov.br` | Sondagem, produtos, anomalias, condições nas capitais (e as estações que já usamos) |
| `apimeteograma.inmet.gov.br` | Meteogramas do COSMO por cidade ou por coordenada |
| `apiprevmet3.inmet.gov.br` | Previsão por município, análise sinótica (texto), **avisos** |
| `apicommet.inmet.gov.br` | Carta da análise sinótica (imagem) |
| `apiprec.inmet.gov.br` | Mapas de precipitação acumulada |

## 2. VIME — modelos COSMO (`apivime`)
* Modelos: `COSMO7` (7 km, 37 produtos) e `COSMO2P8` (2,8 km, 21 produtos). Áreas: `N`, `NE`, `CO`, `S`, `SE`, `AS` (a URL `/SE` é só a área inicial).
* Rotas: `/modelos`, `/parametros/{modelo}/{area}`, `/inicializacao/{modelo}/{area}/{parametro}` (rodadas 00 e 12 UTC, ~7 dias), `/validades/{modelo}/{area}/{parametro}/{AAAA-MM-DD}/{HH:MM}`,
  `/{modelo}/{area}/{parametro}/{AAAA-MM-DDHHH:MM}` → **lista de quadros** (`validade` +24…, 3 em 3 h, `base64` JPG 700×700). Uma série inteira = ~4 MB (51 quadros) em ~4 s.
* Produtos COSMO 7 km: vento 10 m, rajada, Tmáx/Tmín, UR 2 m, pressão, precipitação 3 h/6 h/24 h/7 dias, neve, nuvem baixa/média/alta/total, água precipitável, **índices K, CAPE, Showalter, Totals, Lifted**,
  linhas de corrente e jato (200/300/850 hPa), vorticidade (500/850), omega, tendências de pressão/temperatura, Cisalhamento, VTUR (temp/corrente/umidade 500/700/850/925).
* COSMO 2,8 km: precipitação 1 h/24 h/48 h, T2m, UR, rajada e vento 10 m, Tmáx/Tmín, índices, VTUR.

## 3. Sondagem (`apitempo`)
* **A estação do RJ é `83746 — Galeão (RJ)`**. (O código `83378` do link é **Brasília**.) Estações: 33 (ex.: 83746 Galeão, 83779 Campo de Marte, 83649 Vitória, 83840 Curitiba, 83566 Confins…), lista em `/estacoesSondagem`.
* Rotas: `/estacoesSondagem`, `/datas/Sondagem/{est}` (6 dias), `/horas/Sondagem/{est}/{AAAA-MM-DD}` (hora de lançamento, ex. `11`), `/Sondagem/{est}/{AAAA-MM-DD}/{hora}` → `{base64: PNG}`.
* O produto é **uma imagem Skew-T** (650×650: temperatura e ponto de orvalho, ventos, isóbaras/isotermas/adiabáticas, alturas em ft e hPa). **Não há valores numéricos** nessa API (nem CAPE/CIN). Para números seria preciso outra fonte (não investigada).

## 4. Meteogramas (`apimeteograma`)
* **COSMO 2,8 km** para **30 cidades do RJ** (Rio de Janeiro, Niterói, Angra, Búzios, Cabo Frio, Campos, Macaé, Petrópolis, Nova Friburgo, Teresópolis, Resende, Volta Redonda, Itaperuna…): `/modelos`, `/pais/…`, `/estado/{modelo}/BRA`, `/cidade/{modelo}/BRA/RJ`, `/data/…`, `/rodada/…`, `/{modelo}/BRA/RJ/{cidade}/{data}/{rodada}`.
  Imagem 700×1100, 48 h: precipitação, T2m, ponto de orvalho, UR, pressão, nuvens baixas/médias/altas, vento 10 m.
* **Por coordenada:** `GET /agricultor/{lat}/{lon}/{AAAA-MM-DD}/{00|12}` → mesmo meteograma para **qualquer ponto** (testado em -22,90/-43,17). Permite meteograma de qualquer estação do painel.
* Modo "dinâmico": `METUR`, `METPREC`, `METT` (umidade, precipitação, temperatura).

## 5. Outros produtos do INMET (`apitempo` / `apiprevmet3` / `apiprec`)
* **Análise sinótica** — `apiprevmet3/analises` (texto do meteorologista, 00 e 12 UTC, ex. "ZCIT … ciclone em 35°S/42°W, 999 hPa … frente fria …") + `apicommet/ANALISE/AS/analise/{data}/{hora}:00` (carta, JPG base64).
* **Avisos** — `apiprevmet3/avisos/ativos` (`hoje` e `futuro`): polígono GeoJSON, severidade/cor, riscos, instruções, municípios/geocodes, vigência. 3 avisos hoje no Brasil.
* **Previsão por município** — `apiprevmet3/previsao/{geocode IBGE}` (manhã/tarde/noite, T máx/mín, vento, resumo, ícone). Ex.: 3304557 (Rio).
* **Condições nas capitais** — `/condicao/capitais/{data}` (Tmín, Tmáx, UR mín, chuva).
* **Anomalias diárias** (mapas) — `/anomalias/datas/disponiveis`, `/anomalias/{data}`; **precipitação acumulada** (mapas) — `apiprec/{data}`; mapas de condições registradas (`/CondicoesRegistradas/{param}/{data}/{hora}`).
* Já usamos o INMET para as **estações** (`/estacoes/T`, dados em lote com token). Os gráficos/tabelas de estação do site duplicam o que o painel já tem.

## 6. O que se assemelha à Marinha (candidatos a aglutinar)
| Tema | Marinha (já no painel) | INMET | Proposta |
|---|---|---|---|
| Carta sinótica | WMS IDEM-DHN (mapa, animação, comparação) | Análise sinótica: carta + **texto do meteorologista** | Mesma sub-aba "Cartas": alternar **Marinha / INMET** e mostrar o texto da análise |
| Modelo atmosférico | ICON-LAM 6,5 km (vento, temp, UR, visib., nuvens, pressão/prec., jato…) | COSMO 7 km e 2,8 km (VIME) — mesmos temas + **índices de instabilidade** | Mesma sub-aba "Modelos": seletor **Fonte/Modelo** + produto + área + animação |
| Meteogramas | ICON-LAM, 10 pontos do RJ, 5 dias | COSMO 2,8 km, 30 cidades do RJ **ou qualquer coordenada**, 48 h | Mesma sub-aba "Meteogramas": cidade/ponto e **dois modelos lado a lado** |
| Avisos | Avisos de mau tempo no mar (polígonos) | Avisos meteorológicos (polígonos, municípios, severidade) | Mesma sub-aba "Avisos": mapa único com as duas fontes |

## 7. O que só o INMET tem (aproveitar)
**Sondagem do Galeão (Skew-T)**, índices de instabilidade (K, CAPE, Showalter, Totals) em mapas do COSMO, meteograma por coordenada, avisos oficiais por município, previsão oficial por município, análise sinótica em texto, anomalias e mapas de precipitação.
O que só a Marinha tem: ondas, oceano (HYCOM), marés, cartas náuticas, METAREA/NAVAREA.

## 8. Riscos e cuidados
* APIs **não documentadas** (usadas pelo front dos sites): podem mudar sem aviso; mostrar mensagem de indisponível.
* **Peso:** VIME envia todos os quadros de uma série em base64 (~4 MB) — usar carga sob demanda por produto e cache do navegador; no celular avisar.
* Direitos/uso: dados públicos do INMET exibidos com a fonte citada; a conta de **token** do INMET (estações) é outra coisa e não é usada aqui.

## 9. Implementado em 19/10/2026 (aba Meteorologia)
Código: `frontend/src/lib/inmet.ts` (APIs) e os componentes abaixo. O navegador chama o INMET direto; cada bloco mostra mensagem quando a API não responde.
1. **Sondagem** (`SondagemPanel.tsx`, nova sub-aba): Skew-T do **Galeão (83746)** por padrão; seletor das 33 estações (próximas ao RJ primeiro), dia (◀ ▶, 6 dias) e hora; texto "como ler".
2. **Cartas** (`AnaliseSinoticaInmet.tsx`, `CartasSinoticasPanel.tsx`): botões **Marinha | INMET**; a visão INMET mostra a carta e o **texto da análise** do meteorologista (00Z/12Z).
3. **Meteogramas** (`MeteogramasPanel.tsx`): um seletor de local (30 cidades do RJ pelo INMET + pontos no mar da Marinha + **coordenada livre**) e rodada 00Z/12Z. Para Rio, Niterói, Angra, Cabo Frio e Macaé (★) mostra **Marinha (ICON-LAM) e INMET (COSMO 2,8 km) lado a lado**.
   Observação: as rotas `/data` e `/rodada` do INMET demoram ~20 s; o painel consulta a imagem direto (hoje → 2 dias atrás), em < 1 s.
4. **Avisos** (`MeteorologiaPanel.tsx`, `AvisosMapa.tsx`): mapa único com os polígonos do INMET (cor = severidade do aviso; tracejado = previsto) e os da Marinha (vento/onda/ressaca); duas listas de cartões: INMET (descrição, severidade, vigência, nº de municípios do RJ, municípios e instruções ao expandir) e Marinha. Filtro: aviso do INMET com algum geocode IBGE `33…` (RJ).
5. **Modelos** (`ModelosMarinhaPanel.tsx`, `ModelosInmetVisualizador.tsx`): abas **ICON 6,5 km · Marinha**, **COSMO 7 km · INMET**, **COSMO 2,8 km · INMET**, Ondas e Oceano. COSMO: área (6), produto (37/21, incluindo índices K/CAPE/Showalter/Totals), rodada (8 últimas), barra de tempo e animação; os quadros (~4 MB por série) só carregam ao escolher a combinação.
Sub-abas: Previsão · Avisos · Cartas · Modelos · Meteogramas · Sondagem · Marés · Cadastro (8 ícones numa linha no celular).
**Não incluído (ideias):** previsão oficial por município (`apiprevmet3/previsao/{geocode}`), anomalias e mapas de precipitação do INMET, números da sondagem (CAPE/CIN).

## 10. Ajustes de 19/10/2026 (feedback do usuário)
* **Marés (celular):** o seletor de porto ocupa uma linha inteira e a navegação de dia (◀ data ▶ Hoje) fica na linha de baixo (a seta não fica mais sozinha).
* **COSMO — áreas oficiais:** o VIME define as áreas por modelo (lido no código do site). **COSMO 2,8 km:** Sudeste, Sul, Nordeste + zoom por estado `SE-RJ`, `SE-ES`, `SE-MG`, `SE-SP` (padrão: Rio de Janeiro). **COSMO 7 km:** SE, S, CO, NE, N, Brasil (`BRA`), América do Sul (`AS`).
  Antes o painel oferecia áreas que o COSMO 2,8 km não tem (N, CO, AS).
* **Avisos INMET:** a API devolve `riscos` e `instrucoes` como **arrays JSON** (o código esperava texto) — por isso as instruções não apareciam. Agora o cartão mostra todos os riscos e, ao expandir, as **instruções** e os municípios.
* **Cartas INMET:** ordenadas da mais recente para a mais antiga (no mesmo dia, 12Z antes de 00Z).

## 11. Proposta (aguardando aprovação do usuário — nada implementado)
1. **Previsão oficial do INMET por município** — `apiprevmet3/previsao/{geocode IBGE}`: 5 dias (manhã/tarde/noite nos primeiros), resumo, Tmáx/Tmín, vento, umidade mín/máx, tendência, nascer/ocaso (~220 KB por município, ícones em base64).
   Ideia: na aba **Previsão**, mostrar ao lado da previsão do CEMADEN de cada região uma faixa "Referência INMET" com o município representativo da região (ex.: Metropolitana → Rio de Janeiro), destacando divergências de Tmáx/Tmín/chuva; mais um seletor livre dos 92 municípios. É referência: a previsão do CEMADEN continua sendo a principal.
2. **Anomalias e precipitação acumulada** — `apitempo/anomalias/{data}` (2 mapas por dia: Tmín e Tmáx, Brasil) e `apiprec/{data}` (7 mapas do Brasil: acumulado de 1, 3, 5, 10, 15, 30 e 90 dias).
   Ideia: uma sub-aba **"Clima"** com as duas coisas (alternância Anomalia | Chuva acumulada, seletor de data e de período), mapa com zoom/arrasto já enquadrado no Sudeste e botão "Brasil inteiro" (as imagens não são georreferenciadas, então não vão como camada do Leaflet).
3. **Números da sondagem (CAPE/CIN)** — o INMET só publica a imagem. A **Universidade de Wyoming** publica o mesmo lançamento (Galeão 83746, 00Z e 12Z) em texto: perfil completo (pressão, altura, T, Td, UR, vento) e índices **MUCAPE, MUCIN, DCAPE, Showalter, LI virtual, K, Total/Cross/Vertical Totals, SWEAT, LCL, CCL, PWAT**.
   Não tem CORS para o nosso site, então o painel precisaria de um **endpoint no backend** (`/api/sondagem/numerica/`) que baixa e interpreta a página, com cache de ~6 h. Na aba Sondagem entrariam: cartões dos índices com faixas de risco (ex.: CAPE fraco/moderado/forte), tabela dos níveis principais (1000/925/850/700/500/300/200 hPa) e, opcionalmente, um aviso em "Resumo 24h" quando CAPE e K indicarem ambiente favorável a tempestades.
   Cuidados: serviço externo sem garantia (pode mudar o endereço); o horário do Wyoming é o sinótico (12Z) e o do INMET é o lançamento (11Z); testar antes se o servidor HostGator alcança o site de Wyoming.

