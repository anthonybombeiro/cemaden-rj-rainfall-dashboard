# Mapa → Previsão (CEMADEN-RJ por REDEC) — implementado em 20/10/2026

Pedido do usuário: nova sub-aba dentro de **Mapa** (ao lado de Estações e Contatos) que mostre a previsão do CEMADEN-RJ no mapa dividido por REDEC (como o de Contatos, **sem** mapa-base do OpenStreetMap) e permita exportar uma imagem de post (como nas abas de Ventos e Hidrologia), com as logos do CEMADEN-RJ e da Defesa Civil.

## Como funciona
* **Dados:** a mesma previsão da aba Meteorologia (`fetchPrevisoes(data)`, uma por REDEC/dia; abre na última data com previsão cadastrada). Seletor de dia (◀ ▶ e calendário). Nada é escrito: a aba só lê.
* **Geometria:** `public/redecs.geojson` (as 11 REDECs da previsão: Baixada Fluminense, Baixada Litorânea, Capital, Costa Verde, Metropolitana, Norte, Noroeste, Serrana I e II, Sul I e II). O mapa de Contatos usa outra divisão (REDECs 1–11 da planilha, com "Serrana" única), por isso não serve para a previsão.
* **Desenho (`PrevisaoMapaCorpo.tsx`):** cada REDEC é pintada pela condição do tempo (céu claro, poucas nuvens, parcialmente nublado, nublado/encoberto, chuva, chuva e raios) e ganha um **cartão** com ícone, nome e **mín/máx** ligado à região por uma linha. Os cartões ficam no contorno do quadro, na mesma ordem geográfica das regiões, para não se sobrepor. Clicar numa região (ou cartão) abre os detalhes: umidade, vento, nascer/pôr do Sol e o comentário.
* **Exportação (`PrevisaoMapa.tsx` + `ShareModal.tsx`, o mesmo mecanismo da tabela de Ventos):**
  * **Post do mapa:** card quadrado 760×760 com cabeçalho azul, as duas logos, data, o mapa com cartões, legenda e nascer/pôr do Sol da Capital. Baixar PNG, copiar imagem, compartilhar (celular) e **texto pronto** para WhatsApp/Telegram (uma linha por REDEC com emoji, mín/máx e tempo).
  * **Post em tabela:** REDEC × tempo × mín × máx × vento.
* **Formatos de referência** (posts de 2021, 2022, 2024 e 2025 enviados pelo usuário): a base deste primeiro desenho é o mapa com cartões ligados às regiões; versões extras (story vertical 1080×1920, cartões por região no estilo de 2025) ficam como evolução se o usuário quiser.

## Arquivos
`frontend/src/components/PrevisaoMapa.tsx`, `PrevisaoMapaCorpo.tsx`, `Dashboard.tsx` (sub-aba `previsao`).

## Pendências
* Escolher, com a equipe, se o post deve trazer também o resumo textual do dia (hoje só o mapa, a legenda e o Sol) e se o story vertical é desejado.
* Conferir em campo a legibilidade do post no Instagram (cartões em 9–15 px num card de 760 px, exportado a 2×).
