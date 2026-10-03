# Operação em produção — crontab, deploy e salvaguardas

Documento vivo: tudo que existe no servidor (HostGator compartilhado, usuário
cPanel `prese257`) e **como** operá-lo sem shell. Atualizado em 03/10/2026.
Credenciais **não** são registradas aqui (ficam no `.env` do servidor e na
memória local do assistente).

## 1. Arquitetura de execução (resumo)

- Sem shell SSH (só SFTP) e sem Passenger: o Django roda como **CGI** — um
  processo novo por requisição; subir um `.py` por SFTP já vale na próxima
  chamada (não há restart).
- Backend em `~/cemadenrj_backend/`; frontend estático (Next.js export) em
  `~/cemadenrj.preserve.rio.br/`.
- Ingestão periódica: **Cron Jobs do cPanel** chamando
  `POST /api/admin/run/` (header `X-Admin-Secret`) — ações `ingest`
  (`source=<slug>`), `sync_sirenes`, `sync_risk_alerts`, `sync_avisos_mau_tempo`.
- Dependências Python novas: não há "Ensure dependencies" disponível ao
  usuário — vendorizar por SFTP em `~/.local/lib/python3.9/site-packages`
  ou embutir o arquivo no projeto (foi o caso do bundle de CA do INEA).

## 2. Crontab (lido via API2 do cPanel, segredo omitido; reconferido em 03/10/2026 após a alteração do usuário)

| Minuto | Comando (`/api/admin/run/`) | Timeout curl |
|---|---|---|
| `2-59/15` | `ingest alerta_rio` | 25 s |
| `4-59/15` | `ingest wunderground` | 25 s |
| `6-59/15` | `ingest plugfield` | 25 s |
| `8-59/15` | `ingest inmet` | 25 s |
| `10-59/15` | `sync_risk_alerts` | 280 s |
| `13-59/15` | `ingest cemaden_mctic` | 280 s |
| `14-59/15` | `ingest niteroi` | 280 s |
| **`*/2`** | **`sync_sirenes`** (alterado pelo usuário no cPanel em 03/10/2026; antes `*/15`, 25 s) | 60 s |
| `1-59/15` | `ingest inea` | 25 s |
| `0,30` | `sync_avisos_mau_tempo` | 25 s |

### Achados do crontab

1. **`sync_sirenes` estava a cada 15 min** (planejado: 2 min desde 23/09) —
   **corrigido para `*/2` pelo usuário em 03/10/2026** e verificado: sync às
   06:16:03 e 06:18:03 UTC com o painel fechado. O sync dura ~1,5 s. Agora o
   erro de tempo de `triggered_at`/`resolved_at` cai para ~2 min.
2. **Sem cron**: `macae_ufrj`, `redemet`, `ecowitt_paracambi`,
   `rio_chuva_bairro`. Macaé só atualiza no botão "Atualizar agora" (explica o
   atraso/estações paradas). REDEMET passou a ser atualizado pelo painel aberto
   (a cada 15 min) como paliativo.
3. **`cemaden_mctic` a cada 15 min** com fonte de ~10 min: perde 1 de cada 3
   baldes (confirmado nos intervalos de 10-70 min entre leituras guardadas).
4. Todos os comandos usam `> /dev/null 2>&1`: falha de cron é **silenciosa**
   (por isso a salvaguarda de status das sirenes, abaixo).
5. Os minutos estão escalonados (0-14) de propósito para não rodar vários CGI
   ao mesmo tempo no plano compartilhado.

## 3. Como gerenciar o cron sem abrir o cPanel

API2 (a UAPI moderna `/execute/Cron/...` **não existe** neste servidor), base
`https://preserve.rio.br:2083/json-api/cpanel`, header
`Authorization: cpanel prese257:<TOKEN>` (token de API do cPanel guardado na
memória local do assistente, nome do token "cemadenrjpreserveriobr").

- Listar: `cpanel_jsonapi_apiversion=2&cpanel_jsonapi_module=Cron&cpanel_jsonapi_func=fetchcron`
- Adicionar: `func=add_line` com `command`, `minute`, `hour`, `day`, `month`,
  `weekday`.
- Remover: `func=remove_line` com `linekey` (vem do `fetchcron`).
- **Cuidado:** o `add_line` aceita comando com aspas faltando e devolve
  "crontab installed". Monte o `-d` do curl com aspas simples em volta do JSON
  e **sempre** reconfira com `fetchcron` depois.
- **Em 03/10/2026 o classificador de permissões do Claude Code bloqueou
  `add_line`/`remove_line`** (alteração de configuração persistente), mesmo com
  autorização do usuário no chat. Leitura (`fetchcron`) funciona. Para alterar o
  cron é preciso o usuário liberar a regra de permissão correspondente ou
  fazer a alteração.

### Alteração recomendada e pendente

| Ação | Motivo |
|---|---|
| ~~`sync_sirenes`: `*/15` → `*/2`, `curl -m 60`~~ **FEITO em 03/10/2026** | toque de sirene salva vidas; sync de 1,5 s |
| Criar `ingest macae_ufrj` em `5-59/15` (`-m 120`) | Macaé sem cron |
| Criar `ingest redemet` em `7-59/15` (`-m 120`) | histórico de METAR |
| Criar `ingest ecowitt_paracambi` em `9-59/15` (`-m 120`) | sem cron |

**Testes de 03/10/2026 (cada ingestão rodada uma vez em produção):** `macae_ufrj`
1,2 s (26 estações atualizadas, +13 leituras), `redemet` 2,3 s (17 estações,
470 leituras já existentes), `ecowitt_paracambi` 2,5 s (2 estações, +12
leituras) — todas sem erro, então `-m 120` basta. Minutos ímpares escolhidos
para não coincidir com o `sync_sirenes` (minutos pares) nem com os demais
(0, 1, 2, 4, 6, 8, 10, 13, 14). Comando de cada linha (mesmo formato dos
existentes): `curl -s -m 120 -X POST https://cemadenrj.preserve.rio.br/api/admin/run/
-H "X-Admin-Secret: <segredo>" -H "Content-Type: application/json"
-d '{"action":"ingest","source":"<slug>"}' > /dev/null 2>&1`.
| `ingest cemaden_mctic`: `13-59/15` → a cada 5 min | fonte de 10 min |

(As três últimas dependem da decisão do usuário por fonte.)

## 4. Salvaguardas das sirenes (implementadas em 03/10/2026)

O toque de sirene é dado de segurança: se o sync parar, a tela mostraria "0
sirenes tocando" — um falso "tudo normal".

1. **Reforço pelo painel aberto:** `POST /api/refresh/sirenes/` a cada 2 min
   por painel. O servidor **pula** se o último sync tem menos de 90 s
   (`SIRENES_INTERVALO_MIN_S`), evitando rajada de logins no portal da
   GridLab (risco de bloqueio da conta de serviço).
2. **Alerta de dado velho:** `GET /api/sirenes/status/` devolve idade do último
   sync (`max(Station.updated_at)` da fonte). Se `> 300 s` (ou o servidor não
   responde) o topo do painel mostra faixa âmbar: "status das sirenes está
   DESATUALIZADO… confirme pelo portal do CBMERJ".
3. Com o painel **fechado** vale só o cron, agora a cada 2 min (verificado).

Ideias ainda não feitas: sync de sirenes também por GitHub Actions
(redundância fora do HostGator); gravar `ultimo_sync_ok`/`ultimo_erro` num
modelo; alerta ativo (e-mail/Telegram) quando o sync falhar.

## 5. Deploy

- Backend: `put` por SFTP (chave `~/.ssh/hostgator_cemaden`, usuário
  `prese257`) para `cemadenrj_backend/...`.
- Frontend: build com `NEXT_PUBLIC_API_BASE_URL=https://cemadenrj.preserve.rio.br/api npm run build`
  (a variável é obrigatória — um `.env.local` esquecido faria o build apontar
  para localhost) e upload de `frontend/out/` para
  `~/cemadenrj.preserve.rio.br/`.
- **Service worker (PWA):** o navegador guarda o app em cache; para testar
  uma versão nova pode ser preciso desregistrar o SW e limpar `caches`.
  Desde 03/10 o SW não intercepta requisições de outra origem
  (`CACHE_VERSION` = `cemadenrj-v2`).
- Migrations/comandos Django: via `/api/admin/run/` (ações) ou endpoints de
  superusuário `/api/admin/*` (sessão + CSRF).

## 6. Repositório canônico

**`H:\Meu Drive\Claude\cemaden-rj-painel`** é o repositório canônico
(`origin` = `github.com/anthonybombeiro/cemaden-rj-rainfall-dashboard`).
Em 03/10/2026 o usuário confirmou isso e comparamos com a cópia antiga
`C:\Users\antho\projects\cemaden-rj-painel` (`origin` = `.../cemadenrj`): o
HEAD do C: (`3a338d9`) é ancestral do histórico do H:, e os arquivos que
diferem trazem apenas versões **antigas** das mesmas rotinas (nenhum conteúdo
exclusivo do C: faltava no H:). Único acerto: 4 variáveis do `.env` local
(`CEMADEN_RJ_SIRENES_*` e `ECOWITT_PARACAMBI_*`) copiadas do C: para o H:.
Detalhes em `docs/registro-de-acoes.md`.
