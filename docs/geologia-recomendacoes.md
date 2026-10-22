# Aba Geologia — Recomendações de alarme (22/10/2026)

Pedido do usuário: automatizar e gerar banco de dados para os produtos feitos à mão e lançados em planilhas de controle. Primeiro produto: a planilha **"Recomendação Cemaden"** (2020: 25 linhas) das recomendações de acionamento de sirene por risco de deslizamento.

## Estrutura da interface
* Nova aba principal **Geologia** (ícone de montanha), no lugar de **Sirenes**. Sub-abas:
  1. **Sirenes** — a antiga aba, inalterada (tabela, filtros, exportação, compartilhar);
  2. **Recomendações** — consulta em **cartões** ou **tabela**, com resumo, filtros e CSV;
  3. **Cadastrar recomendação** — formulário.
* Mobile: a barra inferior mostra **Geologia** no lugar de Sirenes; as três sub-abas ficam na faixa abaixo do menu.

## Banco de dados (`core.RecomendacaoAlarme`, migração `0020_recomendacao_alarme`)
Campos pedidos: **número da recomendação** (`NN_AAAA`, único), **município** (um dos 92, canônico), **data**, **hora**, **probabilidade de deslizamento** (Baixa/Moderada/Alta/Muito Alta), **estação pluviométrica**, **índice alcançado**, **gatilho** (I–IV), **acionaram?** (sim/não), **sirenes acionadas**, **responsável**, **observação**.
Campos extras que a planilha já trazia: **mm/1h, mm/24h, mm/96h, mm/30 dias** (numéricos, alimentam os quadradinhos do cartão e o texto do índice) e **estágio operacional** (Atenção/Alerta/Alerta máximo). Controle: origem (`painel`/`planilha`), criado/atualizado por e em.
* **Número automático:** próximo sequencial do ano da data (01_2026, 02_2026…); pode ser digitado à mão (formato `NN_AAAA`, não repete).
* **Responsável:** pré-preenchido com o nome do usuário logado.
* **Índice alcançado:** se o texto ficar vazio é montado dos valores (ex.: `54 mm/1h · 435,8 mm/30d`).
* **Validações:** município inválido, número fora do formato/duplicado, chuva fora de 0–2000 mm, e "sirenes acionadas" preenchidas com "Acionaram? = Não".

## API (`/api/recomendacoes/`, sessão + CSRF como o resto do painel)
CRUD; **qualquer usuário logado cria e edita, só superusuário apaga**. Filtros `?ano= &municipio= &data_inicio= &data_fim= &acionaram=true|false &probabilidade= &gatilho= &q=`; `GET /proximo-numero/?data=`; `GET /resumo/` (total, acionaram, % de acatamento, por probabilidade, por município, por ano). Também no Admin do Django.

## Cadastro (formulário)
Município → sugere as estações e sirenes **daquele município** (do cadastro do painel; texto livre continua permitido); probabilidade e gatilho em botões; "Acionaram?" Sim/Não (Sim abre o campo de sirenes, com atalhos `+ nome` das sirenes do município). Mesma tela serve para **editar** (lápis nos cartões/tabela).

## Consulta
Resumo no topo (recomendações, acionaram, não acionaram, % de acatamento), filtros (ano, município, probabilidade, gatilho, acionaram, busca de texto), cartões com barra colorida pela probabilidade, etiquetas (probabilidade, gatilho, estágio, acionaram SIM/NÃO), chuva 1h/24h/96h/30d, sirenes e observação; tabela com todas as colunas da planilha; **CSV** (abre no Excel) respeitando os filtros.

## Testes
Backend: `python manage.py test api.test_recomendacoes` (4 testes: login, número automático e por ano, validações, filtros/resumo/edição/exclusão). Frontend: servidor local (backend sqlite + frontend dev), cadastro pelo formulário, 3 registros extras, filtro, tabela, edição, sub-aba Sirenes e celular (375×812). **Produção:** só a migração foi aplicada e a leitura conferida (lista vazia) — **nenhum dado de teste foi gravado em produção**.

## Implantação (22/10/2026)
Arquivos enviados por SFTP (`models.py`, migração, `admin.py`, `serializers.py`, `views.py`, `urls.py`, `settings.py`); migração aplicada por `POST /api/admin/migrate/` (sessão do superusuário); frontend publicado. `settings.py` ganhou `CSRF_TRUSTED_ORIGINS` por variável de ambiente (vazio em produção; serve ao teste local com o frontend em outra porta).

## Pendências / próximos passos
* **Importar as 25 recomendações de 2020** (e as demais planilhas) — comando/ação de importação ainda não criado; aguardando autorização do usuário para gravar dados históricos em produção.
* Sugerir o **gatilho atingido** automaticamente a partir das chuvas informadas e dos limiares do município (`GatilhoPluviometrico`, 13 municípios).
* Preencher **mm/1h, 24h e 96h** automaticamente a partir da estação escolhida (acumulados do painel).
* Próximas planilhas de controle a migrar (informar quais).


---

# 2ª etapa (22/10/2026, tarde): fluxo envio → validação, 13 municípios, mensagem e planilha 2020–2026

O usuário enviou a planilha atualizada (`Planilha_Recomendação (Sirene)_2020_a_2026.xlsx`, 8 abas), um exemplo da mensagem de envio e três ajustes. O que a planilha mostrou e o que mudou:

## O que a planilha tem (estudo)
* **Abas:** Recomendação_2020 … 2026, uma 2021_2022 (repete 2022; só as linhas de 2021 entram) e **"Acionamento pelo Município"** (mobilizações feitas pelo próprio município, sem recomendação).
* **Colunas variam por ano:** 2023–2026 têm só "Índice alcançado" em texto (`46.2 mm em 1 hora + 522.4 em 30 dias`); 2020–2022 têm também mm/1h, 24h, 96h, 30d; 2020 tem "Estágio operacional"; na aba 2021_2022 a última coluna, chamada OBSERVAÇÃO, é na verdade o **responsável**.
* **"Sirenes acionadas"** é, quase sempre, uma **quantidade**; os nomes vêm na observação (ou, em 2020, no próprio campo).
* **Uma recomendação pode cobrir várias estações** (5 linhas: 17/2020, 07, 08, 19 e 42/2022). Sujeiras: "Muiot Alta", "Muito Ata", gatilho "l"/"i", datas com ano 2011, números pulados (30/2024, 37/2022), "RADAR"/"perguntar ao tiago" no índice.
* **13 municípios** (Areal, Barra Mansa, Barra do Piraí, Bom Jardim, Cachoeiras de Macacu, Duque de Caxias, Magé, Nova Friburgo, Petrópolis, Queimados, São Gonçalo, São João de Meriti, Teresópolis) — exatamente os que o painel já tem com gatilhos; Angra é autônomo e fica fora.

## Mudanças no cadastro
1. **Fluxo em duas etapas.** Primeiro envia-se a recomendação; depois vem a validação. `acionaram` agora pode ser **vazio ("Aguardando validação")**, com `sirenes_qtd` (quantidade) além do texto com os nomes, e `validado_por/validado_em` registrados na primeira validação. Cartões e tabela mostram o selo âmbar e o botão **Validar**; o resumo passa a ter "Aguardando validação" e o **% de acatamento é sobre as já validadas**.
2. **Só os 13 municípios** nos formulários e na API (os que têm `GatilhoPluviometrico`); `GET /api/recomendacoes/municipios/` devolve a lista com os limiares dos gatilhos.
3. **Gatilho sugerido:** ao digitar as chuvas, o formulário mostra os limiares do município e quais gatilhos foram atingidos (I: 1 h; II: 1 h + 24 h; III: 1 h + 96 h; IV: 1 h + 30 dias), com botão "usar IV".
4. **Mensagem de envio** (botão do avião no cartão/tabela e "Cadastrar e gerar mensagem"): usa o mesmo modal "Compartilhar" das tabelas de vento — **card em imagem** (cabeçalho azul com as duas logos, município grande, título "RECOMENDAÇÃO DE MOBILIZAÇÃO n° 48/2026", data, hora, pluviômetro, gatilho), **copiar imagem/texto**, baixar e compartilhar no celular. Texto igual ao exemplo:
```
SEDEC-RJ
CEMADEN-RJ

*TERESÓPOLIS*

RECOMENDAÇÃO DE MOBILIZAÇÃO n° 48/2026
Data: 30/09/2026
Hora: 18h56
Pluviômetro: Quinta do Lebrão 1
Gatilho: I

Fonte: CEMADEN-RJ - SEDEC
```
5. **Nova sub-aba "Acionamentos do município"** (modelo `AcionamentoMunicipio`, `/api/acionamentos-municipio/`): município (92), data, hora, probabilidade, sirene(s), tipo de alarme, quantidade, responsável/usuário do município, observação — lista, filtros, CSV, cadastro e edição.
6. **Vários pluviômetros na mesma recomendação:** o campo "estação" aceita texto com mais de um nome (ex.: `A + B`); os campos de mm guardam os maiores valores e o texto do índice guarda todos. (Se virar rotina, evoluir para lista de estações.)

## Importação dos dados existentes
* `backend/scripts/preparar_recomendacoes_planilha.py` lê o .xlsx (datas e horas reais, sem ambiguidade dia/mês), normaliza (município canônico, probabilidade, gatilho, sim/não, quantidade × nomes de sirenes, mm do texto) e gera `backend/core/data/recomendacoes_planilha.json` + `docs/recomendacoes-planilha-relatorio.md` (**28 pontos a conferir**).
* **Resultado:** **273 recomendações** (2020: 25, 2021: 17, 2022: 45, 2023: 57, 2024: 58, 2025: 23, 2026: 48) e **26 acionamentos do município**. Todas as recomendações da planilha estão validadas (SIM/NÃO).
* `core/importacao_recomendacoes.py` (`manage.py importar_recomendacoes [--dry-run]` e `POST /api/admin/importar-recomendacoes/`, só superusuário): idempotente — número que já existe é pulado, nada é sobrescrito.
* **Estado em produção:** migração 0021 aplicada e **simulação (`dry_run`) conferida no servidor: 273 + 26 novos**; **a gravação ainda não foi feita — aguarda a autorização do usuário**.

## Testes
Backend (`manage.py test api.test_recomendacoes`, 8 testes): fluxo de validação, só 13 municípios, resumo com pendentes, acionamentos do município e a importação completa (273 + 26, idempotente, conferência da 48/2026). Frontend: servidor local com a planilha importada (273 cartões), mensagem idêntica ao exemplo, cadastro com sugestão de gatilho, "Cadastrar e gerar mensagem", validação, aba de acionamentos e celular.
