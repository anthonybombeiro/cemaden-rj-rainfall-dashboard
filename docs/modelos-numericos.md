# Modelos numéricos em grade (GFS e IFS) — mapa interativo (23/10/2026)

Pedido do diretor: levar os modelos globais abertos (ECMWF/IFS, NOAA/GFS e, depois, AIFS e ICON) para o painel como **mapa interativo**, na aba **Mapa** (camada sobre as estações) e na **Previsão numérica** (quadros comparáveis com MONAN, WRF, COSMO etc.), não como imagem estática.

## Arquitetura
```
GitHub Actions (a cada 3 h, minuto 40)  →  scripts/modelos/gerar_grades.py
   baixa só as mensagens GRIB2 necessárias (byte-range pelo índice), recorta o Sudeste (17°S–26°S, 50°W–38°W, 0,25°)
   →  branch `dados-modelos` (1 commit, sobrescrito):  gfs/meta.json, gfs/<var>.json, ifs/meta.json, ifs/<var>.json
navegador  →  https://raw.githubusercontent.com/anthonybombeiro/cemaden-rj-rainfall-dashboard/dados-modelos/...  (CORS aberto, gzip)
   →  frontend/src/lib/modelosGrade.ts  (leitura, produtos derivados, paletas, interpolação)
   →  frontend/src/components/modelos/*  (camada em canvas, controles, meteograma, mapa do quadro)
```
O **servidor HostGator não participa**: não lê GRIB (Python 3.9, sem shell, sem `eccodes`). Nada de credencial: o repositório é público e o workflow usa só o `GITHUB_TOKEN`.

* Workflow: `.github/workflows/modelos-grades.yml` (`workflow_dispatch` com `forcar=true` regera mesmo se a rodada já está publicada). Duração ~5 min (GFS 3 min + IFS 2 min).
* Escolha da rodada: a mais recente cujo arquivo-teste já existe (GFS: passo 240; IFS: passo 144, porque as rodadas 06/18 só vão a 144 h). Se a rodada já está publicada, não faz nada.
* Formato de cada `<var>.json`: `{modelo, run, var, un, nx, ny, lat0, lon0, dlat, dlon, passos, fator, nulo, dados:[[int16…]…]}` (linhas de norte a sul; valor real = inteiro / `fator`). ~0,45 MB cru, ~0,17 MB com gzip por variável; o painel só baixa as variáveis do produto escolhido.
* O catálogo (rótulos, unidades, passos) vem de `meta.json`; o painel não duplica a lista.

## Passos
* **GFS 0,25°:** 0–120 h de 3 em 3 h, 126–240 h de 6 em 6 h (61 passos). Fonte: AWS Open Data `noaa-gfs-bdp-pds` (idx por mensagem). A chuva (`APCP`) vem em blocos de 3/6 h e é transformada em acumulado desde o início da rodada.
* **IFS 0,25° (ECMWF Open Data, CC-BY-4.0):** 0–144 h de 3 em 3 h, 150–240 h de 6 em 6 h (65 passos; rodadas 06/18 terminam em 144 h). Fonte: `data.ecmwf.int` (índice `.index` JSON). O IFS 0,1° (novo em 20/10/2026) ainda não apareceu no caminho `0p1` em 22/10; entra quando publicado.

## Variáveis disponíveis (40 no GFS, 36 no IFS)
| Grupo | Produtos no painel |
|---|---|
| Chuva | acumulada nas últimas 3/6/12/24/48/72/96 h (diferença do acumulado) e total desde o início |
| Vento | 10 m (velocidade + setas), rajada, 925/850/700/500/250 hPa (velocidade + setas), em km/h |
| Superfície | temperatura e ponto de orvalho a 2 m, umidade relativa 2 m (no IFS calculada de T e Td), pressão ao nível do mar, água precipitável, umidade do solo (0–10 cm), refletividade simulada (só GFS), visibilidade (só GFS), altura da camada limite (só GFS) |
| Instabilidade | CAPE (IFS: `mucape`, parcela mais instável; GFS: de superfície), CIN (só GFS) |
| Nuvens | total, baixas, médias e altas |
| Altitude | altura geopotencial 850/500/250, temperatura 850/700/500, umidade relativa 850/700/500, velocidade vertical 700/500 hPa |

Há mais campos nos arquivos (IFS: radiação, fluxos, neve, tipo de precipitação, ondas…; GFS: dezenas de níveis e camadas); entram sob demanda — basta acrescentar uma linha em `VARIAVEIS` do gerador.

## Interface
* **Aba Mapa:** botão **Modelo numérico** (abaixo do zoom). Liga a camada, escolhe modelo/produto/transparência; barra de tempo com animação; legenda com o valor sob o cursor; **clique no mapa** abre o meteograma do ponto (chuva por 3 h, temperatura, vento e rajada; IFS e GFS juntos, com a linha “agora”). Fica abaixo das linhas de REDEC/município e das estações; clique em estação continua abrindo a ficha da estação.
* **Previsão numérica:** “IFS 0,25° (interativo)” e “GFS 0,25° (interativo)” viraram fontes nos quadros (grupos ECMWF e NOAA), com mapa próprio, a mesma hora **sincronizável** com MONAN/WRF/COSMO/Marinha e o mesmo meteograma. Padrão: quadro 1 = IFS, quadro 2 = MONAN.
* O campo é desenhado em canvas a cada pixel (interpolação bilinear), então fica nítido em qualquer zoom; setas de vento a cada 34 px.

## Limitações e cuidados
* Grade de ~25 km: não resolve chuva convectiva local; é guia sinótico e de tendência, não substitui a previsão local nem as estações.
* O painel mostra sempre a **última rodada publicada**; se o Actions falhar, a legenda mostra a data/hora da rodada (dado antigo fica evidente). `raw.githubusercontent.com` guarda cache de 5 min.
* Atribuição obrigatória: ECMWF Open Data (CC-BY-4.0) e NOAA/NCEP — aparece nos quadros e na legenda.
* Se o repositório sair de público, trocar `BASE_DADOS` (`NEXT_PUBLIC_DADOS_MODELOS`) ou publicar o branch em outro lugar.

## Próximas etapas combinadas
1. **AIFS** (ECMWF, IA; `aifs-single/0p25`) e **IFS 0,1°** quando disponível — mesmo gerador.
2. **Probabilidades** do ensemble (IFS ENS e GEFS): chuva acima de limiares, faixa p10–p90 no meteograma.
3. **ICON global (DWD)** — grade icosaédrica, exige regradeação (CDO ou interpolação própria); ICON-EU/D2 **não cobrem o Brasil**. Não confundir com o ICON-LAM 6,5 km da Marinha, que já está na aba.
4. Isóbaras/contornos de pressão e altura geopotencial, divisão de município no clique (ranking de maiores acumulados por município), alertas de limiar.
