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

### Revisão de 28/10/2026 (noite) — card do mesmo tamanho das REDECs, 12 cartões, rodapé, pop-up e ícones
Pedido do usuário depois de ver o primeiro formato (card largo acima das REDECs):

| Item | Como ficou | Arquivos |
|---|---|---|
| Card do texto geral | Agora é **um cartão do mesmo tamanho dos cartões das REDECs** e é o **1º dos 12** (1 geral + 11 REDECs). Mostra o título "Previsão geral", "Estado do Rio de Janeiro", o ícone do clima mais frequente entre as REDECs e o texto. Sem texto: na tela aparece um cartão âmbar de lembrete; nas artes não aparece (ficam 11 cartões) | `PrevisaoMapaCorpo.tsx` (`CartaoGeral`), `lib/meteorologia.ts` (`iconeDominante`) |
| 12 cartões divididos por igual | Previsão CEMADEN-RJ (grade de 1, 2, 3 ou 4 colunas), Mapa → Previsão (2 colunas ao lado do mapa), Story e Post (2 colunas × 6 linhas): o 12º cartão que antes era a mensagem da Defesa Civil agora é o texto geral, no 1º lugar | `MeteorologiaPanel.tsx` (`PrevisaoGeralCard`), `PrevisaoMapa.tsx`, `PrevisaoMapaCorpo.tsx` |
| Rodapé das artes | Faixa azul de ponta a ponta, como o cabeçalho, porém mais baixa (58 px no story, 46 px no post) e com **uma linha curta**: "Defesa Civil RJ · Previsão do CEMADEN-RJ · Emergência: 199 ou 193". O mapa do story ficou com 280 px e o do post com 200 px | `PrevisaoMapaCorpo.tsx` (`Rodape`) |
| Pop-up do Story e do Post | A prévia **cabe inteira, sem barra de rolagem**: a escala é calculada pela largura e pela altura que sobra depois do título e dos botões. O pop-up passou a ser desenhado no `<body>` (portal): no celular a barra inferior do painel cobria os botões "Compartilhar" e "Copiar texto" | `PrevisaoMapa.tsx` (`ExportModal`) |
| Ícones | Os cartões do Mapa → Previsão, do Story e do Post passam a usar os **mesmos ícones da aba Previsão CEMADEN-RJ** (Lucide: gota para umidade, vento, nascer e pôr do sol) no lugar dos emojis. A **Tabela** mostra a imagem do clima na coluna "Situação". **Os textos copiados continuam com emojis** (texto não leva imagem) | `PrevisaoMapaCorpo.tsx` (`CartaoRedec`), `ShareModal.tsx`, `lib/shareExport.ts` (`ShareLinha.icones`) |

Teste (banco de teste local, dados fictícios): 12 cartões de tamanho idêntico em todas as visões (grade da aba: 459 × 285 px; story: 218 px; post: 148 px); sem texto geral, 11 cartões e nenhum cartão cortado; pior caso (11 comentários diferentes de 200 caracteres + texto de 429) sem corte (texto geral a 14 px no story e 10 px no post); comentário repetido nas 11 REDECs some dos cartões das artes; pop-up sem rolagem no PC (1041 px) e no celular (375 px), com os 5 botões visíveis.

### Layout aprovado das artes — legenda em linha longa, mapa à esquerda, texto geral à direita (29/10/2026)
Pedido: o mapa do Story e do Post estava pequeno (uma faixa de 280 px / 200 px com o Estado ocupando só ~390 px de largura), ilegível, e os números cobriam quase uma região inteira. Foram três rodadas de modelo; a 1ª (mapa + texto geral no topo e 11 cartões abaixo) chegou a ser publicada e foi reprovada; as seguintes foram mostradas ao usuário por imagem antes de publicar. O formato final foi aprovado ("ficou maravilhoso").

| Item | Story 1080×1920 | Post 1080×1350 |
|---|---|---|
| Legenda de cores | **uma linha longa** sob o cabeçalho, sobre o mapa e o texto geral, com os rótulos completos (21 px) | idem (17 px) |
| Coluna da esquerda | mapa (~555×467) e **5 cartões**: Capital, Metropolitana, Baixada Fluminense, Costa Verde, Sul I | mapa (~524×355) e os mesmos 5 cartões |
| Coluna da direita | **texto geral** (até 32 px; 27 px com o texto de teste) e **6 cartões**: Sul II, Serrana I, Serrana II, Baixada Litorânea, Norte, Noroeste | texto geral (até 26 px) e os mesmos 6 cartões |
| Larguras | esquerda 553 px, direita 481 px (a esquerda é um pouco mais larga para o mapa) | 522 px cada |
| Cartões das REDECs | 221 px de altura; comentário em 20 px | 146 px; comentário em 15 px |
| Números das regiões | raio 15 (antes 17, sobre um mapa 2× menor) | raio 12 (antes 13) |

As duas colunas fecham na mesma altura (pesos flex: o bloco do mapa pesa o do texto geral + 1 cartão). Sem texto geral escrito, a legenda de cores em cartão ocupa o lugar dele, para a coluna da direita não ficar com buraco. Nada cortado na verificação local (banco de teste). Só os dois formatos exportáveis mudaram; a tela (aba Previsão e Mapa → Previsão) segue como estava. Arquivo: `PrevisaoMapaCorpo.tsx` (`CorpoArte` com `CFG_STORY`/`CFG_FEED`, `CartaoGeral` com `area`, `CartaoLegenda`).

### Mapa neutro com ícones e carrossel de 2 imagens — modelo em teste local (29/10/2026, NÃO publicado)
Motivo: a cor do mapa vinha do ícone do dia, então "sol com pancadas à tarde" (ícone com raios) pintava a região de roxo, igual a "tempestade o dia todo", e passava uma previsão errada. Decisão do usuário: tirar a cor e a legenda de cores, manter os números, pôr o ícone do tempo no mapa e as temperaturas no lugar do ícone do cartão. A previsão do INEA (só chuva) foi só referência; o diferencial do CEMADEN-RJ é emitir avisos de pelo menos 5 parâmetros.

| Item | Como ficou | Arquivo |
|---|---|---|
| Mapa | Regiões em cinza-claro, sem legenda de cores. Cada região tem o **ícone do tempo do dia** num círculo branco e o **número num selo** no canto. Marcadores que se sobrepõem (sudoeste do Estado) são afastados por um algoritmo determinístico e ligados à região por uma linha com ponto | `PrevisaoMapaCorpo.tsx` (`MapaRedec`, modos `numeros`, `icone`, `balao`; `afastar`) |
| Cartão da REDEC | **Mínima / máxima** grandes no canto onde ficava o ícone; situação por extenso (até 2 linhas, nunca cortada); umidade e Sol na 2ª linha; vento na 3ª; comentário | `CartaoRedec` |
| Story e Post (1 imagem) | A estrutura aprovada continua (mapa e 5 REDECs à esquerda; texto geral e 6 REDECs à direita); sem a linha de legenda, a coluna do mapa ficou mais larga (esq. 1,3 no Story e 1,15 no Post). Limite: o Estado é largo, então o mapa cresce com a largura, não com a altura | `CorpoArte`, `CFG_STORY`, `CFG_FEED` |
| Carrossel (novo botão na tela Mapa → Previsão) | **Slide 1**: mapa grande com um **balão por região** (ícone, máxima em vermelho, mínima em azul, número) e o texto geral embaixo. **Slide 2**: os 11 cartões com tipografia maior e, na 12ª célula, um mapa de referência só com os números. Pop-up com troca Post 4:5 / Story 9:16, abas dos slides, "Baixar este slide" e "Baixar os 2 slides" (um PNG por slide) | `SlideMapa`, `SlideDetalhes`, `PrevisaoMapa.tsx` (`ExportModal` com `slides`) |
| "Sol com pancadas à tarde" | Sem mudança de dados: usar o ícone já existente **Parcialmente nublado com chuva e raios** (Sol aparecendo + nuvem com raio) e o comentário "a partir da tarde". Opções futuras: campo "quando" (madrugada/manhã/tarde/noite) ou dois ícones | — |

Verificado: o PNG exportado (clique em "Baixar este slide") sai com os ícones do mapa embutidos (html-to-image trata `<image>` do SVG). Nada cortado nas verificações locais. A tela Mapa → Previsão também usa o mapa com ícones (sem legenda de cores). Sem migração.

### Marcadores em volta do mapa, estilo INEA — modelo em teste local (29/10/2026, NÃO publicado)
Pedido: no estilo do mapa do INEA, os ícones ficam **no entorno do mapa**, com uma linha curta indicando a região, nos dois modelos (imagem única e carrossel).

| Item | Como ficou |
|---|---|
| Posicionamento | `posicionarEntorno` (em `PrevisaoMapaCorpo.tsx`): rasteriza o contorno do Estado num canvas pequeno (passo de 6 px, com folga de 7 px), monta uma imagem integral da ocupação e, região a região, escolhe a posição livre mais próxima que não toque o Estado nem os marcadores já postos. As regiões da borda escolhem primeiro. Determinístico (mesma previsão, mesma imagem) |
| Linha | do ponto da região (centro da maior parte) até a borda do marcador; ponto escuro na região. As regiões do interior (Baixada Fluminense, Serrana) têm a linha mais longa |
| Imagem única (Story e Post) | marcadores só com **ícone do tempo e número**, em círculo branco; as temperaturas ficam no cartão. O mapa ficou um pouco menor que na versão com ícones sobre as regiões, porque precisa de margem em volta (40 px no Story e 36 px no Post) |
| Carrossel, slide 1 | **balões** com ícone, máxima (vermelho), mínima (azul) e número em volta do mapa, que ocupa quase a largura toda (margem de 36 px) |
| Tela Mapa → Previsão | continua com ícones sobre as regiões (modo `icone`) |

Modos de `MapaRedec`: `numeros`, `icone` (sobre a região, afastando sobreposições) e `entorno` (`comTemp` para balão). O modo `balao` anterior foi substituído por `entorno`. Sem migração.

### Post no modelo A e carrossel Story no modelo D — em teste local (29/10/2026, NÃO publicado)
Motivo: o cartão por região repetia no rodapé dados que o mapa já mostra (mínima, máxima, ícone). Foram propostos quatro modelos (A: mapa com balões e tabela por grupos; B: listas por parâmetro; C: mapas pequenos por parâmetro; D: balão completo e rodapé enxuto). Referências consultadas: seta de vento do Windfinder, mapa limpo do Met Office (MapTiler), símbolos da meteoblue, "modelo de estação" meteorológico. O usuário escolheu **A para o Post** e **D para o carrossel Story** (slide 1 = D; slide 2 = textos normais com os mesmos números).

| Peça | Como ficou | Arquivo |
|---|---|---|
| Post 1080×1350 (modelo A) | mapa com **balões** (ícone, máxima e mínima, número) em volta; faixa do **texto geral**; linha do **Sol do Estado** (faixa de horários, ex. 05:09–05:15); **tabela por 4 grupos** (Grande Rio, Sul do Estado, Região Serrana, Leste e Norte) com número, região, **umidade (texto e barra mínima–máxima)** e **vento**; **observações** só das regiões cujo comentário difere do mais repetido | `CorpoFeed`, `TabelaGrupos`, `LinhaSol`, `Observacoes` em `PrevisaoMapaCorpo.tsx` |
| Carrossel Story, slide 1 (modelo D) | balões **completos** em volta do mapa: ícone, máxima, mínima, umidade e vento (ex. "Fraco/Mod. NW-SW") e o número; embaixo só texto geral, Sol do Estado e observações | `SlideMapa`, `MapaRedec` (`balao.info`), `ventoCurto` |
| Carrossel Story, slide 2 | os **textos normais** de cada região (situação, mínima/máxima, umidade, vento, Sol e comentário **sempre mostrado**), com os **mesmos números** do slide 1, e um mapa de referência só com números na 12ª célula | `SlideDetalhes` |
| Posicionamento dos balões | mesma busca de espaço livre em volta do Estado, agora com **troca de posições entre pares** enquanto o comprimento total das linhas diminuir (desfaz cruzamentos) | `posicionarEntorno` |

Regras das observações: o comentário mais repetido (se vale para metade das REDECs ou mais) é tratado como o do texto geral e não se repete; só os diferentes aparecem, com número e nome. Sem texto geral escrito, o comentário comum aparece como observação geral. Os nomes dos grupos são sugestão e podem ser trocados. O botão **Story** (imagem única) continua no layout anterior; o carrossel passou a existir só em Story (o toggle Post/Story foi retirado). Sem migração.

### Ajustes pedidos depois de ver o modelo A e o D (29/10/2026, NÃO publicado)
- **Balões perto da região e em volta do mapa**, como na imagem aprovada: o posicionamento (`posicionarEntorno`) passou a ter uma **busca local** depois da escolha inicial. Cada balão tenta as posições livres e fica com a de menor custo (comprimento da linha + penalidade por cruzar outra linha ou outro balão); depois há troca de posições entre pares quando o custo total cai. Vale para o Post (A) e para o slide 1 do carrossel (D). A troca simples de pares da versão anterior foi substituída.
- **Post (A)**: tabela sem separação por grupos, listada pela numeração 1 a 11; **sem barra de umidade** (só "mín~máx %", ex. 69~100%); colunas **Região, Umidade, Nascer · Pôr do Sol e Vento** (o Sol agora é por região, e a linha do Sol do Estado saiu do Post); observações só das regiões cujo comentário difere (nenhuma coluna de observação).
- **Carrossel Story, slide 1 (D)**: balão completo mantido (ícone, máxima, mínima, umidade e vento), com a linha do Sol do Estado, o texto geral e as observações embaixo.
- **Carrossel Story, slide 2**: o **mapa de referência com os números vem primeiro** (canto superior esquerdo) e os cartões das regiões 1 a 11 depois.
Arquivo: `PrevisaoMapaCorpo.tsx` (`posicionarEntorno`, `TabelaRegioes`, `SlideDetalhes`). Sem migração.

### Posições dos balões desenhadas pelo usuário e ajustes dos modelos A e D (29/10/2026, NÃO publicado)
O usuário marcou sobre as imagens onde cada balão deve ficar (perto da região, em volta do mapa). Como o mapa tem sempre o mesmo contorno, as posições passaram a ser **fixas**, guardadas como fração do retângulo do Estado (`SLOTS_POST` e `SLOTS_STORY` em `PrevisaoMapaCorpo.tsx`; `MapaRedec` recebe `posicoes`). O posicionamento automático (`posicionarEntorno`) continua no código como alternativa quando `posicoes` não vem.

| Peça | Mudança |
|---|---|
| Post (A) | balões nas posições marcadas: o da Sul I sobe para o lugar que era do da Baixada Fluminense; **Capital, Baixada Fluminense e Metropolitana** ficam embaixo do mapa, nessa ordem, da esquerda para a direita; os demais ficam onde estavam. Voltou a **linha única do Sol do Estado** (faixa de horários). A tabela virou **uma região por bloco de duas linhas**: número, região, umidade (mín~máx) e vento; e, na 2ª linha, o **texto da região**. A observação criada pelo assistente foi **excluída** |
| Carrossel Story, slide 1 (D) | balões nas posições marcadas (5 no alto à esquerda, 6 à esquerda, 8 no alto no centro, 3 embaixo no centro, 2 à direita do 1, 9 à direita); **linha de observações excluída**; ficam o texto geral e o Sol do Estado |
| Carrossel Story, slide 2 | o cartão voltou ao **layout clássico** (ícone no canto, mín/máx em destaque, Sol à direita, umidade e vento embaixo, comentário); o mapa de referência com números continua primeiro, no canto superior esquerdo |

Como as posições são fixas, o mapa do Post encolhe conforme a tabela cresce (a imagem do mapa é escalada para a altura que sobra). Sem migração.

### Data por extenso, colunas do Post, linhas do slide 1 e numeração oficial das REDECs (29/10/2026, NÃO publicado)
- **Data nas artes** (Post, Story e carrossel): "Quarta-feira, 28/10/2026", com letra maior (78% do título, antes 60%) e em negrito. As tabelas e o texto copiado continuam com a data curta ("qua 28/10/2026").
- **Post (A)**: colunas da tabela ajustadas: **Região** (335 px), **Umidade centralizada** e **Vento no fim da tabela**, alinhado à direita.
- **Carrossel, slide 1**: a linha da Sul I termina um pouco à direita do centro da região (`AJUSTES_STORY`), para não encostar na da Sul II; o balão da Baixada Fluminense foi para a direita (fração 0,662 × 1,226 do mapa), de modo que a linha dela não passe mais sob o balão da Capital.
- **Numeração oficial das REDECs, global**: 1 Capital, **2 Baixada Fluminense, 3 Metropolitana**, 4 Costa Verde, 5 Sul I, 6 Sul II, 7 Serrana I, 8 Serrana II, 9 Baixada Litorânea, 10 Norte, 11 Noroeste (a mesma dos Contatos). A lista `REDECS` em `frontend/src/lib/api.ts` passou da ordem alfabética para a ordem oficial e é a única fonte: as artes (`ORDEM_REDEC`), os números do mapa e dos cartões, as tabelas e as listas do sistema que usam `REDECS` (cartões da aba Previsão CEMADEN-RJ, cadastro da previsão, filtro por REDEC) seguem essa ordem. As posições dos balões agora são guardadas **por nome da região**, não pela posição na lista. A ordem das frases do texto geral (`ORDEM_TEXTO`, como nos informativos) não mudou. O backend continua com a lista em ordem alfabética (só usada como escolhas do campo).

### Publicação das artes (29/10/2026) e mapa da aba Mapa → Previsão no modelo do carrossel
**Publicado em produção (só frontend, sem migração):** Post no modelo A, carrossel Story no modelo D (balões nas posições desenhadas pelo usuário), data por extenso nas artes, numeração oficial das REDECs (`REDECS` como fonte única), mapa neutro com ícones e balões em volta.

**Mapa da aba Mapa → Previsão (telas ≥ 1024 px):** usa o mesmo mapa do slide 1 do carrossel (neutro, balões completos nas posições `SLOTS_STORY`, com o ajuste `AJUSTES_STORY`), em duas colunas 7/5 com os cartões ao lado.
- **Clicáveis:** as regiões e também os balões. Clicar ilumina a região (azul-claro), contorna o balão e **destaca o cartão ao lado** (anel azul e fundo azul-claro) e o traz à vista; clicar de novo limpa.
- **Cartão ao lado:** layout clássico (ícone no canto, mín/máx, Sol, umidade, vento e comentário), uma coluna.
- Sem o mapinha só de números do slide 2 (os balões já levam o número).
- O mapa é limitado à altura da janela (`calc(100vh - 15rem)`) e fica fixo à esquerda enquanto os cartões rolam (a grade perdia o `sticky` por encolher junto com a janela; agora `shrink-0`).
- Telas estreitas (< 1024 px) mantêm os ícones sobre as regiões, porque os balões ficariam pequenos demais.

**Aba Meteorologia → Previsão CEMADEN-RJ:** os cartões ganharam o **número oficial da REDEC** num círculo azul-escuro antes do nome e seguem a ordem oficial (1 a 11).

### Correções do mapa da aba e do carrossel após o uso em produção (29/10/2026)
Problemas encontrados pelo usuário e correção:
- **Corte no mapa interativo:** o balão da Baixada Fluminense (agora número 2) ficava fora da área do SVG (altura 1150 para um conteúdo de ~1170) e era cortado. O mapa da aba usa agora a altura 1125 com as posições de `SLOTS_TELA` e foi conferido que todos os balões cabem na área.
- **Balões lado a lado:** em `SLOTS_TELA`, **Capital, Baixada Fluminense e Metropolitana** ficam em fila, na mesma altura, embaixo do mapa (posições desenhadas pelo usuário); as demais são as do carrossel.
- **Layout por tela:** celular (< 768 px): mapa de largura total no estilo do story, **ícones em volta do mapa ligados por linha** (posicionamento automático) e cartões em 1 coluna; tablet (768 a 1023 px): mapa de largura total com balões completos e cartões **2 a 2** embaixo; PC (1024 a 1535 px): mapa fixo à esquerda (7/12) e cartões em 1 coluna; PC largo (≥ 1536 px): mapa (6/12) e cartões **2 a 2**. A altura do mapa é limitada à da janela (`100vh − 19rem`) quando ele fica ao lado dos cartões.
- **Story sai, carrossel entra:** o botão **Story** foi retirado; o **Carrossel** (Story de 2 imagens) o substitui. Ficam Post, Carrossel e Tabela.
- **Botões do carrossel (Compartilhar e Copiar texto):** a barra de abas do carrossel não entrava no cálculo da altura do pop-up, e no celular os botões de baixo ficavam cortados. A barra entrou na conta; agora a prévia diminui e os botões (Baixar este slide, Baixar os 2 slides, Copiar imagem, Compartilhar no celular, Copiar texto) aparecem inteiros.
Arquivos: `PrevisaoMapa.tsx` (`useMediaQuery`, `ExportModal`), `PrevisaoMapaCorpo.tsx` (`SLOTS_TELA`). Sem migração.

