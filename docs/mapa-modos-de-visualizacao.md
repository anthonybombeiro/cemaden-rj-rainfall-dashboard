# Mapa: botão "Estações" e modos de visualização (07/10/2026)

No canto superior esquerdo do mapa (ao lado do zoom) há o botão **Estações**, que muda o que as
bolinhas mostram. A escolha fica salva no navegador (`localStorage`, chave `mapa-modo-estacoes-v1`).
Código: `frontend/src/components/MapaBolhas.tsx`, `frontend/src/lib/mapaModos.ts`,
`frontend/src/components/MapView.tsx`; faixas de vento em `frontend/src/lib/ventoFaixas.ts`; cores de
sirene em `frontend/src/lib/sirenesEstilo.ts`.

| Modo | O que mostra | Cores | Dado |
|---|---|---|---|
| Todas as estações (por rede) | comportamento anterior (uma cor por fonte) | por fonte | `stations` |
| Somente sirenes | só as sirenes, **tocando** (maior, cor do tipo de acionamento: as mesmas da tabela Sirenes) × **não tocando** (menor: online verde, offline cinza, desconhecido cinza claro) | tabela Sirenes | `fetchSirenes()` |
| Chuva 1 h | número (mm) dentro da bolinha, todas as fontes | Fraca 0,2–5 azul `#63B8FF`, Moderada `#FFFF66`, Forte `#FFA600`, Muito Forte `#CC0000`; **atrasada (≥ 1 h)** cinza `#BEBEBE`; sem chuva **verde** | `fetchPrecipitacao()` (já com valor oficial quando a fonte tem) |
| Chuva 24 h | idem, em 24 h | níveis 10/30/70 mm (amarelo/laranja/vermelho) — só existem 3 classes para 24 h; atrasada cinza; sem chuva verde | idem |
| Vento (rajada) | rajada em km/h dentro da bolinha, **somente estações que medem rajada** | Fraca, Moderada, Forte, Muito forte (as da tabela Vento); atrasada (> 3 h) cinza | `latest_readings.vento_rajada_ms` × 3,6 |

Regras: estação sem nenhum dado no modo não aparece (exceto atrasadas, no modo chuva); a legenda do
canto troca conforme o modo e mostra a contagem; clicar na bolinha abre o popup com "Ver histórico da
estação". Testado localmente em desktop e celular (não há alteração de backend para o mapa).

## Tabelas pedidas no mesmo dia

* **Paracambi:** a tabela já existia com o nome "Ecowitt"; renomeada para **Paracambi** (aba e título "Paracambi (Defesa Civil, Ecowitt)").
* **CEMADEN-RJ (pluviômetros das sirenes):** nova aba **CEMADEN-RJ** (85 sirenes com pluviômetro). Os acumulados
  **oficiais** (15 min, 1, 4, 12, 24, 48, 72, 96 h e 1 mês) vêm da página pública do portal
  (`ConsultaPluviometros?cmd=dadosPluviometros`, ~3 min) e são lidos dentro do `sync_sirenes`
  (`_acumulados_oficiais_portal`, nunca levanta erro — o status das sirenes não pode falhar), gravados em
  `Station.raw_metadata["acumulados_oficiais"]` e no histórico `AcumuladoOficial`; “Calc” (nosso cálculo) ao lado.
  A tabela de Precipitação passa a usar o oficial (`MAPA_ACUMULADOS_OFICIAIS["cemaden_rj_sirenes"]`).
  Endpoint: `GET /api/stations/rede/?source=cemaden_rj_sirenes` (só sirenes com `tem_pluviometro`).
  Casamento página × estação: chave `CIDADE|ESTAÇÃO` normalizada (85 linhas lidas na página).

## Satélite DSAT/CPTEC-INPE no mapa (07/10/2026)

Em **Opções → Camada de imagem → Satélite** há agora 4 produtos do DSAT/CPTEC (GOES-19) além dos 3 da REDEMET.
O padrão passou a ser a **Cor verdadeira — True Color**.

| Opção | Pasta no CPTEC (`ftp.cptec.inpe.br/goes/goes19/goes19_web/`) |
|---|---|
| Cor verdadeira — True Color | `ams_rgb_natcolor` (RGB natural; o GeoTIFF `rgb/rgb_nat_true` pesa 11 MB e não abre no navegador) |
| IR realçado | `ams_realcada_alta` |
| IR canal 13 | `ams_ret_ch13_alta` |
| Visível canal 02 | `ams_ret_ch02_alta` |

* **Backend:** `backend/api/dsat_imagery_views.py`, rota `GET /api/imagery/dsat/?tipo=truecolor|dsat_realcada|dsat_ch13|dsat_ch02[&anima=1..6]` (exige login, mesmo formato do `/api/imagery/satelite/`). Só lista o diretório do mês (`AAAA/MM/`), acha os quadros mais recentes (a cada 10 min) e calcula os limites geográficos do world file `.jgw` (0,02°/pixel, origem −100°/12,52°) + tamanho do JPEG (leitura por `Range`). Cache 4 min (quadros) e 24 h (limites).
* **Imagem:** o navegador baixa o JPG direto do CPTEC (CORS aberto, sem login); cada quadro tem ~4 MB e cobre toda a América do Sul. Animação limitada a 6 quadros (1 h) por causa do peso. Opacidade 0,8. À noite/antes do amanhecer a imagem é escura (é a cor real).
* **Frontend:** `MapView.tsx` (tipos novos em `TipoSatelite`, `eDsat()`, rótulo "DSAT/CPTEC-INPE (GOES-19)").
* **Teste local:** quadro True Color sobre o RJ georreferenciado corretamente (costa e nuvens sobre as estações). No `next dev` local o proxy remove a barra final e dá 404 (também ocorre com as rotas antigas) — em produção a rota é do mesmo domínio e funciona (403 sem login, como as demais).

### Correção em 08/10/2026 — DSAT "carregando para sempre"
* **Causa:** o CPTEC esvaziou/reorganizou `ftp.cptec.inpe.br/goes/goes19/` na madrugada de 08/10 (diretórios `goes19_web`, `rgb` etc. passaram a dar 404, sobrou só `web_tiles/` vazio). A rota do DSAT dependia da listagem desse diretório, voltava 502 e o mapa ficava em "Carregando…" porque o front tratava a resposta de erro como imagem.
* **Correção (backend):** os mesmos arquivos continuam em `https://satelite.cptec.inpe.br/repositoriogoes/goes19/goes19_web/<produto>/AAAA/MM/<prefixo>_AAAAMMDDHHMM.jpg` (+ `.jgw`), mas **sem listagem de diretório**. A rota agora testa (HEAD, em paralelo) os horários de 10 em 10 min das últimas 4 h e pega os últimos existentes. Prefixos: True Color `S11161220`, IR realçado `S11161222`, canal 13 `S11161113`, visível canal 02 `S11161102` (este só existe de dia). Quadros de ~2,4 MB. Testado no servidor com a ação admin de leitura `teste_dsat` (6 quadros em 0,1 s).
* **Correção (frontend):** erro/sem imagem agora mostra "Sem imagem disponível agora…" em vez de "Carregando…" eterno (`MapView.tsx`).
* Se o CPTEC mudar de novo: reexecutar `teste_dsat` (ação admin) e ajustar `BASE`/`PRODUTOS` em `backend/api/dsat_imagery_views.py`.

## Radar de Santa Teresa — REDEMET (09/10/2026)
Em **Opções → Camada de imagem → Radar** entraram 5 opções "(Santa Teresa)": MAXCAPPI e CAPPI 10/7/5/3 km. A REDEMET
chama a área de `st` ("Radar - Santa Teresa/MG", raio 400 km, centro −19,99/−40,58; limites lat −23,54…−16,35, lon −44,33…−36,66,
cobrindo o norte/noroeste do RJ). As opções antigas ficaram rotuladas "(Pico do Couto)", `area=pc`.
* **Backend:** `/api/imagery/radar/?tipo=<corte>&area=st` (mesma view do Pico do Couto; `area` agora é validada contra `{pc, st}` em `AREAS_RADAR`, `redemet_imagery_views.py`).
* **Frontend:** `MapView.tsx` — tipos `st-maxcappi`, `st-10km`, `st-07km`, `st-05km`, `st-03km`; o prefixo `st-` escolhe `area=st`. Animação: até 8 quadros (limite real da REDEMET).
* **Descoberta do código:** ação admin de leitura `teste_redemet` (GET em `/produtos/...` com a chave do servidor, nunca exibida). Os 5 cortes responderam com imagem recente (17:50-17:57 UTC).
* Não verificado visualmente em produção (a chave REDEMET só existe no servidor e a rota exige login).

## Menus do mapa — rolagem e tamanho (09/10/2026)
Problema: as listas de tipo de satélite/radar (agora 7 e 16 opções) cresciam o painel além da tela e rolar com o dedo/roda movia o mapa ao fundo.
* A lista passou a mostrar **~5 opções** (`max-h-[9.5rem]`) e rola por dentro (`overflow-y-auto overscroll-contain`).
* Os painéis do mapa (Camada de imagem e botão Estações) param os eventos de rolagem/clique/toque antes do Leaflet (`L.DomEvent.disableScrollPropagation` e `disableClickPropagation`), então rolar ou tocar no menu não move nem dá zoom no mapa.
* Teste (375 px): lista com 150 px visíveis de 448 (16 itens), rolou até o fim e o `translate3d` do mapa permaneceu `0,0,0`.

## Alinhamento da imagem do DSAT com o mapa (09/10/2026)
Relato: a imagem de satélite não batia com o mapa (a costa ficava deslocada).
* **Causa:** os JPG do DSAT estão em projeção geográfica (graus lineares de latitude e longitude, 0,02°/pixel). O `ImageOverlay` do Leaflet estica a imagem entre os cantos **em Web Mercator**; numa imagem de 68° de latitude (12,5° N a 56° S) isso distorce a posição (cálculo: ~5° de deslocamento na latitude do RJ no pior caso do estiramento linear).
* **Verificação da georreferência do arquivo:** limites municipais do RJ (`rj_municipios.geojson`) desenhados em lat/lon linear sobre o recorte do True Color coincidem com a costa e a baía (sem deslocamento sistemático); assumir imagem em Mercator não encontra o RJ no lugar certo. Ou seja, o arquivo e o `.jgw` estão corretos; o erro era do desenho.
* **Correção:** novo `frontend/src/components/CamadaGeografica.tsx` — camada de tiles em canvas (`L.GridLayer`) que posiciona cada linha da imagem na latitude Mercator correta (`map.project`) e recorta a longitude por tile. Usa `drawImage` direto (sem ler pixels, então não precisa de CORS); troca de quadro redesenha os tiles existentes sem piscar; cache de até 8 imagens. Aplicada aos 4 produtos DSAT em `MapView.tsx`; REDEMET (satélite/radar), Niterói e INEA continuam em `ImageOverlay` (áreas pequenas ou projeção própria — reavaliar se aparecer desalinhamento).
* **Teste (local):** o canto norte da imagem (12,5° N) e o leste (−25°) caem exatamente em Guiné-Bissau/Cabo Verde no mapa-base.
