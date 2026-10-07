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
