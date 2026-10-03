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

## Pendências abertas (03/10/2026)

1. ~~Aplicar `sync_sirenes` a cada 2 min no cron~~ — **feito e verificado**.
2. ~~Cron para Macaé/REDEMET/Ecowitt~~ — **criados**; `cemaden_mctic` passou a 5 min; falta investigar quem alterou o cron de sirenes para `*/20`.
3. Validar em campo os códigos de acionamento das sirenes (nomes de 5, 6 e 8) e
   consultar `SireneAcaoTipo` no Admin.
4. Persistir acumulados e valores oficiais das fontes (CEMADEN, Alerta Rio,
   INEA, Niterói) e metadados/QC por leitura (ver `fontes-de-dados.md`).
5. Incluir `ecowitt_paracambi` em `PRECIPITACAO_BUCKET_SOURCES`.
6. **Reavaliar a qualificação de chuva no verão** (limite de suspeito 20 para 10 mm e regra de vizinhança), com mais dados: ver "Calibração dos limites da qualificação" em `fontes-de-dados.md`. Decisão do usuário em 03/10/2026.
