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
