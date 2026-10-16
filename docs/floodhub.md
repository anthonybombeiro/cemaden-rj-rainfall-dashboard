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
* **Casamento posto × estação:** por proximidade (≤ 3 km). Em 16/10 foram 20 pares (quase todos hybas × estações do INEA, ex.: Barra do Sana,
  Nogueira/Piabanha, Ponte Paraoquena/Pomba; e Itaperuna/ANA × Itaperuna INEA). Lista para revisão: ação `floodhub_pares`.
* **Validação só começa a acumular a partir de 16/10/2026** (histórico diário `FloodHubSituacao`); com tudo "Sem cheia" ela confirma o "normal".
* **Postos não verificados** ficam escondidos por padrão (caixa "Incluir postos ainda não verificados" na aba).
* **Flash flood** (`flashFloods:search`, probabilidade em 24 h em células de 20 km) e **eventos significativos** (`significantEvents:search`)
  ainda **não** foram integrados; são o próximo passo natural. Mapas de inundação também (vêm em `inundationMapSet`).
* Ferramenta do Colab da equipe: não integrada (aguarda formato de saída).
