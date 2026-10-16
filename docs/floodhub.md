# Google Flood Hub no painel (16/10/2026)

Integração com a **Flood Forecasting API** do Google (`floodforecasting.googleapis.com/v1`), a mesma base do
[Flood Hub](https://sites.research.google/floods/). Dados sob **CC BY 4.0** (a atribuição aparece nas telas).
Documentação do Google: <https://developers.google.com/flood-forecasting>.

## Chave de API
* Nome: `FLOODHUB_API_KEY`, no `backend/.env` (local, fora do Git) e no `.env` do servidor (acrescentada por SFTP em 16/10/2026,
  com cópia `.env.bak-AAAAMMDD` ao lado). `config/settings.py` lê a variável; **a chave só é usada no servidor** (header
  `X-Goog-Api-Key`), nunca vai ao navegador nem aos documentos.
* Para trocar a chave: editar `backend/.env` e reenviar a linha (`set_env_servidor.py FLOODHUB_API_KEY`, script de apoio da sessão).

## O que a API entrega (levantado em 16/10/2026 com a chave)
* **Dois tipos de posto:** `ANA_*` (estações reais da ANA, **sem modelo**: só a situação, sem previsão) e `hybas_*` (pontos
  **virtuais** da rede de rios, com modelo do Google: previsão de **vazão em m³/s** com limiares de atenção, perigo e extremo).
* No retângulo do RJ (lat −23,5…−20,6; lon −45,2…−40,8) há **459** postos; **186 dentro do RJ** e só **15 "quality verified"**
  (8 da ANA — Cataguases/MG, Pádua II, Aperibé, Patrocínio do Muriaé, Carangola, Itaperuna, Cardoso Moreira, Campos Ponte Municipal —
  e 5 hybas verificados). O Google recomenda cautela com os não verificados; por isso a tela mostra **só os verificados por padrão**.
* Severidade (`floodStatus`): `NO_FLOODING`, `ABOVE_NORMAL`, `SEVERE`, `EXTREME` (+ tendência `RISE/FALL/NO_CHANGE`).
* Previsão (`queryGaugeForecasts`): 8 faixas diárias de vazão por emissão. Limiares em `gaugeModels:batchGet`.
* Em 16/10 todos os postos estavam em `NO_FLOODING`.

## O que foi implementado
| Peça | Onde |
|---|---|
| Modelos `FloodHubGauge`, `FloodHubForecast`, `FloodHubSituacao` (migração `0017_floodhub`) | `backend/core/models.py` |
| Sincronização (situação, metadados/limiares 1x/dia, previsões, casamento com estação ≤ 3 km, histórico diário) | `backend/ingestion/floodhub.py` |
| Endpoints `GET /api/floodhub/` (`?todos=1`, `?estacao=<id>`) e `GET /api/floodhub/validacao/?dias=14` | `backend/api/floodhub_views.py` |
| Ações admin: `sync_floodhub` (`forcar`), `floodhub_pares` (leitura: pares posto × estação) | `backend/api/admin_views.py` |
| Etapa 1 — **modo "Flood Hub (cheias)" no mapa** (bolinhas por severidade) e **aba Dados → Flood Hub** (tabela de postos, previsão, limiares) | `MapaBolhas.tsx`, `MapView.tsx`, `FloodHubPanel.tsx`, `Dashboard.tsx` |
| Etapa 2 — **previsão no detalhe da estação** (gráfico de vazão com limiares, para postos a ≤ 3 km) | `FloodHubDetalhe.tsx`, `StationHistoryPanel.tsx` |
| Etapa 3 — **validação** (Flood Hub × classe da cota observada, por dia) | aba Flood Hub → "Validação" |
| Etapa 4 — **alerta informativo** (posto verificado com situação ou pico previsto ≥ "acima do normal") | bloco na aba Flood Hub e no Resumo 24h; **não aciona sirene** |

## Atualização automática
Não há como criar cron novo pela API do cPanel; a sincronização **pega carona no job de 15 min do INEA**:
`ingest source=inea` chama `floodhub.sync_se_vencido(30)` (roda a cada 30 min, nunca derruba o ingest). Primeira carga ≈ 15-25 s,
rodadas seguintes ≈ 8 s. Também dá para forçar: `{"action":"sync_floodhub","forcar":true}` em `/api/admin/run/`.

## Decisões e limites
* **Vazão ≠ nível:** o Google prevê vazão (m³/s) em pontos do rio; nossas estações medem nível (m). Por isso a previsão aparece em gráfico
  próprio com os limiares do posto, e a validação compara **classes** (cota normal/atenção/alerta/transbordo/extrema ↔ Sem cheia/Acima do
  normal/Severo/Extremo), não valores.
* **Casamento posto × estação:** por proximidade (≤ 3 km). Em 16/10 foram 20 pares na primeira rodada, 24 após a regra do mesmo rio (quase todos hybas × estações do INEA, ex.: Barra do Sana,
  Nogueira/Piabanha, Ponte Paraoquena/Pomba; e Itaperuna/ANA × Itaperuna INEA). Lista para revisão: ação `floodhub_pares`.
* **Validação só começa a acumular a partir de 16/10/2026** (histórico diário `FloodHubSituacao`); com tudo "Sem cheia" ela confirma o "normal".
* **Postos não verificados** ficam escondidos por padrão (caixa "Incluir postos ainda não verificados" na aba).
* **Flash flood** (`flashFloods:search`, probabilidade em 24 h em células de 20 km) e **eventos significativos** (`significantEvents:search`)
  ainda **não** foram integrados; são o próximo passo natural. Mapas de inundação também (vêm em `inundationMapSet`).
* Ferramenta do Colab da equipe: não integrada (aguarda formato de saída).

## Revisão de 16/10/2026 (pedidos do usuário após o primeiro uso)

**1. Postos sem relevância para o RJ — removidos.** Os 7 postos virtuais (`hybas_*`) verificados fora do RJ ficavam todos em MG, a oeste de
−43,9° (lat −21,0…−21,9): bacia do Rio das Mortes / Rio Grande, que corre para o Paraná; não contribuem para o RJ. Regra nova
(`ingestion/floodhub.py`): dentro do RJ entram todos; **fora do RJ só entra posto ANA verificado em rio que escoa para o RJ**
(`RIOS_QUE_ESCOAM_PARA_RJ`: Pomba, Muriaé, Carangola, Paraíba do Sul, Paraibuna, Preto, Piabanha, Itabapoana, Dois Rios). Ficaram os ANA de
Cataguases (Pomba), Carangola e Patrocínio do Muriaé, a montante do RJ. A sincronização apaga os que deixam de valer.

**2. Por que uns postos têm previsão e outros não.** Só os postos `hybas_*` têm modelo do Google (vazão prevista). Os postos `ANA_*` **não têm modelo,
previsão nem limiares na API**: ela devolve só a severidade atual (conferido: `queryGaugeForecasts` e `gaugeModels` dão `INVALID_ARGUMENT` para ANA).
O site do Flood Hub desenha a série de nível dos ANA com dados que a API pública não expõe. **Melhoria feita:** os postos ANA passam a casar com a estação
nossa **do mesmo rio** (até 20 km; hybas continuam até 3 km) e mostram o **nível que lemos** (72 h, tendência de 6 h, classe da cota). Pares ANA em
16/10: Cardoso Moreira↔Italva, Patrocínio do Muriaé↔Laje do Muriaé, Aperibé↔Santo Antônio de Pádua, Itaperuna↔Itaperuna, Pádua II↔Santo Antônio de Pádua
(Campos–Ponte Municipal, Carangola e Cataguases ficaram sem estação nossa próxima). Total de pares: 24.

**3. Mapa com postos não verificados.** Modo Flood Hub do mapa ganhou a caixa **"Incluir postos não verificados pelo Google"** (como a da tabela);
não verificados aparecem esmaecidos com contorno tracejado e o popup avisa "NÃO verificado — usar com cautela".

**4. Bacia, tendência e informações do medidor (como no site do Google).** O que a API pública **não** entrega: contorno e área da bacia, série de nível dos ANA,
limiares dos ANA. Polígonos existem só para mapas de inundação (`inundationMapSet`, quando há cheia), eventos significativos e flash floods. Foi criada a
**ficha do posto** (clique no nome na tabela, no alerta ou "Ver ficha do posto" no popup do mapa): severidade, tendência, gráfico de vazão prevista com limiares
(hybas), gráfico do **nível observado 72 h** com as cotas (estação casada), ID/origem/lat-lon/rio/município/modelo e botão para o histórico da estação. A bacia
fica registrada como limitação. **Próximo passo possível:** polígonos de eventos significativos e flash flood (`significantEvents:search`, `flashFloods:search`
com `countryCodes:["BR"]`) e mapas de inundação em camada no mapa.

**5. Histórico da estação ficava sob o mapa (todo o projeto).** Os controles e panes do Leaflet usam z-index até 1000 e o painel de histórico usa z-40.
Correção: `isolation: isolate` em todo `.leaflet-container` (`globals.css`) e `isolate` no contêiner da aba Mapa (`Dashboard.tsx`), contendo o empilhamento
dentro do mapa. Testado: abrindo "Ver histórico da estação" a partir do mapa, 5 pontos do painel (centro, cantos, topo) ficam por cima.

**6. Aba Flood Hub — filtros, ordenação, cliques e números.**
* **Ordenação:** clique no cabeçalho (▲/▼; vazios sempre no fim) nas duas tabelas (Postos e Validação), incluindo Município em ordem alfabética.
* **Filtros:** busca (posto, rio, município, estação), seleção de município, situação (postos) ou resultado (validação) **e** os filtros globais do botão "Filtros"
  (município e REDEC). A barra superior mostra "N de M postos" e **Exportar CSV** exporta a tabela visível.
* **Cliques:** nome do posto abre a ficha; "Estação nossa" abre o histórico (antes só aparecia nos poucos postos casados; agora há 24 pares).
* **181 × validação:** os 181 são **todos** os postos virtuais não verificados dentro do RJ (contagem do Google). A **Validação** só compara os postos **casados com uma
  estação nossa** (24) e só os dias com dados; por isso os números não batem. A tela agora explica isso e mostra a distância posto↔estação e o nome do posto.

## Eventos: inundação significativa e chuva repentina no mapa (16/10/2026)
**O que são** (Google Flood Hub): *inundação significativa* = evento com vários postos e vários dias (polígono da área prevista afetada, área em km², população,
postos, início/fim); *chuva repentina (flash flood)* = probabilidade de enchente repentina nas próximas 24 h em células de 20 km, com duas áreas: **provável** e
**muito provável**.

**Como entra no painel**
* `ingestion/floodhub.py::sincronizar_eventos` (dentro de `sync`, não derruba os postos se falhar): consulta `significantEvents:search` (só os que citam `BR`) e
  `flashFloods:search` (`countryCodes:["BR"]`); para cada evento novo busca o contorno (`serializedPolygons/{id}`, KML) e converte para GeoJSON
  (`kml_para_geojson`, simplifica contornos acima de 2.500 vértices). **Só guarda o contorno dos que tocam o RJ** (`geometria_toca_rj`: algum centroide de
  município dentro do polígono, ou vértice dentro do RJ); os demais ficam registrados sem contorno (`afeta_rj=False`) para não buscar de novo. Limite de 60 polígonos
  por rodada. Eventos que somem da consulta ficam `ativo=False`.
* Modelo `FloodHubEvento` (migração `0018_floodhub_eventos`), endpoint `GET /api/floodhub/eventos/` (`no_rj` com `feicoes` em GeoJSON, `total_brasil`).
* **Mapa** (modo Estações → Flood Hub): áreas desenhadas sob as bolinhas — roxo = inundação significativa; laranja tracejado = chuva repentina provável; vermelho = muito
  provável; popup com horários/área/população; legenda; e o texto "Eventos do Flood Hub: nenhum no RJ agora (N no Brasil)" ou "N evento(s) no RJ agora".
* **Alerta informativo:** bloco "Eventos do Flood Hub no RJ" na aba Dados → Flood Hub (sempre mostra o estado) e no Resumo 24h (só quando há evento). Não aciona sirene.
* **Estado em 16/10/2026:** a API listava 1 inundação significativa (Somália, descartada por não citar o Brasil) e 1 chuva repentina no Brasil, **fora do RJ** — por isso nenhum
  desenho aparece hoje. O desenho foi validado com eventos **sintéticos inseridos só no banco local de teste** (removidos depois): as 3 áreas, o popup e a legenda funcionaram.
  O parser KML foi validado com um polígono real da API (17 polígonos, 2.479 vértices).
* Limites: a ordem dos pontos do KML é lon,lat (convertida); o teste de "toca o RJ" é aproximado (centroides/vértices), podendo perder um polígono que cruze o RJ sem
  conter centroide nem vértice dele (improvável nas escalas desses eventos).

## Cores originais e ordem das camadas (16/10/2026)
* **Cores do Flood Hub** (amostradas da legenda do site do Google): Extremo `#9f0203`, Perigo `#fe320e` (nosso rótulo "Severo"), Aviso `#fb9a32` ("Acima do normal"),
  Normal `#45a46b` ("Sem cheia"), Sem dados `#bebebe`. As bolinhas do mapa e as etiquetas das tabelas usam essas cores, **sem transparência** (borda branca nos
  verificados; tracejada cinza nos não verificados, que ficam um pouco menores). Os rótulos continuam os nossos; se preferir os nomes do Google (Extremo/Perigo/Aviso/Normal),
  é só trocar em `ESTILO_SEVERIDADE` (`frontend/src/lib/floodhub.ts`).
* **Ordem das camadas no mapa (de baixo para cima):** mapa-base (200) → divisões e bolinhas das estações (`overlayPane`, 400; marcadores 600) →
  **áreas de evento do Flood Hub** (pane `eventosFH`, **620**: sobre as estações) → **imagens de satélite/radar** (pane `imagensMeteo`, **650**: sobre tudo) → popups (700).
  Ajustado em 16/10/2026 a pedido: os polígonos de chuva repentina ficam **sobre as estações e abaixo das imagens** (a imagem, com a opacidade escolhida, também cobre os
  polígonos). Antes as imagens (zIndex 400 no mesmo pane das bolinhas) ficavam *abaixo* das estações. Os dois panes têm `pointer-events: none`, então o clique passa para a
  estação por baixo (verificado com o satélite a 100%); o contorno das áreas de evento continua clicável (CSS `.evento-fh { pointer-events: stroke }`).
