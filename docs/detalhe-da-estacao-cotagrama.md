# Detalhe da estação — baldes de 1 h/24 h, cotagrama, tooltips e compartilhar gráfico (07/10/2026)

Pedido do usuário (a partir de prints do detalhe de "Rio das Flores", do cotagrama do INEA e do gráfico do
SGB/CPRM "SACE"): (1) o "balde" de chuva do topo mostrava só a **última leitura**, inútil para o monitoramento
— deve ser sempre **1 h e 24 h**; (2) o gráfico de nível das estações hidrológicas não tinha **linhas de cota**
nem a **chuva** (barras), como no INEA e no SGB; (3) **detalhes ao passar o mouse/dedo** no gráfico; (4) botão
**compartilhar o gráfico**, como na tabela Ventos. Relacionados: `tabelas-individuais-por-fonte.md`,
`registro-de-acoes.md`; cotas: ver a memória "hidrologico-cotas" (`CotaHidrologica`, editável no Admin).

## 1. Baldes de chuva 1 h e 24 h
- Novo endpoint `GET /api/stations/{id}/detalhe/` (`StationViewSet.detalhe`): devolve `acumulado_1h_mm`,
  `acumulado_24h_mm`, `oficial` (true quando o valor é o **oficial da fonte**, ver
  `tabelas-individuais-por-fonte.md` §5) e as `cota` (atenção/alerta/inundação/extrema, cm).
- Os cards "Chuva 1 h" e "Chuva 24 h" (`BaldeAcumulado` em `Gauges.tsx`) substituem o antigo "Chuva (últ.
  leitura)"; o preenchimento é proporcional (fundo de escala 50 mm em 1 h e 100 mm em 24 h) e a **cor segue as
  faixas do painel** (1 h: Fraca/Moderada/Forte/Muito forte; 24 h: 10/30/70 mm). O rodapé diz a origem: "valor
  oficial da fonte" ou "soma das leituras gravadas".

## 2. Cotagrama (aba "Nível do rio" do histórico)
`CotagramaChart.tsx`, no padrão do cotagrama do INEA e do SACE do SGB:
- **Dois painéis empilhados (revisão de 07/10 noite):** a **chuva em barras** no painel de cima (eixo da direita "Chuva (mm)")
  e, separado por um espaço, o **nível** em linha + área no painel de baixo (eixo da esquerda "**Nível (m)**" — sem "do rio", pois
  há estações de córregos, lagoas e canais). Antes as barras ficavam coladas na curva do nível.
- **Linhas das cotas com os nomes e as cores da tabela Hidrológicos** (`COTA_ESTILOS`): **Atenção** (laranja), **Alerta**
  (vermelho), **Transbordo** (roxo) e **Extrema** (rosa tracejada, só se couber). Os valores são os mesmos da tabela
  (`CotaHidrologica`, em cm no banco, em m no gráfico); o que divergia era nome ("Inundação") e cor.
- Baldes de chuva de **15 min** (intervalo ≤ 36 h), **1 h** (≤ 8 dias) ou **1 dia**; a chuva vem das leituras gravadas da estação.
- **Eixo X:** até 36 h, horários (HH:MM); em **semana e mês, só a data (dd/mm)** em divisas de dia, no máximo ~7 marcas (antes
  as legendas de data e hora se sobrepunham).
- **Escala:** por padrão inclui as cotas quando elas não "achatam" o nível (maior cota ≤ 5 × o nível máximo); o botão
  "Ajustar escala ao nível / Mostrar todas as cotas" alterna. A legenda lista só as cotas desenhadas.
- Estações **sem cotas cadastradas** (13 na planilha INEA/CPRM) mostram só nível e chuva e a nota "Estação sem
  cotas cadastradas".

## 3. Detalhes ao passar o mouse/dedo (tooltips)
- **Cotagrama:** linha-guia + ponto + cartão com data/hora, nível (m e cm), **situação pela cota** (chip colorido igual
  ao da tabela Hidrológicos), chuva do intervalo, chuva acumulada no período até ali e as três cotas (realçadas quando
  já ultrapassadas).
- **Histórico (demais variáveis)** e **Precipitação acumulada:** o mesmo tipo de cartão (valor/hora e mín-máx do
  período; chuva do intervalo e acumulada até aqui). `touch-action: pan-y` permite rolar a página com o dedo.

## 4. Compartilhar gráfico (revisão de 07/10 noite)
Identificação do card (padrão pedido pelo usuário, para estações hidrológicas):
- **Título (cabeçalho azul):** `<Município> — Nível do <rio monitorado> (m)` (ex.: "Rio das Flores — Nível do Ribeirão Manoel Pereira (m)"; sem rio cadastrado: "Nível (m)").
- **Linha 1:** `<nome da estação> - <Região Hidrográfica>`.
- **Linha 2 (sem repetir o município):** `<REDEC> - Nível (m) - <período>`.
Nos demais gráficos o título usa o nome da variável no lugar do rio. O gráfico em modo imagem é mais alto (viewBox 520) e
preenche o card de 760×760 (legenda termina a ~97% da altura útil, sem estourar). O texto copiado segue a mesma identificação.
Os dados (município, rio, região hidrográfica, bacia) vêm de `GET /stations/{id}/detalhe/`; a REDEC, do mapa município→REDEC.

### 4.1 Versão anterior
Botão "📤 Compartilhar gráfico" nas seções **Precipitação acumulada** e **Histórico por período** (todas as
variáveis). Reaproveita o `ShareModal` da tabela Ventos (card quadrado fixo 760×760 com cabeçalho azul e logos,
baixar/copiar imagem, compartilhar nativo no celular, copiar texto): `ShareData` ganhou `corpo` (conteúdo do card:
nome da estação, resumo em 4 quadros e o gráfico em modo imagem) e `textoPronto` (texto WhatsApp/Telegram, ex.:
nível, situação, chuva 1 h/24 h, cotas, mín/máx do período, fonte).

## 5. Teste
Local (SQLite de teste, só local): estação Rio das Flores com cotas reais da planilha (213/284/355 cm) e série
sintética de nível/chuva — baldes 1 h/24 h, cotagrama com 3 cotas, barras de chuva, tooltip e o modal de compartilhar
(resumo, gráfico e botões) verificados no navegador. Produção: rota `detalhe` existe (403 sem login), frontend
publicado.

## 6. Hidrológicos e ordem das abas (revisão de 07/10 noite)
- **Ordem:** nas estações hidrológicas, **"Nível do rio (m)" vem na frente de "Chuva acumulada"** no "Histórico por período" e é a
  aba aberta por padrão.
- **Tabela Hidrológicos — coerência dos valores:** as colunas de chuva já usavam o **valor oficial da fonte** (mesma lógica
  documentada em `tabelas-individuais-por-fonte.md` §5). Faltava coerência entre janelas: ao trocar só algumas janelas pelo
  oficial, as que seguiam calculadas por nós podiam ficar **menores** que uma janela contida (ex.: nosso 6 h = 2 mm abaixo do oficial
  de 4 h = 5 mm). `_garantir_janelas_coerentes` sobe essas janelas calculadas para o maior valor das janelas menores (as oficiais
  não são alteradas). Teste: oficiais 1 h 0 / 4 h 5 / 24 h 12 / 96 h 40 → 6 h e 12 h passam a 5, 48 h a 12 e 168 h a 40.
  Vale para todas as tabelas que usam o oficial (Precipitação, Hidrológicos, detalhe).
- Nova ação admin somente leitura `cotas_hidro` (cotas e inventário das 67 estações com cota: rio, região hidrográfica, bacia).
  Achado: 52 de 67 têm cotas no padrão atenção = 60% e alerta = 80% do transbordo (valores derivados da planilha INEA/CPRM).
