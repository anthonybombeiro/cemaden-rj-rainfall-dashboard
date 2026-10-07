# Fontes de dados — o que foi confirmado e o que falta validar

Levantamento feito em setembro/2026 durante a montagem deste projeto. Serve
como referência para os conectores em `backend/ingestion/connectors/` e para
quem for negociar acessos institucionais.

## Plugfield — confirmado e funcionando (conta institucional CEMADEN-RJ)

- API oficial documentada (Swagger): https://wdg.plugfield.com.br/doc-api/index.html
  — atenção, o servidor real é outro host: `https://prod-api.plugfield.com.br`.
- Login: `POST /login` com header `x-api-key` e corpo `{username, password}` →
  `access_token` (JWT que não expira). Chamadas seguintes usam
  `x-api-key` + `Authorization: <access_token>` (sem prefixo "Bearer").
- Um único endpoint basta: `GET /device?page=1` já devolve, para cada
  estação, metadados (nome, lat/lon, cidade) **e** a última leitura
  embutida em `dashboard` (temperatura, umidade, chuva do dia, vento,
  rajada, direção, ponto de orvalho, pressão, UV) — sem precisar de
  chamada extra por estação.
- **9 estações reais confirmadas** (setembro/2026): Cambuci (2), Areal,
  Engenheiro Paulo de Frontin (3), Mendes, Cordeiro, Rio Claro — todas
  claramente estações de Defesa Civil municipal.
- **Histórico de segurança:** uma implementação anterior deste conector
  (feita em outra sessão/branch) commitou usuário, senha e API key da
  Plugfield em texto puro no código-fonte, publicado no GitHub. Foi
  reescrito do zero aqui (credenciais só via `.env`, nunca no código) e o
  branch comprometido foi apagado do GitHub — mas as credenciais antigas
  já ficaram expostas publicamente por um tempo. **Recomendação: trocar a
  senha da conta Plugfield e gerar uma nova API key.**
- Limites documentados: 5.000 requisições/mês por estação, 5 req/s.

## INMET — confirmado e funcionando

- Lista de estações automáticas (sem autenticação):
  `GET https://apitempo.inmet.gov.br/estacoes/T`
  Filtrar por `SG_ESTADO == "RJ"` → 26 estações automáticas no RJ no momento
  do levantamento. Campos: `CD_ESTACAO` (código), `DC_NOME`, `VL_LATITUDE`,
  `VL_LONGITUDE`, `VL_ALTITUDE`, `CD_SITUACAO` ("Operante"/"Pane").
- Metadados de uma estação: `GET /getEstacao/{codigo}` — redundante com a
  lista acima, útil só para depuração manual.
- Séries horárias históricas (rota confirmada, mas **precisa de token**):
  `GET /token/estacao/{inicio}/{fim}/{codigo}/{token}`
  Sem token válido, retorna `"CHAVE INVÁLIDA!"`. Não existe cadastro de
  autoatendimento para esse token — pedido enviado por e-mail ao INMET/
  COPREM (ver `docs/email-inmet-rascunho.md`), resposta pendente.
  **Confirmado independentemente (16/09/2026):** o painel COR-RIO
  `github.com/COR-RIO/dados-rio-chuvas` bateu na mesma parede (mesmo texto
  de erro, mesma rota morta) e documenta a mesma solução (contatar o SAC
  do INMET) — não é limitação nossa, é a situação real da API.
- **Alternativa sem token, pendente de decisão do usuário:** tabela
  BigQuery oficial `datario.meio_ambiente_clima.meteorologia_inmet`
  (mantida por basedosdados/Prefeitura do Rio, achada via
  `https://www.data.rio/documents/f14b1ed52be447379383acbb96353e1c`) —
  dados horários (chuva 1h, vento, temperatura, pressão, umidade,
  radiação) **desde 2010**, atualização diária (não é tempo real, mas não
  precisa de token do INMET nem de Chrome). Exige o usuário criar um
  projeto Google Cloud gratuito (sandbox, sem cartão) e nos passar o ID —
  mesma exigência da tabela de chuva por bairro do Alerta Rio (ver acima),
  então configurar uma vez destrava as duas. Usuário optou por aguardar a
  resposta do e-mail ao INMET antes de investir nisso (16/09/2026).
- **Solução temporária em produção (implementada):** enquanto o token não
  chega, `InmetConnector` usa a técnica que o usuário já tinha em produção
  para consultar vento — Selenium com Chrome real renderizando
  `https://tempo.inmet.gov.br/TabelaEstacoes/{codigo}` (página pública, sem
  login) e parsing da tabela HTML com pandas. Generalizamos para também
  extrair chuva/temperatura/umidade da mesma tabela, não só vento. A
  validação anti-robô dessa página é um reCAPTCHA Enterprise invisível que
  roda no JS da própria página — um Chrome de verdade carregando a página
  resolve isso sozinho, sem nenhuma ação de bypass da nossa parte.
  **Limitação:** exige Chrome instalado na máquina que roda a ingestão →
  funciona em desenvolvimento local, **não funciona no HostGator
  compartilhado** (sem root para instalar Chrome). Nesse servidor, a
  ingestão do INMET vai ficar sem vento/chuva/temperatura em tempo real até
  o token chegar (a lista de estações continua funcionando normalmente,
  pois usa só a API JSON pública). Ver `INMET_SCRAPE_ENABLED` em
  `backend/config/settings.py` para desligar o scraping se necessário.
  **Testado com dados reais** em 13/09/2026: 18-23 das 26 estações do RJ
  retornam leituras a cada rodada (chuva/temperatura/umidade/vento/rajada/
  direção). Três estações (A601 Seropédica, A618 Teresópolis-Parque
  Nacional, A611 Valença) disparam consistentemente um `alert()` JS na
  página ("Erro ao carregar lista de estações") que o Chrome não consegue
  contornar automaticamente — o conector detecta, ignora essa estação
  naquela rodada e segue para as demais sem travar; não chegamos a
  investigar a causa raiz no site do INMET.
- **Como isso roda em produção no HostGator, que não tem Chrome:** testamos
  se a validação anti-robô do endpoint (`POST
  https://apitempo.inmet.gov.br/estacao/front/`, campo `gcap`) é só
  decorativa — não é. Mandamos o campo vazio/forjado e o servidor recusou
  (`{"error":"Algo deu errado!!"}`), confirmando que é validado de verdade.
  Não tentamos forjar um token válido (seria contornar a proteção
  anti-robô do site, fora do que topamos fazer). A solução: o scraping
  roda de graça no **GitHub Actions** (repositório público =
  minutos ilimitados), que tem Chrome disponível, a cada 15 min
  (`.github/workflows/scrape-inmet.yml` +
  `backend/scripts/scrape_inmet_and_push.py`), e envia o resultado via
  HTTP para o endpoint `POST /api/ingest/readings/` do backend no
  HostGator (protegido por segredo compartilhado, ver
  `INGEST_SHARED_SECRET` em `backend/.env.example`). Testado localmente
  ponta a ponta (script → endpoint → aparece em `/api/stations/`).
  Configuração necessária no GitHub (Settings → Secrets and variables →
  Actions) do repositório: `INGEST_URL` (ex:
  `https://cemaden.preservess.com.br/api/ingest/readings/`) e
  `INGEST_SHARED_SECRET` (mesmo valor do `.env` do backend em produção).

## CEMADEN Nacional — fonte `cemaden_mctic` (reescrito em 03/10/2026)

> O IP do WebService de 2015 (seção abaixo, "legado") segue sem uso
> (`cemaden_nacional.py` existe mas não está no `REGISTRY`). Esta seção
> descreve **o que está em produção hoje**.

### Fonte e acesso
- **Rede Salvar** (`salvar.cemaden.gov.br`, restrita, exige login, com
  limite de requisições) é a plataforma do CEMADEN que reúne 10 redes (CEMADEN,
  ANA, INEA, INMET, etc.); a tabela dela traz Rede, UF, estação, últ., 1/3/6/12/24/48/72/96/120 h e
  hora da atualização. **Não** consumimos a Rede Salvar (a pausa/limite foi
  respeitado); a tabela "CEMADEN Nacional" do painel espelha só as estações da
  rede CEMADEN, usando fontes públicas:
  1. `https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=RJ`
     — JSON público, **395 estações no RJ**: `tipoestacao 1` = 356
     pluviométricas (`[A/B]`), `3` = 10 hidrológicas (`[H]`), `10` = 26
     geotécnicas (`[G]`), `4` = 3 sem nenhum dado (ignoradas). Campos:
     `idestacao`, `codibge`, `cidade`, `nomeestacao`, `ultimovalor` (balde de
     ~10 min), `datahoraUltimovalor` (**UTC**, `dd/mm/aa HH:MM`),
     `acc1hr, acc3hr, acc6hr, acc12hr, acc24hr, acc48hr, acc72hr, acc96hr`
     (**acumulados oficiais calculados pela fonte**), `tipoestacao`, `status`.
     **Não traz** 120 h, código da estação, qualificação do dado, nível do
     rio nem umidade do solo; lat/lon só aproximadas (centroide do município).
  2. `https://mapservices.cemaden.gov.br/MapaInterativoWS/resources/horario/{idestacao}/{n}`
     — API pública do mapa interativo, 1 chamada por estação; devolve o
     **código oficial** (`codEstacao`, ex.: `330580209A`), rede, tipo, cotas
     e acumulados por hora. Usada só para obter o código (estável): buscado
     aos poucos (orçamento de 10 s por rodada) e guardado em
     `raw_metadata["cod_estacao"]`.
- Conector: `CemadenMcticConnector`, em
  `backend/ingestion/connectors/cemaden_rj_pluviometros.py`.
- **Cron:** a cada **5 min** (`3-59/5`, `-m 120`) desde 03/10/2026 (era 15
  min; a fonte atualiza a cada 10 min). Custo: ~395 estações por rodada, 1
  download de JSON; sem sobrecarga medida.

### Por que antes divergia (~40% do oficial) e o que mudou
Medido em 03/10/2026 (Casimiro de Abreu `G2-330130602a`: plataforma 24 h =
80 mm × nosso 33,2; Vieira: 1 h oficial 5,3 × nosso 2,17; 24 h 32,17 ×
13,41; 96 h 55,74 × 20,22). Causa: gravávamos só `ultimovalor` (balde de 10
min) a cada rodada de 15 min — intervalos de 10 a 70 min entre leituras, cada
balde não coletado era chuva perdida — e descartávamos os acumulados prontos.
Correções: (1) cron de 5 min; (2) o retrato completo dos acumulados oficiais
fica em `Station.raw_metadata["acumulados_oficiais"]`; (3) o histórico de
**1, 24 e 96 h oficiais** é gravado 1×/hora por estação na tabela
`AcumuladoOficial` (`station`, `janela_h`, `valor_mm`, `referencia`,
`coletado_em`; único por estação/janela/referência) para comparar com o que
calculamos somando os baldes; (4) o acumulado passa a poder ser lido do oficial.

### Estações hidrológicas (H) e geotécnicas (G)
**Entram** (10 H + 26 G), mas como `station_type = outro` e identificadas por
`raw_metadata["tipo_cemaden"]`, porque este JSON só traz **chuva** delas
(H e G também têm pluviômetro). Não trazem nível do rio nem umidade do solo
(isso só existe na Rede Salvar autenticada / mapa interativo). Por isso não
poluem a aba Hidrológicos (que depende de nível). Aparecem na tabela "CEMADEN
Nacional" com sufixo `[H]`/`[G]`.

### ANA
Na Rede Salvar a ANA aparece como mais uma rede, mas **pelo portal do CEMADEN
não é viável consumi-la** (login + limite de requisições; não é API pública).
A ANA tem fonte própria: API HidroWeb/Telemetria (`ana.gov.br/hidrowebservice`,
requer cadastro de credencial) — alternativa recomendada, não implementada.

### Qualificação do dado (válido / suspeito / inválido)
A Rede Salvar marca cada leitura como válida ou não (relógio vermelho = "dado
futuro", faixas de atraso). Implementação nossa (`backend/core/qualidade.py`),
aplicada às **leituras novas** do `cemaden_mctic`; só a **exceção** é gravada
(`LeituraQualidade`, 1:1 com `Reading`; ausência = válida):

| Regra | Resultado |
|---|---|
| valor negativo | inválido |
| balde de 10 min > 50 mm | inválido |
| hora da leitura > 10 min à frente do relógio do servidor | inválido ("data/hora no futuro") |
| balde de 10 min > 20 mm | suspeito |

Validado: as 14 leituras marcadas "no futuro" correspondem às estações que a
Salvar sinaliza com o relógio vermelho. **Limites:** não há comparação com
estações vizinhas nem checagem de sensor travado (chuva constante); a Salvar
tem critérios próprios não públicos. A qualificação **não** altera os
acumulados oficiais exibidos (são da fonte).

### Calibração dos limites da qualificação — análise de 03/10/2026 (proposta adiada para o verão)

**Origem dos limites atuais:** 20 mm (suspeito) e 50 mm (inválido) por balde de
10 min foram escolhas conservadoras minhas (20 mm/10 min = 120 mm/h, extremo
mas possível; 50 mm/10 min = 300 mm/h, implausível para pluviômetro basculante),
**sem base oficial do CEMADEN e sem calibração com dados**. Por isso foi feita
a análise abaixo.

**Como foi feita:** ação somente leitura `analise_chuva_qc` em
`POST /api/admin/run/` (`backend/api/admin_views.py`; parâmetros `source` e
`dias`); não grava nada. Janela: 30 dias até 03/10/2026, fonte `cemaden_mctic`.
O período teve pouca chuva forte e o histórico é curto (a coleta de 5 min só
começou em 03/10), então **os números são indicativos, não definitivos**.

| Medida | Resultado |
|---|---|
| Leituras / estações com leitura | 58.586 / 274 |
| Leituras com chuva (> 0) | 16.379 |
| Percentis (só com chuva) | mediana 0,2 mm; p90 0,6; p99 2,2; p99,9 8,2 |
| Leituras acima de 5 / 8 / 10 / 12 / 15 / 20 / 30 / 50 mm | 40 / 18 / 8 / 4 / 2 / 2 / 1 / 1 |
| Maiores valores | 11,8; 12,4; 13,1; 26,4; 51,4 mm |

- O limite de 20 mm marca só 2 leituras em 58 mil; o de 50 mm marca 1 (51,4 mm,
  claramente erro).
- **Vizinhança** (mesmo município e mesmo horário de 10 min), leituras >= 8 mm:
  18 no total; 1 com apoio de vizinha; 8 sem vizinha com dado no horário; 9
  isoladas (vizinhas quase secas). Caso mais claro: Teresópolis, estação 987,
  com 13,1 / 12,4 / 10,1 mm em horários próximos e vizinhas em 0. Chuva
  convectiva é localizada, então "isolada" não prova erro; padrão repetido na
  mesma estação é indício melhor.
- **Sensor travado** (>= 6 leituras consecutivas iguais e > 0): 190 sequências,
  **todas de 0,2 mm** (resolução do pluviômetro numa garoa constante). A regra
  geraria falso alarme em massa e **não deve ser usada** nesse formato.

**Proposta (NÃO implementada — decisão do usuário em 03/10/2026: reavaliar no
verão, com mais dados e mais eventos de chuva forte):**
1. Manter 50 mm como inválido.
2. Baixar o limite de suspeito de 20 para 10 mm (hoje marcaria ~8 leituras em
   30 dias).
3. Regra de vizinhança, só como **suspeito** ("sem apoio de vizinhas"):
   leitura >= 8 mm cujas vizinhas (mesmo município e horário) estejam abaixo de
   10% do valor; só vale quando há vizinhas com dado.
4. Não adotar a regra de sequências iguais.

Enquanto isso, valem os limites atuais (`backend/core/qualidade.py`). Para
refazer a análise: chamar `analise_chuva_qc` (ex.: `dias: 90`) e comparar com
esta tabela.

### Tabela "CEMADEN Nacional" (aba Dados)
`GET /api/stations/cemaden/` → `CemadenNacionalTable.tsx`. Colunas: Estação
`[A/B|H|G]` (clicável → histórico), Município, Últ., 1/3/6/12/24/48/72/96 h
(oficiais), **REDEC**, **Atualizado em** (hora local; 🕒 e cor para atraso:
>4 h <120 h azul-escuro, >120 h <30 d oliva, >30 d roxo, futuro vermelho), e
**Código** por último. Linhas ordenadas pela chuva de 1 h (maior primeiro);
cor da linha = faixas de chuva 1 h do painel (Atrasada/Fraca/Moderada/Forte/
Muito Forte; "atrasada" = >1 h sem atualizar); ⚠ = leitura suspeita/inválida.
Sem as colunas Rede e UF. Filtros globais Município/REDEC se aplicam; 392
estações com coordenada conhecida.

### Legado — WebService de 2015 (sem uso)

Documento oficial "WebService – Disponibilização de dados da rede
pluviométrica e Hidrológica Cemaden" (Cemaden, Grupo de Desenvolvimento de
Sistemas, v2.0, 2015), obtido em
`trac.dpi.inpe.br/terrama2/raw-attachment/ticket/86/DOC01_webservice_cemaden.pdf`:

- `GET http://150.163.255.240/CEMADEN/resources/parceiros/{UF}/{tipo}`
  `tipo`: `1` = Pluviométrica, `3` = Hidrológica.
  Retorna só as últimas 3 horas de dados (limite deles, não nosso) —
  por isso a ingestão deve rodar a cada 10-15 min.
  Formato: `{"cemaden": [{"codestacao", "latitude", "longitude", "cidade",
  "nome", "tipo", "uf", "chuva", "nivel", "dataHora"}]}`, `dataHora` em UTC.

- **Atenção:** é um IP direto (não um domínio), documentado em 2015. Ao
  testar a partir do ambiente usado para montar este projeto, a conexão
  deu timeout — pode ser bloqueio de rede do ambiente de desenvolvimento,
  firewall que só libera IPs conhecidos, ou o endereço ter mudado. **Preciso
  ser validado a partir do servidor de produção** (o HostGator, que tem
  saída de internet normal). Se não responder de lá também, contatar o
  Cemaden (e-mail do responsável técnico no documento:
  jether.rodrigues@cemaden.gov.br) para confirmar o endereço atual — o mais
  provável é que hoje eles tenham migrado para um domínio via
  mapainterativo.cemaden.gov.br com uma API mais nova (não documentada
  publicamente; o site usa OpenLayers 2.x + backend próprio, não investigado
  a fundo por ser mais demorado de fazer engenharia reversa).

## Alerta Rio / GeoRio — RESOLVIDO (16/09/2026), com leituras reais em tempo real

- Localização das 33 estações pluviométricas (sem autenticação):
  `GET https://www.data.rio/api/download/v1/items/88b61c6abe424c049fdf83d27917602e/geojson?layers=0`
  Retorna GeoJSON com `endereço`, `est` (bairro), `cod` (código da estação),
  coordenadas.
- **Leituras em tempo real — achadas lendo o código-fonte aberto de um
  painel recente da própria COR-RIO no GitHub**
  (`github.com/COR-RIO/dados-rio-chuvas`, pushed em 01/09/2026): a API que
  abastece o site oficial do Alerta Rio é
  `https://websempre.rio.rj.gov.br/json/chuvas` (chuva por estação, janelas
  de 5min/15min/1-4h/24h/96h/mês) e
  `https://websempre.rio.rj.gov.br/json/dados_meteorologicos` (temperatura,
  umidade, pressão, vento — conjunto de estações parcialmente diferente).
  Sem autenticação, sem CAPTCHA. **Só rejeita clientes sem um User-Agent de
  navegador comum** (WAF, mensagem "Request Rejected") — não é um desafio
  interativo, só checagem de cabeçalho, então mandamos um User-Agent normal
  (ver `BROWSER_HEADERS` em `alerta_rio.py`).
- **Testado com dados reais:** 32 das 33 estações pluviométricas retornam
  leitura (a única sem match, "Barra/Itanhangá", genuinamente não aparece
  mais no feed ao vivo — parece ter sido renomeada/desativada na fonte, não
  é bug do nosso lado). Casamento de estação feito por nome (chuva) e por
  código numérico (meteorológico) contra o GeoJSON de estações.
- **Ressalva:** a unidade de velocidade do vento não está documentada
  publicamente — assumimos km/h (convenção comum em painéis de defesa
  civil no Brasil) e convertemos para m/s. Confirmar se possível.
- **Achados de 03/10/2026 (nada corrigido ainda):** (1) as 31 estações com
  dado têm atraso uniforme de ~7 min (`updated_at` vs. agora) — o `read_at`
  do feed é o carimbo do intervalo e a publicação vem depois, somado ao
  nosso ciclo de ingestão: conferido em 03/10/2026 04:34 UTC — o feed
  oficial tinha `read_at` 04:25 UTC (9 min antes) e o nosso banco já estava
  nesse mesmo `read_at`, ou seja, **o atraso é do feed, não do nosso
  ciclo**. (2) Gravamos o `m15` (chuva dos últimos 15 min, janela
  deslizante). **Comparação com o feed oficial no mesmo `read_at`
  (03/10/2026 04:25 UTC), nosso banco × oficial:** Vidigal 1h 8,8×8,6 /
  3h 15,6×14,8 / 24h 33,6×33,4 / 96h 45,6×43,8; Rocinha 1h 9,4×9,8 /
  3h 18,0×18,2 / 24h 97,8×99,2 / 96h 113,2×113,4; Urca 1h 1,6×1,8 /
  24h 17,4×18,6 / **96h 43,8×38,6 (+13%)**. Ou seja, de 1 h a 24 h fica
  dentro de ~1-6% (hipótese anterior de "inflar muito" NÃO se confirmou
  nessas janelas), mas há excesso nas janelas longas de algumas estações
  (Urca 96 h e mês), compatível com sobreposição de `m15` em períodos
  antigos. O feed também entrega `m05`, `h01`…`h04`, `h24`, `h96` e `mes`
  prontos, que servem de verdade-terreno para auditar. O conector do
  Niterói (`m15` de `horaLeitura`) tem o mesmo desenho e ainda não foi
  comparado.
- Esse achado veio de um arquivo de pesquisa (.md) que o usuário baixou de
  outra ferramenta e nos passou — não foi engenharia reversa de proteção
  nenhuma, foi literalmente ler o código-fonte público de um projeto no
  GitHub que já faz isso oficialmente.

## Chuva por Bairro (Escritório de Dados Rio / COR) — mantido como extra, provavelmente descontinuado

Com o Alerta Rio resolvido diretamente (seção acima, via
`websempre.rio.rj.gov.br`), este conector deixou de ser essencial — fica
no projeto como fonte complementar caso o serviço volte a funcionar.

- API pública, sem autenticação, código-fonte aberto:
  https://github.com/prefeitura-rio/api-dados-rio (GPLv3, mantida pelo
  Escritório de Dados, escritoriodedados@gmail.com).
  **Correção (16/09/2026):** o campo `pushed_at` do repositório mostrava
  data recente, mas o commit de verdade mais recente é de 04/03/2024 (a
  atividade "recente" era só um bot de pre-commit, não desenvolvimento).
  Serviço provavelmente descontinuado/abandonado, não instável.
- Achado navegando o catálogo oficial do data.rio (busca por "pluviômetro"
  retornou o dataset "Estações Alerta Rio" que já usávamos + um dataset de
  "Zonas Pluviométricas"), depois cruzando com uma busca no GitHub da
  Prefeitura do Rio (`prefeitura-rio/api-dados-rio`) — sem nenhuma
  engenharia reversa de proteção nenhuma, tudo documentado publicamente.
- Endpoint usado: `GET https://api.dados.rio/v2/clima_pluviometro/
  precipitacao_15min/` — chuva dos últimos 15 min por hexágono H3
  (só cobre o município do Rio, não o estado inteiro). Outras janelas
  (30min/1h/3h/6h/12h/24h/96h) existem na mesma API, não usadas ainda.
- **Status: serviço fora do ar (HTTP 503) em 15/09/2026 e de novo em
  16/09/2026** — não só o endpoint de chuva, mas também `/healthcheck/` e a
  raiz do domínio. Combinado com a descoberta acima (sem desenvolvimento
  real desde 2024), a leitura mais honesta é que este serviço está
  **provavelmente abandonado/descontinuado**, não apenas instável. O
  conector (`rio_chuva_bairro.py`) fica no projeto porque não custa nada
  mantê-lo (trata erro corretamente, não derruba a ingestão) — mas não
  há garantia de que volte a funcionar. Se for importante ter esse dado,
  o caminho é contatar o Escritório de Dados diretamente
  (escritoriodedados@gmail.com) para confirmar se a API foi descontinuada
  e se existe substituta.

## Weather Underground (PWS) — confirmado e funcionando, com ressalva de método

**Histórico importante:** a primeira tentativa aqui foi descobrir *toda* a
rede de estações PWS do RJ fazendo engenharia reversa de um mecanismo não
documentado (varredura de coordenadas contra um endpoint de geolocalização
que devolve a estação mais próxima). Isso foi abandonado — mesmo não
tocando diretamente na proteção anti-robô (Akamai) do mapa interativo do
site, usar um canal alternativo para obter a mesma enumeração que o mapa
protege é, na prática, a mesma coisa. O classificador de segurança do
Claude Code bloqueou automaticamente a automação dessa abordagem duas
vezes, o que reforçou essa conclusão.

**Solução adotada:** só consultar códigos de estação específicos e já
conhecidos, obtidos diretamente das Defesas Civis municipais (Rio das
Ostras, Casimiro de Abreu, Macaé, e outras usadas por essas Defesas Civis
para monitoramento regional: Armação dos Búzios, Cabo Frio, Arraial do
Cabo, Nova Friburgo) — isso é exatamente o uso pretendido da API pública
de PWS (consultar dados de uma estação cujo ID você já tem, com
consentimento implícito do dono ao deixar a estação pública).

- Chave de API: **pessoal**, obtida de graça em autoatendimento em
  https://www.wunderground.com/member/api-keys (criar conta grátis, "My
  Profile > My Devices", adicionar um device — não precisa de estação de
  verdade — depois gerar a chave). Nada de negociação com a IBM/Weather
  Company necessária. Configurar em `WUNDERGROUND_API_KEY`.
- Endpoint: `GET https://api.weather.com/v2/pws/observations/current?
  stationId={codigo}&format=json&units=m&apiKey={chave}` — sem CAPTCHA,
  sem bloqueio, retorna JSON limpo com temperatura, umidade, vento
  (velocidade/rajada/direção), chuva acumulada, pressão, radiação solar.
- 16 estações confirmadas (setembro/2026), 14 respondendo dados no momento
  do teste (`IRIODA5` e `IRIODA16` retornaram HTTP 204 — sem leitura
  recente, provavelmente offline temporariamente; ficam cadastradas no
  conector mesmo assim, o pipeline já ignora estação sem dado).
- Qualidade: rede amadora/particular (dados variam de estação para
  estação), não é dado aberto oficial de governo como INMET/CEMADEN — usar
  como complemento, não como fonte autoritativa isolada.

## Painel CEMADEN-RJ (GridLab) — sem API pública

`https://painelcemadenrj.defesacivil.rj.gov.br` é uma plataforma comercial
operada pela GridLab Sistemas e Serviços Ltda para a Defesa Civil-RJ. A tela
de dashboard (`/dashboard/...`) exige login; mas o mapa de alertas em tempo
real (`/monitoramento/v2/mapa/`) é **público, sem login** — vale como
referência de UX, mas os dados são renderizados 100% server-side em PHP
(o SVG do mapa do RJ já vem com as cores por município embutidas no HTML;
não tem endpoint JSON separado pra copiar — visto no código-fonte de
`monitoramento/v2/js/map.js`, que só lê `<path>` já coloridos, não busca
nada via fetch/AJAX). Não dá pra "espelhar" tecnicamente; teria que replicar
com dado próprio.

**As 4 camadas de alerta que o usuário quer no nosso painel existem nesse
mapa** (confirmado navegando em setembro/2026), uma coisa boa: dá pra saber
exatamente o que construir. Todas são um mapa coroplético por município (não
por estação pontual), com a mesma escala de 5 níveis (MUITO BAIXO / BAIXO /
MODERADO / ALTO / MUITO ALTO):

- **Monitoramento do Risco Hidrológico** — `/monitoramento/v2/mapa/`
- **Monitoramento do Risco de Deslizamento** (geológico) — mesma URL, aba ao lado
- **Nível de Severidade Meteorológica** — `/monitoramento/v2/mapa/redec.php?action=1`
- **Risco de Incêndio Florestal** — `/monitoramento/v2/mapa/redec.php?action=2`

Cada mapa mostra um timestamp de atualização (ex: "16/09/2026 às 02:49:08").

**Atualização — CONFIRMADO E CONSTRUÍDO (setembro/2026):** a fonte por trás
dessas 4 camadas é uma API pública própria da Defesa Civil-RJ, achada em
`https://painelcemadenrj.defesacivil.rj.gov.br/integracao/envia/cemaden/`
— feita para consumo por Power BI (tela de resumo com o título "API
Integracao Power BI"), **sem login**. 8 endpoints (tabelas HTML), dos quais
usamos 4 (um por camada de alerta):

| Endpoint | Camada | Granularidade |
|---|---|---|
| `atualizacao_hidro.php` | Aviso Hidrológico | REDEC (11 regionais) |
| `atualizacao_geo.php` | Aviso Geológico | REDEC |
| `atualizacao_municipio_geo.php` | Aviso Geológico | Município (92, cobertura completa) |
| `redec_meteoro.php?action=1` | Severidade Meteorológica | REDEC |
| `redec_meteoro.php?action=2` | Risco de Incêndio Florestal | REDEC |

(`atualizacao_municipio_hidro.php` existe mas devolve vazio — hidrológico
não tem granularidade municipal na fonte, só REDEC.)

A própria página de resumo tem uma seção "Legenda" com as cores oficiais
usadas pela Defesa Civil (usadas também no nosso frontend, em
`RISK_LEVEL_COLORS` de `frontend/src/lib/api.ts`): MUITO BAIXO `#28a745`,
BAIXO `#ffff19`, MODERADO `#ffc107`, ALTO `#bd2130`, MUITO ALTO `#6f42c1`.

**Atenção — endpoints pesados:** cada um devolve o HISTÓRICO COMPLETO de
alterações, não só o estado atual (`atualizacao_municipio_geo.php` passou
de 40MB num teste real). O conector (`backend/ingestion/connectors/
cemaden_rj_alertas.py`) faz parsing em streaming pra não estourar memória
em hospedagem compartilhada, e guarda só o estado mais recente por
REDEC/município (nunca o histórico) no modelo `RiskAlert`.

**Atenção — dado pessoal exposto sem querer, possivelmente:** o endpoint
por município inclui o nome do funcionário responsável por cada lançamento
de risco (ex: "Tiago Ferreli"). É público, sem autenticação. Não é algo que
este projeto usa além de exibir (é dado legítimo da própria fonte), mas
vale a Defesa Civil-RJ estar ciente de que está exposto.

Lista oficial das 11 REDECs do estado (útil como referência pra qualquer
hierarquia futura por regional): Baixada Fluminense, Baixada Litorânea,
Capital, Costa Verde, Metropolitana, Norte, Noroeste, Serrana I, Serrana
II, Sul I, Sul II.

Acesso via API/feed de **estações** (não de alertas — isso já está
resolvido acima) ainda depende de contato institucional direto com a
Defesa Civil-RJ e/ou GridLab — em andamento pelo usuário deste projeto.

**Atualização — RESOLVIDO (setembro/2026):** o próprio diretor do
CEMADEN-RJ (usuário deste projeto) indicou outro caminho: o "Sistema de
Alerta e Alarme Sonoro" (rede de sirenes do estado), hospedado em
`sirene.cbmerj.rj.gov.br` — domínio do Corpo de Bombeiros, mas confirmado
pelo diretor que é operado pelo próprio CEMADEN-RJ (o CBMERJ só empresta
domínio/servidor; os dois são órgãos da mesma Secretaria de Estado de
Defesa Civil, não uma integração externa). Ver
`backend/ingestion/connectors/cemaden_rj_pluviometros.py` — finalmente
temos as ~85 estações pluviométricas PRÓPRIAS do CEMADEN-RJ, de verdade,
o pedido original deste projeto desde a primeira conversa.

O mesmo portal também tem um mapa autenticado (`MapaControle?cmd=
consultaEstacoesAtualiza`) com as 225 estações da rede de sirenes (140
sirenes + 85 pluviômetros acoplados), latitude/longitude exata, e status
em tempo real — inclusive quando uma sirene está TOCANDO. **Integrado em
23/09/2026** com um login de serviço dedicado — a documentação completa
(acesso, campos, pluviômetros, toques de sirene, gatilhos, validações e
limitações) está na seção **"CEMADEN-RJ — Rede de Sirenes e Pluviômetros
(GridLab)"** logo abaixo.

## CEMADEN-RJ — Rede de Sirenes e Pluviômetros (GridLab) — documentação completa (03/10/2026)

Fonte `cemaden_rj_sirenes` — a **rede própria do CEMADEN-RJ**: 225 sirenes
de alerta/alarme sonoro, das quais 85 têm pluviômetro acoplado. É a única
fonte do projeto que diz se uma **sirene está tocando** e a única com a
chuva dos pluviômetros que **parametrizam os acionamentos**. Código:
`backend/ingestion/connectors/cemaden_rj_sirenes.py` (função `sync()`, não
é um `BaseConnector`), modelos em `backend/core/models.py`, gatilhos em
`backend/core/gatilhos.py`, tela em `SirenesTable.tsx`.

### 1. Origem, institucional e acesso

- Sistema "Sistema de Alerta e Alarme Sonoro" em
  `http://sirene.cbmerj.rj.gov.br:8080/sirenesestadorj/` — domínio e
  servidor do CBMERJ, mas **operado pela GridLab** (rodapé da tela de login)
  — a mesma empresa do painel comercial `painelcemadenrj.defesacivil.rj.gov.br`.
  O diretor do CEMADEN-RJ confirmou que a rede é do CEMADEN-RJ e que as 85
  estações pluviométricas existem "para parametrizar os acionamentos das
  225" sirenes.
- **Login de serviço** criado pelo diretor só para esta automação
  (`CEMADEN_RJ_SIRENES_USERNAME` / `_PASSWORD` no `.env`; nunca a conta
  pessoal dele). Plain HTTP (sem TLS) na porta 8080.
- Fluxo (achado lendo o JS de `mapaFrame.jsp`, não é scraping de HTML):
  1. `POST /LoginControle?cmd=validandologin` (form: `usuario`, `senha`,
     `Login=Login`) → 302 + cookie `JSESSIONID`. Login errado **não** dá
     401/403: devolve de novo a tela (texto fixo `IDENTIFIQUE-SE`), é isso
     que o código testa.
  2. `GET /MapaControle?cmd=consultaEstacoesAtualiza` (mesma sessão) → JSON
     com todos os registros (229). ~1,2-1,3 s por chamada, sem degradação em
     3 chamadas seguidas.
- Cada sync faz **login completo** (não há token reutilizável) — por isso não
  se roda a cada minuto: ~1.440 logins/dia contra o sistema deles poderiam
  acionar defesa antiabuso ou bloquear a conta de serviço, justamente numa
  emergência.
- **Cadência do sync — conferida no crontab em 03/10/2026:** o cron
  `sync_sirenes` estava em `*/15` (a cada 15 min, `curl -m 25`); em 23/09 havia
  sido criado a cada 2 min e alguém/algo o reduziu para 15 (motivo não
  registrado). O sync leva ~1,4-1,7 s (medido 3 vezes). **O usuário alterou
  para `*/2` (`curl -m 60`) direto no cPanel em 03/10/2026 e o assistente
  verificou**: crontab correto e syncs às 06:16:03 e 06:18:03 UTC com o painel
  fechado (a alteração pelo assistente havia sido bloqueada pelo classificador
  de permissões; ver `docs/operacao-cron-e-producao.md`). **Salvaguardas ativas
  (03/10):** o painel aberto pede um sync a cada 2 min
  (`POST /api/refresh/sirenes/`, com piso de 90 s no servidor) e a tela
  mostra alerta âmbar se o último sync tiver mais de 5 min
  (`GET /api/sirenes/status/`). Detalhes de impacto: seção 4/7.
- Fonte pública antiga (`ConsultaPluviometros?cmd=dadosPluviometros`, HTML
  sem login, 85 linhas, centroide do município) foi **retirada** em 23/09:
  é subconjunto exato desta (mesmos 85 `external_id`) sem coordenada
  exata, sem as 140 sirenes sem pluviômetro e sem acionamento. **Mas ela
  continua no ar e traz acumulados oficiais** (seção 3).

### 2. O que a API devolve por registro

Composição dos 229 registros (`equipamento.tipoEquipamento`): 140 "Sirene"
pura + 83 "Pluviômetro/Sirene" + 2 "Linímetro/Pluviômetro/Sirene" = **225
sirenes**; 3 "Cancela" + 1 "Repetidora" ficam de fora (não são sirenes).
Por REDEC (nas 225): Serrana I 53, Serrana II 44, Baixada Fluminense 40,
Metropolitana 33, Sul I 25, Costa Verde 20, Sul II 10.

| Campo | Significado | Uso |
|---|---|---|
| `idEstacao` | id local **não único** (só 36 valores distintos nas 225; escopado por grupo/cidade) | só referência (`raw_metadata.id_estacao_origem`) |
| `nomeEstacao`, `descricaoEstacao`, `rua`, `numero`, `bairro`, `cidade`, `estado` | endereço | gravado em `raw_metadata` / `name` / `municipality` |
| `latitude`, `longitude` | **coordenada exata** | gravado |
| `nomeRedec`, `grupo{idGrupo,nomeGrupo}` | regional e grupo (26 grupos, alguns cruzam cidades) | `raw_metadata` |
| `equipamento.tipoEquipamento` | tipo do equipamento | filtro + `tem_pluviometro` |
| `logStatusEstacaoTemp.fk_idStatusEstacao` | 1 = online/normal; 2 e 3 = offline/manutenção (ícone `offlinemnt*.png`) | `Station.status` (ativa se =1, senão inativa) |
| `logStatusEstacaoTemp.fk_idStatusAcaoEstacao` | **código de acionamento** (seção 4) | gera `AlertEvent` |
| `motivoManutencao.motivoManutencao` | texto livre do motivo (vazio nas amostras) | **ignorado** |
| `pluviometro.*` (só se `idPluviometro != 0`; 85 de 229) | seção 3 | `chuva_mm` |
| Estações "Linímetro" (2) | têm campos de linímetro | **nível não é ingerido** |

**Chave da estação:** como `idEstacao` não é único e `idGrupo` também não
resolve, o `external_id` é `"{cidade normalizada}|{nome normalizado}"` —
único nas 225 (conferido). Mesma estratégia do conector público antigo.

### 3. Pluviômetros (85 estações) — o que fornecem e como gravamos

Campos de `pluviometro`: `idPluviometro`, `tempo1`, `tempo2`, `intervalo`,
`flagOffLine`, `DataHora` (e `modelo`, que traz uma data aparentemente
reaproveitada por bug do sistema — **não confiar; usar sempre `DataHora`**).

| Campo | Semântica (memória de 23/09 + código) | Gravado? |
|---|---|---|
| `tempo1` | chuva dos "últimos 15 min" — **na prática janela deslizante** (ver abaixo) | **Sim**: `chuva_mm` |
| `tempo2` | chuva da última 1 h | **Não (ignorado)** |
| `intervalo` | 15 (confirma a cadência nominal de 15 min) | não |
| `flagOffLine` | pluviômetro offline | não (só o status da estação é usado) |
| `DataHora` | hora da última leitura, formato `dd/mm/aaaa HH:MM:SS`, **hora local (BRT)** | sim, convertido p/ UTC |

**Problema da janela deslizante (corrigido em 01/10/2026):** `tempo1` é
documentado como balde de 15 min, mas durante chuva ativa o portal manda
`DataHora` com poucos minutos de diferença (18:42, 18:45, 18:51 — vimos 6
min), cada uma já trazendo os últimos ~15 min. Somar todas (como em toda
fonte "balde") contava a mesma chuva várias vezes (Coréia 1: 110 mm aqui
contra 58 mm no painel oficial, achado ao comparar o acumulado de 24 h).
Correção (commit `a1b26cd`): `INTERVALO_MINIMO_LEITURA_CHUVA = 14 min` —
leitura que chegue menos de 14 min depois da última **gravada** daquela
estação é descartada (`readings_skipped_sobrepostas` no resumo do sync); e
o comando `fix_sirenes_chuva_sobreposta` (endpoint
`/api/admin/fix-sirenes-chuva-sobreposta/`, dry-run por padrão, `--aplicar`)
reaplicou a regra ao histórico: **779 leituras sobrepostas removidas**.
Efeito colateral conhecido: dentro de um surto, mantém-se a primeira
leitura de cada grupo e **descarta as seguintes, que já continham chuva
nova** — a chuva entre a leitura mantida e a próxima aceita (≥14 min)
fica de fora (subamostragem).

**Atraso inerente (hipótese consistente com os dados):** o `DataHora` de
cada leitura tem segundos 02-04 (HH:30:03) e nosso sync roda no mesmo
instante (HH:30:04), quando o portal ainda serve a leitura de HH:15 — a
leitura nova só aparece no ciclo seguinte. Atraso observado nas leituras gravadas: **25-28 min
em 03/10** (mediana 28 min). Uma estação ou outra (ex.: "Parque Uruguaiana -
83", 01:00) fica horas parada no portal.

**Acumulados — verificação contra o painel oficial (03/10/2026, comparação
com a página pública às 02:30 BRT; nosso último dado: 02:15 BRT, 1 ciclo
atrás):**

| Estação | 24 h oficial | 24 h nosso | + balde 15 min de 02:30 | Resultado 24 h | 96 h oficial / nosso | 1 mês oficial / nosso |
|---|---|---|---|---|---|---|
| Gentio1 (Petrópolis) | 18,6 | 17,0 | +1,6 | fecha | 78,0 / 41,6 | 195,4 / 48,2 |
| Quinta do Lebrão 1 | 25,0 | 23,6 | +1,4 | fecha | 101,8 / 82,8 | 270,2 / 93,4 |
| Coréia 1 | 51,4 | 50,6 | +0,8 | fecha | 136,6 / 117,6 | 358,0 / 161,0 |
| Independência-Taquara | 67,2 | 65,8 | +1,4 | fecha | 88,4 / 86,8 | 419,8 / 154,0 |
| Vale da Revolta 1 | 41,4 | 40,6 | +0,8 | fecha | 98,0 / 83,2 | 304,0 / 114,2 |
| Maringá (N. Friburgo) | 36,8 | 36,6 | +0,2 | fecha | 64,2 / 64,0 | 257,4 / 73,6 |
| Arsenal (S. Gonçalo) | 14,6 | 14,0 | +0,6 | fecha | 29,6 / 29,0 | 212,0 / 37,2 |
| Cantagalo (Angra) | 35,8 | 35,8 | +0,0 | fecha | 83,6 / 83,6 | 296,2 / 101,2 |
| Buraco do Sapo 1 | 24,0 | 22,4 | +1,6 | fecha | 94,8 / 67,2 | 262,6 / 74,8 |
| São Sebastião1-Vital | 72,6 | 63,8 | +1,2 | **faltam 7,6** | 103,8 / 88,0 | 475,6 / 169,8 |
| Santa Rita do Bracuí | 38,0 | 35,0 | +0,0 | **faltam 3,0** | 103,0 / 100,0 | 381,6 / 116,2 |
| Caleme 1 | 18,8 | 16,4 | +1,0 | **faltam 1,4** | 94,0 / 85,8 | 230,2 / 93,4 |

Leitura: **até 24 h o nosso acumulado bate com o oficial** (9 de 12
estações fecham exatamente quando se soma o balde de 15 min que ainda não
tínhamos; as 3 restantes perderam baldes, 1,4 a 7,6 mm). **Em 96 h e "1
mês" há déficit grande** (ex.: Gentio1 96 h 53% do oficial; 1 mês 25%).
Causas: (1) o histórico só existe desde 23/09 (≈10 dias; a janela de 1 mês
nunca esteve completa); (2) a subamostragem em surtos e a limpeza de 01/10
removeram baldes com chuva real; (3) execuções do sync perdidas. A
definição exata de "1 Mês" do portal (corrido de 30 dias ou calendário) não
foi confirmada.

**O que o portal oferece e nós não guardamos:** a página pública
`ConsultaPluviometros?cmd=dadosPluviometros` (tabela `#chuva-limits`,
ISO-8859-1, sem login) traz por pluviômetro **acumulados oficiais** de 3
min, 15 min, 1 h, 4 h, 12 h, 24 h, 48 h, 72 h, 96 h e 1 mês, com
`Data e Hora` da última leitura — exatamente a verdade-terreno que
falta para auditar e para reconciliar o nosso acumulado. Também existe
`tempo2` (1 h) no JSON autenticado.

**Sirenes sem pluviômetro (140):** os gatilhos usam uma **estação de
referência (REF)** — pré-preenchida pelo comando `populate_sirene_ref` com a
estação pluviométrica/meteorológica (ou sirene com pluviômetro) mais
próxima **num raio de 2 km** (editável no Admin). Em 03/10: 120 das 140
têm REF; **20 ficam sem referência** (sem chuva para gatilho).

### 4. Toques de sirene (acionamento)

Fonte do dado: `logStatusEstacaoTemp.fk_idStatusAcaoEstacao` +
`fk_idStatusEstacao`. Regra herdada da lógica de ícone do próprio portal
(`mapaFrame.jsp`): **4 e 0 = normal / retorno à normalidade**; **1 =
estação mobilizada** (o portal conta "Estações Mobilizadas" com
`statusAcao == 1`); **qualquer outro código com a estação ONLINE
(`fk_idStatusEstacao == 1`) = ícone "tocando"**. Os nomes dos demais
códigos (Aviso de Chuva, Teste de Manutenção etc.) **não estão** no portal
acessível com o login de serviço.

- **Regra no código (`sync()`):** `tocando = online AND acao ∉ normais`. Cada
  mudança de código fecha o `AlertEvent` aberto (`resolved_at`) e abre outro
  — `AlertEvent.value` guarda o **código**. Eventos ligados à `AlertRule`
  "guarda-chuva" **"Sirene de alarme tocando"** (severidade `alerta_maximo`;
  `reading_type/threshold` do modelo são exigidos mas não usados).
- **`SireneAcaoTipo`** (editável no Admin: "Tipos de acionamento de
  sirene"): `codigo`, `nome`, `categoria` (normal / aviso / teste /
  mobilização / outro), `observacao`. Códigos novos são **criados sozinhos**
  pelo sync como "Acionamento código N (nome a confirmar)". Seed: 0 e 4
  normais, 1 mobilização; 2 e 3 vieram como "nome a confirmar". **Não
  consegui ler a tabela em produção** — os nomes atuais dos códigos 5, 6 e 8
  precisam ser conferidos no Admin.
- **Validação operacional:** a leitura dos códigos é do JS do portal; o
  diretor autorizou seguir (23/09) **sem validação linha a linha**. Ainda
  em aberto: testar/simular um acionamento e ver o código mudar, ou
  perguntar o significado de cada código.
- **Não chamar comandos de acionamento do portal** (regra de segurança do
  projeto: só leitura).
- **O que existe em produção (23/09 a 02/10/2026):** 108 eventos, 72
  estações diferentes; por código:

| Código | Eventos | Duração observada (mín / média / máx) | Observação |
|---|---|---|---|
| 1 (mobilização) | 8 | 6 / 50 / 67 min | |
| 5 | 23 | 2 / 7 / 30 min | nome a confirmar |
| 6 | 76 | 5 / 13 / 19 min | nome a confirmar; 70% dos eventos |
| 8 | 1 | 15 min | nome a confirmar |

  Por dia: 23/09 14, 24/09 2, 25/09 5, 28/09 1, 29/09 14, 30/09 25, 01/10 46,
  02/10 1. Hoje (03/10) há 0 sirenes tocando e 9 das 225 estão inativas (5
  delas com pluviômetro).
- **Limitação importante de tempo:** `triggered_at` é o **horário em que o
  nosso sync viu** o código (`auto_now_add`), não o horário em que o portal
  acionou; `resolved_at` idem. Com sync de ~15 min, a duração tem erro de
  até ±15 min, e **toques mais curtos que o intervalo do sync podem não ser
  vistos** (os eventos de 2 min provavelmente vêm de syncs manuais). Para
  registro histórico fiel do toque, o ideal é sync de 1-2 min (o que a
  cadência de 23/09 pretendia) ou buscar o histórico de acionamento no
  portal.
- **Exibição:** ícone no mapa (pulsa em vermelho quando tocando),
  **banner global** no topo (atualiza a cada 1 min via `/api/alerts/`),
  **push do navegador** (`Notification API`, só com o painel aberto e
  permissão concedida) e aba "Sirenes".
- **Endpoint `GET /api/stations/sirenes/`:** por sirene devolve
  `tocando`, `tocando_desde`, `acao_codigo/nome/categoria`,
  `ultimo_acionamento_nome/fim`, `status_estacao`, `chuva_1h/24h/96h/30d_mm`
  (da própria estação ou do REF; `chuva_1h_mm = null` = sem leitura na
  última hora), `ultima_chuva_mm/em`, `tipo_sirene`, `risco_sirene`,
  `ref_*`, `gatilho_definido` e `gatilhos` (GI-GIV).

### 5. Gatilhos pluviométricos de acionamento (GI-GIV) e campos manuais

- **Gatilhos** (planilha da Defesa Civil, 29/09/2026), tabela
  `GatilhoPluviometrico` por município — **só 13 municípios** com gestão;
  os demais ficam "--" (não "normal"): GI = chuva 1 h; GII = 1 h **e** 24 h;
  GIII = 1 h **e** 96 h; GIV = 1 h **e** 30 dias (avaliados de forma
  independente). Bandas (`core/gatilhos.py`): **condicionado** (amarelo)
  entre 95% e 110% do limite; **obrigatório** (laranja) ≥ 110%;
  **acionado** (vermelho) = sobreposição do estado real "tocando".
- **Consequência da qualidade dos dados:** as entradas são os acumulados
  1 h/24 h/96 h/30 d calculados por nós a partir de `tempo1`. Pelas
  medições acima, **GI e GII (1 h / 24 h) são confiáveis; GIII (96 h) e
  sobretudo GIV (30 dias) tendem a subestimar** — o histórico só tem ≈10
  dias e houve perda de baldes. Um gatilho GIV pode deixar de aparecer
  por falta de histórico, não por falta de chuva. Convém alimentar 96 h e
  30 d com os acumulados oficiais do portal (seção 3).
- **Campos manuais por sirene** (`Station`): `tipo_sirene` (EAA /
  EAA+P derivados automaticamente por ter ou não pluviômetro; EAA+H e
  EAA+M atribuídos à mão quando existirem — hoje 140 EAA e 85 EAA+P);
  `risco_sirene` (geo / hidro / geo+hidro — **classificação real ainda não
  feita**: as 225 estão com o padrão "geo" aplicado em massa em 29/09 pelo
  comando `set_risco_sirene_padrao`, para ir ajustando no Admin);
  `sirene_ref` (REF, acima).

### 6. Linha do tempo das mudanças nesta fonte

- **23/09** — achado da API autenticada e conector `cemaden_rj_sirenes`
  (commit `1f71c9f`); cron de 2 min; ícone no mapa + banner; conector público
  `cemaden_rj` retirado (3.447 objetos órfãos apagados em produção).
- **24-25/09** — aba "Sirenes"; códigos de acionamento editáveis
  (`SireneAcaoTipo`); sync passa a seguir o portal (só "acionada" se online),
  um `AlertEvent` por código; coluna "Chuva 1h".
- **29/09** — gatilhos GI-GIV, `tipo_sirene`, `risco_sirene`, REF e
  acumulados 24 h/96 h/30 d na tabela.
- **01/10** — correção da chuva inflada por sobreposição (`tempo1`
  deslizante): intervalo mínimo de 14 min + limpeza de 779 leituras.
- **03/10** — esta auditoria (cadência efetiva ≈15 min; déficit em 96 h/30
  d; ver abaixo).

### 7. Limitações, riscos e perguntas em aberto

1. **Significado dos códigos de acionamento** não validado em campo; nomes
   de 5, 6 e 8 desconhecidos (conferir `SireneAcaoTipo`).
2. **Cadência do sync** (≈15 min observados × 2 min planejados): define o
   erro de tempo de todos os toques. Conferir o crontab.
3. **Histórico de chuva curto** (desde 23/09) e **perda de baldes** em surtos
   e execuções falhas: 96 h e 30 d subestimados.
4. **`tempo1` é janela deslizante** — o contador oficial de 15 min não é
   reproduzível por soma simples; a página pública já traz os acumulados
   oficiais.
5. **`tempo2` (1 h), `flagOffLine`, `motivoManutencao` e a data
   `modelo`** não são usados; o nível das 2 estações com linímetro não é
   ingerido.
6. **20 sirenes sem REF** e **225 sirenes com risco "geo"** por padrão
   (classificação real pendente).
7. **Sem validação de qualidade** (faixa/persistência) nas leituras de chuva;
   pluviômetro offline é percebido pelo atraso, não por flag.
8. **Transporte em HTTP puro (8080)** e login em cada sync; credencial de
   serviço única — se bloqueada, perde-se também o alerta de toque.

## Marinha do Brasil (CHM/DHN) — plano de obtenção de dados (levantamento em 01/10/2026)

Pesquisa feita a pedido do usuário, **só levantamento de opções, nada implementado
ainda**. Objetivo: trazer para o painel os avisos de mau tempo, cartas sinóticas,
dados de maré e boias climáticas (PNBOIA) da Marinha, que são referência
institucional para monitoramento costeiro/climático no RJ. Site principal:
`https://www.marinha.mil.br/chm/` (Centro de Hidrografia da Marinha).

### Estrutura institucional (quem é quem)

- **DHN** (Diretoria de Hidrografia e Navegação) — órgão maior, dono das normas de
  acesso a dados.
- **CHM** (Centro de Hidrografia da Marinha) — opera o **SMM** e o **PNBOIA**,
  produz os boletins/avisos/cartas no dia a dia.
- **SMM** (Serviço Meteorológico Marinho) — avisos de mau tempo, cartas sinóticas,
  Meteoromarinha, previsões especiais.
- **BNDO** (Banco Nacional de Dados Oceanográficos) — maré, dados oceanográficos
  (temperatura, salinidade, correntes), estações maregráficas/fluviométricas;
  acesso sob pedido.
- **IDEM-DHN** (Infraestrutura de Dados Espaciais Marinhos) — catálogo de
  metadados geoespaciais, `https://idem.marinha.mil.br/` (há também referências a
  `idem.dhn.mar.mil.br/geonetwork/...` para registros individuais — parece ser um
  GeoNetwork; não confirmado se expõe WMS/WFS consultável).
- **NAD-DHN** (Norma de Acesso aos Dados e Informações Abertos da DHN, Portaria
  nº13/2018) — política de dados abertos que cobre **27 tipos** de dados/produtos
  "ostensivos" (não sigilosos) sob custódia da DHN, acesso livre. PDF oficial:
  `https://www.marinha.mil.br/dhn/sites/www.marinha.mil.br.dhn/files/Port13-2018-DHN-Aprova-NAD-DHN.pdf`
  (redireciona para `assets.marinha.mil.br/dhn/...`) — **deu HTTP 503 nas duas
  tentativas de leitura nesta sessão**, não chegamos a extrair a lista completa
  dos 27 itens; vale tentar de novo depois (pode ser instabilidade pontual do
  servidor, não bloqueio).

### Bloqueio técnico transversal encontrado nesta sessão

Todo o domínio `marinha.mil.br` está atrás de **Cloudflare com desafio anti-robô
ativo** (`cf-mitigated: challenge` confirmado via `curl -I` com User-Agent de
navegador comum) — toda tentativa de leitura automatizada nesta sessão retornou
**HTTP 403**, em várias páginas diferentes (avisos de mau tempo, BNDO, tábuas de
maré, página inicial do CHM). É mais rígido que a proteção do INMET (que um
Chrome real resolve sozinho, sem ação nossa — ver seção INMET acima).

**Atualização importante (01/10/2026) — o bloqueio é por ferramenta/página, não
pelo domínio inteiro:** usando a biblioteca Python `requests` pura (sem
Selenium, sem header especial, sem User-Agent de navegador — só
`requests.get(url, verify=False)`) em vez de `curl`, a página de **avisos de
mau tempo passou a responder HTTP 200 com o conteúdo completo**, de forma
reproduzível (testado 2x, isolado, com espera entre chamadas). Ou seja, o
WAF da Marinha provavelmente bloqueia pela assinatura TLS/HTTP do `curl`
especificamente, não pelo fato de ser automação. **Mas isso não destrava
tudo:** testando as outras páginas (tábuas de maré, BNDO, previsões
especiais, cartas sinóticas, formulário de solicitação) da mesma forma, com
`requests` puro, **todas continuaram voltando 403 "Just a moment..."**
(desafio Cloudflare) — é proteção configurada por página/rota específica no
CHM, não um bloqueio geral do domínio. `idem.marinha.mil.br` também responde
200, mas é só a casca de uma SPA (2,4 KB, sem dado real, igual ao caso do
dados.gov.br). Essa descoberta veio de ler o código-fonte de um projeto
open-source de terceiros (ver seção 4 abaixo) que usa exatamente essa técnica
(`requests` puro) para ler essa mesma página.

Dois subdomínios relevantes (`pam.dhn.mar.mil.br` e `idem.dhn.mar.mil.br`) nem
chegaram a ser testados: o proxy de saída deste ambiente **bloqueia por política
qualquer domínio `.mar.mil.br`** (erro `connect_rejected`). Precisam ser
validados a partir da máquina de produção, que tem saída de internet normal.

### 1. Avisos de mau tempo — prioridade alta — RESOLVIDO (01/10/2026)

- Página: `https://www.marinha.mil.br/chm/dados-do-smm-avisos-de-mau-tempo/avisos-de-mau-tempo`.
  Organiza os avisos pela **METAREA V** (águas do Atlântico Sul sob
  responsabilidade do Brasil), subdividida em áreas ALFA, BRAVO, DELTA e
  SUL OCEÂNICA (nomenclatura real vista no teste; o mapa SVG mostra mais
  subdivisões, mas só essas apareceram com aviso ativo). Mostra timestamp de
  atualização e parece atualizar várias vezes ao dia.
- **Confirmado com dados reais (01/10/2026): dá pra ler com `requests` puro +
  BeautifulSoup** (sem Selenium — ver nota sobre bloqueio por página/
  ferramenta no início desta seção). A página devolve um bloco HTML
  (`<div id="block-govbr-govbr-theme-system-main">`) com um `<p>` por área
  (nome da área) seguido de um `<p>` por aviso dentro dela, em português e
  depois repetido em inglês. Cada aviso vem como texto corrido, mas
  estruturável por regex: número do aviso, tipo (vento forte/muito forte,
  mar grosso/muito grosso), horário de emissão, coordenadas da área,
  intensidade (força Beaufort/altura de onda) e validade. Não é JSON/XML,
  mas é parseável de forma confiável — exemplo real capturado no teste:
  `AVISO NR 716/2026 AVISO DE VENTO FORTE EMITIDO ÀS 1200Z - SEG - 28/SET/2026
  ÁREA COSTEIRA ENTRE ARRAIAL DO CABO/RJ E VITÓRIA/ES ATÉ 300 MN DA COSTA...`.
- **ÁREA DELTA cobre o litoral do RJ** (confirmado no teste: "ÁREA COSTEIRA
  ENTRE ARRAIAL DO CABO/RJ E VITÓRIA/ES ATÉ 300 MN DA COSTA"). **A ÁREA
  CHARLIE também cobre parte do litoral do RJ** (confirmado pelo usuário,
  diretor do CEMADEN-RJ — não havia aviso ativo nessa área no momento do
  teste pra capturar o texto exato dos limites; registrar o texto de um
  aviso real da ÁREA CHARLIE assim que houver um ativo, pra confirmar onde
  exatamente é o limite entre ela e a DELTA). **O conector final deve
  filtrar as duas áreas (CHARLIE e DELTA), não só DELTA.**
- **Canal oficial de distribuição real desses avisos é via satélite Inmarsat
  SafetyNET**, pela estação terrena de Tanguá (AOR-E), em inglês, 2x/dia
  (0730Z e 1930Z) + imediato quando há aviso novo. O Brasil não opera NAVTEX
  próprio nessa área (avisos costeiros vão por SafetyNET) — não precisamos
  mais desse caminho agora que o scraping direto funciona, mas fica
  registrado como alternativa caso o WAF da Marinha mude de comportamento.
- Canais alternativos não estruturados: página do Facebook do SMM
  (`facebook.com/servicometeorologicomb`) e app Android "Boletim ao Mar"
  (parceria Marinha + Instituto Rumo ao Mar/RUMAR) — úteis como verificação
  manual/fallback, não como fonte automatizável.
- **IMPLEMENTADO (01/10/2026):** conector em
  `backend/ingestion/connectors/marinha_avisos.py` (`sync()`), modelo
  `AvisoMauTempo` em `core/models.py`, endpoint `GET /api/avisos-mau-tempo/`
  (autenticado, como o resto da API — filtros `?area=` e `?ativo=`) e
  disparo administrativo via `POST /api/admin/run/` com
  `{"action": "sync_avisos_mau_tempo"}` (mesmo padrão do
  `sync_risk_alerts`). Testado localmente ponta a ponta (fetch → parse →
  upsert → API) com HTML real capturado nesta sessão — parseou
  corretamente 2 avisos reais da ÁREA DELTA, inclusive um caso de virada de
  mês (emitido 28/SET, válido até 01/OUT). **Ainda falta validar a partir
  do servidor de produção HostGator** (só foi testado deste ambiente de
  desenvolvimento) **e adicionar o Cron Job no cPanel** que chama
  `/api/admin/run/` periodicamente (passo manual fora do controle de
  versão, igual já é feito pros outros `sync_*`).

### 2. Cartas sinóticas

- Produzidas pelo CHM/SMM, formato imagem (há um PDF de simbologia oficial em
  `https://www.marinha.mil.br/chm/sites/www.marinha.mil.br.chm/files/chm_simbologia.pdf`).
  É produto gráfico (mapa de isóbaras/frentes), não dado estruturado — no
  painel só entraria como imagem estática/embed, não como camada de dados.
- **Atalho possível:** o INMET também publica regularmente cartas sinóticas em
  `https://portal.inmet.gov.br/cartasinotica` (achado durante esta pesquisa) —
  como o projeto já tem conector INMET funcionando e aquele domínio não
  apresentou o mesmo bloqueio Cloudflare da Marinha nas pesquisas feitas, vale
  avaliar usar o mirror do INMET em vez de brigar com a proteção da Marinha
  para este item especificamente. Precisa confirmar se o conteúdo é o mesmo
  mapa (cobertura Atlântico Sul) ou uma versão diferente.

### 3. Boletim Meteoromarinha / Previsões especiais

- `https://www.marinha.mil.br/chm/dados-do-smm-previsoes-especiais` — boletim de
  até 48h de condições atmosféricas/oceânicas na área de responsabilidade
  marítima do Brasil, formato texto padrão OMM, voltado à navegação. Mesmo
  bloqueio Cloudflare impediu inspeção detalhada do conteúdo atual nesta
  sessão.

### 4. Boias climáticas — PNBOIA — prioridade alta (boia "Itaguaí" é perto do RJ)

- **PNBOIA** (Programa Nacional de Boias, Resolução CIRM nº001/97) é gerenciado
  pelo CHM: boias fixas (fundeadas) e de deriva + flutuadores ARGO, transmissão
  quase em tempo real via satélite (CLS-ARGOS / Inmarsat IDP), ~10 parâmetros
  oceanográficos/meteorológicos coletados (tipicamente: vento, temp. do ar,
  pressão, umidade, temp. da superfície do mar, altura/período/direção de
  onda, corrente). Dados também alimentam o **GTS** (Global Telecommunication
  System) — ou seja, podem já estar entrando indiretamente nos modelos que o
  INMET/CPTEC consomem; vale perguntar isso no mesmo contato que já existe com
  o INMET/COPREM (ver `docs/email-inmet-rascunho.md`).
- **A boia "Itaguaí" é explicitamente descrita pela própria Marinha como usada
  para validar os avisos de mar grosso/ressaca do litoral do RJ** — é a boia
  mais relevante para este painel.
- **Catálogo/metadados:** lista de boias fixas em
  `https://idem.marinha.mil.br/` (menu PNBOIA > Boias Fixas, segundo achado via
  busca — a página carrega, mas é só casca de SPA sem dado real, mesmo
  problema do dados.gov.br).
- **Visualizações em tempo real possivelmente existentes** (achadas como itens
  de menu, não abertas): `https://www.marinha.mil.br/chm/views-dados-do-smm-mapa-ondogramas`
  (ondogramas) e `https://www.marinha.mil.br/chm/meteogramas_mapa` (meteogramas)
  — podem ser, como no caso do painel GridLab/CEMADEN-RJ, só HTML renderizado
  no servidor sem endpoint JSON por trás; precisa inspecionar com navegador
  real a partir da produção.
- **Caminho institucional confirmado — formulário de solicitação de dados do
  BNDO:** `https://www.marinha.mil.br/chm/form/formulario-de-solicitacao-de-dad`,
  permite pedir dados por tipo (ex.: ID 20 = meteorológico, ID 26 =
  propriedades físico-químicas), período e área geográfica. Esse é o mesmo
  padrão de acesso institucional que já funcionou para o CEMADEN-RJ/GridLab
  neste projeto (contato direto).
- **API real do PNBOIA — encontrada, conta criada, catálogo liberado, dados
  ainda bloqueados (atualizado em 01/10/2026):**
  - Achada via o projeto open-source `github.com/soutobias/oceanobs`
    (pacote Python "oceanoobsbrasil", autor Tobias Ferreira, pesquisador
    oceanógrafo afiliado ao National Oceanography Centre/UK). O README
    descreve que agrega **boias PNBOIA, marégrafos via CHM, avisos
    meteorológicos da Marinha e cartas sinóticas** — as quatro fontes que
    estamos atrás, já resolvidas por outra pessoa.
  - A API é a **"PNBoia API" v2.0.1**, em `http://52.67.222.63/` — projeto
    maduro, com changelog próprio, Swagger público (`/docs`,
    `/openapi.json`) e dezenas de endpoints `/v2/*` (boias fixas, boias de
    deriva, gliders, sailbuoys, ARGO, dados qualificados/QARTOD). Faz parte
    de um programa maior chamado **REMObs** ("REMO Observacional" — rede de
    modelagem e observação oceanográfica, parceria Marinha + Petrobras).
  - **Autenticação:** JWT Bearer emitido por um serviço separado,
    `api-controle-usuarios.remobs.com.br` (também FastAPI, com Swagger
    próprio). **Registro de conta é 100% self-service, sem convite:**
    `POST /auth/register` só pede `username` + `password` (+ `institution`
    opcional) e devolve 201 na hora. `POST /auth/login` devolve o JWT.
  - **Fizemos o registro nesta sessão:** conta criada
    (`username: cemadenrj.painel`, `institution: "CEMADEN-RJ (Defesa Civil
    do Estado do Rio de Janeiro)"`, `id: 88`). Credenciais salvas só no
    `.env` local (gitignored), nunca commitadas — ver
    `PNBOIA_USERNAME`/`PNBOIA_PASSWORD` em `backend/.env.example`.
  - **O que o JWT novo já libera:** `GET /v2/buoys` (catálogo público de
    todas as boias, sem precisar de permissão especial) — confirmamos
    **50 boias cadastradas**, incluindo a **METOCEAN WATCHKEEPER CABO
    FRIO** (id 48, `-23.582, -42.1711`), que está **ativa agora
    (`mode: "FUNDEADA"`, última leitura no dia do teste)** — melhor
    candidata pro painel, mais perto do RJ e com dado recente de verdade.
    Em contraste, a boia **"Itaguaí"** (id 8, mencionada pela própria
    Marinha como referência pro litoral do RJ) aparece como
    **`mode: "INOPERANTE"`, última leitura em 07/01/2020** — parece estar
    fora de operação há anos; não é mais a aposta certa.
  - **O que o JWT novo NÃO libera ainda:** dados de observação de verdade
    (`/v2/moored/latest`, `/v2/moored/metadata`, `/v2/moored/timeseries`)
    devolvem **403 "This JWT does not have permission for this
    endpoint."** — o payload do JWT mostra `resource_access` zerado
    (`buoys.read = {ids: [], all: false}`) por padrão em toda conta nova;
    alguém do lado do REMObs precisa conceder acesso por boia/recurso
    depois do cadastro (sistema de roles/permissions do
    `api-controle-usuarios`). Ou seja: **o cadastro é instantâneo, mas o
    acesso aos dados reais precisa de aprovação manual.**
  - **Próximo passo:** contatar quem administra o REMObs pedindo a
    liberação de `resource_access.buoys` pra conta `cemadenrj.painel`
    (pelo menos a boia 48, Cabo Frio Watchkeeper, e idealmente qualquer
    outra boia que opere perto do litoral do RJ). Caminhos possíveis, em
    ordem de praticidade: (1) abrir uma issue no GitHub
    `soutobias/oceanobs` explicando o pedido; (2) o mesmo formulário/
    contato institucional do BNDO/CHM, já que REMObs é ligado à Marinha
    via o programa REMO; (3) o site `remobs.com.br` (não acessível deste
    ambiente de desenvolvimento, proxy de saída bloqueou — tentar de
    novo a partir da produção ou do navegador do usuário) pode ter
    contato direto.

### 5. Dados de maré

- **Tábuas de Maré** — publicação anual em PDF por porto (não dado estruturado):
  `https://www.marinha.mil.br/chm/tabuas-de-mare` (2025) e
  `https://www.marinha.mil.br/chm/tabuas-de-mare-6` (2026). Cobertura nacional:
  44 portos + ilhas + barras; **quais portos do RJ exatamente estão na lista
  não foi confirmado** (a tabela completa está dentro do PDF, não lido nesta
  sessão por causa do bloqueio).
- **BNDO — Acesso a Dados e Produtos:**
  `https://www.marinha.mil.br/chm/dados-do-bndo/acesso-dados-e-produtos`
  (também referenciado como `/chm/bndo/acesso`) — segundo resumos de busca,
  oferece download gratuito direto no site para previsão de maré, estações
  maregráficas e fluviométricas; dados mais detalhados (constantes
  harmônicas, observações de maré, previsões horárias de máx/mín) são só por
  e-mail, sob pedido. FAQ em
  `https://www.marinha.mil.br/chm/bndo/duvidas-frequentes`. Nenhuma dessas
  páginas foi lida com sucesso nesta sessão (403 Cloudflare) — testado de
  novo em 01/10/2026 com `requests` puro (a técnica que destravou os avisos
  de mau tempo) e continua 403 "Just a moment..." em todas elas (tábuas de
  maré, BNDO, previsões especiais, cartas sinóticas, formulário). Essas
  páginas especificamente têm proteção mais forte que a de avisos de mau
  tempo.
- **CONFIRMADO EM 02/10/2026 — é um desafio Cloudflare de verdade (Turnstile
  interativo), não só falta de JS/cookie:** testamos com um **navegador
  Chromium real (headless, via Playwright)**, não só `requests`/`curl` —
  mesma técnica que já resolve sozinha a proteção do INMET neste projeto.
  A resposta confirma: `cf-mitigated: challenge` no header, e o HTML
  devolvido é a página de orquestração oficial do Cloudflare
  (`/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1`), que faz
  fingerprinting de automação. **Mesmo esperando 10s, o Chromium headless
  não resolveu o desafio sozinho** (continuou em "Just a moment..." —
  diferente do INMET, onde um Chrome real passa direto sem nenhuma ação
  nossa). Isso é porque a Marinha configurou um nível de proteção mais
  alto *especificamente* nessas rotas (tábua de maré, BNDO, cartas
  sinóticas, previsões especiais, formulário) — não é o mesmo nível de
  "avisos de mau tempo", que não tem esse desafio.
  **Por política já adotada neste projeto, paramos aqui**: não vamos tentar
  plugins de stealth, falsificar `navigator.webdriver`, resolver o
  Turnstile automaticamente, nem qualquer técnica de evasão de detecção —
  isso cruzaria a linha de "abrir a página com navegador normal" para
  "contornar deliberadamente a proteção" de um órgão federal/militar.
  **Conclusão prática: esse caminho direto está fechado.** As alternativas
  reais que restam são: (a) o formulário institucional do BNDO (pedido
  direto, mesmo caminho que já funcionou pro CEMADEN-RJ/GridLab); (b) os
  atalhos de terceiros abaixo; (c) testar manualmente num navegador comum
  (não automatizado) a partir da máquina de produção — um clique humano
  real num Turnstile quase sempre passa, então pode ser viável abrir a
  página manualmente de vez em quando e baixar o PDF à mão, só não dá pra
  automatizar a coleta.
- **Terceiros que já resolveram esse problema (candidatos a atalho, não
  oficiais — avaliar com a mesma cautela já aplicada ao Weather Underground):**
  - `github.com/Ddiidev/tabua_mare_convert_pdf2db` — projeto open-source que
    converte os PDFs de tábua de maré da Marinha para um formato
    consultável/API própria. Precisa avaliar licença, atividade recente e
    confiabilidade antes de depender dele.
  - `mareagora.com.br` e `tabuasdemare.com.br` — sites que dizem usar "dados
    oficiais da DHN" para dezenas/~96 portos com interface web e gráfico por
    porto. Se algum dia for necessário, o mesmo método já validado para o
    Alerta Rio (ler as chamadas de rede que o próprio site faz para se
    alimentar, sem tocar em proteção nenhuma) poderia revelar um endpoint
    JSON mais simples que brigar com o Cloudflare da Marinha — não
    investigado ainda.

### 6. Dados abertos institucionais — NAD-DHN e dados.gov.br — INVESTIGADO, SEM DADO ÚTIL (01/10/2026)

- O endpoint `/api/3/action/package_search` (CKAN clássico) **não é o usado
  pelo site atual** — é outra API, por trás de um API Gateway que devolve
  401 vazio (`www-authenticate: Bearer`, sem corpo) pra qualquer chamada,
  autenticada ou não; parece legado/desativado. **Achado real:** inspecionando
  o tráfego de rede do próprio portal (DevTools, feito pelo usuário), o site
  usa um endpoint diferente e **público, sem token nenhum**:
  `GET https://dados.gov.br/api/publico/busca/buscar?termo={termo}` — responde
  200 direto do navegador, sem header `Authorization`. O usuário chegou a
  gerar um token de API (JWT) pelo perfil do portal, mas **não foi
  necessário usá-lo** — o endpoint certo nunca pediu autenticação.
- **Esse endpoint está bloqueado para automação a partir deste ambiente de
  desenvolvimento** (mesma assinatura de bloqueio de borda via CloudFront
  vista em `marinha.mil.br`: 401 vazio mesmo replicando os headers exatos do
  navegador) — mas funciona normalmente no navegador do usuário, então não é
  um problema do endpoint, é do IP/ambiente daqui. Precisa rodar de um lugar
  com saída de internet normal (produção/GitHub Actions) se algum dia for
  automatizado.
- **Resultado da busca (testada pelo usuário, termos: maré, boia, PNBOIA,
  hidrografia, oceanográfico): nenhum dataset real da Marinha com dado
  oceanográfico/meteorológico estruturado apareceu** — só retornos vazios ou
  datasets administrativos sem relação (embarcações cadastradas, concursos,
  carteira de amador etc., como "Marinha do Brasil - Embarcações" e "Formas
  de Ingresso na Marinha" vistos na busca por "marinha").
- O único dataset relacionado a normas que apareceu, **"Normas da Autoridade
  Marítima"** (`dados.gov.br/dados/conjuntos-dados/normas-da-autoridade-maritima`),
  **só disponibiliza um PDF/página HTML de normas regulatórias — não é dado
  de maré/boia/aviso, é texto normativo.**
- **Conclusão: dados.gov.br não é um caminho útil para avisos de mau tempo,
  cartas sinóticas, maré ou boias.** O NAD-DHN (política de 27 tipos de dados
  abertos) pode não estar de fato publicado nesse portal — ou está catalogado
  sob outros termos de busca não tentados ainda (ex.: nome oficial de algum
  produto específico, "DHN", "CHM" sem "marinha"). Não vale insistir mais
  tempo aqui; os caminhos institucionais (BNDO, formulário de solicitação) e
  o teste das páginas bloqueadas do CHM continuam sendo as apostas mais
  prováveis.

### Recomendações e próximos passos (ordem sugerida)

1. ~~Testar as páginas bloqueadas com Chrome real/Selenium~~ — **concluído.**
   Avisos de mau tempo: resolvido de forma mais simples em 01/10/2026, só
   trocando `curl` por `requests` (Python) — **ainda falta** confirmar que
   isso também funciona a partir do servidor de produção (HostGator), só
   testado deste ambiente de desenvolvimento até agora. Tábuas de maré/
   BNDO/cartas sinóticas/previsões especiais: testado com Chromium real
   (headless, Playwright) em 02/10/2026 — **confirmado desafio Cloudflare
   interativo de verdade (Turnstile)**, nem o Chromium real resolveu
   sozinho; decidimos não insistir com técnicas de evasão (ver seção 5).
   `pam.dhn.mar.mil.br` continua não testado (domínio bloqueado pela
   política de rede deste ambiente).
2. ~~Criar conta e token em dados.gov.br~~ — **feito em 01/10/2026, sem dado
   útil encontrado** (ver seção 6 acima). Não repetir esse caminho.
3. ~~Escrever o conector de avisos de mau tempo (ÁREAS CHARLIE e DELTA)~~ —
   **implementado em 01/10/2026** (seção 1). Falta só validar a partir da
   produção e configurar o Cron Job no cPanel.
4. **Contatar o autor do `oceanobs` (GitHub `soutobias`) e/ou o GOOS-Brasil
   (`goosbrasil.org`) para perguntar como obter um `PNBOIA_TOKEN`** —
   caminho mais direto para a API de boias (`52.67.222.63/v1/`) encontrada
   nesta sessão, que não tem o bloqueio Cloudflare do `marinha.mil.br`.
5. **Preencher o formulário de solicitação de dados do BNDO** pedindo, em um
   único contato institucional (mesmo padrão que já destravou o CEMADEN-RJ/
   GridLab): (a) dados da boia PNBOIA "Itaguaí" em quase-tempo-real (IDs 20
   meteorológico e 26 físico-químico), caso o caminho do item 4 não vingue;
   (b) tábua de maré dos portos do RJ em formato estruturado (CSV/planilha,
   não só PDF); (c) confirmar se existe algum feed não-HTML para cartas
   sinóticas.
6. **Avaliar usar o mirror de cartas sinóticas do INMET**
   (`portal.inmet.gov.br/cartasinotica`) em vez de depender do CHM para esse
   item específico, já que o projeto já tem conector INMET.
7. **Investigar `pam.dhn.mar.mil.br` (Previsão Ambiental Marinha) e
   `oceano.live` com navegador real** — ambos parecem portais dedicados a
   previsão/visualização ambiental marinha; se tiverem mapa com camadas
   consultáveis, são o maior valor agregado em potencial para o painel
   entre tudo que foi levantado aqui — mas não puderam ser acessados nesta
   sessão (domínio/conectividade bloqueados pelo ambiente).
8. **Avaliar o projeto de terceiros `Ddiidev/tabua_mare_convert_pdf2db`**
   (licença, atividade, confiabilidade) como atalho temporário para maré,
   com a mesma ressalva de "fonte não-oficial" já aplicada ao Weather
   Underground neste documento.
9. **Não tentar contornar a proteção anti-robô da Marinha além de trocar a
   ferramenta de requisição** (é órgão federal/militar, mais sensível que o
   INMET) — usar `requests`/navegador real normalmente está liberado (é o
   que já fizemos); não forjar cabeçalhos de desafio, resolver CAPTCHA
   automaticamente, nem coisas do tipo.

### Resumo — o que dá para usar hoje vs. o que precisa de mais trabalho

| Necessidade do usuário | Fonte na Marinha | Status após este levantamento |
|---|---|---|
| Avisos de mau tempo | SMM, página de avisos (METAREA V) | **Implementado (01/10/2026)** — conector + modelo + API (`/api/avisos-mau-tempo/`) prontos e testados localmente; falta validar a partir da produção e configurar o Cron Job |
| Cartas sinóticas | SMM (CHM) | Página continua bloqueada mesmo com `requests`; mirror do INMET é alternativa mais simples; projeto `oceanobs` também integra isso (não inspecionado o código ainda) |
| Dados de maré | BNDO / Tábuas de Maré | **Caminho direto fechado (02/10/2026)** — confirmado desafio Cloudflare real (Turnstile), nem Chromium headless real resolve; não vamos tentar evasão. Resta: formulário institucional do BNDO, atalhos de terceiros, ou download manual via navegador humano |
| Boias climáticas (PNBOIA) | CHM/PNBOIA, boia Itaguaí | **API real encontrada** (`52.67.222.63/v1/`, fora do bloqueio Cloudflare) — só falta o token; alternativa institucional via formulário BNDO continua valendo |
| Dados abertos em geral | NAD-DHN / dados.gov.br | **Investigado e descartado (01/10/2026)** — endpoint público existe (`api/publico/busca/buscar`) mas não tem dataset real de maré/boia/aviso da Marinha; só achado documento normativo em PDF |

## REDEMET (DECEA/Força Aérea) — estações da Aeronáutica + satélite + radar — IMPLEMENTADO (02/10/2026)

Levantamento feito a pedido do usuário: (1) como inserir no mapa uma camada de
imagem de satélite/radar, do jeito que a maioria dos painéis de monitoramento
faz; (2) verificar se dá pra agregar as estações meteorológicas da
Aeronáutica (aeródromos). **As duas coisas vêm da mesma fonte** — REDEMET
(Rede de Meteorologia do Comando da Aeronáutica, operada pelo DECEA) — e já
estão implementadas e testadas com dado real (usuário se cadastrou e obteve
a `api_key` em 02/10/2026).

### Acesso

- Site institucional: `https://redemet.decea.mil.br` (o domínio antigo
  `redemet.aer.mil.br` faz 301 pra esse). Página "O que é a API-REDEMET":
  `https://ajuda.decea.mil.br/base-de-conhecimento/api-redemet-o-que-e/`.
- **Base da API:** `https://api-redemet.decea.mil.br`
- **Cadastro:** `https://api-redemet.decea.mil.br/cadastro-api/` — formulário
  com nome, sobrenome, e-mail e "motivo de uso da API" (até 1.500
  caracteres). **Confirmado: cadastro é aprovado na hora** (o usuário
  recebeu a `api_key` imediatamente após enviar, sem espera) — ver passo a
  passo e texto pronto em `docs/redemet-cadastro-rascunho.md`.
- Autenticação: header `X-Api-Key` (ordem de precedência da própria REDEMET
  sobre o query param `api_key` — usamos o header pra não vazar a chave em
  log de acesso/URL). Confirmado funcionando com chamadas reais.
- **Instabilidade de conexão observada (01-02/10/2026):** a API-REDEMET
  resetou a conexão no meio de algumas respostas, tanto via `curl` quanto
  via `requests` puro do Python — diferente do caso da Marinha (bloqueio por
  ferramenta), aqui parece só instabilidade mesmo (funcionou normalmente na
  tentativa seguinte). Os conectores (`RedemetConnector` e as views de proxy
  de imagem) já tratam isso com retry simples (até 3-4 tentativas, backoff
  curto) — ver `_get_with_retry`/`_get_com_retentativa` no código.

### Estações da Aeronáutica (METAR) — IMPLEMENTADO

- `backend/ingestion/connectors/redemet.py` (`RedemetConnector`, slug
  `redemet`, já no `REGISTRY` — roda via `python manage.py ingest redemet`,
  via `/api/refresh/` e entra automaticamente no cron geral de ingestão).
- `GET /aerodromos` (sem filtro por país/UF na própria API — lista global de
  ~4.200 aeródromos) filtrado aqui por `pais` == Brazil/Brasil e `cidade`
  terminando em "RJ" → popula `Station` (tipo `meteorologica`).
- **Atualização 03/10/2026 — histórico e atraso corrigidos:** o conector
  guardava só a mensagem mais recente por estação, com o horário de
  *recebimento* (10-30 min depois da observação), numa chamada por estação;
  como não há Cron Job do REDEMET no cPanel, só rodava no "atualizar agora"
  manual (1 única leitura por estação desde o início). Agora:
  `GET /mensagens/metar/SBGL,SBRJ,...?data_ini=&data_fim=` (todas as
  estações numa chamada, janela de 3 h, formato `YYYYMMDDHH`), cada METAR
  gravado com o horário real do grupo `DDHHMMZ` do texto, `get_or_create`
  por (estação, tipo, timestamp); fallback pro modo por estação se o lote
  falhar. O painel aberto chama `POST /api/refresh/redemet/` a cada 15 min
  (Dashboard.tsx). Verificado: +400 leituras, SBJR com histórico 14h-17h.
  Resta 1 leitura antiga por estação (carimbo de recebimento, 15:01).
- `GET /mensagens/metar/{icao}` → mensagem METAR mais recente do dia
  corrente (UTC); decodificada com regex simples pra extrair vento
  (direção/velocidade/rajada, convertido de nós pra m/s), temperatura,
  ponto de orvalho e QNH (guardado como `pressao_nm_hpa`, já que QNH É a
  pressão ao nível do mar). Fenômenos de tempo presente, visibilidade e
  nuvens ficam só no texto bruto (`raw_payload`), sem campo próprio no
  modelo ainda.
- **Testado com dado real em 02/10/2026 — 17 estações no RJ**, bem mais que
  o esperado pela pesquisa inicial (que só tinha achado os aeroportos
  "óbvios"): além de `SBGL` (Galeão), `SBRJ` (Santos Dumont), `SBJR`
  (Jacarepaguá), `SBSC` (Santa Cruz), `SBAF` (Campo dos Afonsos), `SBME`
  (Macaé), `SBCB` (Cabo Frio), `SBCP` (Campos dos Goytacazes), `SBES` (São
  Pedro da Aldeia), `SBMI` (Maricá) e `SBPW` (Porto do Açu), a lista trouxe
  de bônus **5 plataformas marítimas de petróleo da Petrobras com METAR
  próprio** (`SBEN` Enchova, `SBLB` Albacora, `SBLI` P-51, `SBMM` P-20,
  `SBRC` P-52) — estações offshore que nenhuma outra fonte deste projeto
  cobre, relevantes pro monitoramento costeiro que o usuário já tinha
  interesse (ver seção Marinha/PNBOIA acima).
- **No momento do teste, 11 das 17 tinham METAR fresco na hora** (`SBGL`,
  `SBRJ`, `SBJR`, `SBME`, `SBMI`, `SBSC` + as 5 plataformas) com valores
  plausíveis (temperatura 21-25°C, vento 0,5-9,3 m/s, QNH 1013-1017 hPa).
  As outras (`SBAF`, `SBCB`, `SBCP`, `SBES`, `SBPW`) ficaram sem observação
  na janela — comum em aeródromos sem torre 24h, não é erro do conector
  (ele simplesmente pula a estação nesse ciclo e tenta de novo no próximo).
- Dado histórico disponível desde 01/01/2006, segundo a doc oficial
  (não implementado — só a leitura mais recente é ingerida).

### Radar — camada pra mapa — IMPLEMENTADO

- Endpoint: `GET /produtos/radar/{tipo}?area={codigo}&data={YYYYMMDDHH}&anima={1..15}`
  (`data`/`anima` opcionais, default = agora / 1 imagem).
- `tipo` = corte de altitude do eco: `maxcappi` (400km raio, composição de
  toda a coluna, o que o painel usa por padrão), `10km`/`07km`/`05km`/`03km`
  (CAPPI em altitude fixa, 250km de raio cada).
- `area` = 26 códigos de radar espalhados pelo Brasil. **O que cobre o RJ é
  `pc` = Pico do Couto (Petrópolis)** — é o único radar do estado na lista
  oficial da API.
- **Ressalva de pesquisa anterior RESOLVIDA:** havia achado que esse radar
  foi desligado em 2016 por corte orçamentário, sem confirmação de
  reativação. **Testado de verdade em 02/10/2026: o radar está ATIVO**,
  devolvendo imagem com timestamp de poucos minutos atrás no momento do
  teste (`"data":"2026-10-02 00:06:50"`, testado às ~00:07 UTC) — ou foi
  reativado em algum momento entre 2016 e agora, ou a notícia de 2016 não
  se aplicava mais a esse radar especificamente. Não precisou de fallback
  (RainViewer ou outro).
- Resposta é **JSON** com metadados + caminho da imagem, incluindo limites
  geográficos (`lat_min`/`lat_max`/`lon_min`/`lon_max`) dentro do objeto do
  próprio radar retornado — usados para montar o `bounds` do
  `ImageOverlay` do Leaflet.
- Proxy: `GET /api/imagery/radar/?tipo=maxcappi&area=pc` (ver
  `backend/api/redemet_imagery_views.py`).
- **Animação (implementada 02/10/2026):** `anima=N` precisa ser repassado
  à API-REDEMET (bug inicial: o proxy não repassava e fatiava 1 item).
  Formato com `anima>1`: `radar` = 1 grupo POR QUADRO no tempo, cada um com
  1 entrada por área (não 1 grupo com N quadros) — o proxy achata `g[0]`
  de cada grupo. **Radar só tem 8 quadros reais** (slider 0-7 no site
  oficial, ~20 min entre quadros no MAXCAPPI); pedir mais faz a REDEMET
  repetir o último — o frontend pede `anima=8` e remove repetidos. Satélite:
  15 quadros reais, 10 min entre quadros.

### Satélite — camada pra mapa — IMPLEMENTADO

- Endpoint: `GET /produtos/satelite/{tipo}?data={YYYYMMDDHH}&anima={1..15}`
- `tipo`: `ir` (infravermelho), `realcada` (infravermelho colorida/realçada,
  a usada por padrão no painel por ser mais legível), `vis` (visível, só
  útil de dia).
- Testado com dado real: resposta traz `lat_lon` com os limites geográficos
  no nível raiz do objeto `data` (cobertura Brasil/América do Sul inteira:
  `lat -56 a 12,52`, `lon -100 a -25,24`) — não recortado por estado, então
  uma imagem só já serve pro painel inteiro.
- Proxy: `GET /api/imagery/satelite/?tipo=realcada` (mesmo arquivo de views
  acima).

### Carta SIGWX (não implementado, baixa prioridade)

- `GET /produtos/sigwx?api_key=...` — devolve só a URL da carta mais recente
  (PNG), sem parâmetro de data (não dá pra pegar histórico). Baixa
  prioridade — é carta de tempo significativo em altitude, mais voltada pra
  navegação aérea do que pro monitoramento de chuva/risco deste painel. Não
  implementado.

### Como foi implementado no mapa (Leaflet)

- As imagens PNG (satélite até ~1,3MB, radar bem menor) ficam num host
  estático público, `estatico-redemet.decea.mil.br`, que **não exige a
  `api_key`** (confirmado baixando uma imagem real sem nenhum header de
  autenticação) — só o endpoint que diz "qual é a imagem mais recente e
  quais são os limites geográficos dela" precisa da chave. Por isso o
  backend só faz proxy do JSON pequeno (`backend/api/redemet_imagery_views.py`,
  `RedemetSateliteImageryView`/`RedemetRadarImageryView`, cache de 5min via
  `django.core.cache`) — o navegador do usuário carrega o PNG **direto** do
  host da REDEMET, sem gastar banda/CPU do nosso servidor.
- `REDEMET_API_KEY` (variável de ambiente, nunca commitada) fica só no
  backend — o frontend nunca vê a chave.
- Frontend (`frontend/src/components/MapView.tsx`): botão flutuante
  "Satélite/Radar" (canto inferior esquerdo — o superior direito já é o
  painel "Filtros" do Dashboard.tsx, aberto por padrão) com 3 opções —
  Nenhuma / Satélite / Radar. A imagem escolhida é desenhada com
  `<ImageOverlay>` do `react-leaflet`, opacidade 0,55 pra não esconder as
  estações por baixo, usando os `bounds` que o proxy do backend já devolve
  prontos (convertidos de `lat_min/lat_max/lon_min/lon_max` pro formato
  `[[lat_min,lon_min],[lat_max,lon_max]]` que o Leaflet espera). Reconsulta
  a cada 3 minutos enquanto uma camada estiver ativa (menor que o TTL do
  cache do backend).
- **Atualização 03/10/2026:** o botão passou a se chamar "Opções" (painel
  "Camada de imagem" + "Camada das estações"), com dropdown de tipo,
  animação (play/pause, barra, data/hora do quadro), botão de atualizar,
  recarga automática a cada 10 min e quadros a cada 1,2 s. Fontes de radar
  adicionais na seção "Radares adicionais" abaixo.

### Radares adicionais — Niterói, INEA, Alerta Rio (investigado em 02/10/2026)

- **Radar de Niterói (Defesa Civil de Niterói)** — `radar.niteroi.rj.gov.br`.
  API REST pública, sem login, achada lendo o bundle JS (sem doc):
  `https://radar.niteroi.rj.gov.br:3337` — `GET /radars` (1 radar,
  `b35bf5fe-a016-4516-81bb-681088e72ce7`, raio 100 km, passo 5 min),
  `GET /radars/product-types` (só MAXDISPLAY,
  `a57c0a09-e9f0-461c-84b9-65ea856cc90c`),
  `GET /radars/{id}/products?type_id=&cutoff_datetime={epoch_ms}&amount=N`
  (mais recente primeiro; `datetime` em epoch ms; imagem em
  `/uploads/<hash>.png`). 15 quadros reais distintos. CORS liberado →
  chamado direto do navegador (`buscarRadarNiteroi` em `MapView.tsx`).
  O backend NÃO alcança a porta 3337 (HostGator bloqueia saída em porta
  não-padrão → 502). Opção "Niterói (local, 5min)" no radar.
- **INEA Radar Tool** — `radartool.inea.rj.gov.br/radar-tool/` (iframe de
  `alertadecheias.inea.rj.gov.br/radartool.php`). Agregador dos 6 radares
  do estado (Guaratiba, Macaé, Mendanha, Niterói, Pico do Couto, Sumaré)
  + mosaico. API (sem doc): `GET /radar-tool/frames.php?type=mosaic&product=zh&hours=N&max=M`
  e `...?type=radar&radar={gua|mac|mdn|nit|sumare|picocouto}&product=zh&...`
  (atenção: `type=gua` direto dá 400) → `{images, labels, step_min}`;
  `labels` em hora local (BRT). Passo 5 min (radares) / 10 min (mosaico).
  Bounds por radar no objeto `radars` de `radar-tool.js` (Guaratiba e Macaé
  250 km; Mendanha/Niterói 100 km; Sumaré 138,9 km; mosaico estadual).
  CORS bloqueia `frames.php` no navegador → proxy
  `GET /api/imagery/radar-inea/?tipo=mosaic|gua|mac|mdn|sumare&anima=1..15`
  (`backend/api/inea_radar_views.py`); PNGs carregados direto. **O servidor
  do INEA não envia o certificado intermediário** (Sectigo DV R36):
  `requests` falha com "unable to get local issuer certificate" (local e
  produção; atualizar o `certifi` não resolve) — resolvido com bundle
  próprio `backend/api/certs/inea-ca-bundle.pem` (certifi + intermediário).
  Testado em produção: Macaé, Guaratiba, Sumaré e mosaico com 15 quadros;
  **Mendanha sem imagem nas últimas 6 h** (radar sem publicar). Sem Cron:
  proxy sob demanda, cache 2 min.
- **Alerta Rio (Sumaré/Mendanha) direto — inviável:**
  `sistema-alerta-rio.com.br` tem desafio JS de bot (`hcdn-cgi/jschallenge`)
  e sem CORS. Os arquivos por trás: Sumaré `upload/Mapa/semfundo/radar001..020.png`
  (sem timestamp por quadro; bounds `[-24.431567,-45.336972],[-21.478793,-41.159092]`)
  e Mendanha `upload/Mapa_Mendanha/max_png/latest.json` (20 quadros com
  timestamp no nome, bounds `[-23.72847,-44.49769],[-21.91973,-42.54871]`).
  Os mesmos radares vêm do INEA sem essas barreiras.
- **Bug do Service Worker (corrigido 03/10/2026):** `public/sw.js`
  interceptava também requisições de outras origens e, se o `cache.put()`
  falhasse, respondia com o HTML do próprio painel — `fetch().json()`
  falhava em silêncio e nenhuma imagem aparecia. Agora ignora origem
  diferente (`CACHE_VERSION` = `cemadenrj-v2`). Para testar versões novas é
  preciso limpar o SW/cache do navegador.

### Configuração necessária

- `REDEMET_API_KEY` no `.env` do backend (ver `backend/.env.example`) — já
  preenchido no ambiente local desta sessão pra validar a implementação;
  **falta configurar no servidor de produção (HostGator)** pra ingestão e
  camadas funcionarem lá também.

## Macaé — Rede de Telemetria UFRJ/Defesa Civil (`macae_ufrj`) — achados de 03/10/2026

- Conector `backend/ingestion/connectors/macae_ufrj.py` (login de serviço
  `MACAE_UFRJ_USERNAME/PASSWORD` no `.env`): `POST /Login` →
  `GET /Estacoes/visualizarEstacoes` (IDs) →
  `GET /Estacoes/getEstacoesGeoJson/volume_chuva/?ids=...&ativa=true`
  (estação + **só a última leitura** — `ultimaLeitura`: temperatura,
  umidade, vento, direção, `volume_chuva`, `payload` com rajada/pressão).
  Só estações `tipo == "interna"` (as `weather.com` são PWS do Wunderground).
- **Problemas observados (nada corrigido):**
  1. Sem histórico: 1 leitura por estação por rodada; `volume_chuva` é
     "balde" do intervalo do sensor, então rodada perdida = chuva perdida.
  2. Estações paradas há horas na tabela de Precipitação (ex.: Imboassica
     12:40, Centro 14:41, Bicuda pequena 15:41 enquanto outras estão em
     23:48) — falta confirmar no portal se a estação parou de transmitir ou
     se o portal serve leitura velha. O carimbo gravado é o `datahora` do
     sensor (hora local → UTC).
  3. "Failed to fetch" no botão "Atualizar agora": `POST /api/refresh/`
     roda todos os conectores num único pedido (threads); testado em
     03/10/2026, passou de 45 s sem responder — o servidor corta o pedido.
     Macaé faz login + 3 chamadas em série (timeout 30 s cada) e é suspeito
     de ser dos mais lentos, mas não foi medido isolado.
- **Atualização 03/10/2026 — problema resolvido:** o portal tem histórico
  (`POST /Leituras/getEstatisticasLeiturasJson`, escala de minuto) e a última
  leitura traz os acumulados oficiais (`volume_acumulado_1h/24h/96h`). O conector
  passou a gravar a chuva minuto a minuto e os oficiais. Detalhes, validação e
  inventário por estação em `redes-sensiveis-plugfield-macae-wunderground.md`.
  A tabela "Macaé" em Dados mostra os oficiais.

## Catálogo comparativo das fontes — o que recebemos, o que gravamos, o que falta (03/10/2026)

Visão de meteorologia observacional/instrumental, climatologia e sinótica
sobre o que o sistema recebe hoje, para orientar decisões por fonte e o
desenho futuro de um dashboard de apoio a gestor e meteorologista. Baseado
na leitura do código dos conectores e em comparações medidas em
03/10/2026. Nada aqui foi implementado: é diagnóstico e proposta.

**Legenda das células:** `G` = consumido e **gravado** no banco · `D` =
gravado após conversão/derivação · `I` = o fornecedor **oferece e nós
ignoramos** · `—` = o fornecedor não oferece · `?` = a confirmar.

### 1. Chuva — agrupada por frequência de atualização do fornecedor

| Grupo (cadência) | Fonte | Rede / natureza | Estações | Valor que gravamos (`chuva_mm`) | Janelas prontas que o fornecedor oferece (e ignoramos) | Carimbo de tempo | Resolução |
|---|---|---|---|---|---|---|---|
| **5 min** | Alerta Rio (Prefeitura RJ/GeoRio) | pluviógrafo basculante | 33 | **`m05` a cada 5 min (desde 06/10; antes `m15` deslizante)**; sentinela −99,99 descartada; oficiais `m05/m15/h01-h04/h24/h96/mes` em `raw_metadata` + `AcumuladoOficial` 1/24/96 h | — | `read_at`, publicado ~5-10 min após | 0,2 mm |
| **5 min** | Niterói (Defesa Civil/Tecal) | pluviômetro | 30 | **`m05` a cada 5 min (desde 06/10; antes `m15`)**; oficiais `m05…h720, mes` + `is_delay` em `raw_metadata` + `AcumuladoOficial` 1/24/96 h | — (sem endpoint de histórico) | `horaLeitura` UTC, grade de 5 min | ? |
| **10 min** | CEMADEN Nacional (`cemaden_mctic`) | PCDs A/B + hidrológicas H + geotécnicas G (só chuva) | 392 (356 A/B, 10 H, 26 G) | `ultimovalor` (~10 min), cron a cada **5 min** desde 03/10 | `acc1hr`…`acc96hr` — **retrato em `raw_metadata` + histórico 1/24/96 h em `AcumuladoOficial`** (03/10) | `datahoraUltimovalor` em UTC | qualificação válido/suspeito/inválido (`LeituraQualidade`) |
| **15 min** | CEMADEN-RJ sirenes (GridLab) | pluviômetro + sirene | 85 com pluviômetro | `tempo1` (janela deslizante), mín. 14 min entre gravações | outras janelas (**I**) | `DataHora` (BRT→UTC) | ? |
| **15 min** | INEA Alerta de Cheias | pluviômetro + linígrafo | 94 | `dado_ultimo` (15 min) | `chuva_1h/4h/24h/96h/30d` (**I**, por decisão) | `data_hora` (BRT→UTC) | ? |
| **15 min** | Rio Chuva por Bairro (COR) | **produto agregado** por hexágono H3, não é ponto | hexágonos | `chuva_15min` | 30 min…96 h (**I**) | 1 carimbo global (BRT→UTC fixo) | ? |
| **Horária** | INMET (estações automáticas) | rede nacional, padrão OMM | 26 | `CHUVA` (acumulado da hora) | — | hora de medição (UTC) | ? |
| **Total corrido do dia** (cadência do dispositivo) | Wunderground (PWS) | colaborativa, **sem calibração** | 121 cadastradas, 106 respondem | total do dia → balde por diferença (`D`); **`precipTotal`/`precipRate`/`qcStatus` oficiais guardados em `raw_metadata` (03/10)** | histórico de ~5 min `observations/all/1day`, `history/hourly` (**I**) | `obsTimeUtc` | 0,01 mm (varia por equipamento) |
| **Total corrido do dia** | Plugfield (parceiros municipais) | estações de Defesas Civis | 19 (17 ativas) | `rainDay` → balde por diferença (`D`); **`rainDay/Month/Year` oficiais no `raw_metadata`** | `/data/hourly`, `/data/daily`, `lastRainfall` (pulsos de 5 min) (**I**) | `lastUpdateTimestamp` do aparelho | 0,11 mm |
| **Total corrido do dia** | Ecowitt Paracambi | 2 estações GW3000B | 2 | `rainfall.daily` → balde (`D`) | taxa, hora, semana, mês, evento (**I**) | `time` do campo | ? |
| **1 min** (histórico por minuto) | Macaé UFRJ | telemetria própria | 26 internas (11 com dado) | **histórico por minuto do portal** (corrigido em 03/10; antes `volume_chuva` da última leitura = ~3% da chuva); **`volume_acumulado_1h/24h/96h` oficiais** em `AcumuladoOficial` | `ESCALA_HORA/DIA` (**I**) | `datahora` (BRT→UTC) | 0,34 mm |

Leitura rápida: quem nos entrega janelas oficiais prontas (Alerta Rio,
CEMADEN, INEA, Niterói) é quem mais perde com o desenho "um valor por
rodada"; as fontes de total corrido do dia (Wunderground, Plugfield,
Ecowitt) se autocorrigem. **Defeito achado:** `ecowitt_paracambi` não
consta em `PRECIPITACAO_BUCKET_SOURCES` (`api/views.py`), então suas 2
estações saem sem acumulados na tabela mesmo gravando baldes.

### 2. Variáveis atmosféricas de superfície — por frequência

| Grupo | Fonte | T | Tmáx / Tmín | UR | UR máx/mín | P estação | P nível do mar | T orvalho | Vento vel. | Dir. | Rajada | Radiação | UV | Sensação |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Horária** | INMET | G | G (extremos da hora) | G | G | G | — | G | G | G | G | D (kJ/m²→W/m²) | — | I |
| **Horária** | REDEMET METAR | G | — | — | — | — | D (QNH) | G | D (kt→m/s) | G (VRB descartado) | D | — | — | — |
| **5 min** | Alerta Rio (estações met.) | G | G (`max`/`min` informados) | G | — | G | — | — | D (km/h assumido→m/s) | D (cardinal→graus) | — | — | — | — |
| **1 min** | Macaé UFRJ | G | — | G | — | G | — | — | D (km/h→m/s) | G | **G (histórico por minuto)** | — | — | — |
| **Dispositivo** | Plugfield | G | G (extremo do dia até agora) | G | — | G | G | G (filtrado) | D (km/h→m/s) | G | D | I (unidade desconhecida) | G | G |
| **Dispositivo** | Wunderground | G | — (endpoint atual não tem) | G | — | — | G | G (filtrado) | D (km/h→m/s) | G | D | G | G | I (`heatIndex`, `windChill`) |
| **Dispositivo** | Ecowitt Paracambi | G | — | G | — | I (absoluta) | G | G | G | G | G | G | G | G |

O que cada fonte oferece além do que consumimos (observação): INMET —
`PRE_MAX/MIN`, `PTO_MAX/MIN` (**I**); REDEMET METAR — visibilidade,
nebulosidade (tipo, altura da base), teto, tempo presente (RA, TSRA, FG…),
tendência/RMK (todos só no `raw_payload`, sem campo estruturado); Alerta
Rio — nada além do que já lemos; Wunderground — `qcStatus` (**I**).

### 3. Hidrologia, oceano e avisos

| Tema | Fonte | Frequência | O que recebemos | Gravamos | Observação |
|---|---|---|---|---|---|
| Nível de rio | INEA Alerta de Cheias | 15 min | `nivel_rio` (73 estações "Plu/Flu" têm nível; 21 são só "Plu") | `nivel_m` (G); sem unidade explícita (limiares em cm → ×100) | Sem bacia/rio na fonte; cotas por `CotaHidrologica` (estático, planilha INEA/CPRM) |
| Nível de rio | ANA / CEMADEN hidrológica | — | — | **Nenhum conector** (só código ANA no inventário) | Lacuna para séries históricas de vazão/cota |
| Maré / boias / ondas | Marinha (PNBOIA, tábua) | — | — | **Nada** (só avisos de mau tempo) | Lacuna oceânica; tábua/BNDO atrás de Cloudflare |
| Avisos de mau tempo | Marinha (CHM/SMM, áreas Charlie e Delta) | irregular | texto do aviso, validade | `AvisoMauTempo` (não é `Reading`) | Só texto PT; sem geometria |
| Risco hidro/geo/meteoro/incêndio | CEMADEN-RJ (Power BI da Defesa Civil) | por boletim | nível por REDEC/município | `RiskAlert` (G) | Só o estado mais recente |
| Sirenes | CEMADEN-RJ (GridLab) | 15 min | status e acionamento por sirene | `AlertEvent`, `SireneAcaoTipo` | Semântica do acionamento não validada em campo |
| Previsão do tempo | Painel legado (11 REDECs) | diária | Tmáx/Tmín, UR, vento, ícone, comentário | `Previsao` (~22,7 mil registros desde 2010) | Previsão **manual**; não guardamos previsão numérica |
| Gatilhos pluviométricos | Regra interna (13 municípios) | — | limiares 1h/24h/96h/30d | `GatilhoPluviometrico` | Base para alertas, não é observação |

### 4. Sensoriamento remoto (radar e satélite) — hoje só visualização

| Produto | Fonte | Cadência / histórico real | Cobertura | Variável | Gravamos |
|---|---|---|---|---|---|
| Radar MAXCAPPI e CAPPI 3/5/7/10 km | REDEMET (Pico do Couto) | ~20 min, **8 quadros** | raio 400 km (CAPPI 250 km) | refletividade | **Nada** (PNG como camada) |
| Radar MAXDISPLAY | Prefeitura de Niterói | 5 min, 15 quadros | raio 100 km | refletividade máx. | Nada |
| Radar Guaratiba / Macaé | INEA Radar Tool | 5 min, 15 quadros | raio 250 km | refletividade | Nada |
| Radar Mendanha / Sumaré | INEA Radar Tool | 5 min (Mendanha sem imagem nas últimas 6 h) | 100 km / 139 km | refletividade | Nada |
| Mosaico dos radares do estado | INEA | 10 min, 15 quadros | todo o RJ | refletividade | Nada |
| Satélite (IR, IR realçado, visível) | REDEMET | 10 min, 15 quadros | América do Sul | temperatura de brilho / reflectância | Nada |

Nenhum valor numérico de radar/satélite é guardado: não dá para montar
série de refletividade, estimativa de precipitação por município nem
trajetória de células depois que o PNG some do servidor deles (8-15
quadros).

### 5. O que o banco guarda hoje (esquema) e suas lacunas

`Reading(station, reading_type, value, timestamp UTC, raw_payload JSON)`,
único por (estação, tipo, timestamp); `Station(source, external_id, lat,
lon, altitude_m, tipo, status, município)`.

- **Sem unidade no registro** (a unidade é implícita no `reading_type`);
  sem **flag de qualidade**; sem **versão/valor original** quando houve
  conversão; sem diferença entre **hora da observação** e **hora da coleta**
  (para vários conectores o carimbo é de publicação).
- **Sem janela do valor**: `chuva_mm` pode ser 5, 10, 15 min, 1 h ou balde
  entre rodadas — o significado só está no código do conector. Falta
  `intervalo_inicio/fim` (ou `janela_min`) por leitura.
- **Sem metadados de sensor/estação** no padrão da OMM/WIGOS: tipo e
  fabricante do sensor, resolução, altura/exposição (altura do pluviômetro,
  do anemômetro), data de instalação/calibração, altitude (quase sempre
  `None`), coordenada exata × aproximada (CEMADEN usa centroide do
  município; Rio Chuva por Bairro usa centroide do hexágono).
- `get_or_create`: um valor corrigido pela fonte depois **não** atualiza o
  registro; `raw_payload` por leitura incha o banco (já estoura o
  hospedeiro em consultas grandes) e repete o mesmo JSON para cada variável.
- **Sem agregados persistidos** (horário/diário/mensal), sem completude
  por período, sem climatologia, sem arquivo das previsões emitidas.
- Conversões assumidas e não confirmadas: vento do Alerta Rio em km/h;
  pressão do Alerta Rio (estação ou nível do mar?); `nivel_rio` do INEA em
  metros; `rainDay` do Plugfield (e `updateDateTime`, que vem 3 h
  deslocado — o código usa o timestamp do aparelho).

### 6. Veracidade — o que foi medido e o que melhorar

| Fonte | Validado contra | Resultado | Controle de qualidade hoje | Principais riscos | Melhoria proposta |
|---|---|---|---|---|---|
| CEMADEN (`cemaden_mctic`) | plataforma oficial, 03/10/2026 | **~40% do oficial** (24h 33,2 × 80 mm) | nenhum | baldes de 10 min perdidos (gaps 10-70 min) | **FEITO em 03/10/2026:** `acc*` oficiais gravados (`AcumuladoOficial` + `raw_metadata`), cron de 5 min, tabela "CEMADEN Nacional" mostra os oficiais |
| Alerta Rio | feed oficial, mesmo `read_at` (gravado desde 06/10) | 24 h: erro médio −0,6 mm (06/10); 96 h/mês com excesso antes (Urca +13%) — reconferir em 24-48 h | **descarta −99,99** (235 leituras já haviam entrado); negativo/>20/>50 mm | `m15` sobreposto (trocado por `m05`); atraso de ~9 min é do feed; horas de sentinela = perda definitiva | reconferir diariamente; ver `alerta-rio-niteroi-inea-e-saude-das-fontes.md` |
| Niterói | não validado | — | nenhum | só vale com ingestão exata de 15 min; antes de 25/09 gravava `m05` | usar `h01` como referência/reconciliação |
| INEA | oficiais `chuva_1h/4h/24h/96h/30d` guardados (06/10) | ainda não comparados | negativo/>20/>50 mm (06/10) | janela de `dado_ultimo` presumida; `verify=False` no TLS; id por nome | comparar oficial × nosso; validar certificado |
| CEMADEN-RJ sirenes | revisão de sobreposição (779 removidas) | corrigido | intervalo mínimo 14 min | janela deslizante subamostra chuva intensa | usar janela oficial maior (1 h) como referência |
| INMET | — | — | faixas físicas (T -10..50, UR 0..100, chuva 0..300, vento 0..80, P 300..1100 …) | extremos de rede no limite; rate-limit devolve HTTP 200 texto | adicionar teste de passo (T), persistência (vento/pressão) e consistência T ≥ Td |
| REDEMET METAR | — | horário real do METAR já usado | nenhum além do parsing | QNH ≠ pressão de estação; ventos VRB perdidos; nuvens/visibilidade fora da base | guardar visibilidade, teto, tempo presente estruturados |
| Wunderground | `qcStatus` do Weather Company guardado (03/10) | — | faixas T/UR/P/Td/rad; teto 150 mm/balde; **qualificação de chuva (03/10)**: total do dia regrediu e `qcStatus` 0 → suspeito | PWS sem calibração (T 60 °C, P 900 hPa, contador de chuva que não zera — ex.: IMARIC14) | marcar como "não-operacional" (flag) e **nunca** misturar em estatística oficial |
| Plugfield | — | — | filtro de Td; teto de balde; **qualificação de chuva (03/10)**: total do dia regrediu → suspeito | unidade da radiação desconhecida; timestamp do painel errado; 2 estações de Cambuci paradas há meses | confirmar unidades com o fornecedor; manutenção das estações paradas |
| Ecowitt | — | — | **nenhum** | sem QC; fora do conjunto de fontes de balde | aplicar as mesmas faixas do Wunderground |
| Macaé UFRJ | acumulados oficiais 1/24/96 h (03/10) | — | balde > 20 mm/min → suspeito (03/10) | 15 das 26 internas sem dado; 3 offline com leitura velha | contato com a UFRJ/Defesa Civil; alerta de estação parada |

Referências de método para o controle de qualidade e metadados:
WMO-No. 8 (Guide to Instruments and Methods of Observation), WMO-No. 100
(Guide to Climatological Practices), WMO-No. 1192 (WIGOS Metadata Standard)
e os testes clássicos de QC de superfície — limite físico, **passo**
(variação máxima entre leituras), **persistência** (valor travado),
**consistência interna** (T ≥ Td, rajada ≥ vento médio, UR ≤ 100) e
**consistência espacial** (comparação com vizinhas). Convém gravar o
resultado como **flag** por leitura (0 = ok, 1 = suspeito, 2 = rejeitado,
9 = não testado) em vez de descartar o dado, para poder auditar depois.

### 7. O que guardar para o dashboard (gestor e meteorologista)

Princípio: **bruto imutável + camadas derivadas + metadados**, com tudo em
UTC e com a janela de cada valor explícita.

| Camada | Conteúdo proposto | Para quê |
|---|---|---|
| Observação bruta (`Reading`) | + `unidade`, `janela_min`, `hora_observacao` e `hora_coleta`, `flag_qc`, `fonte_valor_original`; `raw_payload` só 1 por rodada/estação | auditoria, reprocessamento, comparação entre fontes |
| Metadados de estação/sensor | altura do sensor, exposição, resolução, fabricante, instalação/calibração, altitude exata, tipo de coordenada (exata/aproximada), rede (operacional × colaborativa) | padronização, calibração, ponderação por confiabilidade |
| Acumulados de chuva por estação | 5 min…96 h, 7 d, 30 d, mês, ano hidrológico, **gravados** a cada ingestão + completude (% de baldes presentes) | consulta por SQL, alertas, comparação com valores oficiais |
| Referência oficial da fonte | acumulados e extremos que a própria fonte informa (CEMADEN, Alerta Rio, INEA, Niterói) | verdade-terreno para medir o erro da nossa soma |
| Agregados horários e diários | Tméd/Tmáx/Tmín e amplitude, UR média, vento médio vetorial e rajada máx., pressão média, **tendência de pressão 3 h**, T − Td, chuva horária/diária, contagem de amostras | diagnóstico do estado atual, início de séries climatológicas |
| Sinótica / termodinâmica | variação de pressão ao nível do mar, convergência de vento entre estações, T − Td, e (futuro) índices de **radiossondagem** (CAPE, CIN, K, TT, LI, água precipitável); candidata: sondagem do Galeão (WMO 83746, disponibilidade a confirmar) | previsão de curto prazo e instabilidade |
| Radar e satélite derivados | por município/REDEC: refletividade máx., área acima de limiares (ex.: ≥35 dBZ), taxa de chuva estimada (relação Z–R), temperatura de brilho mínima (IR) e série temporal; centroide e deslocamento de células | nowcasting 0-3 h; hoje some com o PNG |
| Oceano | PNBOIA/boias (altura e período de onda, direção, T do mar, vento, pressão) e maré (tábua + residual) | previsão costeira e ressaca |
| Climatologia | normais (OMM, período 1991-2020), percentis, extremos absolutos e por mês, desvio-padrão, **anomalia** = valor − normal, SPI, dias com chuva ≥1/10/50 mm, dias secos consecutivos, R95p/Rx1day (índices ETCCDI) | variabilidade sazonal, tendência e mudanças climáticas |
| Previsões emitidas | arquivar a previsão (valor, data de emissão, prazo) e a observação correspondente | verificação: viés, erro médio absoluto, acerto de chuva |
| Eventos e impactos | sirenes acionadas, avisos (Marinha, CEMADEN-RJ), ocorrências | correlacionar tempo × impacto |

Para as **décadas** de histórico (a nossa base só começa em set/2026), as
fontes candidatas — **não pesquisadas neste levantamento** — são séries
históricas do INMET (BDMEP), CEMADEN, ANA (Hidroweb), INEA e Alerta Rio, e
produtos de grade/reanálise (ERA5, CHIRPS, MERGE/CPTEC, IMERG) para
preencher lacunas e calcular normais. Qualquer série longa exige
padronizar horário (UTC), unidade, janela do acumulado e política de
valores ausentes antes de comparar redes diferentes.

### 8. Prioridades sugeridas (impacto × esforço, para você decidir por fonte)

| # | Ação | Impacto | Esforço |
|---|---|---|---|
| 1 | Cadência de ingestão ≤5 min (ex.: GitHub Actions → `/api/admin/run/`) | alto (corrige perda de baldes em todas as fontes de "último valor") | baixo |
| 2 | Gravar acumulados oficiais das fontes (CEMADEN, Alerta Rio, INEA, Niterói) como referência | alto (mede o erro e destrava auditoria) | médio |
| 3 | Tabela de acumulados por estação/janela gravada a cada ingestão | alto (consulta por SQL e histórico) | médio |
| 4 | Campos `unidade`, `janela_min`, `flag_qc` em `Reading` + QC de passo/persistência/consistência | alto (veracidade) | médio |
| 5 | Incluir `ecowitt_paracambi` no conjunto de fontes de balde; aplicar QC a Ecowitt | médio | baixo |
| 6 | Arquivar métricas derivadas de radar/satélite por município | alto para nowcasting | alto |
| 7 | Agregados horários/diários + completude; início da climatologia | alto (dashboard e estatística) | médio |
| 8 | Metadados de sensor/estação (padrão OMM/WIGOS) | médio-alto (calibração e ponderação) | médio |
| 9 | Conectores faltantes: ANA, boias/maré, radiossondagem | médio | alto |
| 10 | Rotacionar credenciais do Plugfield já commitadas no passado | segurança | baixo |

## Auditoria de acumulados de chuva — como é calculado e guardado (03/10/2026)

**Nenhum acumulado é gravado no banco.** Só existem leituras brutas
`Reading(reading_type=chuva_mm)`, uma por estação por timestamp
(`get_or_create` em `BaseConnector.run`). Todos os acumulados da tabela de
Precipitação (agora, 5/10/15/30 min, 1/2/3/4/6/12/24/36/48/72/96 h, hoje,
168 h, 30 dias corridos, mês, pico) são calculados **na hora da consulta**
em `StationViewSet._calcular_precipitacao` (`backend/api/views.py`): soma
em Python das leituras `timestamp >= agora - janela` (até 96 h) e `Sum`/`Max`
no banco para 168 h, 30 d, mês calendário e pico 24 h. Só fontes em
`PRECIPITACAO_BUCKET_SOURCES` entram. Consequências: o acumulado só está
certo se todo balde foi gravado uma vez; não há série histórica de
acumulados consultável por SQL sem recalcular.

Situação por fonte (lida no código; "não auditado" = ainda não verificado):

| Fonte | Valor gravado | Robustez a rodadas perdidas |
|---|---|---|
| Wunderground, Plugfield, Ecowitt Paracambi | total do dia → balde por diferença (`bucket_from_running_daily`, teto 150 mm) | Robusta: autocorrige (medido em 03/10/2026: Plugfield 17/17 e Wunderground 95/96 batem com o total oficial; ver `redes-sensiveis-plugfield-macae-wunderground.md`) |
| CEMADEN-RJ sirenes (`cemaden_rj_sirenes`) | `tempo1` com intervalo mínimo de 14 min (corrigido 02/10) | Boa; 779 sobreposições antigas removidas |
| CEMADEN Nacional (`cemaden_mctic`) | `ultimovalor` (~10 min) por rodada | **Corrigido em 03/10/2026** — era ~40% do oficial; agora cron de 5 min, acumulados oficiais gravados e exibidos (tabela CEMADEN Nacional); `chuva_mm` ainda é balde, os acumulados oficiais são a referência |
| Alerta Rio | `m05` por `read_at` (grade de 5 min) com cron de 5 min, desde 06/10/2026 | Antes (`m15`): 1-24 h dentro de ~1-6%, 96 h com excesso (Urca +13%) e **sentinela −99,99 corrompendo acumulados** (corrigido); reconferir 96 h em 24-48 h |
| Niterói (`niteroi`) | `m05` de `horaLeitura` por rodada (5 min), desde 06/10/2026 | Antes (`m15`): 96 h +3-10% em 25 de 30 estações; reconferir em 24-48 h |
| INEA (`inea`) | `chuva_mm` da tabela por rodada | Frágil; janela do valor **não auditada**; acumulados oficiais agora guardados para a comparação |
| Macaé UFRJ | histórico por minuto do portal (desde 03/10/2026) | **Corrigido:** antes ~3% do oficial (3,4 × 90,8 mm em 24 h); agora igual ao oficial |
| Rio Chuva por Bairro | por rodada | Frágil; não auditado |
| INMET | `CHUVA` (última hora) | Depende de pegar toda hora; não auditado em detalhe |

Causa comum: cadência de ingestão irregular (gaps de 10-70 min medidos
na estação CEMADEN 18790; sem Cron Job controlável pelo usuário no cPanel).

**Opções levantadas (sem decisão do usuário; nada implementado):**
agendar a ingestão a cada 5 min via GitHub Actions chamando
`/api/admin/run/`; tabela de acumulados gravados por estação/janela a cada
ingestão (consultável por SQL, com histórico); tabela com os acumulados
oficiais das fontes que os entregam (CEMADEN 1h…96h; Alerta Rio
`m05/m15/h01..h04/h24/h96/mes`) para referência e comparação; reconciliar
déficit com leitura de "ajuste" marcada; trocar `m15` por `m05` (Alerta
Rio/Niterói); um pedido de refresh por fonte em vez de `/api/refresh/`
único. Decisão por estação e fonte fica com o usuário.

## Ainda não iniciado (Fase 3 do plano)

ANA (hidrologia de barragens/reservatórios), Defesas Civis municipais do
interior do RJ — nenhum desses foi pesquisado ainda. (INPE/CPTEC como fonte
alternativa de satélite deixou de ser prioridade: REDEMET, acima, já cobre
satélite com cadastro simples; só vale revisitar o INPE se o cadastro da
REDEMET emperrar.)

## Atualização 06/10/2026 — Alerta Rio, Niterói, INEA e saúde das fontes

Valor-sentinela −99,99 no Alerta Rio (235 leituras negativas distorcendo acumulados), troca de
`m15` por `m05` com cron de 5 min no Alerta Rio e em Niterói, acumulados oficiais guardados
(Alerta Rio, Niterói, INEA), 2 estações do Alerta Rio que nunca gravaram (nomes), faixa de
saúde das fontes e preenchimento de lacunas do Wunderground: ver
`alerta-rio-niteroi-inea-e-saude-das-fontes.md`.

## Atualização 06-07/10/2026 — Ecowitt, INMET, REDEMET, TX-15

- **Ecowitt (Paracambi):** fora de `PRECIPITACAO_BUCKET_SOURCES` até 06/10 (a tabela de Precipitação não
  mostrava a chuva); incluída. Totais oficiais (1 h, dia, evento, semana, mês, ano, taxa) guardados em
  `raw_metadata["acumulados_oficiais"]`; qualificação aplicada (total que regride, 1ª leitura do dia).
- **INMET:** 26 estações ativas, observação horária; sem acumulados oficiais.
- **REDEMET:** 17 estações, METAR horário (T, Td, vento, QNH); sem chuva/rajada/umidade.
- **"TX-15" do Alerta Rio** = taxa de chuva em mm/h estimada pelos últimos 15 min (acumulado de 15 min
  × 4). A nota antiga de que o nosso "Pico" é "equivalente ao TX-15" **estava errada** (Pico = maior
  balde individual em 24 h).
- Tabelas de todas as fontes, regras de colunas e achados: `tabelas-individuais-por-fonte.md`.
