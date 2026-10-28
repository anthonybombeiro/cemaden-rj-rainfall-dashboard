# Previsão diária: o que o painel guarda × o texto do Telegram (28/10/2026)

Pedido do usuário: comparar a previsão que já é preenchida no painel com a que aparece no estudo (arquivo `Previsão_diaria - 10 Outubro`, o texto enviado ao grupo 00) e propor melhorias.

**Método (só leitura):** `GET /api/previsoes/?data=AAAA-MM-DD` em produção, com a sessão do usuário, para 23, 24, 25, 26, 27 e 28/10/2026, comparando temperatura máxima/mínima e umidade máxima/mínima das 11 REDECs com o docx (5 dias × 11 REDECs = 55 blocos). Nada foi gravado.

## 1. Resultado

| Item | Resultado |
|---|---|
| Temperatura e umidade por REDEC | **52 de 55 blocos idênticos**. Três divergências, todas em 27/10 (abaixo) |
| Dia sem previsão no painel | **26/10 (segunda-feira) não tem nenhum registro**, embora o texto do Telegram exista |
| Estrutura | **Uma diferença estrutural**: o painel guarda um *comentário por REDEC* (campo `comentario`, 200 caracteres) e o vento por REDEC (`vento_velocidade` + `vento_direcao`); o texto do Telegram traz **um único texto geral do estado que já inclui a frase do vento** ("Ventos fracos a moderados.") |

Divergências de 27/10:

| REDEC | Telegram (docx) | Painel | Leitura |
|---|---|---|---|
| Baixada Fluminense | U 99/60 | U **100**/60 | Ajuste manual na hora de enviar (99 em vez de 100) |
| Baixada Litorânea | U 99/60 | U **100**/60 | Idem |
| Noroeste | T 23/**13** | T 23/**18** | Provável erro de digitação em um dos dois; 13 é coerente com 26/10 (13) e com a Serrana (12) |

## 2. A diferença estrutural, com os números

* Comentários no painel: 1 texto igual nas 11 REDECs em 24, 25, 27 e 28/10; **2 textos diferentes em 23/10** (6 REDECs e 5 REDECs), enquanto o Telegram usa **um texto só** ("…especialmente nas regiões ao sul do estado").
* A frase do vento do Telegram **não existe** no painel como texto, mas **dá para gerá-la** com o que já está cadastrado: a união das classes de vento das REDECs (`Fraco` … `Forte`) e a direção mais frequente. Reproduzi três dias: 23/10 ("fracos a moderados"), 24/10 ("fracos a moderados"), 25/10 ("fracos a moderados, predominantemente de Noroeste-Sudoeste" = a direção `NW-SW` que mais aparece).
* O texto do Telegram às vezes é **mais curto** que o comentário do painel (24/10: o painel diz "pancadas isoladas de chuva moderada a ocasionalmente forte, que podem vir com raios e rajadas…"; o Telegram diz "pancadas isoladas de chuva, com raios e rajadas…"). Ou seja, quem monta o Telegram edita à mão. Por isso o texto geral precisa ser **um campo próprio e editável**, não só uma cópia do comentário.
* O texto do Telegram sai **na ordem das REDECs do estudo**: Costa Verde, Sul I, Sul II, Capital, Baixada Fluminense, Serrana I, Serrana II, Metropolitana, Baixada Litorânea, Norte, Noroeste. O painel ordena por ordem alfabética (Baixada Fluminense primeiro).

## 3. Propostas

| # | Proposta | Onde | Esforço |
|---|---|---|---|
| P1 | **Texto geral do estado** (campo único por dia, editável), sugerido a partir do comentário mais frequente + frase do vento gerada | Meteorologia → Cadastro (`PrevisaoForm`) | Médio (modelo `PrevisaoDia` + migração) |
| P2 | **Frase do vento automática** ("Ventos fracos a moderados, predominantemente de Noroeste-Sudoeste"), com as regras acima; o técnico só ajusta | `lib/previsaoTexto.ts` (novo) | Fácil |
| P3 | **Botão "Texto do Telegram"** no formato exato do estudo (cabeçalho, texto geral, 11 REDECs na ordem do estudo, legenda) | `PrevisaoMapa.tsx` + `PrevisaoForm.tsx` | Fácil |
| P4 | **Aviso de dia sem previsão** a partir das 15 h 30 ("Hoje ainda não há previsão cadastrada") e de **amanhã**; selo na aba | `Dashboard.tsx` (selo), `PrevisaoForm.tsx` | Fácil |
| P5 | **Validações ao salvar**: Tmin < Tmax; umidade 0–100; diferença entre Tmin da REDEC e a mediana das outras acima de 6 °C pede confirmação (pegaria o 13 × 18 do Noroeste); ícone de chuva com comentário "sem previsão de chuva" (e o inverso) | `PrevisaoForm.tsx` + `PrevisaoSerializer` | Fácil |
| P6 | **Regra única da umidade máxima** (o Telegram usa 99 quando o painel tem 100): decidir se o teto é 99 ou 100 e aplicar nos dois | Decisão + `PrevisaoForm.tsx` | Fácil |
| P7 | **Cadastro uma vez, saídas várias**: o mesmo registro alimenta mapa, Story, Post, Telegram, Tendência (faixa de temperatura) e o catálogo de sistemas atuantes | Já parcialmente; completar com P1 | Médio |
| P8 | **Ordem das REDECs** do estudo em todas as saídas de texto e tabela | `PrevisaoMapa.tsx` (ordenação) | Fácil |

### Como fica o texto (exemplo gerado para 28/10 com os dados do painel)
```
SEDEC-RJ
CEMADEN-RJ
PREVISÃO METEOROLÓGICA PARA QUARTA-FEIRA (28/10)

Céu parcialmente nublado a encoberto, sem previsão de chuva significativa. Ventos fracos a moderados.

REDEC
COSTA VERDE
T Max/T Min 25/15°C
U Max/U Min 95/65%

SUL I
T Max/T Min 25/14°C
U Max/U Min 95/50%
… (11 blocos, na ordem do estudo)
TMax - Temperatura máxima; TMin - Temperatura Mínima; UMax - Umidade Relativa do Ar Máxima; UMin - Umidade Relativa do Ar Mínima.
```

### Teste proposto (antes de publicar)
Gerar o texto de 23, 24, 25, 27 e 28/10 com os dados do painel e comparar com o docx: devem ficar iguais, exceto os itens já listados (umidade 99/100 e Noroeste 27/10), que passam a ser sinalizados pelas validações.

## 4. Decisões que pedem resposta
1. O teto da umidade é 99 ou 100?
2. O texto geral é escrito pela meteorologista no painel (e o painel gera o do Telegram) ou continua sendo montado à mão a partir do comentário?
3. O comentário por REDEC continua existindo (é o que aparece na arte e no mapa) ou passa a ser opcional?
