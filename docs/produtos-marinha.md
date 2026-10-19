# Produtos da Marinha (SMM/CHM/DHN) no painel — 18/10/2026

Pedido do usuário (18/10/2026): trazer para a aba **Meteorologia** os produtos meteorológicos e oceanográficos da Marinha do Brasil.
Sub-abas criadas: **Cartas sinóticas**, **Modelos** (atmosférico, ondas, oceano), **Meteogramas** e **Marés**.

## 1. De onde vêm os dados (o que descobrimos)
| Fonte | Endereço | Acesso |
|---|---|---|
| Site do CHM | `www.marinha.mil.br/chm/...` | **Cloudflare** (desafio gerenciado / Turnstile): bloqueia curl, `<img>` e iframe de outro site. Não contornamos o desafio. |
| **Servidor de arquivos** | `assets.marinha.mil.br/chm/sites/www.marinha.mil.br.chm/files/...` | **Sem Cloudflare.** Serve os mesmos arquivos do CHM (imagens dos modelos, meteogramas, PDFs). `<img>` funciona de qualquer site. |
| **IDEM-DHN** | `idem.marinha.mil.br/geoserver` (WMS/WFS) | Aberto, **CORS liberado**. 711 camadas: cartas sinóticas (14), cartas náuticas (537), comissões (113), LEPLAC (20), acervo, `smm:metarea_v`, `seg_nav:navarea_v`, estações (só posição). |

Risco: a Marinha pode ativar proteção também no servidor `assets` ou mudar os nomes. Cada aba mostra mensagem de "indisponível" quando a imagem não carrega.
Os nomes foram lidos em 18/10 nas páginas do CHM (filtros da página trocam por query string `?field_area_novo_value=...`; a lista de arquivos vem no HTML).

## 2. Meteogramas do RJ (`MeteogramasPanel.tsx`)
`.../smm/{00|12}/meteogramas/<arquivo><1|2>.jpg` (ICON-LAM 6,5 km, 5 dias; a data de referência "Ref" está no cabeçalho do gráfico).
Gráfico **1** = pressão, temperatura/ponto de orvalho, umidade, vento/rajada; gráfico **2** = visibilidade, precipitação, cobertura e base de nuvens.
Pontos do RJ: Angra dos Reis `Angra_R`, Ilha Grande `IlhaGra`, Marambaia `Maramba`, Baía de Guanabara `BaiaGua`, Entrada da Baía `BaiaOut`,
Charitas/Clube Naval `ClubeNa`, Ilha Rasa `IlhaRas`, Cabo Frio `CaboFri`, Macaé `Macae_R`, Bacia de Campos `BaciaCa`. (A lista completa do país tem ~60 pontos; só os do RJ foram incluídos.)

## 3. Modelos (`ModelosMarinhaPanel.tsx`, config em `lib/produtosMarinha.ts`)
Seletor de **área**, **produto**, **rodada (00Z/12Z)**, barra de tempo e **Animar** (700 ms/quadro, quadros pré-carregados).
* **Atmosférico** — `.../smm/{R}/atmosferico/{met|nne|cto|sse}/{produto}_{HHH}.gif`, HHH = 000…096 de 3 em 3 h (33 quadros).
  Áreas: METAREA V, Nordeste, Centro-Oeste, Sul-Sudeste. Produtos: `vent10m`, `ventmax`, `precpress`, `temp2m`, `hum2m`, `visibilidade`, `nebulos_total`, `espvor`, `vorgeo500`, `vertical`, `jato250`.
* **Ondas** — `.../smm/{R}/ondas/{met|nne|sse|ant|pen}/{ondas|periopeak}_{HHH}.png`, 000…096 de 3 em 3 h.
* **Oceanográfico (HYCOM)** — `.../smm/{R}/hycom/{área}/...{HH}.png`, HH = 00…90 de 6 em 6 h (16 quadros).
  `METAREA` e `4km` (Sul/Sudeste): `SSH_`, `temperaturaNaSuperficie_`, `temperatura50metros_`, `temperatura250metros_`, `correnteNaSuperficie_`, `corrente50metros_`, `corrente250metros_`.
  `NORTE`/`LESTE`/`SUDESTE`/`SUL` (áreas 1 a 4): `ssh_area_N_`, `temp_0|50|250_area_N_`, `corrente_0|50|250_area_N_`.
* Todos os padrões foram verificados (HTTP 200) em 18/10. Não incluídos: modelo atmosférico **Antártico** (`/chm/modeloantartico`) e **Meteogramas em mapa** (`/chm/meteogramas_mapa`) — possíveis extensões.
* A rodada padrão é 00Z; o usuário alterna. A Marinha publica com atraso de várias horas (observado: às 13:41 UTC a pasta `00` ainda tinha a carta de 17/10). Ideia futura: um endpoint no backend lendo o `Last-Modified` para escolher sozinha a rodada mais recente.

## 4. Marés (`MaresPanel.tsx`, dados em `frontend/public/mares-2026.json`)
Os PDFs de tábua de maré (`.../files/dados_de_mare/NN - PORTO ....pdf`, linkados em `www.marinha.mil.br/chm/tabuas-de-mare-6`) são **anuais** e **não podem ser exibidos
dentro do painel** (CSP `frame-ancestors 'none'`); por isso o texto é **extraído** (horário local UTC-3 e altura em metros acima do nível de redução da carta).
* **Script:** `backend/scripts/gerar_mares_marinha.py AAAA` baixa os 7 PDFs do RJ com `curl` (o Python não reconhece a cadeia de certificados do servidor da Marinha) e gera `frontend/public/mares-AAAA.json` (365 dias por porto, 3 a 8 extremos por dia — marés com picos secundários são reais, ex.: Itaguaí).
* **Portos (7):** 40 Porto do Rio de Janeiro (Ilha Fiscal), 41 Itaguaí, 43 Terminal da Ilha Guaíba, 44 Angra dos Reis, 42 Porto do Forno (Arraial do Cabo), 38 Porto do Açu, 39 Terminal Marítimo de Imbetiba (Macaé). Verificado: Ilha Fiscal 01/01/2026 = 01:51 1,20 · 08:01 0,37 · 13:12 1,00 · 20:12 0,08 (igual ao PDF).
* **Tela:** seleção de porto e dia (◀ ▶, calendário, "Hoje"); **curva** do dia (interpolação cossenoidal entre extremos, ponto azul = valor oficial, linha vermelha "agora", linha do nível médio); lista de preamares/baixa-mares com a **próxima maré** (hoje); **Tábua do mês** (clicável).
  Preamar/baixa-mar são classificadas comparando com os vizinhos (inclui o dia anterior/seguinte).
* **Aviso na tela:** é previsão astronômica, sem maré meteorológica (vento/pressão).
* **Rotina anual:** em dezembro a Marinha publica "Tábuas de Maré 2027" com **novos nomes de arquivo** (o sufixo numérico muda). Atualizar `PORTOS_RJ_2026` no script (ver a página do CHM), rodar `python backend/scripts/gerar_mares_marinha.py 2027`, build e deploy do frontend. Sem o arquivo do ano, a aba mostra "Tábuas de maré de AAAA indisponíveis".

## 5. Cartas sinóticas
Ver `fontes-de-dados.md` ("Cartas sinóticas da Marinha via IDEM-DHN") — WMS do IDEM-DHN, mapa com animação e comparação.

## 6. Layout das sub-abas
Previsão · Avisos · Cartas · **Modelos** · **Meteogramas** · **Marés** · Cadastro. No celular só ícones (7 cabem em uma linha); a barra tem rolagem horizontal em telas médias.

## 7. Possíveis próximos passos
Modelo Antártico; meteogramas em mapa (`/chm/meteogramas_mapa`); camadas `smm:metarea_v`/`seg_nav:navarea_v` no mapa de avisos; escolher a rodada mais recente automaticamente; **Meteoromarinha** (previsão de 24 h em texto, `/chm/dados-do-smm-meteoromarinha/previsao-24-horas`, ainda não analisada); **Programa PNBOIA** (boias) e estações meteorológicas costeiras da Marinha (dados medidos — o IDEM só tem a posição; os valores estão em páginas do CHM).

> **INMET (VIME, Sondagem, meteogramas, avisos):** levantamento em `produtos-inmet.md` (18/10/2026), com proposta de aglutinação com os produtos da Marinha.

> **Atualização de 19/10/2026:** as abas "Modelos" foram substituídas pela **Previsão numérica** unificada (`previsao-numerica.md`). Descoberta importante: os arquivos de `assets.marinha.mil.br/.../smm/` têm `Cache-Control` de 10 anos e as pastas `00`/`12` são sobrescritas a cada rodada (publicadas ~19,5 h e ~8 h depois do horário da rodada); as imagens passaram a levar um parâmetro de versão.
