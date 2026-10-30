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

## Importação em produção (29/10/2026 — FEITA)
* Resultado: **1.818 informativos** gravados (2020: 460, 2021: 401, 2022: 327, 2023: 166, 2024: 136, 2025: 176, 2026: 152), todos `importado=True`, estado enviado, só previsão e SMS por REDEC (a planilha não tem o texto). Próximo número de 2026: 194.
* Como: `manage.py importar_informativos planilha.xlsx --json core/data/informativos_planilha.json` (local, com openpyxl) gera o arquivo; o servidor lê esse JSON em `POST /api/admin/importar-informativos/` (superusuário; `{"dry_run": true}` só conta; repetível). A lógica está em `core/importacao_informativos.py`.
* Datas em texto ambíguas: só são aceitas quando a numeração prova qual é (o informativo anterior e o seguinte do mesmo ano delimitam a data). Foram resolvidas 4; a lista está no relatório. `125*` (asterisco de reenvio) agora vira o nº 125.
* **Ficaram de fora 8 informativos** (2022: nº 14 e 59 a 63; 2023: nº 39 e 99 — só têm data em texto ambígua que a numeração não resolve) e 46 linhas para revisão: `docs/informativos-importacao-revisao.csv`. Corrigir a data na planilha e rodar de novo (repetível) importa só o que falta.
* **Numeração de 2024:** a equipe não reiniciou a contagem em 01/01/2024; o ano vai de 178 a 316 (contínuo, sem buracos), continuando 2023 (que termina no 176; o 177 não consta na planilha). Os números foram mantidos como foram emitidos. O "180 lacunas" que a simulação mostrava era só o trecho 1–177 inexistente; `lacunas(numeros, desde=...)` evita esse falso alarme no relatório.

## Testes
`api/test_informativos.py` (13: login, numeração e ano, dois usuários, texto/ajuste manual, matriz, fluxo e cancelamento sem apagar, SMS, duplicar, prévia, acompanhamento/lacunas/radar, vigência 6 h, público, histórico/CSV/estatísticas), `api/test_informativos_texto.py` (19), `api/test_importar_informativos.py` (4). Suíte `api core`: 83 OK.

## Fases B a D (30/10/2026): implementado e publicado
Lógica em `core/informativo_apoio.py`; rotas em `api/informativo_apoio_views.py`; 21 testes novos (`api/test_informativo_apoio.py`). Tudo é leitura e **sugestão**: nada decide pelo técnico.
| Item | O que faz | Onde |
|---|---|---|
| F9 | Maior chuva de 1 h das estações de cada REDEC, na escala única (fraca 0,2 · moderada 5,1 · forte 25,1 · muito forte > 50 mm/h), só leituras dos últimos 90 min. A classe vira a intensidade da matriz (forte → moderada a forte; muito forte → pontualmente muito forte) | `GET /api/informativos/apoio/`; botão **Preencher a matriz** no compositor (só preenche campos vazios) |
| F10 | Previsão do dia: ícone com chuva → "fraca a moderada"; com raios → "moderada" + raios. Nunca propõe previsão abaixo da chuva atual. Botão **Copiar o último** copia a matriz do último enviado | idem |
| F11 | **Quando emitir**: sem informativo vigente e chuva forte (urgência alta) ou moderada (média); região descoberta; informativo a vencer (< 45 min) com chuva | `emitir` em `acompanhamento/` |
| F12 | **Região descoberta**: chuva ≥ moderada numa REDEC que o vigente não cobre (nem cenário nem previsão ≥ moderada) | `descobertas` em `apoio/` e `emitir` |
| F18 | Previsão do informativo vigente (enviado, < 6 h, não importado) → sugestão de NM por município da REDEC, em **Produção → Pendências** (tipo `informativo`). Tabela: moderada a forte → NM 1; com raios/rajadas → NM 2; ≥ moderada a ocasionalmente muito forte, granizo ou rajada forte → NM 3 marcado "só a pedido da meteorologia"; só aparece acima do NM vigente e a partir de NM 2 | `SugestoesNivelView` |
| F19 | **Faixa** no topo do painel: nº, hora, validade, regiões, cor pela maior intensidade, "radar atrasado" e o aviso de emitir | `FaixaInformativo.tsx` (consulta a cada 2 min, pausa com a aba oculta) |
| F22 | Lista **Informativos de hoje** no Acompanhamento e bloco "Informativos meteorológicos no período" no Resumo 24 h | `hoje` em `acompanhamento/`; `informativos` em `GET /api/resumo/` |
| F24 | **Fila de revisão da importação** na aba Histórico: os 8 informativos sem data utilizável (2022: 14, 59 a 63; 2023: 39, 99) aparecem com as regiões da planilha; quem sabe a data e a hora completa (nada é adivinhado) | `GET/POST /api/informativos/importacao-revisao/`; vem de `core/data/informativos_planilha.json` (`pendentes`) |
| F26 | **Verificação**: previsto (moderada a forte ou mais) × medido (chuva de 1 h ≥ 5,1 mm em estação da REDEC nas 6 h seguintes, só janelas fechadas). Acertos, falsos alarmes, perdas, acertos negativos, POD, FAR, CSI, viés e acurácia. Informativos importados ficam de fora | aba **Verificação**; `GET /api/informativos/verificacao/?dias=` (até 90 dias, 40 informativos) |
| F28 | **Texto livre guiado**: frases prontas (granizo pontual, raios e rajadas, pancadas isoladas, melhora do cenário, atualização) inseridas antes do rodapé; o texto passa a valer como ajustado à mão | `TextoLivreGuiado.tsx` |
| F14 (parte técnica) | Rota que entrega o quadro de radar do INEA pelo nosso servidor (o INEA não libera CORS e o canvas não poderia ser exportado). Lista fechada: só PNG de `radartool.inea.rj.gov.br/radar-tool/img/` | `GET /api/informativos/radar/imagem/?url=` |

Ainda **não** feito: o recorte do radar com legenda (F14, tela) e o mapa/arte das 11 REDECs (F20) — são arte nova e esperam a aprovação do modelo visual antes de publicar.

## Fila de decisão (30/10/2026) — aguardando o usuário
1. **Imagens do informativo** (recorte do radar com legenda e mapa das 11 REDECs): modelo enviado, código pronto (`ImagensInformativo.tsx`), **não publicado**. Publica quando houver OK ou ajustes.
2. **Lagoa de Imboassica no NM:** desligar da sugestão (recomendado) ou manter com aviso "lagoa".
3. **Gatilhos do NM:** começar por GI–GIV e "sirene tocando", sempre como sugestão (recomendado); depois chuva observada, rajadas/raios, Flood Hub e Marinha.
4. **Oito informativos antigos sem data** (2022: nº 14, 59–63; 2023: nº 39, 99): preencher pela fila de revisão do Histórico quando houver as datas.
5. **Nº 177/2024:** confirmar se existiu (a numeração de 2024 segue a de 2023 a partir do 178).

## Acompanhamento em cards (30/10/2026) — publicado
Mesmo padrão dos avisos de mau tempo: **mapa das REDECs** coloridas pela chuva prevista do vigente; **card do vigente** (mensagem publicada, regiões com ⚡/❄/SMS, validade, radar, SMS pendentes, notificações = histórico de ações, sugestões = NM, texto de SMS/TV, observação); **cards dos anteriores do episódio** (enviados em sequência sem pausa maior que 12 h, até 12) com o mesmo conteúdo. API: `acompanhamento/` agora devolve `vigente` em detalhe completo e `episodio` (lista de detalhes). Código: `CardInformativo.tsx`, `MapaVigente.tsx`, `_episodio` em `informativo_views.py`; teste novo em `test_informativos.py`.

## Ajustes do compositor (30/10/2026, noite) — publicado
- **Núcleos que se aproximam** não entravam no texto quando o texto estava "ajustado à mão" (inclusive por inserir frase do texto livre, que antes ligava esse modo sem avisar). Agora a frase guiada entra na geração (matriz e núcleos seguem atualizando) e, com texto ajustado à mão, aparece um aviso explicando que mudanças não entram até **Regerar**. Salvar e Registrar envio passaram a enviar também os núcleos.
- **Raios** e **Rajadas de vento** são botões separados no texto livre guiado.
- **Intensidades novas:** Pontualmente forte, Forte, Forte a ocasionalmente muito forte, Forte a muito forte e Muito forte. A gravidade virou escala contínua (pontual_forte 4,5; forte 5,5; forte_ocasion_muito_forte 6,5; forte_muito_forte 7,5; muito_forte 9) para manter os limiares (≥4 SMS, ≥5 radar intenso, ≥6 NM 3 a pedido). `normalizar_intensidade` reconhece as novas; "forte" sozinho deixou de virar "moderada a forte".
- **Limpar:** botão ao lado de Copiar apaga matriz, núcleos, frases e texto digitados (com confirmação); diferente de Regerar.

## Envio, imagens e validação Idap (30/10/2026) — PUBLICADO em 30/10 (aprovado pelo usuário; migrações 0029 e 0030 aplicadas)
Regra do usuário: **nada se tira do Compor informativo** (texto livre guiado, Salvar rascunho, Marcar revisado, Registrar envio). Só entra o botão **Registrar e Publicar**, que registra o envio e abre a arte. Aprovado e publicado.
- **Compor:** + **Registrar e Publicar** (gera a arte) e + **Fechar edição** (ao lado de Limpar; volta ao novo informativo em branco). O bloco de radar/Idap que havia sido posto no compositor saiu. "Mostrar na página pública enquanto vigente" vem **marcado por padrão** (`publico` default True; migração 0030).
- **Arte do informativo** (`PublicarInformativo.tsx`), um formato por vez: **3:4 com radar** (radar no topo, legenda de uma linha em fonte menor, cenário e previsão em faixas, rodapé só com a fonte e a validade) ou **1:1 só texto** (sem chips de região). Letra maior, ajustada ao tamanho do texto.
- **Radar** (`RadarCompartilhar.tsx`, `lib/radarImagem.ts`): ícone no card; caixa de compartilhar com **seletor de radar no topo**, prévia **sem barras de rolagem** e os botões de sempre; cabeçalho = título do painel ("Painel Integrado de Monitoramento" / "CEMADEN-RJ / SEDEC"); mapa centralizado ocupando o máximo, fundo transparente; legenda de uma linha "Radar X - atualização de HHhMM (hora local)"; texto copiado: "*Painel Integrado de Monitoramento CEMADEN-RJ*" + a legenda. Pode registrar o envio do radar várias vezes.
- **Card do Acompanhamento** (`CardInformativo.tsx`): desenho dos cards do INMET/mau tempo (faixa superior, título, etiquetas, mensagem enviada, dados); controles depois da mensagem: ícones **gerar arte, radar, editar, lixeira (cancela)**, botão **Validar envio Idap**, notificações e sugestões. Sem a lista de regiões com ícones.
- **Validar envio Idap** (`ValidarIdap.tsx`, popup como o "Validar" da recomendação): ferramentas = as mesmas do NM (Google Alertas, Telegram, WhatsApp, SMS, TV por assinatura, DCA), quem autorizou, regiões, identificação do disparo, observação; preencher e confirmar é a validação (dá para registrar sem validar e validar depois). Avisos pedem confirmação (SMS abaixo de moderada a forte; TV e DCA só NM 4 e 5). Lixeira só administrador.
- `ShareModal`: novos campos `cabecalho`, `topo`, `semRolagem`, `acoes`; a exportação sai sempre em tamanho real (`transform: none`), mesmo com a prévia reduzida. Proxy de radar também aceita PNG da REDEMET.
- Testes: 40 do backend OK; no navegador local: radar, arte 3:4 e 1:1, Registrar e Publicar, Fechar edição, popup Idap.
- Publicação: migrações → migrate → backend → front, sem 500. Não testado em produção: quadro real da REDEMET (chave só no servidor) — conferir no primeiro uso. As duas artes (3:4 com radar e 1:1 só texto) ficam.

## Incidente: texto do informativo cortado em produção (30/10/2026) — CORRIGIDO
- **Sintoma:** os informativos nº 194 e 195 mostravam só "CEMADEN-RJ / INFORMATIVO METEOROLÓGICO n°…" (cards, arte, "texto gerado"); as artes saíam com cenário e previsão "—".
- **Causa:** o MySQL do servidor grava em utf8 de 3 bytes e **corta o texto no primeiro caractere de 4 bytes** (o emoji 📅 da linha "Data", depois 🌧), sem erro. Passava despercebido no teste local (SQLite) e antes disso o texto salvo quase não era lido.
- **Correção:** `TextFieldSeguro` (`core/models.py`) para `texto` e `texto_gerado`: grava cada caractere fora do plano básico como `{{u:1F4C5}}` e restaura na leitura (sem alterar a coluna). Migração **0031** regenerou pela matriz os textos cortados (195 e 194; texto livre e importados ficam como estão). Verificado em produção: 195 com 864 caracteres e 194 com 655, com 📅.
- **Compor:** a prévia em branco chegava depois de abrir um informativo salvo e sobrescrevia o texto na tela; agora a prévia não roda enquanto o informativo carrega nem para os já enviados.
- **Atenção:** o informativo nº 193 (texto livre, criado pela equipe) está com texto vazio — não foi tocado. Outros campos de texto do painel com emoji (ex.: texto geral da Previsão) podem sofrer o mesmo corte: verificar.

## Radares/satélite na imagem, texto de informativos antigos e rodapé (30/10/2026) — PUBLICADO
- **Imagem de radar/satélite** (`lib/camadaImagem.ts`, `GerarImagemCamada.tsx`): todos os radares do Mapa (REDEMET Pico do Couto, Santa Teresa e **Mosaico Sudeste**; INEA mosaico, Guaratiba, Macaé, Mendanha, Sumaré; **Niterói**) com escolha do **produto** (MAXCAPPI/CAPPI, refletividade, precipitação, velocidade, MAXDISPLAY). No informativo (ícone do radar no card e arte 3:4) e no **Mapa**: botão **📷 Gerar imagem** no menu da camada, ao lado de Nenhuma/Satélite/Radar, que também gera **satélite** (GOES-19 cor verdadeira, IR realçado, canal 13, visível 02; REDEMET realçada, IR, visível) recortado só no estado do RJ. Legenda: "Radar X - atualização de HHhMM (hora local)" / "Satélite X - …". O proxy de imagem aceita também satélite REDEMET e GOES-19 (JPEG, até 12 MB). GOES-19 usa latitude linear (0,02°/pixel); as demais seguem o esticamento do Mapa.
- **Rodapé:** removidas "Fiquem atentos aos informativos e alertas emitidos por nossas fontes oficiais." e "Sigam o perfil @defesacivil_rj para informações atualizadas." (padrão do modelo e do rodapé configurado, e dos textos já gravados). Migração 0032 também devolveu aos nº 193, 194 e 195 o texto exatamente como foi enviado (colado pelo usuário).
- **Informativo antigo sem texto** (importado da planilha, que só tem a matriz): a API devolve o texto gerado pela matriz (sem gravar); antes o compositor abria em branco. A prévia do compositor também não sobrescreve mais o texto de um informativo salvo enquanto a matriz não mudar.
