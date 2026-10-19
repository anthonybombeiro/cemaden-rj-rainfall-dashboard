# Aba Meteorologia — Previsão numérica, Sondagem, Clima e Previsão INMET (implementado em 19/10/2026)

Decisões do usuário (19/10/2026) que guiaram esta entrega:
* **"Previsão numérica" única no lugar de "Modelos"**, por tema, com a fonte escolhida dentro do tema (Marinha, INMET/COSMO, CPTEC), **1 a 4 quadros alinhados pela hora de validade**, animação e setas do teclado; ondas (Wwatch × Marinha) e estrutura vertical na mesma tela; região padrão Sudeste.
* **Não implementar os meteogramas do CPTEC** (série por município parada desde 27/08/2026; sem previsão de retomada).
* Do Nowcasting do CPTEC, implementar o item 1 (**Sondagem**) e **manter** a sondagem numérica de Wyoming (CAPE/CIN).
* **Previsão INMET** em sub-aba própria; a atual vira **Previsão CEMADEN-RJ**. **Clima** numa sub-aba única (anomalias, chuva acumulada, subsazonal, sazonal).

## 1. Sub-abas de Meteorologia (10; só ícones no celular, em uma linha)
Previsão CEMADEN-RJ · **Previsão INMET** · Avisos · Cartas · **Previsão numérica** · Meteogramas · **Sondagem** · Marés · **Clima** · Cadastro.

## 2. Previsão INMET (`PrevisaoInmetPanel.tsx`)
* Seletor dos **92 municípios do RJ** (códigos IBGE lidos de `public/rj_municipios.geojson`); previsão **oficial do INMET de até 5 dias** (`apiprevmet3/previsao/{geocode}`): Tmáx/Tmín, resumo, vento, umidade, nascer/pôr do sol; **manhã, tarde e noite** nos primeiros dias, dia único nos demais.
* **Comparação com o CEMADEN-RJ** por região (botão "Comparar agora"): cada uma das 11 regiões é comparada com um município de referência do INMET; diferença de **3 °C ou mais** em Tmáx/Tmín destaca a linha. Baixa 11 previsões (~2,5 MB) só ao clicar.
  Municípios de referência (constante `MUNICIPIO_DA_REGIAO` — ajustável): Capital→Rio de Janeiro; Baixada Fluminense→Nova Iguaçu; Baixada Litorânea→Cabo Frio; Costa Verde→Angra dos Reis; Metropolitana→Niterói; Norte→Campos dos Goytacazes; Noroeste→Itaperuna; Serrana I→Petrópolis; Serrana II→Nova Friburgo; Sul I→Volta Redonda; Sul II→Resende. (**Escolha da equipe técnica; o usuário ainda pode corrigir.**)
* Só leitura de dados; a previsão do CEMADEN-RJ não é alterada.

## 3. Clima (`ClimaPanel.tsx`, `lib/cptecClima.ts`)
* **Anomalias (INMET):** mapas diários de anomalia de Tmín e Tmáx (`apitempo/anomalias/{data}`), últimas 60 datas.
* **Chuva acumulada (INMET):** acumulados de 1, 3, 5, 10, 15, 30 e 90 dias (`apiprec/{data}`, ~1,7 MB por dia). Como as imagens do Brasil não são georreferenciadas, têm zoom/"Brasil inteiro".
* **Subsazonal (CPTEC, BAM-1.2):** semanas 1–4 (4 figuras), 14 dias (2), 21 e 30 dias (1); 6 regiões, 7 variáveis (inclui as calibradas, com probabilidade de anomalia positiva e do tercil mais provável). Inicializações aos domingos e quartas (8 últimas, calculadas); figura ausente mostra "não publicada".
* **Sazonal (CPTEC):** 4 meses e 2 trimestres; emissão mensal; **links das notas técnicas trimestrais (PDF)** (trimestre atual e 2 anteriores).
* Nomes de figura verificados em 19/10 (`bam12_{var}_{campo}_{AAAAMMDD}00_{week|fort|3wks|mnth|seas}NN_{região}.png`).

## 4. Sondagem (`SondagemPanel.tsx`, `lib/sondagemCptec.ts`, `backend/api/sondagem_views.py`)
* **Observada — CPTEC** (padrão): 43 estações (Galeão 83746 por padrão; Vitória, Campo de Marte, Confins, Curitiba, Brasília e Florianópolis primeiro). Imagem com Skew-T, hodógrafa e tabela de índices (CAPE/CINE SFC-ML-MU, LCL, LFC, EL, LI, EHI, SRH, shear, STP, SHIP, SCP, PWV, K, DCAPE…). Os horários 00Z/12Z são calculados e testados pela própria imagem.
* **Observada — INMET:** a imagem Skew-T do INMET para a mesma estação (se existir).
* **Prevista — MONAN:** sondagem do modelo para o ponto equivalente (Galeão → `RJR`, Rio de Janeiro), rodada 00Z, 3 em 3 h até 72 h, com seletor de rodada e barra de validade.
* **Números (Wyoming) — CAPE/CIN e índices:** o servidor interpreta a página da Universidade de Wyoming (`weather.uwyo.edu`, sem CORS) e devolve JSON em `GET /api/sondagem/numerica/?estacao=83746&data=AAAA-MM-DD&hora=00|12` (login obrigatório como o resto da API). Mostra **CAPE e CIN (parcela mais instável), CAPE descendente, K, Total Totals, Showalter, Lifted virtual, SWEAT, água precipitável, LCL e CCL** com faixas de cor **indicativas** (não são limiares operacionais), tabela dos níveis 1000/925/850/700/500/300/200 hPa (T, Td, UR, vento) e **download do perfil em CSV**. O horário usado é o do lançamento selecionado (INMET 11Z ≈ 12Z).
  Cache em arquivo no servidor (`backend/cache_sondagem/`, 6 h; 15 min para erro). Verificado: o servidor HostGator alcança Wyoming. Aviso na tela: o CAPE de Wyoming e o do CPTEC usam métodos diferentes e podem diferir (ex.: Galeão 19/10 00Z — Wyoming MUCAPE 122 J/kg × CPTEC MU 490 J/kg).

## 5. Previsão numérica (`PrevisaoNumericaPanel.tsx`, `lib/previsaoNumerica.ts`)
* **Temas:** Vento, Temperatura, Chuva, Pressão, Umidade, Altos níveis e jato, **Estrutura vertical** (lapse rate, cisalhamento 1/2/3 km, índices K/CAPE, K/Showalter, Totals/Lifted, água precipitável), Nuvens e visibilidade, **Ondas** (Wwatch × Marinha), Oceano (HYCOM). Cada produto lista as fontes que o oferecem.
* **Fontes:** CPTEC (MONAN 10 km, WRF 7 km, BRAMS 8 km, BAM global, Wwatch), Marinha (ICON-LAM, ondas, HYCOM) e INMET (COSMO 2,8 e 7 km via VIME). **ETA e SMEC ficam de fora** (ETA com erro 503 e SMEC parado desde 27/08).
* **Quadros:** 1 a 4 (botões 1–4); cada quadro tem fonte e rodada próprias; **um só controle de tempo** (de 3 em 3 h, "validade") com animação, botões e **setas ← → do teclado**; o controle fica fixo no topo ao rolar. PC: grade (2 colunas; 3 em 3 quadros). **Celular: quadros empilhados.** Se um quadro não tem exatamente aquela hora, mostra o anterior mais próximo com aviso (INMET) ou "sem quadro para esta hora".
* **Regiões:** Sudeste (padrão), Rio de Janeiro (zoom do COSMO 2,8 km, `SE-RJ`), Sul, Centro-Oeste, Nordeste, Norte, Brasil e América do Sul. Quando um produto não tem recorte regional (ex.: lapse rate, pressão no CPTEC), cai numa região maior e avisa no quadro.
* **Como as horas são alinhadas (descobertas de 19/10):**
  * **CPTEC:** o número no nome do arquivo conta as horas **desde 00Z do dia da rodada** (rodada 12Z: `012z` = hora inicial). Lista de rodadas: `mod_*.json` (CORS aberto).
  * **Marinha:** as pastas `00` e `12` guardam só a **última** rodada e o nome não traz data. Medido em 18–19/10 pelo `Last-Modified`: a pasta 00 é atualizada ~19,5 h depois da rodada 00Z e a pasta 12 ~8 h depois da 12Z; a data da rodada é **inferida** por esse atraso e o seletor permite trocar entre as duas pastas. **Cache:** o servidor da Marinha manda `Cache-Control` de 10 anos e sobrescreve os arquivos; sem cuidado o navegador mostrava a rodada antiga. As imagens agora levam `?r=<instante da rodada>` (e os meteogramas `?t=<bloco de 3 h>`).
  * **INMET:** rodadas do VIME (`/inicializacao`); os quadros vêm de uma vez em base64 (~4 MB por série, só ao escolher; cache em memória).
* **Robustez:** os servidores do CPTEC devolvem 503 de forma intermitente — cada imagem tenta de novo até 3 vezes; pré-carrega só os 2 próximos quadros.
* **Substituiu** `ModelosMarinhaPanel.tsx` e `ModelosInmetVisualizador.tsx` (removidos). `lib/produtosMarinha.ts` segue com meteogramas e marés.

## 6. Arquivos novos/alterados
Frontend: `PrevisaoNumericaPanel.tsx`, `SondagemPanel.tsx` (reescrito), `ClimaPanel.tsx`, `PrevisaoInmetPanel.tsx`, `MeteorologiaPanel.tsx` (sub-abas), `lib/previsaoNumerica.ts`, `lib/sondagemCptec.ts`, `lib/cptecClima.ts`, `lib/inmet.ts` (previsão, anomalias, precipitação), `lib/api.ts` (`fetchSondagemNumerica`), `lib/produtosMarinha.ts` (cache dos meteogramas).
Backend: `api/sondagem_views.py`, `api/urls.py` (rota `sondagem/numerica/`).

## 7. Pendências e riscos
* APIs/figuras de INMET e CPTEC não são documentadas e podem mudar; cada bloco mostra mensagem de indisponível.
* A inferência da data da rodada da Marinha é heurística (atraso de publicação); revisar se a Marinha mudar o horário.
* Radares/TATHU/LightningCast do Nowcasting (itens 2 e 3 da proposta) **não** foram feitos nesta etapa (exigem intermediário no servidor).
* Municípios de referência da comparação INMET × CEMADEN: confirmar com a equipe.
