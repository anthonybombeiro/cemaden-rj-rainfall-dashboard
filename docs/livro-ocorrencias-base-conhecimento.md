# Livro de ocorrências: base de conhecimento a partir dos e-mails reais (04/11/2026)

Análise dos **27 e-mails "Ocorrências Gerais" enviados pelo técnico de meteorologia** entre 05/10 e 03/11/2026 (turnos de 05/10 a 03/11), lidos na caixa do usuário a pedido dele. O objetivo é saber o que a equipe realmente informa, onde há retrabalho ou erro e o que o painel pode preencher sozinho no formulário do L.O. (Produção → Meteorologia → Livro de ocorrências). Nenhum endereço de e-mail está neste documento; os destinatários ficam só em Admin → Configuração do plantão.

> **Resposta curta à pergunta do usuário:** o L.O. publicado em 03/11 **não usou** estes e-mails; foi montado pelo procedimento 03 do protocolo. O formato real é diferente (ver §2 e §9), por isso o formulário precisa de ajuste.

## 1. Amostra e método

* 27 e-mails, 1 por turno de 24 h (07 h → 07 h), 4 destinatários (2 internos, 2 da GRIDLAB; em 05/10 eram 3).
* Enviados entre 06 h e 11 h do dia seguinte ao turno (em 09/10 e 03/11 saíram por volta de 11 h).
* Não há e-mail nos turnos de **17/10, 21/10 e 27/10** (ou foram enviados com outro assunto; a busca foi por remetente + "Ocorrências").
* Rodízio de 4 técnicos, cada um cobre as 24 h do turno (07–19 h e 19–07 h): Ana Carolina, Cauã, Kamyllin e Lucas.

## 2. Anatomia do e-mail

```
Assunto: Ocorrências Gerais - dd/mm/aaaa - 07h / 07h.

Data: dd/mm/aaaa
Plantão: 07h-19h
Operador: <nome>
Ocorrências:
  - <linhas em ordem aproximada de hora>
  - Técnico X encerrando o plantão das 07h - 19h.
  - Técnico X iniciando o plantão das 19h - 07h

Data: dd/mm/aaaa
Plantão: 19h-07h
Operador: <nome>
Ocorrências:
  - <linhas>
  - Técnico X encerrando o plantão das 19h - 07h.
  - Técnico Y iniciando o plantão das 07h - 19h.
[Obs.: texto livre]
-- assinatura fixa (endereço, e-mail institucional, telefone)
```

Diferenças para o L.O. que o painel gera hoje: o painel fala em **um** turno 07→07 com "técnico que encerra / inicia", e o assunto sai como `Ocorrências Gerais – dd/mm/aa hh/mmh`. O real tem **dois blocos** (dia e noite), assunto com ano de 4 dígitos e `07h / 07h.` (com ponto final), cada linha com hora e número do produto, e a assinatura fixa.

## 3. Catálogo das linhas de ocorrência

Frequência em 27 turnos. "Painel" diz se o painel já tem a informação.

| Linha | Quantas vezes | Hora típica | Painel hoje |
|---|---|---|---|
| Coletados os dados de temperatura (Tmax/Tmin) | 27 (bloco noturno) | sem hora | item de checklist `maxmin_obs` |
| Resumo das condições observadas | 27 | 06h30 (06h30 a 06h40; 07h16 em 29/10) | item `resumo_plantao` |
| E-mail "panorama do risco met./hidro./geo. + SRAAS" | 26 (faltou em 15/10) | 10h00 (21), 11h00 (3), 10h08 (1), 15h59 (1) | item `panorama` |
| Previsão para o dia seguinte | 27 | 15h30 (9), 15h31–15h59 (8), **16h ou depois (10)** | item `previsao_enviar`; hora real fica na marca |
| Briefing das condições meteorológicas nº/ano | ~2 por dia | noite ~17h42–18h50; manhã ~05h57–06h40 | itens `briefing_*`, **sem número** |
| Informativo meteorológico nº/ano (+ regiões e conteúdo) | 30 números em 30 dias (172 a 206) | qualquer hora | **sim** (nº, hora, regiões) |
| SMS de chuvas intensas (municípios não autônomos) | 12 | variada | parcial (Idap ligado ao informativo) |
| Alerta via Idap (chuvas intensas) | 8 | variada | parcial |
| Defesa Civil Alerta / Cell Broadcast | 1 (06/10, 23h19, Rio das Flores) | variada | **não** |
| Tendência meteorológica | 6 | 16h01 a 16h40 | item `tendencia`, **sem número** |
| Tabela dos 10 maiores acumulados 24 h | 8 | 06h00 a 06h28 | endpoint de acumulados (03/11) |
| Briefing extraordinário (maiores acumulados) | 1 (16/10, 22h50) | extraordinário | não |
| Previsão "nova" enviada pelo Painel | 1 (29/10, 20h41) | | previsão já é do painel |
| Obs. livre (infraestrutura) | 9 de 27 | | campo "outra ocorrência" |

Frases-modelo recorrentes (sempre com a hora "enviado às HHhMM"):

* `Informativo meteorológico n°NNN/2026 sobre <fenômeno> nas regiões <lista>, enviado às HHhMM.`
* `SMS sobre chuvas intensas para os municípios não autônomos das regiões <lista>, enviado às HHhMM.`
* `ALERTA VIA IDAP sobre Chuvas Intensas para o município autônomo da região <região> (<município>), enviado HHhMM.`
* `Briefing das condições meteorológicas n° NNN/2026 [postado no Instagram às HHhMM e] enviado às HHhMM.`
* `Tendência Meteorológica [nº NN/2026] [postada no instagram às HHhMM e] enviada às HHhMM.`
* `Técnico(a) X encerrando / iniciando o plantão das 07h - 19h.`

## 4. Horários reais × horários do checklist

* **Previsão do dia seguinte:** 10 de 27 saíram às 16h ou depois (de 16h00 até 20h06). O aviso do painel foi para 16 h por isso; manter o item do checklist em 15h30 só faz sentido como alvo, não como fato.
* **Briefing da manhã:** saiu em geral entre 05h57 e 06h12, e em vários turnos entre 06h16 e 06h34; o checklist marca 06:30. Briefing da noite: 17h42 a 18h50, checklist 18:00.
* **Tendência:** saiu 6 vezes (05/10 seg, 08/10 qui, 13/10 **ter**, 22/10 qui, 29/10 qui, 03/11 **ter**). O protocolo diz segunda e quinta: segundas de 12/10, 19/10, 26/10 e 02/11 não aparecem e duas terças aparecem. Divergência já conhecida; vale perguntar qual é a regra real.
* **Panorama:** às 10h00 em 21 de 26; atrasos de 1 h e um às 15h59.

## 5. Padrões de envio pela Idap e Cell Broadcast

* 21 envios em 27 turnos (12 SMS + 8 alertas "via Idap" + 1 Cell Broadcast); 14 turnos tiveram ao menos um.
* "SMS" e "Alerta via Idap" são usados para o mesmo canal; o texto muda de turno para turno. Recomenda-se um vocabulário único: **Idap (SMS)**, **Idap (SMS+TV)** e **Cell Broadcast**.
* Os destinatários são sempre descritos como **"municípios não autônomos" de uma lista de regiões**, com exceções pontuais ("município autônomo" Itaperuna, Magé; "Cachoeira de Macacu", "Carapebus e Quissamã"). Falta no painel uma lista de **municípios autônomos** para montar a frase sozinho.
* Dia de maior carga: 11/10 (4 alertas Idap, 3 informativos).
* Intervalo entre informativo e Idap costuma ser de minutos (ex.: Idap 13h45, informativo 13h52): dá para sugerir "registrar Idap" logo ao enviar o informativo.

## 6. Observações livres (9 de 27)

Todas são de infraestrutura e **se repetem copiadas** de um dia para o outro:

* Internet instável / com latência / que "para de funcionar": 10/10, 14/10, 18/10, 22/10 (4).
* VPN com problema: 13/10 e repetida em 15/10, mais dica de troca de senha em 16/10 (3).
* Computador travou: 12/10 (1).
* Ar-condicionado pingando: 05/10, consertado em 06/10 (2).

Sugestão: tratar como **pendência técnica** (categoria + data de início + "resolvido em") que aparece no topo do L.O. até ser fechada, em vez de redigitar o texto.

## 7. Inconsistências e erros encontrados (o que o painel evitaria)

| Problema | Onde |
|---|---|
| **Assunto com a data errada** (usa a data do envio, não a do turno) | 15/10 (assunto 14/10), 23/10 (assunto 24/10, duplicado com o de 24/10), 18/10, 19/10, 20/10 (assunto = Data + 1) |
| **Número de briefing errado, repetido ou fora de ordem** | 14/10 ("n° 5/2026"), 573 em dois turnos, 572 repetido em 12/10 e 14/10, 24/10 com 581 e 582 logo depois de 593 e 594, 31/10 sem o 609 |
| **Briefing com hora fora do bloco** | 06/10: "nº 560 postado às 18h50" no bloco noturno (mesma hora do 559) |
| **Informativos sem registro nos e-mails** | números 176, 190, 198, 202 e 205 |
| **Formato de hora** | `13h52`, `20:05`, `3h30`, `às 17h`, `às 15h30.` |
| **Concordância** | "Técnica/Técnico", Kamyllin/Kamilyn/Kamillyn, "Plantão: 07-19h" × "07h-19h" |
| **Ordem das linhas** | fora de ordem de hora (11/10, 15/10) |
| **Panorama ausente** | 15/10 |
| **Dois horários** | "postado no Instagram às X e enviado às Y" só em alguns dias |

## 8. O que dá para automatizar (por prioridade)

**A. Já está no painel; só falta ligar ao L.O.**

1. **Informativos** (nº, hora, regiões, texto-resumo): hoje entram, mas com frase diferente da usada pela equipe.
2. **Horas das marcas do checklist** (`feito_em`): previsão, tendência, briefings, resumo 06h30, panorama, Tmax/Tmin, acumulados. Cada linha do e-mail vira uma linha gerada pela marca.
3. **Operador e troca de turno:** o operador é quem marcou o checklist; as linhas "encerrando/iniciando" saem por modelo. Falta a **escala** (quem entra no próximo turno).
4. **Ordem cronológica** automática e formato de hora único (`HHhMM`).
5. **Assunto** na forma real (`Ocorrências Gerais - dd/mm/aaaa - 07h / 07h.`) com a **data do turno**.

**B. Pede um pequeno campo novo**

6. **Número no item do checklist** para briefing e tendência (sequencial por ano, sugerido pelo painel; elimina 573/572 repetidos, "5/2026" e 581 depois de 594).
7. **Duas horas** (postado no Instagram × enviado) como campos opcionais da marca.
8. **Registro de envio de alerta** (canal Idap-SMS / Idap-SMS+TV / Cell Broadcast, tipo, regiões ou municípios, hora, protocolo), que serve ao informativo, ao aviso e ao envio avulso.
9. **Lista de municípios autônomos** (configuração) para escrever "todos os municípios não autônomos" sozinho.

**C. Depende de produtos ainda não existentes no painel**

10. **Tendência e briefing** gerados no painel, com número automático.
11. **Pendências técnicas** com histórico (ver §6).

## 9. Mudanças propostas no formulário atual

1. Duas seções (07–19 h e 19–07 h), cada uma com Operador, linhas e as duas frases de troca.
2. "Ocorrências" automáticas por turno e por bloco, ordenadas por hora, com texto no padrão dos exemplos do §3.
3. Linhas manuais continuam, com tipo "infraestrutura" ligado ao item 11.
4. Saída: texto no formato real, assunto correto, assinatura fixa configurável, botão copiar (e "abrir e-mail" com destinatários).
5. Validação antes de gerar: número repetido ou fora de ordem, turno sem previsão, sem Tmax/Tmin, sem resumo 06h30.

## 10. Decisões que preciso do usuário

1. A regra real da tendência (segunda e quinta, ou outra)?
2. O L.O. do painel substitui o e-mail do técnico (mesmo texto) ou continua paralelo durante um período?
3. A escala dos técnicos entra no painel (quem inicia o próximo turno)?
4. Quais municípios são "autônomos"?
5. Vocabulário único para Idap/SMS/Cell Broadcast, como no §5?
6. Os turnos de 17/10, 21/10 e 27/10 tiveram L.O. por outro meio?

## 11. Resumo por turno

| Turno | Operador | Informativos | Envios Idap/SMS/CB (hora) | Previsão | Tendência | Briefings | Acum. | Obs |
|---|---|---|---|---|---|---|---|---|
| 05/10 | Kamyllin | 172 | SMS 16h00 | 17h20 | 16h01 | 557 | – | ar-cond. |
| 06/10 | Ana Carolina | 173–175 | SMS 17h18, 20h18; CB 23h19 | 15h43 | – | 559, 560 | 06h08 | ar-cond. ok |
| 07/10 | Lucas | – | SMS 11h44, 12h13 | 17h00 | – | – | – | – |
| 08/10 | Cauã | – | – | 16h57 | 16h12 | 563, 564 | – | – |
| 09/10 | Kamyllin | 177 | SMS 15h00 | 16h05 | – | 565, 566 | – | – |
| 10/10 | Ana Carolina | 178 | SMS 15h12 | 15h39 | – | 567, 568 | 06h06 | internet |
| 11/10 | Lucas | 179–181 | Idap 13h45, 15h35, 15h50, 21h14 | 15h33 | – | – | – | – |
| 12/10 | Ana Carolina | – | – | 16h54 | – | 571, 572 | – | computador |
| 13/10 | Kamyllin | 182 | SMS 11h00 | 15h30 | 16h04 | 573, 573 | – | VPN |
| 14/10 | Cauã | 183 | Idap 22h04 | 15h30 | – | "5", 572 | – | latência |
| 15/10 | Lucas | 184–186 | Idap 12h13 | 17h10 | – | – | sim | VPN |
| 16/10 | Cauã | 187–189 | Idap 10h59, 14h32 | 20h06 | – | 580 + extra | 06h01 | VPN |
| 18/10 | Ana Carolina | – | – | 15h30 | – | 583, 584 | 06h01 | internet |
| 19/10 | Lucas | – | – | 16h00 | – | 585, 586 | – | – |
| 20/10 | Cauã | – | – | 15h39 | – | 587, 588 | – | – |
| 22/10 | Ana Carolina | 191 | – | 15h30 | 16h40 | 591, 592 | – | internet |
| 23/10 | Cauã | – | – | 15h30 | – | 593, 594 | – | – |
| 24/10 | Kamyllin | 192, 193 | SMS 15h20 | 17h38 | – | 581, 582 | – | – |
| 25/10 | Ana Carolina | – | SMS 09h00 | 15h30 | – | 597, 598 | salva | – |
| 26/10 | Cauã | – | – | 15h30 | – | 599, 600 | – | – |
| 28/10 | Lucas | – | – | 17h00 | – | – | – | – |
| 29/10 | Ana Carolina | 194, 195 | SMS 07h01 | 15h41 (+20h41 Painel) | 16h01 | 605, 606 | 06h28 | – |
| 30/10 | Kamyllin | 196, 197 | – | 15h46 | – | 607, 608 | 06h00 | – |
| 31/10 | Lucas | 199 | – | 15h30 | – | 610 | – | – |
| 01/11 | Cauã | 200, 201 | SMS 15h05 | 15h48 | – | 611, 612 | – | – |
| 02/11 | Kamyllin | 203, 204 | – | 15h55 | – | 613, 614 | – | – |
| 03/11 | Ana Carolina | 206 | – | 15h30 | 16h08 (nº 88) | 615, 616 | – | – |
