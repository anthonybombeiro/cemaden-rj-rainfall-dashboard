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

| 07/10 | **Resultado do monitor do crontab:** ~3 h, 88 leituras, nenhuma mudança (sirenes `*/2` o tempo todo); documentado em §10.7 do doc do Alerta Rio. **Auditoria da documentação** (a pedido do usuário): faltavam o resultado do monitor, as ações `cotas_hidro`/rotas novas em `operacao-cron-e-producao.md` e um índice — corrigidos; criado `docs/README.md` |
| 07/10 | **Mapa — botão Estações** com 5 modos (por rede, sirenes, chuva 1 h, chuva 24 h, vento); **aba Paracambi** (renomeada de Ecowitt); **aba CEMADEN-RJ** (acumulados oficiais da página pública lidos no `sync_sirenes`, `rede` e `MAPA_ACUMULADOS_OFICIAIS`). Deploy de `api/views.py`, `cemaden_rj_sirenes.py` e frontend; `sync_sirenes` rodado (225 estações, 0 erros). Detalhes em `mapa-modos-de-visualizacao.md`. Pendente: conferir em produção com login que as 85 linhas casaram |
| 07/10 | **Satélite DSAT/CPTEC-INPE (GOES-19) no mapa:** True Color (padrão), IR realçado, IR canal 13 e Visível canal 02; nova rota `/api/imagery/dsat/` (`dsat_imagery_views.py`). Deploy de backend e frontend; documentado em `mapa-modos-de-visualizacao.md` |
| 07/10 | **Aba Resumo 24h** (após Alertas): rota `/api/resumo/`, `ResumoPanel.tsx`; resumo do dia, Top 10 (chuva, Tmáx, Tmín, rajada), previsão × observado por REDEC e cidades com chuva/rajada. Deploy backend+frontend; documentado em `resumo-24h.md` |
| 08/10 | **Correções a pedido do usuário:** (1) Resumo 24h não rolava e ficava ruim no celular → contêiner com rolagem, listas e grids responsivos; (2) satélite DSAT em "Carregando…" eterno → o CPTEC esvaziou o ftp, rota passou a sondar `satelite.cptec.inpe.br/repositoriogoes` por HEAD; mapa mostra erro claro; ação admin de leitura `teste_dsat`. Deploy backend+frontend |
| 08/10 | **Conferência Alerta Rio × Niterói (24 h):** critério atendido nas duas (erro médio ≈ 0, 0 estações com \|erro\| > 2 mm); Niterói também 96 h OK; Alerta Rio 96 h ainda −5,94 por perda de 04-06/10 (revalida 10/10 22:00). Detalhes em `alerta-rio-niteroi-inea-e-saude-das-fontes.md` §10.8 |
| 09/10 | **Radar de Santa Teresa (REDEMET, área `st`)** no mapa: 5 cortes; `area` validada no backend; ação admin de leitura `teste_redemet`. Deploy backend+frontend. Ver `mapa-modos-de-visualizacao.md` |
| 09/10 | **Menus do mapa:** listas de satélite/radar limitadas a ~5 opções com rolagem interna; rolar/tocar no painel não move mais o mapa (`MapView.tsx`, `MapaBolhas.tsx`). Deploy frontend |
| 09/10 | **Satélite DSAT alinhado ao mapa:** imagem em lat/lon linear era esticada em Mercator pelo `ImageOverlay`; nova `CamadaGeografica.tsx` (tiles em canvas com reprojeção por linha). Deploy frontend. Ver `mapa-modos-de-visualizacao.md` |
| 16/10 | **Barra de opacidade** das imagens de satélite/radar acima da animação (padrão 70%, salva no navegador). Deploy frontend |
| 16/10 | **Conferência 96 h Alerta Rio × Niterói:** critério atendido nas duas (Niterói −0,85 mm, 3 estações > 4 mm; Alerta Rio +0,26 mm, 1 estação > 4 mm). Detalhes em `alerta-rio-niteroi-inea-e-saude-das-fontes.md` §10.9 |
| 16/10 | **Google Flood Hub (etapas 1 a 4):** chave `FLOODHUB_API_KEY` no `.env` local e do servidor (SFTP, com backup); migração `0017_floodhub`; `ingestion/floodhub.py` (situação, limiares, previsões, casamento ≤ 3 km, histórico diário) com carona no job de 15 min do INEA; endpoints `/api/floodhub/` e `/api/floodhub/validacao/`; ações admin `sync_floodhub` e `floodhub_pares`; modo "Flood Hub" no mapa, aba Dados → Flood Hub, previsão no detalhe da estação, validação e alerta informativo (também no Resumo 24h). 196 postos no RJ (15 verificados), 20 casados com estações. Ver `floodhub.md` |
| 16/10 | **Flood Hub — revisão a pedido do usuário (6 itens) + auditoria da documentação:** retirados os postos de MG fora das bacias que escoam para o RJ; ANA casa com estação do mesmo rio (24 pares) e mostra o nível observado; caixa de não verificados no mapa; ficha do posto; ordenação/filtros/busca/CSV nas tabelas; correção do histórico por baixo do mapa (`isolation: isolate`). **Auditoria:** todos os commits de código desde 06/10 tocaram os docs; faltavam em `operacao-cron-e-producao.md` as ações admin e rotas novas e em `fontes-de-dados.md` o DSAT/radar `st`/Flood Hub — acrescentados. Ver `floodhub.md` |
| 16/10 | **Flood Hub — polígonos de eventos no mapa:** inundação significativa e chuva repentina (provável/muito provável); modelo `FloodHubEvento` (0018), sincronização com KML→GeoJSON e filtro "toca o RJ", rota `/api/floodhub/eventos/`, camada, legenda e popup no mapa, blocos na aba Flood Hub e no Resumo 24h. Hoje: 1 evento no Brasil, nenhum no RJ; desenho validado com eventos sintéticos só no banco local. Ver `floodhub.md` |
| 16/10 | **Mapa:** bolinhas do Flood Hub nas cores originais do Google e sem transparência; imagens de satélite/radar e polígonos de chuva repentina passam para panes acima das estações (`imagensMeteo` 650, `eventosFH` 660), com clique atravessando para a estação. Ver `floodhub.md` |
| 16/10 | **Ordem das camadas:** polígonos de chuva repentina do Flood Hub (pane 620) ficam sobre as estações e abaixo das imagens de radar/satélite (pane 650). Verificado localmente (satélite a 45% esmaece estações e polígonos). Ver `floodhub.md` |
| 16/10 | **Mapa — temperatura/umidade e hidrologia:** 6 modos novos (Rios nível e cotas, Temperatura agora, Tmáx, Tmín, Umidade máx., Umidade mín.) com escalas/legendas; ver `mapa-modos-de-visualizacao.md`. **Tabela geral Precipitação revisada:** auditoria `auditoria_precip` (803 estações), "—" no lugar de 0,0 sem leitura, coerência entre janelas oficiais e calculadas, oficial no Plugfield/Wunderground, coluna Origem e qualificação; ver `tabelas-individuais-por-fonte.md` §8. Incidente de ~poucos min (500 por anotação Python 3.9) corrigido |
| 17/10 | **Tolerância de atraso por fonte:** estações horárias do INMET só ficam "atrasadas" após 3 h (antes 1 h) em todas as tabelas e no mapa; janelas do INMET ancoradas na última leitura dentro da tolerância. Ver `tabelas-individuais-por-fonte.md` §9 |
| 18/10 | **Site com HTTP 429 por ~25 min (09:00-09:25):** diagnóstico (429 do Apache, afeta cron e usuários, outros domínios ok; cPanel sem Uso de recursos; Gator Protect Free; IP blocker vazio) e **pausa das consultas periódicas com a aba oculta** (`intervaloVisivel.ts`); causa exata não confirmada. Texto para chamado HostGator: "O domínio cemadenrj.preserve.rio.br (conta prese257, servidor br722) devolveu HTTP 429 do Apache para todas as requisições, inclusive as do próprio servidor, entre ~09:00 e 09:25 de 18/10/2026; os outros domínios da conta funcionaram. Qual limite ou regra gerou o 429 e como evitar que se repita?". Ver `operacao-cron-e-producao.md` |
| 18/10 | **Cron de sirenes reverteu para `*/20` de novo (3ª vez, sem causa conhecida):** usuário reajustou para `*/2`; criada **carona do sync de sirenes nas ingestões de 5 min (Niterói e CEMADEN Nacional)** para independência da linha dedicada; verificado em produção. Ver `operacao-cron-e-producao.md` |
| 18/10 | **REDEMET com tolerância de atraso de 3 h** (como o INMET). **Validação Flood Hub × observado reavaliada** (4 dias: 41 de 57 conferem; 16 "Flood Hub abaixo" em estações com régua estável em atenção; sem cheia no período) — `floodhub.md`. **Redes sensíveis reavaliadas** (Macaé 8/26 em dia; Plugfield 2 de Cambuci paradas e Areal intermitente; Wunderground 108/121 e IMARIC14 normalizada) — `redes-sensiveis-plugfield-macae-wunderground.md`. Ação admin `floodhub_validacao` |
| 18/10 | **Avisos de mau tempo: só os que atingem o litoral do RJ + mapa de polígonos** (NR 763 RS–SC deixa de aparecer). Conector lê o SVG da Marinha, converte para lon/lat, filtra por 100 km da costa; migration 0019; `AvisosMapa.tsx`. **Deploy feito em produção (18/10):** backend por SFTP, migration 0019 aplicada, `sync_avisos_mau_tempo` (15 avisos, 0 erros) e frontend publicado; `/api/auth/csrf/` = 200. Cartas sinóticas: inviáveis por Cloudflare — ver `fontes-de-dados.md` |
| 18/10 | **Site em branco após o deploy dos avisos (relatado pelo usuário):** o service worker (`sw.js`) guardava no cache respostas 404 de `_next/static/*` (pedidas enquanto o upload ainda rodava) e as servia para sempre. Correção: só cacheia resposta `ok` e `CACHE_VERSION` → `cemadenrj-v3` (limpa o cache contaminado). Frontend republicado; verificado no Chrome (site abre, aba Avisos mostra NR 760, 759 e 756 e o mapa com 3 polígonos). Quem ainda ver tela em branco: recarregar 2x ou limpar dados do site. Lição: o deploy do frontend pode deixar o SW com 404 em cache — por isso a correção |
| 18/10 | **Cartas sinóticas da Marinha na aba Meteorologia** (nova sub-aba): mapa com a carta embutida (WMS do IDEM-DHN, achado pelo usuário) + cartas originais 2 por vez com paginação. Substitui a conclusão anterior de "inviável" (Cloudflare do CHM). Deploy do frontend e verificado no Chrome. Ver `fontes-de-dados.md` |
| 18/10 | **Cartas sinóticas — revisão:** mapa em tela cheia (melhor no celular), animação das 7 últimas, comparação de 2 cartas sincronizadas, contornos do mapa-base; removidas as imagens soltas e o "abrir em tamanho grande". Investigação de outros produtos da Marinha: meteogramas e modelos de previsão estão no servidor `assets.marinha.mil.br/chm/sites/www.marinha.mil.br.chm/files/smm/{00,12}/...` (sem Cloudflare); tábuas de maré só no site do CHM (Cloudflare Turnstile — não contornado). Aguardando decisão do usuário. Deploy do frontend feito |
| 18/10 | **Cartas sinóticas — ajustes de interface (celular/PC):** sub-abas só com ícones no celular, cabeçalho e controles compactos, comparação apenas no PC, mapa sem barra de rolagem, botão "Carta inteira". Deploy do frontend e verificado no Chrome (PC e quadro de 390 px). Lint: o erro `set-state-in-effect` em `PrevisaoDiaria` é anterior a esta mudança |
| 18/10 | **Produtos da Marinha na aba Meteorologia:** novas sub-abas **Modelos** (atmosférico 11 produtos × 4 áreas, ondas 5 áreas × 2, oceanográfico 6 áreas × 7; rodadas 00Z/12Z; barra de tempo e animação), **Meteogramas** (10 pontos do RJ, 2 gráficos) e **Marés** (7 portos do RJ: tábuas de 2026 extraídas dos PDFs da Marinha por `backend/scripts/gerar_mares_marinha.py`; curva do dia, próxima maré, tábua do mês). Imagens vêm direto de `assets.marinha.mil.br` (sem Cloudflare). Sub-abas só com ícones no celular (7 em uma linha). Deploy do frontend e verificado no Chrome (PC e quadro de 390 px). Ver `produtos-marinha.md`. Rotina anual: refazer o JSON de marés em dezembro |
| 18/10 | **Levantamento dos produtos do INMET** (VIME/COSMO, Sondagem, Meteogramas, Avisos, Análise sinótica): APIs abertas com CORS, sondagem do RJ = Galeão 83746 (o código 83378 do link é Brasília), meteograma por coordenada, índices K/CAPE no COSMO. Proposta de aglutinar com a Marinha nas sub-abas Cartas/Modelos/Meteogramas/Avisos + nova Sondagem. **Implementado em 19/10 (itens 1 a 5 abaixo).** Ver `produtos-inmet.md` |
| 19/10 | **Produtos do INMET integrados (itens 1 a 5):** nova sub-aba **Sondagem** (Skew-T Galeão 83746 e outras 32 estações); **Cartas** com alternância Marinha/INMET (análise sinótica com texto); **Meteogramas** com Marinha e INMET (COSMO 2,8 km; 30 cidades do RJ e coordenada livre) lado a lado; **Avisos** com mapa único e cartões INMET + Marinha; **Modelos** com COSMO 7 km e 2,8 km (VIME) ao lado dos modelos da Marinha. Frontend direto nas APIs abertas do INMET. Deploy do frontend e verificado no Chrome (PC e quadro de 390 px). Ver `produtos-inmet.md` seção 9 |
| 19/10 | **Ajustes do INMET a pedido do usuário:** seta de dia das marés alinhada no celular; áreas oficiais por modelo no COSMO (2,8 km: S/SE/NE + estados ES/MG/RJ/SP; 7 km: SE/S/CO/NE/N/Brasil/AS); instruções dos avisos do INMET (a API devolve arrays); cartas INMET da mais recente para a mais antiga. Deploy do frontend e verificado no Chrome. **Proposta** para previsão por município, anomalias/precipitação e CAPE/CIN (via Wyoming) em `produtos-inmet.md` seção 11 — aguardando aprovação |
| 19/10 | **Levantamento do CPTEC/INPE** (previsão numérica, subsazonal, sazonal, demais sites): catálogo de 7 modelos (MONAN, WRF, BRAMS, ETA, BAM, SMEC, Wwatch) embutido no JS do site, imagens abertas em `s1.cptec.inpe.br`, datas em JSON com CORS; SMEC e as séries por município parados desde 27/08; ETA com 503; subsazonal/sazonal por figuras em `s0.cptec.inpe.br`; **sem sondagem observada** no CPTEC. Proposta de "Previsão numérica" unificada (Marinha+INMET+CPTEC, 1–4 quadros sincronizados), Tendência (sub/sazonal) e estrutura vertical. **Nada implementado; aguardando aprovação.** Ver `produtos-cptec.md` |
| 19/10 | **Nowcasting do CPTEC investigado (a pedido do usuário; corrige a conclusão de que o CPTEC não tinha sondagem):** radiossondagem observada (43 estações, inclui Galeão; Skew-T + hodógrafa + CAPE/CINE/LFC/EL/SRH/K na própria imagem), sondagem do modelo MONAN (67 pontos, Rio = RJR, 3 em 3 h até 72 h), radares do RJ (Pico do Couto e Macaé atuais; Guaratiba parado desde 23/09) com VIL/Echotop/chuva, TATHU, LightningCast, camadas MONAN (MUCAPE/cisalhamento, IVT…). API sem CORS (precisa proxy); imagens/WMS abertos. Nada implementado; aguardando aprovação. Ver `produtos-cptec.md` seção 7 |
| 19/10 | **Entrega da aba Meteorologia (a pedido do usuário):** nova **Previsão numérica** unificada (CPTEC, Marinha e INMET por tema, 1–4 quadros alinhados pela hora de validade, animação, setas do teclado, quadros empilhados no celular; Wwatch × ondas da Marinha; estrutura vertical); **Sondagem** com CPTEC observada, INMET, MONAN prevista e **números de Wyoming (CAPE/CIN, índices) via novo endpoint `/api/sondagem/numerica/`** (backend implantado; servidor alcança Wyoming); **Clima** (anomalias e chuva acumulada INMET; subsazonal e sazonal CPTEC com notas técnicas); **Previsão INMET** (92 municípios, 5 dias) com comparação por região com o CEMADEN-RJ; aba antiga renomeada **Previsão CEMADEN-RJ**. Sem meteogramas do CPTEC (decisão do usuário). Correções: cache de 10 anos dos arquivos da Marinha (parâmetro de versão, também nos meteogramas), nova tentativa em 503 do CPTEC. Deploy backend+frontend e verificado no Chrome (PC e 390 px). Ver `previsao-numerica.md` |

## 20/10/2026 — retorno do usuário sobre Meteorologia (5 itens)

Executados do mais fácil ao mais difícil; cada item conferido em produção (Chrome) após o deploy.

1. **Clima:** imagens sempre inteiras (`object-contain`, botão "Ampliar"); Tendência em 2 por vez no PC/tablet e 1 por vez no celular, com paginação ◀ ▶ (`ClimaPanel.tsx`, `lib/useMedia.ts`).
2. **Cartas sinóticas:** dois painéis independentes lado a lado (INMET×Marinha, Marinha×Marinha em horas diferentes, INMET×INMET), análise do INMET abaixo da carta, animação também no INMET, opacidade só na Marinha (`PainelCarta.tsx`, `CartasSinoticasPanel.tsx`; removidos `CartasSinoticasMapa.tsx` e `AnaliseSinoticaInmet.tsx`).
3. **Marés:** gráfico maior, escala de hora em hora no PC (3 em 3 h no celular), valor ao passar o mouse/dedo, valores e horas de preamar/baixa-mar no gráfico, ☀ no nascer e ☾ no pôr do Sol, indicador enchendo/vazando (`MareGrafico.tsx`). Bug corrigido: o pôr do Sol saía 12:13 por causa do sinal da longitude; conferido (05:16/17:59 × INMET 05h20/18h00). Tideschart/tabuademares são terceiros e **não** foram copiados; Niterói usa o Porto do Rio de Janeiro (Ilha Fiscal).
4. **Previsão numérica:** refeita com fonte → produto → área nativos por quadro e hora individual (detalhes em `previsao-numerica.md` §5; `lib/catalogoModelos.ts` novo).
5. **Mapa → Previsão:** nova sub-aba com a previsão do CEMADEN-RJ no mapa das 11 REDECs (sem mapa-base), cartões com ícone e mín/máx, detalhes ao clicar e exportação em post (imagem quadrada com as duas logos, texto para WhatsApp e versão em tabela). Ver `docs/mapa-previsao.md`.

Sugestão para os Guarda-Vidas (ainda não decidida): estágio futuro com praia, ondas e marés juntas.

## 20/10/2026 (2ª rodada) — segunda revisão do usuário

Testado em servidor local com dados simulados, em PC e celular, antes de publicar.

1. **Previsão numérica:** título + botões + Sincronizar horas na mesma linha; texto explicativo removido; figuras ocupam toda a altura útil sem barra de rolagem (PC 1024x768 e celular 375x812).
2. **Cartas do INMET fora do ar:** o servidor de imagens apicommet.inmet.gov.br está resetando as conexões (curl e navegador, ontem e hoje); a lista de análises (apiprevmet3) funciona. A aba agora mostra imagem fora do ar, o texto da análise segue abaixo, e botão Tentar de novo. Dependência do INMET; rever quando voltar.
3. **Clima:** imagens sem espaço em branco nem corte (altura máxima em vez de caixa fixa), seletores em 2 colunas no celular.
4. **Mapa → Previsão refeito** (dados completos, mapa numerado, sem linhas no celular, story 1080x1920 com comentário): ver docs/mapa-previsao.md.
5. **Marés + condições de praia** a partir dos links do usuário: ver docs/mares-praia.md.

Aprendizados: o service worker mantém JS antigo (limpar ao testar); html-to-image pode falhar na 1ª captura (agora tenta de novo); comentários reais da previsão têm ~58 caracteres.

## 20/10/2026 (3ª rodada) — mapa quase perfeito + praias do Estado

1. **Mapa → Previsão:** nascer/pôr do Sol de cada região em todos os cartões e formatos; post quadrado trocado por post de feed 1080x1350 com umidade, vento, Sol e comentário; texto para copiar com todos os campos. Ver docs/mapa-previsao.md.
2. **Marés para cada praia do Estado:** 351 praias (OpenStreetMap) em 22 municípios, busca na aba Marés, maré do porto mais próximo e clima/mar/Sol/Lua do ponto da praia. Ver docs/mares-praia.md.
Testado em servidor local (PC e celular) antes de publicar.

## 22/10/2026 — aba Geologia e banco de recomendações de alarme

A aba Sirenes virou sub-aba da nova aba **Geologia**, junto de **Recomendações** (cartões/tabela) e **Cadastrar recomendação**. Novo modelo `RecomendacaoAlarme` (migração 0020, aplicada em produção), API `/api/recomendacoes/`, testes de backend e teste local de ponta a ponta; nenhum dado de teste gravado em produção. Ver docs/geologia-recomendacoes.md. Pendente: importar a planilha de 2020 (25 linhas) com autorização do usuário.

## 22/10/2026 (tarde) — planilha 2020–2026, validação em duas etapas e mensagem de envio

Estudo da planilha enviada pelo usuário e ajuste do cadastro: validação posterior (acionaram nulo = aguardando), 13 municípios, sugestão de gatilho, mensagem de envio em imagem/texto, nova sub-aba Acionamentos do município. Importador pronto (273 recomendações + 26 acionamentos), migração 0021 aplicada em produção; **gravação dos dados históricos pendente de autorização**. Ver docs/geologia-recomendacoes.md e docs/recomendacoes-planilha-relatorio.md.

## 22/10/2026 (noite) — histórico gravado e recomendação pré-preenchida

Com a autorização do usuário, a planilha 2020–2026 foi gravada em produção (273 recomendações + 26 acionamentos do município; correções, pelo painel). Nova coluna **Recomendação** na tabela de Sirenes (botão aparece com gatilho em andamento e abre o cadastro pré-preenchido) e quadro **Gatilhos em andamento agora** no cadastro. Ver docs/geologia-recomendacoes.md.

## 22/10/2026 (noite) — vários gatilhos por recomendação

Recomendação com mais de um gatilho (campo `gatilho` como lista, migração 0022), pré-preenchimento com todos os gatilhos ativos e controle do que já foi recomendado hoje por gatilho. Ver docs/geologia-recomendacoes.md (4ª etapa).

## 22/10/2026 (noite) — municípios com sirenes editáveis

Aba Acionamentos do município restrita aos 17 municípios com sirenes, em lista editável no Admin (modelo `MunicipioComSirene`, migração 0023). Ver docs/geologia-recomendacoes.md (5ª etapa).

## 22/10/2026 — API HidroWebService da ANA (levantamento e conector)

Leitura do OpenAPI, do manual oficial e da resposta da ANA; conector `ana_hidroweb.py` (fonte `ana`, inativa até haver credencial), tipo de leitura `vazao_m3s` (migração 0024) e rota de diagnóstico somente leitura `/api/admin/ana/`. A senha **não** foi vista nem registrada. Ver docs/ana-hidrowebservice.md.

## 22/10/2026 (tarde) — ANA em produção

Credenciais enviadas ao `.env` do servidor por SFTP (sem exibir valores). Fonte `ana` ligada: 121 estações (94 com nível, 62 com vazão), primeira ingestão em produção sem erros, coluna **Vazão (m³/s)** na tabela Hidrológicos e nova sub-aba **Dados → ANA**. Sem cron próprio: a ANA roda de **carona no cron da REDEMET** (`7-59/15`, 120 s), lote de até 40 estações por rodada em rodízio, com orçamento de 80 s. Detalhes e achados confirmados em docs/ana-hidrowebservice.md (seção 6).

## 23/10/2026 — Modelos numéricos em grade (IFS, IFS 0,1°, AIFS, GFS, ICON, conjuntos IFS ENS/GEFS)

Gerador `scripts/modelos/` + workflow `modelos-grades.yml` (GitHub Actions, a cada 3 h, 7 jobs em paralelo) publicam grades recortadas do Sudeste no branch `dados-modelos`; o painel lê direto do navegador. Camada interativa **Modelo numérico** na aba Mapa (contornos, ranking por município, meteograma por clique, faixa de incerteza dos conjuntos) e as mesmas fontes na Previsão numérica. Inclui ondas, produtos derivados (divergência, vorticidade, cisalhamento, fluxo de umidade, índice de calor, Tmax/Tmin) e auditoria do que ficou de fora. Detalhes em docs/modelos-numericos.md.

Gerador `scripts/modelos/gerar_grades.py` + workflow `modelos-grades.yml` (GitHub Actions, a cada 3 h) publicam grades recortadas do Sudeste no branch `dados-modelos`; o painel lê direto do navegador. Camada interativa **Modelo numérico** na aba Mapa e fontes **IFS/GFS (interativo)** na Previsão numérica, com meteograma por clique. Detalhes, variáveis e limitações em docs/modelos-numericos.md.

## 25/10/2026 — Radar da REDEMET: consulta a cada 5 min

O radar do mapa passou a reconsultar a cada 5 min (antes 10, igual ao satélite) e o cache do servidor para o radar caiu de 5 para 2 min, porque o site oficial publica a cada 10 min e a defasagem máxima chegava perto de um quadro inteiro. Satélite segue em 10 min. Arquivos: `MapView.tsx` (`INTERVALO_ATUALIZACAO_RADAR_MS`) e `backend/api/redemet_imagery_views.py` (`CACHE_TTL_RADAR_SEGUNDOS`).

## 25/10/2026 (tarde) — Camada de radar/satélite: histórico sempre carregado e escolha da imagem

Removida a opção "Animar histórico": ao escolher radar ou satélite o painel abre na **última imagem** e o histórico fica no controle (anterior, play/pausa, próxima e régua para escolher a imagem, com o horário inicial e final). A reconsulta automática não tira o usuário do quadro que ele escolheu (só acompanha o último se ele já estava nele). O radar REDEMET passou a pedir 15 quadros (antes 8). **Achado:** a API-REDEMET devolve o radar do Pico do Couto a cada ~20 min (com `anima` ou com `frames`, que é o que o próprio site da REDEMET usa; o parâmetro `data=AAAAMMDDHH` devolve só a última imagem da hora). Os quadros de 10 min que o usuário viu em outro site não vêm dessa API — origem a identificar.

## 25/10/2026 (noite) — Mosaico dos radares da REDEMET no Sudeste

Nova opção **REDEMET — Mosaico Sudeste (RJ, SP, MG, ES)** na camada de radar. `GET /api/imagery/radar-mosaico/` (backend/api/redemet_imagery_views.py, `montar_mosaico`) pede à API-REDEMET os 15 quadros de **todos** os radares, fica só com os de RJ/SP/MG/ES (hoje 4 com dado: Pico do Couto/RJ, São Roque/SP, Almenara/MG e Santa Teresa/MG; São Francisco/MG e Três Marias/MG vêm sem imagem) e **alinha os horários**: os quadros de referência são os do radar com mais imagens e cada radar entra com a imagem mais próxima (tolerância de 10 min; na prática ≤ 3 min); só vira quadro o instante em que **todos** os radares ativos têm imagem (radar parado há mais de 1 h sai e é informado), então a animação pode encurtar. No navegador cada quadro desenha as imagens dos radares juntas (o do RJ por cima nas sobreposições), abre no último quadro e tem o mesmo controle de histórico (anterior, play, régua). Não há imagem única fundida: a REDEMET não envia cabeçalho CORS nas imagens (o navegador não deixa ler os pixels) e o servidor não tem Pillow/numpy.

## 25/10/2026 (noite) — Radar: escolha separada de radar e de produto

No painel de camadas o radar passou a ter dois seletores: **Radar** (REDEMET Pico do Couto, Santa Teresa e Mosaico Sudeste; INEA Mosaico, Guaratiba, Macaé, Mendanha e Sumaré; Niterói) e **Produto**, que depende do radar. Produtos verificados em 25/10/2026: REDEMET = MAXCAPPI e CAPPI 3/5/7/10 km (inclusive no mosaico, 4 radares × 14 quadros); INEA (Radar Tool, `frames.php?product=zh|rr|vel`) = refletividade, **precipitação (mm/h)** e **velocidade radial (m/s)** — o mosaico não tem velocidade (0 quadros) e Sumaré/Pico do Couto só publicam refletividade; Niterói = MAXDISPLAY da Prefeitura (única opção pública da API deles, os outros tipos pedem login) mais os 3 produtos via INEA (código `nit`, passo de 5 min). Mendanha estava sem imagem no momento do teste. Legenda de cores e valores do INEA exibida no painel para zh/rr/vel. Backend: `inea_radar_views.py` (parâmetro `produto`, radar `nit`, validação por radar) e mosaico REDEMET já aceitava o tipo.

## 28/10/2026 — Nível de Monitoramento do PLANCON 2026/2027

Implementados no repositório: modelos + migração 0025, regras do PLANCON, API (inclusive pública sem login), aba Alertas > Nível de Monitoramento (mapa, lançamento com assistente, pendências, histórico, guia) e página pública `/publico`. Testado localmente (tsc, 9 testes, navegador). Arquivos do backend enviados ao servidor por SFTP; **publicado em produção no mesmo dia**: migração 0025 aplicada (POST /api/admin/migrate/ com sessão, autorizado pelo usuário), `.htaccess` com a regra `/publico` (backup `.htaccess.bak-publico`) e front implantado por SFTP (94 arquivos); `/publico` verificado sem login. Detalhes e pendências em `nivel-monitoramento-plancon.md`.

## 28/10/2026 (tarde) — Página pública no celular

Correção a pedido do usuário: no celular o cabeçalho de `/publico` ficava espremido (logo, título e horário em linha) e o mapa ficava numa caixa alta demais, com vazio em cima, e travava a rolagem da página. Agora o cabeçalho empilha em telas estreitas, o mapa usa proporção 900:640 (altura máxima só como teto) e `touch-action: pan-y` quando sem zoom (`PublicoMonitoramento.tsx`, `monitoramento/MapaNiveis.tsx`; vale também para a aba privada). Publicado (94 arquivos) e conferido em produção com tela de 390 px. Observação de teste: no `localhost` o service worker serve chunks antigos (sem hash no dev) — desregistrar o SW antes de testar; em produção os chunks têm hash e o HTML vem sempre da rede.

## 28/10/2026 (noite) — Reorganização: Produção e Suporte

A pedido do usuário: (1) o guia do plantão em HTML (iframe) foi **refeito como componente nativo** no padrão do painel e colocado numa sub-aba **Suporte**; (2) o lançamento do NM saiu de Alertas e foi para uma **nova aba principal "Produção"** (sub-abas Lançar nível, Pendências, Histórico e Suporte), no mesmo padrão da Geologia/recomendações de sirenes; (3) **Alertas → Nível de Monitoramento** ficou só com a visualização (contagens, mapa, regionais, municípios em NM ≥ 2), com atalho "Lançar nível para estes" para a Produção. Backend: removidos a view/rota `/api/monitoramento/guia/` e o `guia_plantao.html` (também no servidor, por SFTP); 8 testes passando. Front: build e deploy SFTP (95 arquivos, 0 falhas). Verificado em produção: aba Produção e Suporte abrem; `niveis`, `sugestoes`, `registros` e `publico` respondem 200, `guia` 404 (esperado). Nenhum NM foi lançado em produção.

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
