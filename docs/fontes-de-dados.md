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

## CEMADEN Nacional — documentado, não testável a partir deste ambiente

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
em tempo real — inclusive quando uma sirene está TOCANDO. O diretor vai
gerar um login/senha dedicados pra essa parte (ainda não integrada; exige
sessão autenticada, diferente da tabela pública). Isso é operacionalmente
importante: mostrar acionamento de sirene no mapa em tempo real.

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

## REDEMET (DECEA/Força Aérea) — API confirmada, cobre estações + satélite + radar (01/10/2026)

Levantamento feito a pedido do usuário: (1) como inserir no mapa uma camada de
imagem de satélite/radar, do jeito que a maioria dos painéis de monitoramento
faz; (2) verificar se dá pra agregar as estações meteorológicas da
Aeronáutica (aeródromos). **Boa notícia: as duas coisas vêm da mesma fonte.**
REDEMET (Rede de Meteorologia do Comando da Aeronáutica, operada pelo DECEA)
tem uma API pública dedicada que cobre METAR, satélite e radar num só
cadastro.

### Acesso

- Site institucional: `https://redemet.decea.mil.br` (o domínio antigo
  `redemet.aer.mil.br` faz 301 pra esse). Página "O que é a API-REDEMET":
  `https://ajuda.decea.mil.br/base-de-conhecimento/api-redemet-o-que-e/`.
- **Base da API:** `https://api-redemet.decea.mil.br`
- **Cadastro obrigatório, mas simples e aparentemente gratuito:**
  `https://api-redemet.decea.mil.br/cadastro-api/` — formulário com nome,
  sobrenome, e-mail e "motivo de uso da API" (até 1.500 caracteres), botão
  "Enviar solicitação". Não achamos documentação pública sobre preço, prazo
  de aprovação ou limite de requisições — precisa cadastrar pra descobrir
  (mesmo padrão de "contato institucional" que já funcionou pro
  CEMADEN-RJ/GridLab neste projeto). **Próximo passo prático: o usuário (ou
  quem for operar a conta) preenche esse formulário pra conseguir a
  `api_key`.**
- Autenticação: `api_key` como query param em toda chamada (confirmado
  também por teste direto: `GET /mensagens/metar/SBGL` sem chave devolveu
  `401 Unauthorized`, o que confirma que o endpoint existe e exige a chave).

### Estações da Aeronáutica (METAR) — para agregar ao mapa de estações

- Endpoint (padrão por analogia com os outros confirmados, e validado como
  rota real pelo 401 acima): `GET /mensagens/metar/{icao}?api_key=...`.
  A API também expõe categorias "Aeródromos", "Aeródromos Status",
  "Aeródromos Info" (lista/metadados de estação) e mensagens TAF, SIGMET,
  GAMET, PILOT, TEMP, avisos de aeródromo e meteogramas — mesma família de
  endpoints, mesmo padrão de autenticação.
- **Aeródromos no RJ com METAR confirmados nesta pesquisa** (via fontes
  aeronáuticas abertas, não via chamada autenticada — falta validar contra a
  lista oficial da API assim que tivermos a chave): `SBGL` (Galeão),
  `SBRJ` (Santos Dumont), `SBAF` (Campo dos Afonsos), `SBME` (Macaé),
  `SBCB` (Cabo Frio), `SBCP` (Campos dos Goytacazes/Bartolomeu Lisandro).
  Pode haver mais (bases militares como Santa Cruz/SBSC, Resende/SBVR) —
  confirmar com o endpoint de aeródromos assim que a chave chegar, filtrando
  por UF/estado RJ do mesmo jeito que já fazemos pro INMET.
- Dado histórico disponível desde 01/01/2006, segundo a doc oficial.

### Radar — camada pra mapa

- Endpoint: `GET /produtos/radar/{tipo}?area={codigo}&data={YYYYMMDDHH}&anima={1..15}&api_key=...`
  (`data` e `anima` opcionais, default = agora / 1 imagem).
- `tipo` = corte de altitude do eco: `maxcappi` (400km raio, composição de
  toda a coluna), `10km`/`07km`/`05km`/`03km` (CAPPI em altitude fixa, 250km
  de raio cada).
- `area` = 26 códigos de radar espalhados pelo Brasil. **O que cobre o RJ é
  `pc` = Pico do Couto (Petrópolis)** — é o único radar do estado na lista
  oficial da API.
- **Ressalva importante, achada numa busca separada:** o radar de Pico do
  Couto foi **desligado em 2016 por corte orçamentário** (junto com mais 4
  radares do DECEA) e não achamos confirmação de que foi reativado — a
  notícia mais recente sobre renovação da rede de radares do DECEA (contrato
  RMT 0200 assinado em 2023) fala de instalações em Rio Branco/AC, Belém/PA,
  Cachimbo/PA, Chapada dos Guimarães/MT e Vilhena/RO, **não menciona
  Pico do Couto**. Ou seja: **a API provavelmente aceita `area=pc` mas pode
  devolver imagem vazia/desatualizada**, porque o radar físico pode estar
  fora do ar. **Isso só dá pra confirmar testando de verdade com a chave em
  mãos** (ver se `data` do produto retornado é recente). Se `pc` estiver
  morto, a imagem mais próxima que cobriria o RJ seria `st` (Santa
  Teresa/MG, mais distante) ou nenhuma — nesse caso vale considerar a
  alternativa global abaixo (RainViewer) como fallback visual, mesmo sendo
  resolução mais grosseira.
- Resposta é **JSON** com metadados + a imagem (caminho/arquivo), não um
  tile WMS pronto — inclui limites geográficos (`lat_lon`) da imagem, o que
  é exatamente o que o Leaflet precisa pra desenhar a imagem sobreposta no
  lugar certo (ver seção de implementação abaixo).

### Satélite — camada pra mapa

- Endpoint: `GET /produtos/satelite/{tipo}?data={YYYYMMDDHH}&anima={1..15}&api_key=...`
- `tipo`: `ir` (infravermelho), `realcada` (infravermelho colorida/realçada,
  a mais usada em painéis por ser mais legível), `vis` (visível, só útil de
  dia).
- Mesmo formato de resposta do radar: JSON com `lat_lon` (limites
  geográficos), caminho da imagem e timestamp — cobre o Brasil/América do
  Sul inteiro (não é recortado por estado), então uma imagem só já serve
  pro painel inteiro, sem precisar escolher "área" como no radar.
- Cobertura nacional/continental quer dizer que esta camada **não depende**
  do problema de radar desligado acima — é a aposta mais segura de "imagem
  de satélite sempre disponível" pro painel.

### Carta SIGWX (bônus, menor prioridade)

- `GET /produtos/sigwx?api_key=...` — devolve só a URL da carta mais recente
  (PNG), sem parâmetro de data (não dá pra pegar histórico). Baixa
  prioridade — é carta de tempo significativo em altitude, mais voltada pra
  navegação aérea do que pro monitoramento de chuva/risco deste painel.

### Como isso se encaixa no mapa (Leaflet) — padrão usado pela maioria dos painéis

O `MapView.tsx` atual (`frontend/src/components/MapView.tsx`) só tem um
`<TileLayer>` fixo do OpenStreetMap como base, sem nenhum overlay
meteorológico ainda. O padrão comum em painéis de monitoramento (Windy,
RainViewer, os próprios sites da Marinha/INMET) pra uma imagem de
satélite/radar que não é um tileset próprio (como é o caso do REDEMET, que
devolve uma imagem única georreferenciada, não um `{z}/{x}/{y}.png`) é:

1. Buscar o JSON do produto (radar ou satélite) num endpoint do nosso
   próprio backend (proxy — a `api_key` da REDEMET não deve ir pro
   frontend/navegador do usuário final, mesmo padrão já usado com outras
   chaves deste projeto, ex. `WUNDERGROUND_API_KEY`).
2. No frontend, usar `L.imageOverlay(urlDaImagem, bounds)` do Leaflet (ou o
   componente `<ImageOverlay>` do `react-leaflet`, já que o projeto já usa
   essa lib) — `bounds` vem direto do `lat_lon` que a REDEMET retorna no
   JSON, sem precisar calcular nada.
3. Expor isso como camada opcional/toggle (`<LayersControl>` do
   react-leaflet, ou um botão flutuante como o `LegendaFlutuante` que já
   existe no `MapView.tsx`), com opacidade reduzida (~0.5-0.6) pra não
   esconder as estações por baixo — é o padrão visual de praticamente todo
   painel de chuva com radar/satélite.
4. Para animação (campo `anima`, até 15 quadros), um player simples
   (ciclar a cada ~500ms entre as imagens retornadas) replica o que a
   maioria dos painéis faz pra mostrar deslocamento de nuvens/chuva.
5. Cache: como a REDEMET atualiza essas imagens periodicamente (não a cada
   request), o proxy do backend pode cachear por alguns minutos (mesmo
   princípio já usado no `.htaccess` do projeto pra outras APIs, ver commit
   "Corrige .htaccess: cache de 24h estava pegando respostas da API" — aqui
   o TTL teria que ser bem mais curto, minutos, não 24h, por ser imagem que
   muda com frequência).

### Próximos passos

1. **Usuário preenche o cadastro** em
   `https://api-redemet.decea.mil.br/cadastro-api/` pra obter a `api_key`.
2. Com a chave em mãos, testar de verdade: (a) `produtos/radar/maxcappi?area=pc`
   pra confirmar se Pico do Couto está mesmo fora do ar ou se já foi
   reativado; (b) `produtos/satelite/realcada` pra confirmar formato real da
   resposta/`lat_lon`; (c) `mensagens/metar/SBGL` e os outros códigos ICAO
   do RJ listados acima, e consultar o endpoint de "Aeródromos" pra pegar a
   lista oficial completa (lat/lon, status) em vez da lista montada por
   busca nesta sessão.
3. Escrever `backend/ingestion/connectors/redemet.py` (estações METAR, igual
   padrão INMET: metadados + última leitura) e um endpoint de proxy
   `backend/api/` pra radar/satélite (não é ingestão agendada tipo
   `Reading`, é mais parecido com um proxy de imagem sob demanda, com
   cache).
4. No frontend, adicionar `<ImageOverlay>`/`<LayersControl>` em
   `MapView.tsx` consumindo esse proxy.

## Ainda não iniciado (Fase 3 do plano)

ANA (hidrologia de barragens/reservatórios), Defesas Civis municipais do
interior do RJ — nenhum desses foi pesquisado ainda. (INPE/CPTEC como fonte
alternativa de satélite deixou de ser prioridade: REDEMET, acima, já cobre
satélite com cadastro simples; só vale revisitar o INPE se o cadastro da
REDEMET emperrar.)
