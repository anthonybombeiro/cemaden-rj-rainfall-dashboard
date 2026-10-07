# Tabelas individuais por fonte — padrão, colunas e achados (06-07/10/2026)

Cada rede da aba **Dados** tem uma tabela própria (`RedeTable.tsx`, endpoint
`GET /api/stations/rede/?source=<slug>`), no mesmo ciclo do CEMADEN Nacional: **comparar com o
valor oficial da fonte → corrigir → qualificar → tabela → testar → documentar**. Documentos
relacionados: `fontes-de-dados.md`, `redes-sensiveis-plugfield-macae-wunderground.md`,
`alerta-rio-niteroi-inea-e-saude-das-fontes.md`, `registro-de-acoes.md`.

## 1. Regras de todas as tabelas

- Linhas ordenadas pela **chuva de 1 h, da maior para a menor** (REDEMET, que não tem chuva,
  ordena por nome); cor da linha = faixas de chuva do painel; hora da atualização com 🕒 nas
  faixas da Rede Salvar; estação clicável (histórico); exportação CSV.
- **Ordem das colunas:** Estação → [Município] → **dados recebidos** (chuva oficial, depois
  meteorologia) → Dir. do vento → situação → **colunas "Calc"** (nosso cálculo, cinza/itálico, só
  para conferir) → [REDEC ou Localização] → Atualizado em → **Código** (última).
- **Redes de uma só cidade não repetem Município/REDEC** (Niterói, Macaé, Alerta Rio, Ecowitt de
  Paracambi). Alerta Rio usa **Localização** (região informada pelo portal) no lugar da REDEC.
- **Calc depois de todos os dados** (pedido de 06/10): em Plugfield e Wunderground o "Calc Hoje"
  fica ao final; no Plugfield passou a existir (antes não havia).
- **Direção do vento** igual à tabela Ventos: bússola + graus + ponto cardeal (ex.: 224° SO).
- A coluna "Fonte/Situação" só existe quando a fonte informa algo (Niterói `is_delay`, Macaé
  online/offline, Plugfield bateria, Wunderground QC, INEA tipo); **no Alerta Rio foi removida**
  (não tinha dado nenhum) e **a coluna Rajada também** (o feed do Alerta Rio não a informa).

## 2. Colunas por fonte

| Aba | Município/REDEC | Chuva (recebida) | Meteorologia | Calc |
|---|---|---|---|---|
| **Alerta Rio** | não (Localização) | 5, 10, 15, 30 min; 1, 2, 3, 4, 6, 12, 24, 96 h; Mês; **TX-15** (como no portal) | T, UR, Vento, **Dir.**, P | 1/24/96 h |
| **Niterói** | não | 5, 10, 15, 30 min; 1, 6, 12, 24, 36, 48, 72, 96, 168 h; 30 d; Mês; "Fonte" = `is_delay` | — | 1/24/96 h |
| **Macaé** | não | 1, 24, 96 h oficiais | T, UR, Vento, Rajada, P, Dir.; Status online/offline | 1/24/96 h |
| **Plugfield** | sim | 1-96 h (soma dos baldes) + **Hoje, Mês, Ano** oficiais | T, UR, Vento, Rajada, P, Dir.; Bat. | **Calc Hoje** |
| **Wunderground** | sim | 1-96 h (soma) + **Hoje** oficial + mm/h | idem; QC (✓/✗/—) | Calc Hoje |
| **INEA** | sim | **1, 4, 24, 96 h e 30 d oficiais** | Nível (m); Tipo Plu/Flu | 1/24/96 h |
| **Ecowitt** (Paracambi) | não | **1 h, Hoje, Evento, Semana, Mês, Ano, mm/h** oficiais | T, UR, Vento, Rajada, P, Td, Rad., Dir. | 1/24 h e Hoje |
| **INMET** | sim | 1-96 h e Hoje (soma das horas gravadas) | T, Tmáx, Tmín (da hora), UR, Vento, Rajada, P, Rad., Dir. | — |
| **REDEMET** | sim | — (METAR não informa chuva) | T, Td, Vento, P (QNH), Dir. | — |

## 3. TX-15 (Alerta Rio) — o que é

No portal do Alerta Rio (`websempre.rio.rj.gov.br/estacoes/`, tabela "Dados Pluviométricos", sem
legenda explicativa) a coluna **"TX - 15" é a TAXA de chuva em mm/h estimada pelos últimos 15
minutos: o acumulado de 15 min × 4.** Conferido nos números do portal em 06/10/2026
(21:15 BRT): Barra/Barrinha 15 min = 6,8 → TX-15 = 27,2; Bangu 1,4 → 5,6; Barra/Riocentro 3,0 →
12,0; Ilha do Governador 1,0 → 4,0; Copacabana 0,2 → 0,8. É a unidade das faixas de intensidade da
legenda (Fraca 0,2-5 mm/h, Moderada 5,1-25, Forte 25,1-50, Muito Forte > 50); a cor da linha no
portal segue a **chuva de 1 h**, não o TX-15. A tabela usa o valor do portal (ou 15 min × 4).
**Correção:** o nosso "Pico" da tabela de Precipitação (maior balde individual em 24 h) tinha
sido documentado como "equivalente ao TX-15" — **não é**; o texto foi corrigido.

## 4. Achados por fonte (resumo)

- **Alerta Rio:** o feed JSON não tem 10 min, 30 min, 6 h, 12 h, TX-15 nem Localização; a página
  HTML do portal tem (4 regiões: Zona Sul, Baía de Guanabara, Barra/Jacarepaguá, Baía de
  Sepetiba); "ND" = sem dado. O conector lê as duas e completa o retrato oficial. **Cada
  estação só atualiza a cada 10 min** (ver `alerta-rio-niteroi-inea-e-saude-das-fontes.md` §2).
- **INEA:** nosso cálculo ficava **abaixo do oficial** (96 h: média −17,8 mm, 73 de 92 estações
  com |erro| > 2 mm; 24 h: −1,7 mm, 17 de 92; 1 h: −0,2 mm). As estações têm fases próprias de
  15 min e há dados que chegam atrasados e que nunca vemos. **Solução:** a tabela de
  Precipitação passou a exibir o valor OFICIAL das janelas que a fonte informa (ver §5).
- **Ecowitt (Paracambi):** a fonte não estava em `PRECIPITACAO_BUCKET_SOURCES` — a tabela de
  Precipitação **não mostrava nenhuma chuva** dessas 2 estações apesar de ~400 leituras gravadas.
  Incluída; o total do dia nosso = oficial (BNH de Cima 1,0 × 1,0; Cascata 4,6 × 4,6). A API
  entrega 1 h, dia, evento, semana, mês, ano e taxa, agora guardados como retrato oficial; qualificação
  de chuva aplicada (total que regride, 1ª leitura do dia).
- **INMET:** 26 estações, todas ativas, 1 observação por hora (48 instantes em 2 dias, maior
  lacuna 16 h); sem acumulados oficiais — a chuva é o total de cada hora.
- **REDEMET:** 17 estações (16 com leitura; Porto do Açu/SBPW sem dado), observação horária; sem
  chuva, sem rajada, sem umidade.

## 5. Valor oficial na tabela de Precipitação (06/10/2026)

`StationViewSet._calcular_precipitacao` agora **substitui o nosso cálculo pelo valor oficial** nas
janelas que a fonte informa (`MAPA_ACUMULADOS_OFICIAIS`: Alerta Rio, Niterói, INEA, Macaé,
CEMADEN Nacional, Ecowitt), desde que o retrato tenha até **2 h** (`OFICIAL_VALIDADE_H`); caso
contrário (estação parada) vale o nosso. O que a fonte marca como ND/sentinela é ignorado. O
nosso cálculo original fica em `entry["calculado"]` e **sempre** nas colunas "Calc" das tabelas por
rede (`rede`, `cemaden` e a ação `snapshot_precip` usam `usar_oficiais=False`). Motivo: o
oficial inclui dados atrasados que nunca recebemos; fabricar leituras de "ajuste" foi descartado
(distorce janelas curtas e pode contar a mesma chuva duas vezes).

## 6. Layout no celular (06/10/2026)

A faixa de saúde das fontes e o aviso das sirenes empurravam o conteúdo e a base da tela
(botões Opções/Legenda do mapa) ficava cortada. Correções: raiz com `h-dvh` (altura dinâmica da
janela, em vez de `h-screen`/100vh), padding inferior com `env(safe-area-inset-bottom)`, faixa de
saúde em **uma linha** truncada e aviso das sirenes com fonte menor no celular. Testado em
emulação 375×812: raiz com 812 px, barra inferior encostada, botões visíveis.
