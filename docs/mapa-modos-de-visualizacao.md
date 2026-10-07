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
