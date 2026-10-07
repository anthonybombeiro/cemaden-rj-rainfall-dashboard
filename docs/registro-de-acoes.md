# Registro de ações do projeto (diário de bordo)

**Regra (definida pelo usuário em 03/10/2026):** toda ação feita no projeto
— código, servidor, cron, configuração, investigação, correção, decisão —
deve ser registrada aqui, em ordem cronológica, para servir de base à
documentação de publicação da ferramenta. Cada entrada: **o quê**, **por quê**,
**onde** (arquivos/servidor), **como foi verificado** e **pendências**.
Documentos de apoio: `fontes-de-dados.md` (cada fonte e achados),
`operacao-cron-e-producao.md` (servidor, cron, deploy, salvaguardas),
`redemet-api-completa.md` (API REDEMET).

Os dados de entradas anteriores a 03/10/2026 foram reconstruídos do histórico
git e de resumos de sessões anteriores; as de 03/10 foram registradas na hora.

---

## Até 02/10/2026 (reconstruído)

| Data | Ação | Detalhe / verificação |
|---|---|---|
| 23/09 | Sirenes CEMADEN-RJ integradas (225 estações, toque em tempo real) | commit `1f71c9f`; cron `sync_sirenes` criado a cada 2 min; conector público antigo `cemaden_rj` retirado |
| 25/09 | Sirenes: tipos de acionamento editáveis (`SireneAcaoTipo`), coluna Chuva 1h; Niterói passa a gravar `m15` (era `m05`, subestimava ~3×) | migração 0012 regravou o histórico de Niterói |
| 29/09 | Gatilhos pluviométricos GI-GIV (13 municípios), `tipo_sirene`, `risco_sirene`, REF | migrações 0013/0014 |
| 01/10 | Correção da chuva inflada das sirenes (`tempo1` é janela deslizante): intervalo mínimo 14 min + comando `fix_sirenes_chuva_sobreposta` | 779 leituras sobrepostas removidas; commit `a1b26cd` |
| 01-02/10 | Produção em Python 3.9: `from __future__ import annotations` em `core/municipios.py`; `soupsieve==2.5` pinado | import quebrava em 3.9 |
| 01-02/10 | `.htaccess`: cache de 24 h valia para toda resposta `application/json`; restringido a arquivos `.json/.geojson` | respostas da API eram servidas velhas |
| 01-02/10 | Aba "Avisos de mau tempo" (Marinha) e conector REDEMET (METAR 17 estações + satélite/radar) em produção (PR #10) | |

## 02/10/2026

| Ação | Onde | Verificação |
|---|---|---|
| Animação de satélite/radar no mapa (play/pause, barra, data/hora, atualizar, dropdowns) | `MapView.tsx`, `redemet_imagery_views.py` | testado no navegador em produção |
| Bug: o proxy não repassava `anima` à REDEMET (sempre 1 quadro) | `redemet_imagery_views.py` | satélite passou a 15 quadros |
| Radar REDEMET: resposta com `anima>1` vem 1 grupo por quadro; proxy achata; só 8 quadros reais (conferido no site oficial) → frontend pede `anima=8` e remove repetidos | `redemet_imagery_views.py`, `MapView.tsx` | radar com 8-13 quadros únicos |
| Botão "Satélite/Radar" renomeado "Opções"; "Camada das estações" separada com checkbox que de fato oculta os marcadores; filtros do mapa iniciam fechados; recarga automática 10 min; quadros a cada 1,2 s; sem remontar o `ImageOverlay` por quadro | `MapView.tsx`, `Dashboard.tsx` | |
| Correção do crash ao trocar satélite→radar (estado antigo sobrescrevia a troca) | `MapView.tsx` | sem erros de console |
| Radar de Niterói (API pública, direto do navegador; backend não alcança a porta 3337) | `MapView.tsx` (`buscarRadarNiteroi`) | 15 quadros reais |
| Service worker interceptava requisições de outra origem e devolvia o HTML do painel; corrigido (`cemadenrj-v2`) | `frontend/public/sw.js` | causa do "nenhuma imagem" |
| Radares INEA (mosaico, Guaratiba, Macaé, Mendanha, Sumaré) via proxy `/api/imagery/radar-inea/`; o servidor do INEA não envia o certificado intermediário → bundle de CA próprio | `inea_radar_views.py`, `api/certs/inea-ca-bundle.pem` | 15 quadros; Mendanha sem imagem (radar parado) |
| Tentativa de vendorizar `certifi` por SFTP (`~/.local/lib/python3.9/site-packages`) — **não resolveu** (causa era o intermediário ausente); permanece lá, inofensivo | servidor | |
| Estações REDEMET: busca em lote, janela de 3 h, horário real do METAR, `POST /api/refresh/redemet/` a cada 15 min pelo painel | `redemet.py`, `refresh_views.py`, `Dashboard.tsx` | +400 leituras; SBJR com histórico 14h-17h |
| Alerta Rio (Sumaré/Mendanha) direto: inviável (Cloudflare JS + sem CORS) | — | documentado |
| Memória do assistente: nunca pedir ações no cPanel ao usuário | memória local | |

## 03/10/2026

| Ação | Onde | Verificação / resultado |
|---|---|---|
| Auditoria de acumulados de chuva por fonte (cálculo na consulta, nada gravado); comparação medida: CEMADEN `cemaden_mctic` ~40% do oficial, Alerta Rio dentro de ~1-6% (1-24 h) | `fontes-de-dados.md` | Casimiro de Abreu 24 h 33,2 × 80 mm |
| Catálogo comparativo de fontes (tabelas por frequência; consumo × gravação; veracidade; camadas para dashboard/climatologia) | `fontes-de-dados.md` | |
| Documentação completa da fonte CEMADEN-RJ sirenes/pluviômetros (acesso, campos, `tempo1` deslizante, toques, gatilhos, validação de 12 estações) | `fontes-de-dados.md` | 24 h bate com o oficial em 9/12; 96 h/1 mês com déficit (histórico desde 23/09) |
| Commits/push dos `.md` e do código | GitHub `cemaden-rj-rainfall-dashboard` | `581b4ab`, `7449f0c`, `539ce3d` |
| **Crontab lido** (API2 do cPanel, `fetchcron`): `sync_sirenes` em `*/15` (planejado 2 min); sem cron para Macaé, REDEMET, Ecowitt; `cemaden_mctic` a cada 15 min | `operacao-cron-e-producao.md` | leitura confirmada |
| Medido o tempo do sync de sirenes (3×) | produção | 1,4-1,7 s por execução |
| **Alteração do cron de sirenes (`*/15` → `*/2`) tentada e BLOQUEADA** pelo classificador de permissões do Claude Code (alteração de configuração persistente) — nenhuma linha do cron foi alterada | — | pendente: o usuário libera a permissão ou altera; ver `operacao-cron-e-producao.md` §3 |
| Salvaguarda das sirenes: `POST /api/refresh/sirenes/` (reforço pelo painel a cada 2 min, piso de 90 s no servidor) e `GET /api/sirenes/status/` + faixa âmbar na tela quando o último sync tem > 5 min | `refresh_views.py`, `urls.py`, `api.ts`, `Dashboard.tsx` | testado em produção: status "obsoleto" detectado (387 s), 1ª chamada sincronizou, 2ª foi pulada |
| Comparação C:\ × H:\ (repositório canônico = H:\ confirmado pelo usuário) | — | H: contém todo o histórico do C: (HEAD `3a338d9` é ancestral); arquivos diferentes eram versões antigas; nenhum conteúdo exclusivo do C: faltava |
| Copiadas do `.env` do C: para o do H: (gitignored) 4 variáveis ausentes: `CEMADEN_RJ_SIRENES_USERNAME/PASSWORD`, `ECOWITT_PARACAMBI_API_KEY/APPLICATION_KEY` | `backend/.env` (local) | só nomes conferidos; valores não exibidos |
| Autorização do usuário: o token do cPanel (memória local) pode ser usado para gerenciar cron | memória local | uso de leitura funcionou; escrita bloqueada (acima) |

| O **usuário alterou o cron de sirenes para `*/2` (`-m 60`) direto no cPanel**; o assistente **conferiu** via `fetchcron` (cron correto, demais crons intactos, aspas do `-d` íntegras) e **verificou a execução** com o painel fechado: syncs às 06:16:03 e 06:18:03 UTC (cadência de 2 min) | cPanel; `operacao-cron-e-producao.md` | confirmado |

| Testadas em produção, uma vez cada, as ingestões de Macaé, REDEMET e Ecowitt (admin/run) para dimensionar os crons que faltam | produção | Macaé 1,2 s; REDEMET 2,3 s; Ecowitt 2,5 s; todas sem erro. Crons propostos (`5-59/15`, `7-59/15`, `9-59/15`, `-m 120`) em `operacao-cron-e-producao.md` — **criação pendente** (nova alteração de cron via API não foi tentada após o bloqueio anterior) |

| Usuário liberou a regra de permissão `Bash(curl *preserve.rio.br:2083*)`; **assistente criou os 3 crons** via API2 (`add_line`): Macaé `5-59/15`, REDEMET `7-59/15`, Ecowitt `9-59/15` (`-m 120`) | cPanel; `operacao-cron-e-producao.md` | crontab relido: 13 jobs, formato e aspas corretos |
| **Incidente:** ao reler o crontab, `sync_sirenes` estava em `*/20` (origem da mudança desconhecida; já estava assim antes das minhas inclusões). Assistente adicionou `*/2` (`-m 60`) e removeu a linha antiga | cPanel | crontab final: 13 jobs, uma única linha `sync_sirenes` em `*/2` |

| Verificação da execução dos novos crons após os horários 06:50 (Macaé), 06:52 (REDEMET) e 06:54 (Ecowitt) UTC | produção | **Ecowitt**: última leitura passou de 03:31 para 03:53 BRT (cron rodou). **REDEMET**: de 03:34 para 03:48 BRT (METAR novo coletado). **Macaé**: sem leitura nova porque o portal não tinha dado mais recente que 02:58 BRT (ingestão manual posterior: +0 leituras, 71 duplicadas) — o cron foi criado e validado no crontab, mas a execução não é comprovável por dados novos |

| **CEMADEN Nacional — pacote de fidelidade (03/10/2026):** (1) cron `ingest cemaden_mctic` `13-59/15` → `3-59/5` (`-m 120`) via API2, autorizado pelo usuário; (2) conector ampliado: inclui hidrológicas (H, 10) e geotécnicas (G, 26) só com chuva, guarda código oficial da estação (API pública `mapservices`) e os acumulados oficiais 1/3/6/12/24/48/72/96 h; (3) novos modelos `AcumuladoOficial` (histórico oficial 1/24/96 h, 1×/hora) e `LeituraQualidade` + migração 0016 aplicada em produção; (4) `core/qualidade.py` (válido/suspeito/inválido; só exceção gravada) e gancho `pos_ingestao` em `BaseConnector`; (5) endpoint `GET /api/stations/cemaden/`; (6) bug `name 'time' is not defined` na 1ª ingestão, corrigido e reimplantado | `models.py`, `migrations/0016…`, `qualidade.py`, `base.py`, `cemaden_rj_pluviometros.py`, `views.py`; crontab | ingestão sem erros; 392 estações; 246 códigos já preenchidos (restante nas próximas rodadas); 14 leituras "no futuro" = estações com relógio vermelho na Salvar; crontab relido (13 jobs) |
| **Aba Dados → "CEMADEN Nacional"** (tabela espelhando a Rede Salvar: sem Rede/UF; ordenada por 1 h; cores de chuva do painel; atraso com 🕒 nas faixas da Salvar; REDEC, atualização e código por último; estação clicável; exportar CSV) | `CemadenNacionalTable.tsx`, `Dashboard.tsx`, `api.ts` | build OK, deploy SFTP (80 arquivos), verificado no navegador em produção (392 estações, códigos e relógio exibidos) |
| Documentação da fonte CEMADEN Nacional reescrita (acesso, campos, H/G, ANA, qualificação, causa da divergência, cron) e demais `.md` corrigidos | `fontes-de-dados.md`, `dados-por-fonte-e-estacao.md`, `operacao-cron-e-producao.md`, `referencia-visual-rede-salvar.md` | — |

| **Análise para calibrar os limites da qualificação** (ação nova, somente leitura, `analise_chuva_qc` em `/api/admin/run/`): 30 dias do `cemaden_mctic` = 58.586 baldes de 10 min, 274 estações. Chuva > 0: mediana 0,2 mm, p99 2,2 mm, p99,9 8,2 mm. Acima de 10 mm: 8 leituras; 15 mm: 2; 20 mm: 2 (26,4 e 51,4); 50 mm: 1. Das 18 leituras ≥ 8 mm, só 1 teve apoio de estação vizinha (mesmo município e horário), 8 não tinham vizinha no horário e 9 estavam isoladas (ex.: Teresópolis, estação 987: 13,1 / 12,4 / 10,1 mm em horários próximos com vizinhas em 0). Sequências de ≥ 6 leituras iguais: 190, todas de 0,2 mm (resolução do pluviômetro, não indica sensor travado). **Conclusão:** limite de 20 mm marca só 2 de 58 mil; proposta (10 mm + regra de vizinhança) **adiada para o verão por decisão do usuário**, documentada em `fontes-de-dados.md` | `admin_views.py` | executado em produção; nada foi gravado |

| **Redes sensíveis (Plugfield, Macaé, Wunderground) — levantamento e correção (03/10/2026).** (1) Sondagem direta das três fontes (endpoints, campos, histórico, unidades); (2) comparação oficial × nosso por estação em produção: **Macaé gravava ~3% do oficial** (Bicuda Grande 24 h: 3,4 × 90,8 mm), Plugfield 17/17 corretos, Wunderground 95/96 corretos (IMARIC14: contador regrediu); (3) **conector de Macaé corrigido**: histórico por minuto (`POST /Leituras/getEstatisticasLeiturasJson`), acumulados oficiais 1/24/96 h (`AcumuladoOficial`), código da estação; idempotente e sem apagar nada; (4) **qualificação** (`registrar_qualidade_chuva`, dica `qc_hint`) para Plugfield e Wunderground: total do dia regrediu → suspeito, `qcStatus` 0 → suspeito, 1ª leitura do dia não avaliada; Wunderground passa a guardar `observacao_oficial` (`precipTotal`, `precipRate`, `qcStatus`); (5) endpoint genérico `GET /api/stations/rede/?source=` e `RedeTable.tsx`: abas **Plugfield**, **Macaé** e **Wunderground** em Dados (mesmo padrão da tabela CEMADEN Nacional); (6) novas ações admin **somente leitura** `snapshot_precip` e `analise_funcionamento` (e `analise_chuva_qc`) | `macae_ufrj.py`, `plugfield.py`, `wunderground.py`, `base.py` (`bucket_from_running_daily_detalhe`), `qualidade.py`, `views.py`, `admin_views.py`, `RedeTable.tsx`, `Dashboard.tsx`, `api.ts` | **Testes locais** em SQLite temporário com credenciais reais (1ª e 2ª rodadas sem duplicar; Macaé igual ao oficial) e das 3 abas no navegador local; **produção:** Macaé reingerido (backfill 96 h, 0 erros) e comparação final igual ao oficial; Plugfield e Wunderground reingeridos sem erros; frontend publicado (80 arquivos) |
| Documento novo `redes-sensiveis-plugfield-macae-wunderground.md` (funcionamento, API, validação, qualificação, tabelas, inventário por estação, pendências) e demais `.md` atualizados (`fontes-de-dados.md`, `dados-por-fonte-e-estacao.md`, `operacao-cron-e-producao.md`) | `docs/` | — |

## 04/10/2026

| Ação | Onde | Verificação |
|---|---|---|
| **Nascer e pôr do sol automáticos na previsão do tempo.** Tabela de referência do CEMADEN-RJ (`DADOS DE REFERENCIA/Meteorologia/tabela_nascer_por_sol_redecs_2026_2035.json`, 40.172 linhas = 11 REDECs x 3.652 dias, 01/01/2026 a 31/12/2035, horários locais do município-sede) convertida em arquivo compacto no repositório (`backend/core/data/sol_redecs_2026_2035.json`, 563 KB; ver `core/sol.py`). (1) `GET /api/previsoes/sol/?data=` devolve nascer/pôr das 11 REDECs; (2) ao **criar** previsão sem nascer/pôr, o backend preenche da tabela; (3) o formulário de cadastro preenche os campos vazios ao escolher data/região, mostra "Automático (tabela de referência) — pode editar" e o botão "Restaurar automático (HH:MM)" quando o operador altera. **Editável:** o valor gravado é do operador; edições posteriores não são refeitas. Fora de 2026-2035 não há preenchimento. A tabela de origem fica fora do repositório (Drive); para regenerar o arquivo compacto basta repetir a conversão (por região: data inicial + lista "HH:MM HH:MM"). | `core/sol.py`, `core/data/sol_redecs_2026_2035.json`, `api/views.py` (`sol`), `api/serializers.py`, `PrevisaoForm.tsx`, `api.ts` | Testado localmente: endpoint (11 regiões; fora da tabela `{}`; data inválida 400), criação sem horários preenchida, horário digitado preservado, edição posterior preservada; formulário no navegador local (05:31/17:52 em 04/10, edição → dica some e aparece o botão de restaurar). Publicado (backend por SFTP e frontend, 80 arquivos); em produção a rota responde 403 sem login (existe) |

## 06/10/2026

| Ação | Onde | Verificação |
|---|---|---|
| **Item 1 — cron de sirenes:** estava de novo em `*/20` (`linekey` 2639992328); nada no repositório mexe no cron. Reaplicado `*/2` (add + remove da linha antiga) | cPanel | crontab relido (13 jobs, aspas íntegras); leitura de sirenes às 22:45 UTC |
| **Item 2 — dados em produção:** CEMADEN 392/392 códigos; Macaé continua igual ao oficial (mais estações offline hoje); sirenes ativas | produção | ações `analise_funcionamento`/`snapshot_precip` |
| **Achado grave — Alerta Rio com sentinela −99,99:** 235 leituras negativas (21/09-06/10) distorciam acumulados (Grota Funda 96 h = −445,6 mm). Correção: `BaseConnector.run` não grava chuva negativa; consultas de chuva ignoram valores < 0 (`views.py`); nada foi apagado | `base.py`, `views.py`, nova ação `analise_negativos` | 0 janelas negativas após a correção; erro médio 24 h −0,6 mm |
| Alerta Rio: 2 estações sem chuva desde sempre (`Barra/Barrinha`, `Barra/Riocentro`) — apelidos de nome | `alerta_rio.py` | passaram a gravar |
| **Item 5 — acumulados oficiais** de Alerta Rio, Niterói e INEA em `raw_metadata` + `AcumuladoOficial` (1/24/96 h, 1×/hora); helper `gravar_acumulados_oficiais` | `base.py`, `alerta_rio.py`, `niteroi.py`, `inea.py` | teste local (2 rodadas) e produção sem erros |
| Alerta Rio e Niterói passam a gravar **`m05`** (grade de 5 min) com **cron de 5 min** (`2-59/5` e `0-59/5`, autorizado nesta rodada, código e cron aplicados juntos) | conectores + cPanel | 13 jobs; reconferir 96 h em 24-48 h |
| **Item 3 — saúde das fontes:** `GET /api/fontes/saude/` e `SaudeFontesBanner.tsx` | `saude_views.py`, `urls.py`, `Dashboard.tsx`, `api.ts` | faixa testada localmente (fonte atrasada + estações paradas); rota em produção responde 403 sem login |
| **Item 4 — lacunas:** Wunderground recupera baldes de `observations/all/1day` (lacuna > 45 min); Plugfield `/data/hourly` não usado (4,4 × 3,3 mm) | `wunderground.py` | teste local com lacuna simulada: soma = oficial, idempotente |
| **Tabelas individuais Alerta Rio e Niterói** na aba Dados (oficiais + colunas "Calc", REDEC, atualização e código por último) | `RedeTable.tsx`, `views.py` (`rede`), `Dashboard.tsx` | 33 e 30 linhas no navegador local; frontend publicado |
| Documento novo `alerta-rio-niteroi-inea-e-saude-das-fontes.md` e demais `.md` atualizados | `docs/` | — |

| Crontab reconferido (13 jobs; sirenes `*/2`, Alerta Rio `2-59/5`, Niterói `0-59/5`). **CEMADEN:** do feed, só ~200 de 389 estações atualizaram na última hora, 158 estão há > 6 h e 142 de 392 há > 48 h sem reportar. Faixa de saúde ajustada: só coleta atrasada e paradas das redes sensíveis disparam; CEMADEN fica nos detalhes | `saude_views.py`, `SaudeFontesBanner.tsx`, `api.ts` | publicado; docs atualizados |

## 06-07/10/2026 — lote de 7 pedidos (classificados por prioridade e executados do mais fácil ao mais difícil)

| # | Pedido | Ação | Verificação |
|---|---|---|---|
| 1 | Tirar Município e REDEC de Niterói, Macaé e Alerta Rio | `RedeTable` configurável por fonte (`CONFIG`): `municipio`/`redec` só nas redes de várias cidades | abas no navegador local |
| 7 | Colunas Calc depois dos dados; Plugfield sem Calc | Calc ao final em todas; Plugfield ganhou "Calc Hoje"; Wunderground reordenado | idem |
| 4 | Agendar a conferência de Alerta Rio e Niterói | Duas tarefas únicas (08/10 10:00 e 10/10 22:00 BRT) + script `backend/scripts/conferir_oficial_vs_nosso.py` | baseline medido (§10.4 do doc do Alerta Rio) |
| 2 | Alerta Rio: sem coluna Fonte nem Rajada; Dir. do vento; Localização no lugar da REDEC; 10/15/30 min e TX-15; documentar TX-15 | Portal HTML do Alerta Rio lido (Localização, m10, m30, h06, h12, TX-15, "ND"); feed sem rajada; coluna Dir. (bússola) em todas as redes com direção; TX-15 = taxa mm/h (15 min × 4) documentado; texto errado de "Pico ≈ TX-15" corrigido | 33 estações com Localização; TX-15 = 27,2 para Barra/Barrinha |
| — | **Erro meu corrigido:** o `m05` (troca de ontem) perdia ~metade da chuva do Alerta Rio porque o feed atualiza a cada 10 min | `_valor_janela` (m05/m10/m15/m30 conforme o intervalo desde a última leitura) | erro médio de 1 h: −3,55 → −1,19 mm (14 min depois) |
| 6 | Faixa de saúde cortava os botões inferiores no celular (aba Mapa) | `h-dvh`, padding com `safe-area-inset-bottom`, faixa de saúde em 1 linha, aviso das sirenes menor no celular | emulação 375×812: botões Opções/Legenda visíveis |
| 5 | Existe trava da HostGator no cron? | Investigado: sem shell, sem limite de frequência, linha `*/20` restaurada com o mesmo `linekey`, nenhuma outra sessão/tarefa mexe; monitor do crontab ativo; sirenes reaplicado `*/2` | §10.6; log do monitor |
| 3 | Tabelas individuais das fontes restantes | **INEA** (oficiais 1/4/24/96 h/30 d, nível, tipo), **Ecowitt** (oficiais 1 h/dia/evento/semana/mês/ano/taxa), **INMET**, **REDEMET**; Ecowitt incluído no cálculo de chuva (estava de fora); INEA: nosso 96 h −17,8 mm vs oficial → a tabela de Precipitação **exibe o oficial** das janelas informadas pela fonte (≤ 2 h) | Ecowitt hoje = oficial; INEA/Ecowitt locais ok; INMET/REDEMET dependem de tokens (produção) |
| 8 | Documentar tudo | `tabelas-individuais-por-fonte.md` (novo) + atualizações em `alerta-rio-niteroi-inea-e-saude-das-fontes.md`, `redes-sensiveis-…`, `fontes-de-dados.md`, `operacao-cron-e-producao.md` | — |

## 07/10/2026 — detalhe da estação

| Ação | Onde | Verificação |
|---|---|---|
| **Baldes de chuva do detalhe da estação sempre 1 h e 24 h** (antes: última leitura); endpoint `GET /api/stations/{id}/detalhe/` com acumulados (oficial da fonte quando houver) e cotas | `views.py` (`detalhe`), `Gauges.tsx` (`BaldeAcumulado`), `StationHistoryPanel.tsx`, `api.ts` | cards "Chuva 1 h"/"Chuva 24 h" no navegador local |
| **Cotagrama** nas estações hidrológicas (aba Nível do rio): nível + linhas de cota (atenção/alerta/inundação/extrema) + chuva em barras penduradas do topo, como INEA e SGB/CPRM; alternância de escala | `CotagramaChart.tsx` | cotas reais (213/284/355 cm) + série sintética, local |
| **Tooltips** com detalhes ao passar o mouse/dedo (cotagrama, histórico, precipitação acumulada) | `CotagramaChart.tsx`, `HistoryChart.tsx`, `AccumulationChart.tsx` | idem |
| **Compartilhar gráfico** (imagem/texto) como na tabela Ventos: `ShareData.corpo`/`textoPronto` | `ShareModal.tsx`, `shareExport.ts`, `StationHistoryPanel.tsx` | modal testado local; frontend publicado |
| Documento novo `detalhe-da-estacao-cotagrama.md` | `docs/` | — |

### 07/10/2026 (noite) — 9 correções do cotagrama / card de compartilhar

| # | Correção | Ação | Verificação |
|---|---|---|---|
| 1 | Títulos do card | `<Município> — Nível do <rio monitorado> (m)`; linha 1 `<estação> - <Região Hidrográfica>`; linha 2 `<REDEC> - Nível (m) - <período>`; `detalhe` devolve município, rio, região hidrográfica e bacia | texto/card no navegador local |
| 2, 5 | Chuva separada do nível; gráfico mais alto e centralizado | painéis empilhados (chuva em cima, nível embaixo), margens simétricas, altura 520 no modo imagem | idem |
| 3 | Eixo X apertado | semana/mês só com data (dd/mm), ≤ 7 marcas | ticks 08/09…03/10 |
| 4 | Espaço sobrando no card | gráfico preenche o card (legenda a 635 de 657 px) | idem |
| 6 | Rótulos cortados; "Nível do rio" | margens maiores; eixo e legenda "Nível (m)" | idem |
| 7 | Cotas | nomes e cores da tabela Hidrológicos (Atenção laranja, Alerta vermelho, Transbordo roxo, Extrema rosa); valores já eram os mesmos (conferido com a ação admin `cotas_hidro`) | idem |
| 8 | Hidrológicos com a lógica de valores corrigidos | já usava o oficial; adicionada a coerência entre janelas (`_garantir_janelas_coerentes`) | teste unitário local |
| 9 | Nível na frente de Chuva acumulada | `nivel_m` primeiro na lista e como aba padrão | navegador local |

## Pendências abertas (03/10/2026)

1. ~~Aplicar `sync_sirenes` a cada 2 min no cron~~ — **feito e verificado**.
2. ~~Cron para Macaé/REDEMET/Ecowitt~~ — **criados**; `cemaden_mctic` passou a 5 min; falta investigar quem alterou o cron de sirenes para `*/20`.
3. Validar em campo os códigos de acionamento das sirenes (nomes de 5, 6 e 8) e
   consultar `SireneAcaoTipo` no Admin.
4. Persistir acumulados e valores oficiais das fontes (CEMADEN, Alerta Rio,
   INEA, Niterói) e metadados/QC por leitura (ver `fontes-de-dados.md`).
5. Incluir `ecowitt_paracambi` em `PRECIPITACAO_BUCKET_SOURCES`.
6. **Reavaliar a qualificação de chuva no verão** (limite de suspeito 20 para 10 mm e regra de vizinhança), com mais dados: ver "Calibração dos limites da qualificação" em `fontes-de-dados.md`. Decisão do usuário em 03/10/2026.
7. **Macaé:** 15 das 26 estações internas sem dado; **Plugfield:** 2 estações de Cambuci paradas há meses e lacuna de 20 h em Areal; **Wunderground:** IMARIC14 (contador regrediu) e 15 estações sem dado — ver `redes-sensiveis-plugfield-macae-wunderground.md` §9.
8. **Reconferir Alerta Rio e Niterói em 24-48 h** (96 h oficial × nosso após o `m05`); investigar o intervalo mediano de 60 min do CEMADEN; descobrir quem reescreve o cron de sirenes.
9. **Conferências agendadas** (08/10 10:00 e 10/10 22:00) de Alerta Rio e Niterói; ler `cron_monitor.log` para saber quando (e se) o cron de sirenes mudou; decidir sobre a redundância via GitHub Actions para as sirenes.
10. INMET e REDEMET: validar as novas abas em produção com login (os tokens só existem no servidor).
