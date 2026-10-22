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
