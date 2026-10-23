# Modelos numéricos em grade — mapa interativo (23/10/2026)

Pedido do diretor: levar os modelos globais abertos (ECMWF, NOAA, DWD) para o painel como **mapa interativo** — na aba **Mapa** (camada sobre as estações) e na **Previsão numérica** (quadros comparáveis com MONAN, WRF, COSMO etc.) — e não como imagem estática. Ordem executada: GFS e IFS → AIFS e IFS 0,1° → conjuntos (probabilidades) → ICON → contornos e ranking por município.

## Arquitetura
```
GitHub Actions (a cada 3 h, minuto 40; 7 jobs em paralelo)  →  scripts/modelos/gerar_grades.py
   baixa só as mensagens necessárias (GRIB2 por byte-range; ICON por arquivo .bz2), recorta o Sudeste
   →  job "publicar": branch órfão `dados-modelos` (1 commit, sobrescrito): <modelo>/meta.json e <modelo>/<var>.json
navegador  →  https://raw.githubusercontent.com/anthonybombeiro/cemaden-rj-rainfall-dashboard/dados-modelos/...  (CORS aberto, gzip, cache 5 min)
   →  frontend/src/lib/modelosGrade.ts (+ modelosExtras.ts)  →  frontend/src/components/modelos/*
```
O **servidor HostGator não participa** (Python 3.9, sem shell, sem `eccodes`). Nenhuma credencial: repositório público e `GITHUB_TOKEN`.

* Workflow: `.github/workflows/modelos-grades.yml`. Cada modelo é um job (`matrix`) que só gera se a rodada ainda não está publicada (`--so-se-nova`); `workflow_dispatch` com `forcar=true` regera tudo. Duração total ~8–10 min (o mais lento é o IFS ENS, ~8 min).
* Arquivos: `gerar_grades.py` (determinísticos), `conjuntos.py` (IFS ENS e GEFS), `icon.py` (ICON). Dependências em `requirements.txt` (`eccodes`, `numpy`, `requests`, `scipy`).
* Formato de `<var>.json`: `{modelo, run, var, un, nx, ny, lat0, lon0, dlat, dlon, passos, fator, nulo, dados:[[int16…]…]}` (linhas de norte a sul; valor real = inteiro / `fator`). Cada variável traz a **sua** grade (as de ondas têm malha própria). `meta.json` traz o catálogo (rótulo, unidade, grupo, paleta, faixa, passos) — o painel não duplica a lista.
* As mensagens GRIB são validadas (`GRIB`…`7777`) e baixadas de novo se vierem truncadas.

## Modelos
| id | Modelo | Grade/recorte | Passos | Observação |
|---|---|---|---|---|
| `ifs` | ECMWF IFS 0,25° | Sudeste, 0,25° | 3 h até 144 h, 6 h até 240 h | rodadas 06/18 só até 144 h |
| `ifs01` | ECMWF IFS 0,1° (~9 km) | **só o RJ** (20,2–24,2°S, 45,2–40,6°W), 0,1° | 3 h até 144 h | só superfície (arquivos 6× maiores) |
| `aifs` | ECMWF AIFS (IA) | Sudeste, 0,25° | 6 h até 360 h | sem rajada, CAPE nem umidade relativa (UR de níveis calculada de T e q) |
| `gfs` | NOAA GFS 0,25° | Sudeste, 0,25° | 3 h até 120 h, 6 h até 240 h | chuva em blocos de 3/6 h convertida em acumulado |
| `icon` | DWD ICON global 13 km | Sudeste, **regridado para 0,125°** | 3 h até 120 h, 6 h até 180 h | ver abaixo |
| `ifsens` | ECMWF ENS, 50 membros | Sudeste, 0,25° | 6 h até 240 h | estatísticas do conjunto |
| `gefs` | NOAA GEFS, 31 membros | Sudeste, 0,25° | 6 h até 240 h | estatísticas do conjunto |

**ICON:** os dados abertos vêm na grade icosaédrica nativa (2,9 milhões de células) em um arquivo `.grib2.bz2` por variável/passo/nível, com CLAT/CLON (graus). O gerador recorta as células ao redor do domínio e interpola por inverso da distância (3 células) para uma grade regular de 0,125°, sem precisar do CDO. ICON-EU (6,5 km) e ICON-D2 (2,2 km) **não cobrem o Brasil**; não confundir com o ICON-LAM 6,5 km da Marinha (aba Previsão numérica, grupo Marinha).

## Variáveis dos modelos determinísticos (≈ 40 a 58 por modelo)
| Grupo | Produtos no painel |
|---|---|
| Chuva | acumulada nas últimas 3/6/12/24/48/72/96 h, total desde o início, **convectiva** (6/24/72 h), taxa instantânea (mm/h) |
| Vento | 10 m e 100 m (GFS: 80 m) com setas, rajada, 925/850/700/500/250 hPa com setas — em km/h |
| Superfície | T e Td a 2 m, UR 2 m, sensação térmica (GFS), pressão (nível do mar e superfície), água precipitável, umidade do solo 0–10 cm, escoamento superficial (IFS), refletividade simulada, visibilidade e camada limite (GFS), altura da isoterma de 0 °C (ICON) |
| Ondas | altura significativa (+ direção em setas), período médio/de pico — IFS, AIFS e GFS-wave (stream `wave`/`gfswave`) |
| Instabilidade | CAPE, CAPE da camada de 180 hPa, CIN, Lifted Index, helicidade 0–3 km (os dois últimos e CIN: GFS) |
| Nuvens | total, baixas, médias, altas |
| Altitude | altura geopotencial 850/700/500/250, T 925/850/700/500, UR 925/850/700/500, umidade específica 925/850/700, vento nos 5 níveis, velocidade vertical 700/500 |
| **Derivados (no navegador)** | divergência 850 e 250 hPa, vorticidade relativa 850 hPa, cisalhamento 925–500 hPa, fluxo de umidade 850 hPa (q·V, com setas), índice de calor, Tmax e Tmin das últimas 24 h |

## Conjuntos (IFS ENS e GEFS)
Para cada passo de 6 h o gerador baixa chuva, T 2 m, vento 10 m e rajada de **todos os membros** (e altura de onda no IFS ENS) e grava campos estatísticos:
* **Probabilidades:** chuva ≥ 5/15/30 mm em 6 h; ≥ 10/25/50/100 mm em 24 h; ≥ 25/50/100 mm em 48 h; ≥ 50/100/150 mm em 72 h; T ≥ 35 °C; T ≤ 12 °C; vento 10 m ≥ 40 km/h; rajada ≥ 50 e ≥ 70 km/h; ondas ≥ 2 m e ≥ 3 m (IFS ENS).
* **Percentis e média:** chuva total (média, mediana, p90 — “cenário chuvoso”), chuva em 6/24/48/72 h (média, p50, p90 calculados sobre a janela de cada membro), T 2 m (p10/p50/p90/média), vento e rajada (p50/p90), altura de onda (p50/p90).
* **No meteograma:** as faixas dos conjuntos aparecem junto dos modelos — temperatura com faixa p10–p90 e chuva acumulada com mediana e p90.

## Interface
* **Aba Mapa:** botão **Modelo numérico** (abaixo do zoom): modelo (determinísticos e conjuntos), produto, **contornos** (isóbaras a cada 2 hPa, altura geopotencial 850/700/500/250, T 850, isoterma de 0 °C), transparência, barra de tempo com animação, legenda com valor sob o cursor, **ranking por município** (máximo e média do produto dentro de cada município; clique voa até o município) e **clique no mapa** para o meteograma (chuva por 3 h, chuva acumulada, temperatura, vento e rajada de IFS, IFS 0,1°, AIFS, ICON e GFS, mais as faixas dos conjuntos). A camada fica abaixo das estações e das linhas de REDEC/município.
* **Previsão numérica:** IFS, IFS 0,1°, AIFS, ICON, GFS, IFS ENS e GEFS entram como fontes dos quadros (grupos ECMWF, NOAA e DWD), com mapa próprio, a mesma hora **sincronizável** com MONAN/WRF/COSMO/Marinha, contornos, ranking e meteograma. Padrão: quadro 1 = IFS, quadro 2 = MONAN.
* O campo é desenhado em canvas por pixel (bilinear), nítido em qualquer zoom; as setas e os contornos (marching squares) são redesenhados ao mover/ampliar.

## Auditoria: o que ficou de fora e por quê (23/10/2026)
Comparei o que cada fonte publica com o que o painel mostra.
| Fonte | Existe e **não** foi incluído | Motivo / destino |
|---|---|---|
| IFS/AIFS | neve (`sf`, `sd`, `rsn`, `asn`), gelo (`sithick`), `zos`, `lsm` | irrelevantes para o RJ |
| IFS/AIFS | `ptype` (tipo de precipitação) | categórico; no RJ quase só chuva |
| IFS/AIFS | radiação (`ssr`, `ssrd`, `str`, `strd`), **OLR (`ttr`)**, tensão do vento (`ewss`, `nsss`), `skt`, `sot`, solo em camadas profundas | fluxos são acumulados (exigem derivar taxa); **OLR é bom indicador de convecção — candidato à próxima etapa** |
| IFS/AIFS | `mx2t3`/`mn2t3` | substituídos por Tmax/Tmin 24 h derivados da T 2 m |
| IFS/AIFS | `vo`, `d` (vorticidade/divergência) | calculadas no navegador a partir de u e v |
| IFS/AIFS | `tciw`, `tclw`, `tcrw` (água de nuvem/chuva/gelo na coluna) | uso restrito |
| IFS/AIFS | níveis 1000, 600, 400, 300, 200, 150, 100, 50, 10 hPa | os níveis usados cobrem a rotina; entram sob demanda |
| IFS 0,1° | níveis de pressão | arquivo ~6× maior; fica só superfície no recorte do RJ |
| GFS | ~700 campos/passo: Tmax/Tmin, vorticidade absoluta, CWAT, ICEC, categóricos (CRAIN…), fluxos de calor, médias de radiação, solo profundo, outros CAPE (90-0, 255-0), teto de nuvens | redundantes, categóricos ou pouco usados; incluir é só acrescentar uma linha em `VARIAVEIS` |
| GEFS / ENS | CAPE, pressão, nuvens e vento em níveis; **IFS ENS tem 80+ parâmetros** | foco em chuva, temperatura, vento, rajada e ondas (o que decide alerta) |
| ECMWF | **trajetórias de ciclones tropicais (BUFR)**, `aifs-ens` (404 em 22/10), média/desvio prontos do ENS (`em`/`es` não publicados no caminho aberto) | ciclones fora do foco do RJ; AIFS ENS: reavaliar quando o caminho aparecer |
| NOAA | GFS-wave: ondulação (SWELL 1–3), vento-mar (WVHGT/WVPER/WVDIR) | há altura/período/direção principais; ondulação separada fica como próxima etapa |
| DWD | ICON: níveis de modelo (qv, qc, qi, tke), fluxos radiativos, neve, solo, lagos, `rain_gsp` | `tot_prec` cobre a chuva; níveis de modelo são pesados e exigem pós-processamento |
| DWD | ICON-EU, ICON-D2, ICON-EPS | **não cobrem o Brasil** |

## Limitações e cuidados
* Grade de ~25 km (ICON 13 km, IFS 0,1° 9 km): guia sinótico e de tendência; **não substitui** as estações, o radar nem a previsão local. Chuva convectiva isolada some em 25 km.
* O painel mostra sempre a **última rodada publicada**; se o Actions falhar, a rodada (data/hora) aparece na legenda. `raw.githubusercontent.com` guarda cache de 5 min.
* Probabilidades de conjuntos de 31/50 membros são aproximadas (resolução de 2–3 %); percentil 90 é cenário chuvoso, não previsão.
* Atribuição obrigatória: ECMWF Open Data (CC-BY-4.0), NOAA/NCEP e DWD — aparece nos quadros e na legenda.
* Se o repositório sair de público, trocar `BASE_DADOS` (`NEXT_PUBLIC_DADOS_MODELOS`) ou publicar o branch em outro lugar.

## Próximas etapas sugeridas
OLR/ttr como indicador de convecção; ondulação (swell) separada do GFS-wave; AIFS ENS quando disponível; IFS 0,1° em níveis de pressão só para o RJ; alertas por limiar (probabilidade de chuva ≥ X mm em município) ligados ao registro de acionamentos; comparação lado a lado “modelo × estações” (verificação).
