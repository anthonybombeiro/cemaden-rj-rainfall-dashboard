# Marés + Condições de praia (Guarda-Vidas) — 20/10/2026

Pedido do usuário: verificar, nos links tideschart.com e tabuademares.com (Niterói), se há APIs ou fontes oficiais para os dados que esses sites mostram e implementar. Importância: Guarda-Vidas, praias, ondas e marés.

## O que os sites mostram × de onde tiramos
| Dado dos sites | Fonte no painel | Oficial? |
|---|---|---|
| Preamar/baixa-mar, hora e altura | Tábuas da Marinha (CHM/DHN), já existiam | Sim |
| Amplitude do dia, "coeficiente" | **Novo:** amplitude do dia e % da maior do mês (calculado da tábua) | Derivado de fonte oficial |
| Marés vivas/mortas | **Novo:** sizígia/quadratura pela fase da Lua | Cálculo astronômico |
| Sol nascer/pôr, duração do dia | Cálculo no navegador (conferido com INMET) | Cálculo |
| Fase, idade, iluminação e nascer/pôr da Lua | **Novo:** `lib/astroLua.ts` (conferido: lua nova 10/10 e quarto crescente 18/10/2026 batem com o almanaque) | Cálculo |
| Altura/período/direção das ondas, ondulação | **Novo:** Open-Meteo Marine (modelos ECMWF/WAM, DWD) | Modelo (não validado local) |
| Temperatura da água | **Novo:** Open-Meteo Marine (SST) | Modelo |
| Vento, rajada, temperatura, umidade, pressão, visibilidade, chance de chuva | **Novo:** Open-Meteo (NOAA/GFS, DWD, ECMWF) | Modelo |
| Índice UV (classes OMS) | **Novo:** Open-Meteo | Modelo |
| Período solunar, pesca, pontos de pesca, app | **Não incluído** (teoria não científica / comercial) | — |

Observações: o **tideschart** respondeu HTTP 402 à leitura automática (acesso pago); o **tabuademares** não cita nenhum órgão como fonte e diz que a temperatura da água é "algoritmo próprio, em desenvolvimento". Não há API pública oficial brasileira (Marinha/INMET/CPTEC) com ondas, temperatura da água e UV por ponto; por isso o complemento vem de **modelos numéricos via Open-Meteo** (gratuito, CORS aberto, uso não comercial), sempre rotulado como indicativo.

## Onde fica
Aba Meteorologia → **Marés**, abaixo do gráfico: cartões "Sol e Lua", "Maré", "Mar" e "Tempo" (hora escolhida; hoje = hora atual), **tabela hora a hora de 3 em 3 h** e uma faixa **"Atenção (indicativo de modelo)"**: ondas ≥ 1,5 m (mar agitado) e ≥ 2,5 m (possível ressaca), rajadas ≥ 50 km/h, UV ≥ 8. Pontos de consulta = coordenadas de cada porto da tábua (Niterói usa Ilha Fiscal).

## Limites
* Previsão de modelo para o ponto do porto, não para a praia; **não substitui** os avisos oficiais (Marinha, INMET, Defesa Civil — aba Avisos de mau tempo).
* Open-Meteo cobre de hoje a ~7 dias (e poucos dias para trás); fora disso aparece aviso.
* Se o Open-Meteo ficar fora do ar, o restante da aba (tábua, Sol, Lua, amplitude) continua funcionando.

## Arquivos
`frontend/src/lib/astroLua.ts`, `lib/condicoesPraia.ts`, `components/CondicoesDia.tsx`, `MaresPanel.tsx` (integração), `MareGrafico.tsx` (`hhmm` exportado e corrigido para não gerar "12:60").

## Proposta de continuação (não implementada)
Boletim por praia (Niterói, Rio, Cabo Frio, Arraial…) com coordenadas das praias e envio no formato Story; avaliar integrar medições reais (boias/estações costeiras) se houver acesso.

## Praias do Estado (20/10/2026, tarde)
Pedido do usuário: ter marés e condições para cada praia do Estado.
* **Lista:** `frontend/public/praias-rj.json` — **351 praias** nomeadas ("Praia…", "Prainha…") em **22 municípios**, do OpenStreetMap (© colaboradores do OpenStreetMap, ODbL) via Overpass; gerada por `backend/scripts/gerar_praias_rj.py` (tenta espelhos do Overpass, atribui o município pela malha do IBGE; praias na linha de costa usam o município do vértice mais próximo, até ~4 km). Sem município na malha = descartada. Maior cobertura: Angra dos Reis 83, Rio 57, Mangaratiba 40, Paraty 38, Búzios 25, Niterói 24. **Limite:** só entra o que está nomeado no OSM (litoral norte/Campos e Macaé têm poucas); para atualizar, rode o script e publique o JSON.
* **Na aba Marés:** caixa **Buscar praia** (sem acento, por nome ou município) ao lado do seletor de porto. Com uma praia escolhida:
  * **Maré:** do **porto da tábua mais próximo** (haversine) — a tela diz qual porto e a distância em km e avisa que horários/alturas são de referência. Portos disponíveis: Rio (Ilha Fiscal), Itaguaí, Ilha Guaíba, Angra, Arraial do Cabo (Forno), Açu (São João da Barra) e Macaé (Imbetiba). Praias distantes do porto (ex.: Itaipuaçu, 33 km do Rio) usam a referência e têm esse aviso.
  * **Sol, Lua, ondas, temperatura da água, vento, UV e tempo:** do **ponto da praia** (por isso Copacabana dá ondas de 1,5 m enquanto o porto na baía dá 1,0 m).
  * Teste: amostra de 39 praias (1 a cada 9) no Open-Meteo Marine — todas com onda e temperatura da água; Angra/Paraty (baías abrigadas) recebem o valor do modelo do mar aberto próximo, que **superestima** ondas dentro de baías.
* Arquivos novos: `lib/praias.ts`, `backend/scripts/gerar_praias_rj.py`, `public/praias-rj.json`; `MaresPanel.tsx` alterado.
