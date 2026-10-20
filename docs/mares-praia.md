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
