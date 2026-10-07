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
- **Nível do rio** em linha + área (m), eixo esquerdo.
- **Linhas das cotas** em cores fixas: atenção (amarelo), alerta (laranja), inundação (vermelho) e extrema (rosa
  tracejada, só se couber na escala), com rótulo e valor em m (as cotas estão em cm no banco).
- **Chuva em barras penduradas do topo**, eixo da direita invertido (0 no topo), como no INEA. Baldes de **15 min**
  (intervalo ≤ 36 h), **1 h** (≤ 8 dias) ou **1 dia**; a chuva vem das leituras gravadas da própria estação.
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

## 4. Compartilhar gráfico
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
