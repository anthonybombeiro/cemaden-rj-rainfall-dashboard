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

## 5. Implementado em 28/10/2026 (pedido do usuário)

Decisões do usuário: o **texto geral** é um card próprio, escrito no fim do cadastro e exibido **antes das REDECs e junto ao mapa** em todas as visualizações; **aviso diário a partir das 15 h 30** de "amanhã sem previsão"; **validações ao salvar** (ex.: mínima fora do padrão das outras REDECs); **teto de umidade = 100 %**.

### O que mudou
| Item | Como ficou | Arquivos |
|---|---|---|
| Texto geral (dados) | Modelo `PrevisaoDia` (um texto por data, até 600 caracteres, uma linha), migração `0026_previsao_dia`; rotas `GET/PUT /api/previsoes/texto-geral/?data=` e `GET /api/previsoes/cobertura/?datas=` | `core/models.py`, `core/migrations/0026_previsao_dia.py`, `api/serializers.py`, `api/views.py`, `core/admin.py` |
| Texto geral (cadastro) | Card "Texto geral do estado" abaixo do formulário, com contador "n/11 REDECs lançadas". **Clicar na caixa vazia traz o texto proposto**; "Propor texto"/"Refazer proposta" refaz; salvar grava. Chip "Texto geral" na barra das REDECs; ao salvar a 11ª REDEC a tela rola até o card | `components/PrevisaoForm.tsx`, `lib/previsaoTexto.ts` |
| Texto proposto | Comentário mais usado entre as REDECs (se pelo menos metade concorda) ou, sem isso, frase montada com as imagens do clima ("Céu parcialmente nublado a encoberto, com previsão de chuva nas regiões …") + frase do vento ("Ventos fracos a moderados, predominantemente de Noroeste-Sudoeste." quando 4 ou mais REDECs têm a mesma direção). Mostra avisos ("só 8 de 11 REDECs", "5 REDECs têm comentário diferente") | `lib/previsaoTexto.ts` (`proporTextoGeral`) |
| Onde aparece | Meteorologia → Previsão CEMADEN-RJ (card antes das REDECs); Mapa → Previsão (card logo abaixo do mapa e da legenda, antes dos 11 cartões, também no celular); Story e Post (card de destaque entre mapa e cartões); Tabela (destaque no topo); texto copiado (abre a mensagem). Sem texto, a tela mostra um lembrete âmbar; as artes simplesmente não mostram o card | `PrevisaoMapaCorpo.tsx` (`CartaoTextoGeral`), `PrevisaoMapa.tsx`, `MeteorologiaPanel.tsx`, `ShareModal.tsx`, `shareExport.ts` |
| Artes sem repetição | Se o comentário é **igual nas 11 REDECs** e há texto geral, ele **não se repete nos cartões** das artes (já está no card geral); se forem diferentes, aparecem. No story o mapa encolhe de 290 para 250 px e no post de 215 para 180 px para abrir espaço | `PrevisaoMapaCorpo.tsx` (`comentarioRepetido`) |
| Aviso das 15 h 30 | Faixa âmbar no topo: "A previsão de amanhã (qui 29/10) ainda não foi cadastrada: faltam as 11 REDECs e o texto geral do estado" (ou "está incompleta: faltam 3 REDECs e o texto geral…"). **Só depois das 15 h 30 (Brasília)**, volta a checar a cada 2 min com a aba visível, some quando as 11 REDECs **e** o texto geral estão salvos. Botões "Cadastrar agora" (abre Meteorologia → Cadastro já no dia seguinte) e "Lembrar em 30 min". Ponto âmbar na aba Meteorologia (menu superior e barra inferior do celular) | `components/PrevisaoAmanhaBanner.tsx`, `Dashboard.tsx`, `MeteorologiaPanel.tsx`, `PrevisaoForm.tsx` (`dataInicial`) |
| Teto da umidade | Umidade máxima de **100 %** é aceita (mínima ≤ máxima, faixa 0–100 no formulário e no servidor). Não há mais ajuste para 99. O servidor também confere temperatura entre −10 e 50 °C | `PrevisaoForm.tsx`, `api/serializers.py` |

### Validações ao salvar
Bloqueiam (como antes): mínima maior que a máxima; umidade mínima maior que a máxima; umidade fora de 0–100; temperatura fora de −10…50 °C; imagem do clima não escolhida.

**Não bloqueiam — abrem "Confira antes de salvar" com a lista e os botões "Voltar e corrigir" / "Salvar mesmo assim":**
| Conferência | Regra |
|---|---|
| Mínima ou máxima fora do padrão | Diferença para a **mediana das outras REDECs do dia** (precisa de 4 ou mais já lançadas), **descontando o jeito habitual da região** (mediana dessa mesma diferença nos últimos 14 dias, se houver 4 ou mais dias): alerta acima de **4 °C**; sem histórico, acima de **7 °C** |
| Umidade mínima fora do padrão | Mesma lógica; 20 pontos com histórico, 25 sem |
| Amplitude | Máxima − mínima menor que 3 °C ou maior que 18 °C |
| Salto em relação a ontem | Máxima ou mínima da mesma REDEC mudou mais de 8 °C |
| Imagem × comentário | Comentário fala em chuva e a imagem não tem chuva (e o inverso); comentário cita raios e a imagem não tem raios |
| Data | Anterior a hoje ou a mais de 7 dias |

Exemplo real do teste local: Serrana II com mínima 18 °C (habitual 5 °C abaixo da mediana das outras) + salto de 9 °C em relação a ontem + comentário com chuva e imagem "Céu claro" = 3 pontos listados.

### Limites conhecidos
* O erro do Noroeste em 27/10 (mínima 18 em vez de 13) **pode não ser pego**: 18 fica perto da mediana das outras REDECs; só aparece se a diferença passar de 4 °C do que é habitual para o Noroeste ou se houver salto de mais de 8 °C em relação ao dia anterior. As conferências reduzem erros grosseiros, não substituem a revisão.
* A conferência do histórico depende da API dos últimos 14 dias; se falhar, vale só a comparação com as outras REDECs do dia.
* O "Lembrar em 30 min" é guardado só no navegador de quem clicou.
* Não foi feito: botão "Texto do Telegram" no formato do estudo (P3) e ordem das REDECs do estudo (P8) nas saídas de texto — aguardam decisão.

### Testes
* Backend: `api/test_previsao_dia.py` (8 testes: login, texto vazio, gravar/atualizar, limite de 600, cobertura, cobertura completa, padrão hoje/amanhã, umidade 100 e temperatura fora da faixa); suíte `api` completa: 27 testes OK.
* Funções puras (`lib/previsaoTexto.ts`) exercitadas em script: proposta com comentário em comum, direção predominante, chuva só pelas imagens, comentários divergentes, parcial (3 de 11), mínima fora do padrão sem e com histórico (Serrana habitualmente 8 °C mais fria não gera alerta; 16 °C gera), amplitude, data, imagem × comentário.
* Navegador (backend e front locais, banco SQLite de teste, dados fictícios): aviso das 15 h 30, "Cadastrar agora" abrindo o cadastro em 29/10, modal de conferências com 3 pontos, salvar mesmo assim, card do texto geral (clique traz a proposta; salvar), card em Previsão CEMADEN-RJ e em Mapa → Previsão, Story e Post sem corte nem estouro mesmo no pior caso (11 comentários distintos de 200 caracteres + texto geral de 429 caracteres: 0 cortados), comentário repetido ocultado, Tabela com destaque, celular em 375 px.
