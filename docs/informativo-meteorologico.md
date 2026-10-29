# Informativo meteorológico — o que está implementado (29/10/2026)

Proposta original e decisões: `informativo-meteorologico-proposta.md`. Aqui está o **estado real** do código. Status: **publicado em produção em 29/10/2026** (migração 0028 aplicada; nenhum informativo criado nem importado em produção).

## O que o painel faz e o que NÃO faz
* Compõe o texto no modelo do grupo de operadores, guarda a matriz por REDEC, numera (nº/AAAA, reinicia em 1 a cada ano), acompanha a vigência de 6 h e o relógio do radar, registra revisão/envio/SMS e guarda o histórico.
* **Não envia nada** (SMS/IDAP, WhatsApp, Telegram): o plantonista copia o texto e envia; o painel só registra o que foi enviado.

## Modelo de dados (`core/models.py`, migração `0028_informativo_meteorologico`)
* `InformativoMeteorologico` (ano+número únicos; estado rascunho → revisado → enviado, ou cancelado — **nunca se apaga**; texto final + `texto_gerado` para saber se houve ajuste manual; aproximação de núcleos; `publico`; `historico` JSON de auditoria; `importado`).
* `InformativoRegiao` (uma linha por REDEC: chuva atual, raios, chuva prevista, rajadas, raios, granizo, isolada, SMS enviado).
* `ConfiguracaoInformativo` (uma linha, Admin): rodapé, fonte do radar, validade (6 h) e cadência do radar.

## Gerador de texto (`core/informativos.py`)
Reproduz os informativos reais nº 168–193/2026 (19 testes em `api/test_informativos_texto.py`): agrupa por intensidade, ordem canônica das REDECs, "em todo o estado", "em todas as regiões, exceto X", "nas demais regiões", "Pancadas… com raios e rajadas…", granizo em linha própria, aproximação "por Minas Gerais". Também: sugestão de NM (só **sugestão**), cadência do radar, lacunas de numeração, texto de SMS (≤146) e TV (≤62), frase do Livro de Ocorrências, normalização de REDEC/intensidade para a importação.

## API (`api/informativo_views.py`; login, exceto a pública)
| Rota | O que faz |
|---|---|
| `GET/POST /api/informativos/` | histórico (filtros ano, estado, regiao, de, ate) / cria rascunho reservando o número (`duplicar_de` copia a matriz) |
| `GET/PATCH /api/informativos/<id>/` | detalhe / edita. O texto só é regerado se não foi ajustado à mão (ou `regenerar_texto`). Enviado/cancelado: só `observacao` e `publico` |
| `POST /api/informativos/previa/` | texto ao vivo sem salvar |
| `POST /api/informativos/<id>/revisar|enviar|cancelar|sms/` | fluxo; cancelar exige motivo; `sms` marca por REDEC |
| `GET /api/informativos/acompanhamento/` | vigente, tempo restante, relógio do radar (atrasado?), SMS pendentes, REDECs sem informação, lacunas, próximo número |
| `GET /api/informativos/estatisticas/?ano=` e `/exportar/?ano=` | números por mês/REDEC; CSV no formato da planilha |
| `GET /api/publico/informativo/` | **sem login**: último informativo enviado, marcado público e dentro das 6 h (sem nomes de usuários) |

A numeração é reservada com transação e nova tentativa em caso de conflito (testado com dois usuários).

## Tela
Aba **Produção → seletor de equipe: Nível de Monitoramento | Meteorologia (informativo)** (`ProducaoHub.tsx`). Meteorologia tem três abas: Acompanhamento, Compor informativo (matriz por REDEC + prévia ao vivo + copiar + SMS/TV + sugestão de NM + Livro de Ocorrências) e Histórico (filtros, abrir, duplicar, exportar CSV, resumo). Funciona em 375 px sem rolagem horizontal. A página pública mostra o informativo vigente (`InformativoPublico.tsx`) e ele some sozinho ao vencer.

## Importação do histórico (`manage.py importar_informativos`)
Lê a planilha de controle (abas 2020–2026: nº, ano, data, hora, REDEC, chuva, vento, SMS). **Simulação por padrão**; `--gravar` grava; repetível (não toca em (ano, nº) existente); **nunca adivinha**: REDEC/intensidade/data ilegíveis ou ambíguas (ex.: `04/10/2022`) vão para o relatório de revisão CSV. Importados ficam `importado=True`, `texto_livre=True` (a planilha não tem o texto).
Resultado da simulação sobre a planilha real (banco descartável): **1.813 informativos, 14.809 linhas por REDEC, 3.093 com SMS**; 85 linhas para revisão (datas em texto ambíguas de 2022/2023, REDEC truncada). Lacunas de numeração por ano: 2020: 4, 2021: 27, 2022: 24, 2023: 11, 2024: 180 (a planilha de 2024 começa no nº 178 — provável continuação de 2023; conferir antes de usar a numeração), 2025: 9, 2026: 41.
**A importação em produção depende de autorização explícita** (e de `openpyxl` instalado só na máquina que roda o comando).

## Testes
`api/test_informativos.py` (13: login, numeração e ano, dois usuários, texto/ajuste manual, matriz, fluxo e cancelamento sem apagar, SMS, duplicar, prévia, acompanhamento/lacunas/radar, vigência 6 h, público, histórico/CSV/estatísticas), `api/test_informativos_texto.py` (19), `api/test_importar_informativos.py` (4). Suíte `api core`: 83 OK.

## Ainda não feito (fases B–D)
Sugestão automática de chuva por estações + radar (F9–F12), recorte do radar com legenda (F14), sugestão de NM vinda do informativo para a aba Pendências (F18), faixa/mapa do informativo (F19–F20), bloco do Resumo 24 h (F22), verificação de acerto (F26), fila de revisão da importação na tela (F24), texto livre guiado (F28).
