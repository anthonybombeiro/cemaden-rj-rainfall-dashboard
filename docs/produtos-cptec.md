# Produtos do CPTEC/INPE — levantamento de 19/10/2026 (nada implementado)

Pedido do usuário: investigar `previsaonumerica.cptec.inpe.br` (modelos), `subsazonal`, `sazonal` e `www.cptec.inpe.br`, e propor como juntar com os produtos da Marinha (`produtos-marinha.md`) e do INMET (`produtos-inmet.md`). Inclui a questão da sondagem.

## 1. Como o site "Previsão Numérica" funciona (e o que dá para reaproveitar)
* É um aplicativo React (Vite) sem API própria: **o catálogo de modelos/produtos/regiões está embutido no JavaScript** e as imagens ficam num servidor aberto:
  `https://s1.cptec.inpe.br/grafico/Modelos/{MODELO}/pn/{produto}/{AAAA}/{MM}/{DD}/{HH}/{MODELO}_{produto}_{região}_{AAAAMMDDHH}z_{HHH}z.png`
* A lista de rodadas de cada modelo é um JSON pequeno com **CORS liberado** (`access-control-allow-origin: *`):
  `https://s1.cptec.inpe.br/grafico/Modelos/portal_previsao_numerica/mod_{monan|smec|brams|wrf|eta|bam|wwatch}.json` → `{"datesRun":["2026-10-18 12z", …]}`.
* As imagens são PNG (≈1240×1600) e funcionam em `<img>` de qualquer site (verificado). Alguns pedidos devolvem **503** de forma intermitente (visto em ETA08 e uma vez no Wwatch) — o painel precisa de nova tentativa e mensagem.
* Recursos de interface que o usuário elogiou (vistos na aba aberta): **1, 2, 3 ou 4 quadros por página**, animação, teclas ← →, seletor de hora de previsão, "abrir a imagem em nova aba", cabeçalho/rodapé recolhíveis, layout que funciona no celular.

## 2. Modelos e produtos (catálogo lido do próprio site)
| Modelo (código na URL) | Rodadas | Passo | Alcance | Produtos | Observação (19/10, 06:19 UTC) |
|---|---|---|---|---|---|
| **MONAN** (`MONAN`, 10 km) | 00 e 12 UTC | 3 h | até 168 h (12Z: 12–120 h) | 30 | atualizado (18/10 12Z) |
| **WRF** (`WRF07`, 7 km) | 00 | 3 h | 168 h | 30 + meteogramas | 18/10 00Z |
| **BRAMS** (`BRAMS08`, 8 km) | 00 | 3 h | 168 h | 30 + meteogramas | 18/10 00Z |
| **ETA** (`ETA08`, 8 km) | 00 | 3 h | 240 h | 30 + meteogramas | 18/10 00Z listado, mas as imagens testadas devolveram **503** |
| **BAM** global (`Global_BAM`) | 00 | 6 h | 240 h | 30 + meteogramas | 18/10 00Z |
| **SMEC** (`SMEC`) | 00 | 6 h | 168 h | 26 | **parado desde 27/08/2026** |
| **WWATCH** ondas (`Wwatch`) | 00 | 3 h | 120 h | 5 | 18/10 00Z |

* **Produtos atmosféricos (30):** água precipitável; altura geopotencial (250/500/700/850/925 hPa); **cisalhamento do vento (1000/2000/3000 m)**; **lapse rate**; precipitação (acumulada, 3 h, 24 h); precipitação+pressão+espessura; pressão/vento; temperatura em 2 m (instantânea, máxima, mínima); umidade relativa mínima em 2 m; vento 10 m e em níveis (250–925 hPa); vorticidade (250–925 hPa).
* **Regiões:** `glo` (global), `ams` (América do Sul), `bra` (Brasil), `sul`, `sud` (**Sudeste, inclui o RJ**), `coe`, `nde`, `nte`. Não há recorte só do RJ.
* **Ondas (Wwatch):** altura e direção (`alt_onda`), período médio (`per_medio`), período de pico (`per_pico`), vento (`vento`), windsea; regiões `bra, sul, sud, nde, nte, glo, atl, pac, ind`.
* **Séries por município (meteogramas):** `https://ftp.cptec.inpe.br/modelos/tempo/{Eta/ams_08km|WRF/ams_07km|BRAMS/ams_08km|BAM/TQ0666L064}/recortes/grh/json{2}/AAAA/MM/DD/HH/{cityId}.json` (CORS liberado; **5.565 municípios**, 92 do RJ — IDs no código do site, ex.: Rio de Janeiro 3564, Niterói 3557).
  Cada arquivo traz **169 passos horários (7 dias)** com temperatura, máx/mín, sensação térmica (heat_index), umidade, pressão, vento (direção/velocidade), precipitação, nuvens baixa/média/alta e espessura das camadas.
  **Problema:** a última rodada publicada nessas pastas é **27/08/2026** (todas as quatro). Enquanto o CPTEC não voltar a publicar, não serve para tempo real.

## 3. Previsão subsazonal e sazonal (BAM-1.2)
* **Subsazonal** (`subsazonal.cptec.inpe.br`): previsão de 7, 14, 21 e 30 dias, **semanas 1 a 4**, em 12 regiões (inclui América do Sul), 18 variáveis (precipitação e temperatura, calibradas ou não; pressão, OLR, vento/circulação em 850 e 200 hPa, geopotencial 500 hPa…) e campos (anomalia, total, probabilidade do tercil mais provável, probabilidade de anomalia positiva).
  Figuras: `https://s0.cptec.inpe.br/subsaz/figures_web/AAAA/MM/DD/bam12_{variável}_{campo}_{AAAAMMDD}00_week0N_{região}.png` (testado: `…/2026/10/18/bam12_prec_anomaly_2026101800_week01_as.png` → 200). Rodadas duas vezes por semana (domingo e quarta: 04, 07, 11, 14 e 18/10). Não há API de lista: as datas vêm embutidas no HTML (sem CORS), mas dá para **calcular as datas prováveis e testar a imagem** (`<img onError>`).
* **Sazonal** (`sazonal.cptec.inpe.br`): previsão mensal e trimestral, emissão mensal; figuras em `https://s0.cptec.inpe.br/clima/modelos/BAM-1.2_products/figures/AAAA/MM/01/bam12_…_mnth0N|seas0N_{região}.png`. As **notas técnicas** trimestrais estão em PDF (`ftp.cptec.inpe.br/clima/nota_tecnica/2026/Nota_Tecnica_OND2026.pdf` etc.).
* Ambos têm pacotes Python e downloads (`dataserver.cptec.inpe.br/dataserver_subsaz/`).

## 4. Outros sites do CPTEC
* `clima.cptec.inpe.br` (monitoramento Brasil/global, notas técnicas), `nowcasting.cptec.inpe.br` (app React), `bacias.cptec.inpe.br` (Projeto ANA), `www.cptec.inpe.br/geada`, `meioambiente` (qualidade do ar — não respondeu), `www.cptec.inpe.br/dsat` (satélite GOES-19 — **já usamos no mapa**), `servicos.cptec.inpe.br/XML` (webservice antigo — **403**).
* FTP aberto `ftp.cptec.inpe.br` (`modelos/`, `clima/`, `goes/`, `oceano/`, `nowcasting/`, `chuva/`…).

## 5. Sondagem no CPTEC
**Correção de 19/10 (a sondagem estava no Nowcasting, `nowcasting.cptec.inpe.br`, que eu só tinha olhado por cima): existe radiossondagem observada e sondagem do modelo MONAN — ver seção 7.** (Nas demais páginas do CPTEC não há sondagem.)
O que existe, parecido com sondagem, são **produtos de estrutura vertical** da previsão numérica: lapse rate, cisalhamento do vento (1/2/3 km), geopotencial e vento em 250/500/700/850/925 hPa e água precipitável. Pendente: o usuário indicar o endereço onde viu a sondagem. A sondagem numérica continua vindo de INMET (imagem) + Wyoming (números, ver `produtos-inmet.md` seção 11).

## 6. Proposta de implementação (aguardando aprovação)
1. **Sub-aba "Previsão numérica"** (substitui "Modelos"): navegação **por tema** (vento 10 m, temperatura, precipitação, pressão, umidade, jato/níveis, estrutura vertical, ondas…); para cada tema, escolher a **fonte/modelo**: Marinha (ICON-LAM), INMET (COSMO 7 km e 2,8 km) e CPTEC (MONAN, WRF, BRAMS, BAM). Região padrão: Sudeste/RJ.
2. **Comparação 1–4 quadros** (ideia do CPTEC): até 4 painéis, cada um com um modelo, **sincronizados pelo horário de validade** (um único controle de tempo, 3 h, com animação), teclas ← →, quadros empilhados no celular. É a forma de "aglutinar" os modelos.
3. **Ondas:** Wwatch (CPTEC) junto da onda da Marinha, mesma região, lado a lado.
4. **Estrutura vertical** (ligada à Sondagem): lapse rate e cisalhamento do CPTEC + índices K/CAPE do INMET + a sondagem (Skew-T INMET, e números via Wyoming se aprovado).
5. **Tendência (subsazonal/sazonal):** sub-aba nova com semanas 1–4 e mensal/trimestral, como no site (grade de 4 figuras), datas calculadas e verificadas pela própria imagem; link para a nota técnica trimestral.
6. **Meteogramas por município CPTEC (92 do RJ):** desenhar gráficos próprios a partir do JSON — **só depois que o CPTEC voltar a publicar** (hoje parado em 27/08); o painel já tentaria as 3 últimas rodadas e avisaria "dados de 27/08".
7. **Cuidados:** repetir a requisição em 503; carregar poucos quadros de cada vez (não pré-carregar 57 PNGs de uma vez); cache do navegador; mensagem "indisponível"; SMEC e ETA ficam de fora enquanto fora do ar; citar a fonte (INPE/CPTEC) em cada imagem.

## 7. Nowcasting do CPTEC (`nowcasting.cptec.inpe.br`) — investigado em 19/10/2026
App React ("hub") com API própria em `https://nowcasting.cptec.inpe.br/api/v1` e GeoServer proxy em `/api/v1/geoserver/{workspace}/wms`. **A API não envia CORS** (testado no navegador a partir do nosso domínio: bloqueada); as **imagens** (`s3.cptec.inpe.br`) e os **tiles WMS** abrem normalmente em `<img>`/Leaflet. Dados em JSON/GeoJSON exigem **proxy no backend** (cache de poucos minutos).

### 7.1 Sondagem (o que o usuário viu)
* **Radiossondagem observada** (`estacao-radiossondagem`): **43 estações** (inclui **Galeão 83746**, Vitória 83649, Campo de Marte 83779, Confins 83566, Curitiba, Brasília…). Imagem 1400×1200 por lançamento (00Z e 12Z; janela de 4 dias): `https://s3.cptec.inpe.br/nowcasting/NC/PC/RAOB/SKEWT/AAAA/MM/SKEW_{estação}_{AAAAMMDDHH00}.png`.
  **A imagem traz tudo:** Skew-T, perfis de θ/θe/θes, **hodógrafa**, vento relativo à tempestade, cisalhamento e uma **tabela de índices**: **CAPE e CINE (SFC, ML, MU, FCST)**, LCL, **LFC**, **EL**, LI, EHI 0–1/0–3, SRH 0–1/0–3 km, shear 0–1/0–3/0–6 km, STP, SHIP, SCP, PWV, K-index, **DCAPE**, SWEAT, gradientes térmicos. Exemplo Galeão 19/10 00Z: CAPE SFC 450 J/kg, MU 490 J/kg, CINE −6,7, LFC 5875 m, K 33,1, PWV 46,7 mm.
  Os valores **não vêm em dados numéricos** (só na imagem). Disponibilidade: `GET /geojson-products/fixed/estacao-radiossondagem/slots/83746` lista os horários com `available`; sem API dá para **calcular os horários (00Z/12Z) e testar a imagem** com `<img onError>`. Hoje o 12Z de 17 e 18/10 não existia (só 00Z).
* **Sondagem do modelo MONAN** (`sondagem-modelo-monan`): **67 pontos** (Rio de Janeiro = `RJR`, São Paulo `SPA`, Vitória `VTR`, Belo Horizonte `BHO`…), imagens a cada 3 h, até 72 h: `https://s3.cptec.inpe.br/nowcasting/NC/MODEL/SOUNDING/AAAA/MM/DD/00/SKEW_{id}_{AAAAMMDDHHMM}.png` (testado: rodada de 18/10, `…/2026/10/18/00/SKEW_RJR_202610181200.png` → 200). A rodada de 19/10 ainda não tinha sido gerada às 06 UTC.
  **É a única fonte que dá a "sondagem prevista" do RJ**, para comparar com a observada.

### 7.2 Outros produtos do Nowcasting úteis ao CEMADEN-RJ
* **Radares (WMS `dissm`)**: CAPPI 3 km, PPI refletividade e velocidade radial, **VIL, DVIL, Echotop 20/35 dBZ, Waldvogel, chuva 24/48/72 h**, em ~25 radares. Os que cobrem o RJ (por área): **Pico do Couto/Petrópolis** (atual, 06:20Z), **Macaé (INEA)** (atual, 06:05Z) e **Guaratiba (INEA)** (**parado desde 23/09**). Cada camada tem dimensão de tempo (passo de 10–30 min). Também há 13 camadas de satélite GOES-19 (cor natural, IR realçado, vapor, massas de ar, microfísica, fase da nuvem).
* **Previsão de tempestade por radar** ("Prev tempestade", +10/20/30 min), por radar (Guaratiba/Macaé do INEA; Guaratiba parado desde 23/09).
* **TATHU diagnóstico** (GOES-19): células convectivas com fase (estável/crescendo…), temperatura mínima do topo, taxa de expansão, fração convectiva, e **previsão de +30/60/90/120 min** (GeoJSON, atualizado a cada 10 min, ~1,3 MB).
* **LightningCast** (GOES-19): **probabilidade de raios** (polígonos GeoJSON, 388 feições, atualizado a cada ~15 min).
* **Chuva intensa 24 h/48 h** e **Tempo severo 24 h/48 h** derivados do modelo (GeoJSON, marcados "Experimental").
* **Mapas MONAN como camadas WMS (17):** incluindo **MUCAPE e cisalhamento 0–6 km**, θe 850 hPa, **transporte integrado de vapor (IVT)**, água precipitável + Td + vento em 1000 hPa, vorticidade 500 hPa, jato 250 hPa, umidade específica 925 hPa, precipitação 3 h/24 h/total 168 h; passos de 3 h até +120 h.

### 7.3 Como entraria no painel (proposta, aguardando aprovação)
1. **Sondagem** (aba já existente): seletor **Observada INMET | Observada CPTEC | Modelo MONAN (previsto)**; para o mesmo local (padrão Galeão, com Vitória e Campo de Marte), 2 colunas no PC (observada × MONAN). A imagem do CPTEC traz CAPE/CINE/LFC/EL/SRH, então **a parte de números sai da própria figura** (sem depender de Wyoming); abrir em tela cheia para ler a tabela (celular: zoom/arrastar). Horários 00Z/12Z calculados e testados.
2. **Nowcasting no mapa** (Mapa → camadas): radares Pico do Couto e Macaé (refletividade, VIL, Echotop, chuva 24 h) com animação, **LightningCast** e **TATHU** (precisam de proxy no backend, `/api/nowcasting/…`, com cache de 2–5 min).
3. **Estrutura vertical/instabilidade** (junto de "Previsão numérica"): MUCAPE + cisalhamento 0–6 km, IVT e θe 850 do MONAN (WMS) ao lado do K/CAPE do INMET.
4. Risco: serviço novo ("Experimental", tags de teste), pode mudar; mostrar mensagem quando uma fonte estiver parada (ex.: Guaratiba) e manter a fonte nas imagens.

## 8. Implementado em 19/10/2026
Modelos MONAN/WRF/BRAMS/BAM/Wwatch na **Previsão numérica** unificada; subsazonal e sazonal na sub-aba **Clima**; sondagem observada e do MONAN na aba **Sondagem** (com os números de Wyoming). **Meteogramas por município do CPTEC: decisão do usuário de não implementar** (parados desde 27/08). Radares, TATHU e LightningCast do Nowcasting: ainda não. Detalhes em `previsao-numerica.md`.
