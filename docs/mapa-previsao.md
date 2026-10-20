# Mapa → Previsão (CEMADEN-RJ por REDEC) — 20/10/2026 (revisado no mesmo dia)

Pedido do usuário: sub-aba em **Mapa** (ao lado de Estações e Contatos) com a previsão do CEMADEN-RJ no mapa das REDECs (sem mapa-base), exportável como post (logos do CEMADEN-RJ e da Defesa Civil). Na primeira versão o mapa tinha cartões ligados por linhas, que ficavam inutilizáveis no celular, e os cartões só mostravam ícone e mín/máx. **Refeita** após o retorno do usuário.

## O que mostra
* **Dados completos por REDEC** (cartão numerado 1–11): situação do tempo (texto + ícone), mín/máx, **umidade** (mín–máx), **vento** (velocidade/direção) e **comentário**. Nascer/pôr do Sol da Capital na legenda.
* **Tela:** mapa (`public/redecs.geojson`, as 11 REDECs da previsão) pintado pela condição do tempo, com o número de cada região, e ao lado/abaixo os cartões. No PC, mapa fixo à esquerda e cartões em 2 colunas; **no celular, mapa em cima e cartões empilhados, sem linhas**. Clicar num número/cartão destaca a região.
* **Exportações (botões Story, Post do mapa, Tabela):**
  * **Story 1080×1920** (novo): cabeçalho com as duas logos, mapa, legenda e os 11 cartões em 2 colunas **com o comentário**. A letra do comentário diminui conforme o maior texto do dia (20 px até 110 caracteres … 12 px acima de 290) para o comentário **nunca ser cortado**. PNG de tamanho exato 1080×1920 (conferido).
  * **Post quadrado 760×760** (mesmo `ShareModal` das abas de Ventos/Hidrologia): mapa numerado + 11 cartões compactos (situação, mín/máx, umidade, vento); texto pronto para WhatsApp/Telegram com **todos os campos e o comentário**.
  * **Tabela**: REDEC × situação × mín × máx × umidade × vento.
* Somente leitura (nunca grava previsão). Abre na última data com previsão; setas e calendário trocam o dia.

## Arquivos
`frontend/src/components/PrevisaoMapa.tsx` (tela + modal do story), `PrevisaoMapaCorpo.tsx` (mapa, cartões, post, story), `Dashboard.tsx` (sub-aba `previsao`).

## Como foi testado (antes de publicar)
Servidor local com dados simulados (11 REDECs, comentários curtos e longos), em tela de PC e de celular (375×812): rolagem, sobreposição, medidas dos cartões do story (`scrollHeight` × `clientHeight`) e exportação do PNG (1080×1920). Aprendizado: o service worker do site mantém o JavaScript antigo — limpar o cache ao testar.

## Pendências
* Conferir a legibilidade do post no Instagram com comentários reais mais longos.
* A previsão de hoje está com o mesmo comentário em todas as REDECs (58 caracteres): é como está cadastrado.
