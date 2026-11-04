# Verificação Previsto × Observado (04/11/2026)

Substitui as planilhas "Verificação_precipitação_2026" e "Max&Min". Tela: Produção → Meteorologia → Verificação. Código: `backend/core/verificacao.py`, `backend/api/verificacao_views.py`, `frontend/src/components/producao/Verificacao.tsx`.

## Regras decididas pelo usuário
* **Chuva observada** em uma REDEC no dia: alguma estação com **mais de 1 mm em 1 h** (hora cheia, horário local) **ou mais de 10 mm no dia civil**. Sem estação com dado = **em branco** (não é "não").
* **Previsto "com chuva"**: ícone da previsão da REDEC contém chuva (`*Chuva*`). Quando a planilha traz outro valor, a planilha prevalece (ver "Planilha × painel").
* **Grupos da contingência**: sempre as 11 REDECs, mais o total do estado.
* **Índices de Wilks**: acurácia, threat score, BIAS, FAR, POD e razão de possibilidades, mensais e anuais (aba "Índices"). A planilha antiga chamava de "razão de possibilidades" a conta (a+d)/(b+c); o painel mostra a de Wilks (a·d / b·c) e, ao lado, a da planilha.
* **Temperatura**: Tmax = maior entre `temperatura_c` e `temperatura_max_c`; Tmin = menor entre `temperatura_c` e `temperatura_min_c` (faixa −5 a 48 °C); leituras inválidas ou suspeitas ficam de fora; estações com menos de 6 leituras no dia não contam. Todas as estações meteorológicas disponíveis entram (não só as 45 da planilha). Região = extremo entre as estações da REDEC. Estação sem dado (Itatiaia, Forte de Copacabana) fica em branco.
* **Possível erro de dado**: valor 8 °C ou mais longe da mediana da REDEC, salto de 10 °C ou mais em relação ao dia anterior da mesma estação, ou Tmax < Tmin. O valor não é apagado; aparece com ⚠ e na lista "Possíveis erros" para o técnico avaliar.
* **Dias sem preenchimento**: ficam em branco e aparecem na lista "Sem dados".

## Dados
* `core.VerificacaoDia` (data, REDEC): previsto e observado de chuva e temperatura, mais os campos `*_painel` (sempre o que o painel calculou), estação do extremo, alertas e a lista `planilha` (campos finais que vieram da planilha).
* `core.TemperaturaEstacaoDia`: Tmax/Tmin do dia de cada estação (base dos extremos mensais por estação).
* Migração `0036_verificacao_diaria`.

## Rotinas
* **Diária**: carona no cron da REDEMET (15 min). Grava o dia anterior depois das 00h20 e o refaz uma vez depois das 06h (dados que chegam atrasados).
* **Histórico**: `POST /api/admin/verificacao/gravar/ {inicio, fim}` (superusuário, até 8 dias por chamada). Cobertura mínima para o painel afirmar chuva: 30 estações com leitura no estado no dia e 2 na REDEC; para temperatura, 10 estações.
* **Planilha**: `POST /api/admin/verificacao/importar/ {linhas}`. Valores presentes viram "da planilha" (prevalecem); os em branco ficam com o cálculo do painel. Repetível.
* **Diferenças**: `GET /api/verificacao/diferencas/` lista onde planilha e painel discordam (temperatura: mais de 0,5 °C).

## Situação dos dados (04/11/2026)
* O painel só tem leituras completas a partir de **setembro** (chuva) e do fim de setembro (temperatura). De janeiro a agosto os dias ficam em branco até a importação das planilhas.
* Outubro e novembro foram gravados pelo painel.

## Problemas das planilhas que o painel evita
Datas invertidas (3/6, 05/04), "29/02", `#REF!`, "0,0" em dia sem dado, erros de digitação ("ñão"), Rio Claro/Seropédica com máxima mensal errada, dias só com Previsto ou só com Observado (aparecem como "—").
