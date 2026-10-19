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
**Não encontrei sondagem observada (radiossonda/Skew-T) nas páginas públicas do CPTEC** (busca por "sondagem", "radiossonda", "Skew" em todas as páginas e scripts; `tempo.cptec`/`/sondagem` só redirecionam para a home).
O que existe, parecido com sondagem, são **produtos de estrutura vertical** da previsão numérica: lapse rate, cisalhamento do vento (1/2/3 km), geopotencial e vento em 250/500/700/850/925 hPa e água precipitável. Pendente: o usuário indicar o endereço onde viu a sondagem. A sondagem numérica continua vindo de INMET (imagem) + Wyoming (números, ver `produtos-inmet.md` seção 11).

## 6. Proposta de implementação (aguardando aprovação)
1. **Sub-aba "Previsão numérica"** (substitui "Modelos"): navegação **por tema** (vento 10 m, temperatura, precipitação, pressão, umidade, jato/níveis, estrutura vertical, ondas…); para cada tema, escolher a **fonte/modelo**: Marinha (ICON-LAM), INMET (COSMO 7 km e 2,8 km) e CPTEC (MONAN, WRF, BRAMS, BAM). Região padrão: Sudeste/RJ.
2. **Comparação 1–4 quadros** (ideia do CPTEC): até 4 painéis, cada um com um modelo, **sincronizados pelo horário de validade** (um único controle de tempo, 3 h, com animação), teclas ← →, quadros empilhados no celular. É a forma de "aglutinar" os modelos.
3. **Ondas:** Wwatch (CPTEC) junto da onda da Marinha, mesma região, lado a lado.
4. **Estrutura vertical** (ligada à Sondagem): lapse rate e cisalhamento do CPTEC + índices K/CAPE do INMET + a sondagem (Skew-T INMET, e números via Wyoming se aprovado).
5. **Tendência (subsazonal/sazonal):** sub-aba nova com semanas 1–4 e mensal/trimestral, como no site (grade de 4 figuras), datas calculadas e verificadas pela própria imagem; link para a nota técnica trimestral.
6. **Meteogramas por município CPTEC (92 do RJ):** desenhar gráficos próprios a partir do JSON — **só depois que o CPTEC voltar a publicar** (hoje parado em 27/08); o painel já tentaria as 3 últimas rodadas e avisaria "dados de 27/08".
7. **Cuidados:** repetir a requisição em 503; carregar poucos quadros de cada vez (não pré-carregar 57 PNGs de uma vez); cache do navegador; mensagem "indisponível"; SMEC e ETA ficam de fora enquanto fora do ar; citar a fonte (INPE/CPTEC) em cada imagem.
