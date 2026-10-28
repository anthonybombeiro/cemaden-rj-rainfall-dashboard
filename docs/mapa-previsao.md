# Mapa → Previsão (CEMADEN-RJ por REDEC) — 20/10/2026 (revisado no mesmo dia)

Pedido do usuário: sub-aba em **Mapa** (ao lado de Estações e Contatos) com a previsão do CEMADEN-RJ no mapa das REDECs (sem mapa-base), exportável como post (logos do CEMADEN-RJ e da Defesa Civil). Na primeira versão o mapa tinha cartões ligados por linhas, que ficavam inutilizáveis no celular, e os cartões só mostravam ícone e mín/máx. **Refeita** após o retorno do usuário.

## O que mostra
* **Dados completos por REDEC** (cartão numerado 1–11): situação do tempo (texto + ícone), mín/máx, **umidade** (mín–máx), **vento** (velocidade/direção) e **comentário**. **Nascer e pôr do Sol de cada região** (campos da própria previsão, 🌅/🌇) em todos os cartões — tela, post, story e tabela.
* **Tela:** mapa (`public/redecs.geojson`, as 11 REDECs da previsão) pintado pela condição do tempo, com o número de cada região, e ao lado/abaixo os cartões. No PC, mapa fixo à esquerda e cartões em 2 colunas; **no celular, mapa em cima e cartões empilhados, sem linhas**. Clicar num número/cartão destaca a região.
* **Exportações (botões Story, Post do mapa, Tabela):**
  * **Story 1080×1920** (novo): cabeçalho com as duas logos, mapa, legenda e os 11 cartões em 2 colunas **com o comentário**. A letra do comentário diminui conforme o maior texto do dia (20 px até 110 caracteres … 12 px acima de 290) para o comentário **nunca ser cortado**. PNG de tamanho exato 1080×1920 (conferido).
  * **Post de feed 1080×1350 (4:5)** (substituiu o quadrado 760×760, onde umidade, vento e comentário eram cortados): mesmo conteúdo do story em formato menor, com o comentário ajustado ao espaço (`ajustarComentarioPx`).
  * **Copiar texto** (WhatsApp/Telegram) nos dois modais: uma entrada por REDEC com situação, mín/máx, umidade, vento, nascer/pôr do Sol e o comentário.
  * **Tabela** (`ShareModal` das abas de Ventos/Hidrologia): REDEC × situação × mín × máx × umidade × vento × Sol.
* Somente leitura (nunca grava previsão). Abre na última data com previsão; setas e calendário trocam o dia.

## Arquivos
`frontend/src/components/PrevisaoMapa.tsx` (tela + modal do story), `PrevisaoMapaCorpo.tsx` (mapa, cartões, post, story), `Dashboard.tsx` (sub-aba `previsao`).

## Como foi testado (antes de publicar)
Servidor local com dados simulados (11 REDECs, comentários curtos e longos), em tela de PC e de celular (375×812): rolagem, sobreposição, medidas dos cartões do story (`scrollHeight` × `clientHeight`) e exportação do PNG (1080×1920). Aprendizado: o service worker do site mantém o JavaScript antigo — limpar o cache ao testar.

## Pendências
* Conferir a legibilidade do post no Instagram com comentários reais mais longos.
* A previsão de hoje está com o mesmo comentário em todas as REDECs (58 caracteres): é como está cadastrado.

## Revisão de 20/10/2026 (tarde)
Retorno do usuário: o mapa ficou "quase perfeito"; faltavam nascer/pôr do Sol por região e, no post, a descrição e o vento. Feito: Sol por região em todos os formatos; post quadrado trocado pelo de feed 1080×1350 com todos os dados; texto para copiar com Sol. Teste: comentário curto (58 caracteres, real) e longo (216) — sem nenhum corte (medido por `scrollHeight`); com o longo a letra cai para 16 px (story) e 10 px (feed). Atenção ao testar: com o painel de navegação oculto a captura de imagem trava; trazer a aba à frente.

## Texto geral do estado (28/10/2026)
Card **"Previsão geral do estado"** logo abaixo do mapa e da legenda, **antes dos cartões das REDECs** (no celular, mapa → card → cartões). O texto é escrito no fim do cadastro (Meteorologia → Cadastro; clicar na caixa vazia traz uma proposta) e aparece também no Story, no Post, na Tabela e no texto copiado. Quando o comentário é igual nas 11 REDECs, as artes não o repetem nos cartões. Detalhes, regras, arquivos e testes em `previsao-comparacao-telegram.md` (§5).

### Revisão de 28/10/2026 (noite)
O texto geral virou o **1º dos 12 cartões** (mesmo tamanho dos das REDECs) em vez de um card largo; o Story e o Post têm rodapé em faixa azul de ponta a ponta; o pop-up de exportação cabe sem rolagem e fica acima da barra do celular; os ícones de umidade, vento e Sol são os da aba Previsão CEMADEN-RJ (Lucide). Detalhes em `previsao-comparacao-telegram.md`.

