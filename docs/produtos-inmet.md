# Produtos do INMET (VIME, Sondagem, Meteogramas, Avisos) — levantamento de 18/10/2026

Pedido do usuário: ver o que dá para extrair de `vime.inmet.gov.br`, `tempo.inmet.gov.br/Sondagem/…` e `meteograma.inmet.gov.br`, no estilo do que foi feito com a Marinha
(`produtos-marinha.md`), aglutinando o que for semelhante. **Este documento é só o levantamento (nada foi implementado ainda).**

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
