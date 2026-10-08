# Aba "Resumo 24h" (07/10/2026)

Nova aba depois de **Alertas**. Código: `backend/api/resumo_views.py` (`GET /api/resumo/`),
`frontend/src/components/ResumoPanel.tsx`, tipos/fetch em `frontend/src/lib/api.ts`.

**Período:** botão *Últimas 24 h* (padrão) ou um *Dia* civil (hora de Brasília). Hoje = do 00h até agora.
Cache de 3 min no servidor; botão *Atualizar* e *Copiar resumo* (texto pronto para WhatsApp com o resumo e os Top 10).

## Sub-abas
1. **Resumo:** cartões (municípios com chuva, maior chuva, maior rajada, sirenes acionadas, maior Tmáx, menor Tmín, estações com dado, outros alertas) e a lista "Principais acontecimentos" (intensidade da chuva por município, municípios com rajada moderada ou mais, sirenes por município, risco meteorológico/hidrológico/geológico alto e avisos da Marinha vigentes).
2. **Top 10:** precipitação, rajada de vento, temperatura máxima e mínima (por estação, com município e fonte; clicar abre o histórico da estação).
3. **Previsão × Observado:** por REDEC, a previsão lançada para o dia (tabela `Previsao`) contra o que os sensores registraram.
4. **Cidades:** municípios com chuva (e intensidade), com rajada **Moderada a Muito forte**, ou todos com dados.

## Regras de cálculo
* **Chuva:** soma dos baldes; em "últimas 24 h" e "hoje" usa a mesma conta da tabela Precipitação (`_calcular_precipitacao`, com o valor oficial da fonte quando existe); dia passado = soma dos baldes do dia. Leituras `invalido` (LeituraQualidade) são ignoradas.
* **Tmáx/Tmín:** maior entre `temperatura_c` e `temperatura_max_c` / menor entre `temperatura_c` e `temperatura_min_c`; faixa física −5…48 °C.
* **Rajada:** maior `vento_rajada_ms` (≤ 60 m/s) em km/h. Faixas da tabela Ventos: Fraca < 18,6 · Moderada 18,6–52 · Forte 52–76 · Muito forte ≥ 76 km/h.
* **Intensidade da chuva no município** (maior estação no período): Fraca 0,2–10 mm · Moderada 10–30 · Forte 30–70 · Muito forte ≥ 70 mm (os cortes de 24 h do CEMADEN nacional; cores das faixas de chuva do painel).
* **Região (REDEC):** pelo município, a partir da tabela de risco geológico (`RiskAlert`), a mesma usada nos filtros por REDEC.

## Validação da previsão (critérios)
| Item | Regra |
|---|---|
| Tmáx / Tmín | observado = maior Tmáx / menor Tmín entre as estações da região; diferença ≤ 2 °C **Confere**, ≤ 4 °C **Atenção**, acima **Divergente** (mediana das estações no tooltip) |
| Chuva | "previu chuva" = ícone da previsão com chuva; "choveu" = ao menos uma estação ≥ 1 mm. Resultados: Acertou (previu e choveu / sem chuva), Falso alarme, Não previsto |
| Vento | classe do vento médio máximo (Fraco < 20 km/h · Moderado 20–40 · Forte > 40) contra a classe prevista (Fraco/Moderado e Moderado/Forte aceitam as duas classes) |

Limites conhecidos: o observado usa o extremo entre todas as estações da região (não a média), então tende a
superestimar Tmáx em regiões muito heterogêneas; regiões sem estação mapeada ou sem previsão aparecem com "—".
Verificado com dados locais de teste (previsões de teste só no banco local); em produção conferir com login.

## Correção de layout (08/10/2026)
A aba não rolava (o contêiner `<main>` é `overflow-hidden` e o painel não tinha altura própria) e no celular o conteúdo estourava a largura. O painel agora é `h-full overflow-y-auto overflow-x-hidden`; listas do Top 10 quebram em duas linhas (estação / município · fonte) e os grids usam `min-w-0`. Verificado em viewport de 375 px: conteúdo 1124 px dentro de 581 px visíveis, rolando, sem rolagem horizontal. Tabelas largas (Cidades, Previsão × Observado) rolam dentro do próprio quadro.
