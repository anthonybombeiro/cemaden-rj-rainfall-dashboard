# Limpeza dos baldes de chuva duplicados na virada do dia (Plugfield) — 17/11/2026

Autorizada pelo usuário em 17/11/2026, depois da correção da ingestão (`bucket_from_running_daily_detalhe` passou a usar o dia da leitura). Ferramenta: `POST /api/admin/limpar-baldes-duplicados/` (superusuário; `dry_run` por padrão), código em `backend/core/limpeza_baldes.py`. A simulação (`dry_run`) achou exatamente estes 13 registros e a execução apagou 13; uma nova simulação depois deu 0.

Regra: é a última leitura de chuva do dia local da estação, feita a partir das 23:30, e o valor é igual (±0,35 mm) à soma de todas as leituras anteriores do mesmo dia (soma > 0,5 mm).

| id da leitura | estação | município | dia e hora (BRT) | balde (mm) | soma anterior do dia (mm) |
|---|---|---|---|---|---|
| 6335154 | 2065 - PAROQUIA NOSSA SENHORA DA AJUDA GUAPIMIRIM | Guapimirim | 2026-11-01 23:59:35 | 2.9 | 2.9 |
| 6416169 | 2055 - PATIO DA CAMARA MUNICIPAL GUAPIMIRIM | Guapimirim | 2026-11-02 23:58:35 | 1.2 | 1.2 |
| 6526131 | 2055 - PATIO DA CAMARA MUNICIPAL GUAPIMIRIM | Guapimirim | 2026-11-03 23:56:15 | 1.7 | 1.7 |
| 6526157 | CANAL DO PAIOL GUAPIMIRIM | Guapimirim | 2026-11-03 23:59:44 | 1.3 | 1.3 |
| 6725202 | ESTACÃO SACRA (NOVA)- EPF | Engenheiro Paulo de Frontin | 2026-11-05 23:59:10 | 2.0 | 2.0 |
| 6933702 | ESTACÃO SACRA (NOVA)- EPF | Engenheiro Paulo de Frontin | 2026-11-07 23:59:10 | 36.2 | 36.2 |
| 7032001 | ESTACÃO SACRA (NOVA)- EPF | Engenheiro Paulo de Frontin | 2026-11-08 23:59:31 | 22.5 | 22.4 |
| 7136606 | 2055 - PATIO DA CAMARA MUNICIPAL GUAPIMIRIM | Guapimirim | 2026-11-09 23:55:39 | 31.3 | 31.3 |
| 7136645 | CANAL MAGEMIRIM | Guapimirim | 2026-11-09 23:59:50 | 12.1 | 12.1 |
| 7554951 | Estação Rio Claro Defesa Civil | Rio Claro | 2026-11-13 23:58:30 | 13.2 | 13.2 |
| 7658158 | 2055 - PATIO DA CAMARA MUNICIPAL GUAPIMIRIM | Guapimirim | 2026-11-14 23:59:38 | 2.7 | 2.7 |
| 7879564 | 2065 - PAROQUIA NOSSA SENHORA DA AJUDA GUAPIMIRIM | Guapimirim | 2026-11-16 23:58:56 | 101.6 | 101.6 |
| 7879616 | DEFESA CIVIL GUAPIMIRIM | Guapimirim | 2026-11-16 23:59:47 | 97.5 | 97.5 |

## Antes e depois (acumulado do mês: nosso × oficial da fonte)
- 2065 Paróquia: 350,3 → **245,8** (oficial 246,3). 2055 Pátio da Câmara: 305,2 → **268,3** (269,2). 2220 Canal do Paiol: 274,7 → 273,4 (274,4). 2029: 105,0 → **92,9** (92,9).
- 1999 Defesa Civil Guapimirim: 370,0 → 272,5, mas o oficial é 249,0: **sobram ~23,5 mm**, que NÃO vêm da virada do dia (outra causa, a investigar; dias 07–09/11 com 58,6, 61,6 e 27,7 mm).

Wunderground: 1 caso duvidoso (Nova Friburgo, 11/11 23:32, 0,8 mm) NÃO foi apagado (a ferramenta aceita `wunderground` e `ecowitt_paracambi`, mas só o Plugfield foi autorizado).

## Estação 1999 (Defesa Civil Guapimirim) — avaliação e correção (17/11/2026, pedido do usuário)

- **Diagnóstico:** o mês estava 23,5 mm acima do oficial. A diferença veio do dia 07/11: a leitura **07/11 22:59:14** (id 6935472) gravou balde de **29,3 mm** com `rainDay` = 29,3 no `raw_payload` e soma anterior do dia = 29,3, isto é, o total do dia inteiro de novo. É o mesmo defeito da virada do dia (coleta depois da meia-noite de uma leitura cuja última atualização foi 22:59), só que fora da janela 23:30–24:00 que a primeira regra de limpeza usava.
- **Conferência com a fonte** (`/data/daily` e `/data/hourly` da API Plugfield, só leitura): totais por dia nossos × fonte — 07/11: 58,6 × 35,97 (excesso = o balde duplicado); 08/11: 61,6 × 62,15; 09/11: 27,7 × 28,82; os demais dias batem dentro de 0,2 mm.
- **Correção:** nova variante da ferramenta, `modo: "total_corrido"` (qualquer hora; confere o `rainDay` do raw_payload; aceita `external_id`). Simulação só da 1999 = 1 registro; apagado 1 (id 6935472); nova simulação = 0.
- **Resultado:** mês nosso 272,5 → **243,2** mm (oficial 249,0). Faltam ~5,8 mm, **não** por defeito nosso: no mesmo dia 07/11 o contador ao vivo da Plugfield (`rainDay` = 29,3 às 22:59) ficou 6,7 mm abaixo do total que a própria Plugfield mostra em `/data/daily` (35,97), diferença que a documentação já registrava como não esclarecida entre `rainDay` e `/data/hourly`.
- **Outros casos da mesma variante, NÃO apagados (fora do pedido):** a simulação em todas as estações do Plugfield desde 20/10 achou mais 16: 25/10 (1), 26/10 (2), 27/10 (2), 29/10 (9), 30/10 (1; Pátio da Câmara, 40,5 mm) e 07/11 (1; Escola Castro Alves, 17,4 mm às 19:07). Todos anteriores a 01/11 ou de outra estação.
