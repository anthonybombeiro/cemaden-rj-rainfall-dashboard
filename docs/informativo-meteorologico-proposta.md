# Informativo meteorológico — proposta detalhada (28/10/2026)

Pedido do usuário: detalhar como implementar o informativo meteorológico, com todas as funcionalidades e ideias. Base: protocolo (Procedimento 06, itens 1.3 e 7.1), modelo de texto `Informativos_meteorológicos_10_Outubro` (nº 168 a 193/2026), planilha `INFORMATIVOS METEOROLÓGICOS_CONTROLE` (2020–2026, ≈ 1.400 informativos, ≈ 9,3 mil linhas) e a imagem do texto enviado no grupo (nº 140/2025). **Proposta: nada foi implementado.** Visão geral dos módulos em `protocolos-meteorologia-levantamento.md` (§5.5).

## 1. O que é hoje (processo manual)

1. A meteorologista escreve o texto e manda ao técnico.
2. O técnico revisa, junta a imagem de radar com legenda (`Radar Tool INEA (Pico do Couto) — Atualização de 03h16 (horário local)`) e, quando há descargas, a imagem do detector; envia ao operador no grupo 00 **na ordem: informativo, imagem de radar, legenda**.
3. Salva o texto no documento de informativos (numerados; se faltar algum número, completa) e **preenche a planilha de controle**: uma linha por REDEC com nº, ano, data, hora, previsão de chuva, previsão de vento e **SMS (SIM/NÃO)**.
4. Reenvia radar/legenda a cada 30 min (núcleos intensos), 1 h ou 2 h (noite) e atualiza o informativo a cada 6 h se a chuva continua.
5. Fica atento: núcleo em região **fora** do informativo vigente → avisa a meteorologista para atualizar.
6. Se houver SMS, usa o IDAP (146 caracteres; 62 para TV, só severidade "muito alta"), com ok do diretor.
7. No fim do turno, cita os informativos e SMS no Livro de Ocorrências.

Dores observadas nas bases: numeração e controle manuais; REDEC e intensidade em texto livre ("Fraca / Moderada", "fraca/moderada", "chuva fraca a moderada"); erros de grafia ("BAIXADA FLUMINESE", "SIL II"); ano trocado em datas; REDECs agrupadas nos anos antigos (SERRANA, SUL, NORTE / NOROESTE); texto salvo em um arquivo e dados em outro, sem ligação.

## 2. Visão da solução

Um **compositor** que gera o texto no modelo exato a partir de uma matriz por REDEC, grava **uma vez** (texto + controle + SMS) e aproveita o registro em tudo: pacote de envio, relógio do radar, alerta de região descoberta, Livro de Ocorrências, estatísticas, verificação e sugestão de NM.

**Onde:** Produção → Meteorologia → Produtos → **Informativo** (e o histórico em Produção → Meteorologia → Produtos → Informativo → Histórico). Leitura (informativo vigente) aparece como faixa em Alertas e no Resumo 24 h.

## 3. Funcionalidades

### 3.1 Núcleo (MVP)
| # | Funcionalidade | Detalhe |
|---|---|---|
| F1 | **Matriz por REDEC** | 11 REDECs × {cenário atual, previsão 6 h}. Intensidade em lista fechada: *fraca; fraca a moderada; moderada; moderada a forte; moderada a ocasionalmente forte; pontualmente muito forte*. Complementos: raios, rajadas (moderado, moderado a ocasionalmente forte), granizo pontual, "de forma isolada", "se aproxima por Minas Gerais/Espírito Santo/São Paulo" |
| F2 | **Texto no modelo exato** | Cabeçalho (`CEMADEN-RJ`, `INFORMATIVO METEOROLÓGICO n°N/AAAA`, data, horário), `CENÁRIO ATUAL`, `PREVISÃO PARA AS PRÓXIMAS 06 HORAS`, rodapé fixo; emojis por classe (fraca = chuva leve, moderada = chuva, forte/raios = tempestade, granizo) |
| F3 | **Agrupamento das regiões** | Regiões com a mesma condição entram na mesma frase, em ordem canônica (Costa Verde, Sul I, Sul II, Capital, Baixada Fluminense, Serrana I, Serrana II, Metropolitana, Baixada Litorânea, Norte, Noroeste). Regras vistas nos informativos reais: "na região X" / "nas regiões A, B e C"; "em todo o estado" (11 de 11); "em todas as regiões, exceto Norte e Noroeste" (a partir de 8); "nas demais regiões" (resto da matriz) |
| F4 | **Numeração automática** | Próximo nº = último do ano + 1; reinicia em janeiro. Número **reservado** ao abrir (evita dois técnicos com o mesmo número) |
| F5 | **Registro e controle** | Grava o informativo e uma linha por REDEC (chuva atual, chuva prevista, vento, raios, granizo, **SMS enviado SIM/NÃO**). Substitui o docx e a planilha de controle |
| F6 | **Copiar e baixar** | Copiar texto; baixar pacote na ordem do protocolo (texto, imagem de radar, legenda) |
| F7 | **Texto editável** | O texto gerado pode ser ajustado à mão antes de copiar; o painel guarda o texto final **e** a matriz |
| F8 | **Histórico** | Lista por data/REDEC/intensidade/SMS, abrir, **duplicar como novo** (a maioria dos informativos atualiza o anterior), exportar CSV/XLSX |

### 3.2 Apoio ao plantão
| # | Funcionalidade | Detalhe |
|---|---|---|
| F9 | **Sugestão do cenário atual** | Para cada REDEC, a classe da maior chuva de 15 min / 1 h das estações (fraca, moderada, forte, muito forte, pela **escala única** de chuva) pré-marca a matriz; o técnico confirma. Fonte: `/stations/precipitacao` |
| F10 | **Sugestão da previsão 6 h** | Pré-marca a partir da `Previsao` do dia (ícone de chuva/raios por REDEC) e do último informativo; sempre editável |
| F11 | **Quando emitir** | Faixa "há chuva moderada a forte em Sul I desde 14:10 — último informativo há 7 h" (protocolo 7.1: emitir com chuva moderada a forte; renovar a cada 6 h) |
| F12 | **Região descoberta** | Compara estações (chuva ≥ moderada) com as regiões do informativo vigente: "Serrana II com chuva moderada e fora do informativo nº 194 — avisar a meteorologista". Na fase 2 acrescenta o radar |
| F13 | **Relógio do pacote** | Contagem regressiva para reenviar radar/legenda: 30 min (núcleos intensos ou chuva forte), 1 h (moderada), 2 h entre 22 h e 06 h, 3 h à noite com núcleos fracos. **Regras configuráveis** (o protocolo traz valores diferentes em três trechos) |
| F14 | **Recorte de radar com legenda** | Botão no próprio informativo: pega o quadro do radar escolhido, recorta o estado com divisas municipais e escreve `Radar Tool INEA (Pico do Couto)` + `Atualização de HHhMM (horário local).` com a hora do quadro |
| F15 | **Números faltando** | Alerta de lacuna na sequência ("faltam os nº 187 e 188") — o protocolo pede completar o arquivo quando falta número |
| F16 | **Fluxo de revisão** | Estados **rascunho → revisado → enviado**: a meteorologista cria o rascunho (ou preenche a matriz), o técnico revisa e marca "enviado" com hora. Registra quem fez cada passo |

### 3.3 Ligações com o resto do painel
| # | Funcionalidade | Detalhe |
|---|---|---|
| F17 | **Sugestão de SMS/TV (IDAP)** | Se a previsão chega a "moderada a forte" ou mais, abre o modelo de mensagem com contador (146 SMS / 62 TV), lembrando "só severidade moderada ou acima" e "ok do diretor". O SMS **não é enviado** pelo painel; o técnico marca "SMS enviado" por REDEC |
| F18 | **Sugestão de NM** | Informativo com "moderada a forte" ou "raios/rajadas" numa REDEC gera **sugestão** para os municípios da REDEC em Produção → Pendências (equipe **meteorologia**). Tabela de correspondência proposta na §6; a decisão continua humana |
| F19 | **Faixa do informativo vigente** | Em Alertas e no Mapa: "Informativo nº 194 — 15:20 — válido até 21:20 — Sul I, Sul II, Serrana I", com cor pela maior intensidade; some ao fim da validade (6 h) |
| F20 | **Mapa e arte** | Mapa das 11 REDECs coloridas pela previsão do informativo (mesmo estilo do mapa da previsão) para acompanhar o texto como imagem |
| F21 | **Livro de Ocorrências** | Gera sozinho a frase do protocolo: "Informativo meteorológico n° 194/2026 enviado às 15h20 para as regiões … SMS+TV enviado via IDAP para os municípios …" |
| F22 | **Resumo 24 h** | Lista dos informativos do dia e do turno |
| F23 | **Página pública (opcional)** | Informativo vigente em `/publico` (decisão do usuário; hoje a página só mostra NM e mapas de risco) |

### 3.4 Qualidade e gestão
| # | Funcionalidade | Detalhe |
|---|---|---|
| F24 | **Importação do histórico** | Comando `importar_informativos` lê o CSV exportado da planilha de controle (2020–2026) e **normaliza** REDEC e intensidade; o que não reconhecer vai para uma fila "revisar". Roda primeiro no banco local; em produção só com autorização |
| F25 | **Estatísticas** | Informativos por mês, por REDEC, por intensidade; % com SMS; intervalo entre informativos; horários mais comuns |
| F26 | **Verificação do informativo** | Para cada REDEC, "previu moderada a forte nas 6 h" × "houve ≥ moderada nas estações": acerto, falso alarme, erro, acerto negativo (mesmos índices de Wilks da verificação mensal) |
| F27 | **Auditoria** | Quem criou, revisou, editou e enviou; nada é apagado (cancelar = marcar "cancelado" com motivo); histórico de edições |
| F28 | **Modo texto livre** | Para casos fora do padrão (alerta de granizo isolado, "raios e rajadas"): mesmo cabeçalho/rodapé, texto livre, mesma numeração e registro |
| F29 | **Celular** | Matriz e botões usáveis em tela estreita (plantão e conferência pelo celular) |

## 4. Telas (resumo)

1. **Compositor** — esquerda: matriz com sugestões marcadas e destaque no que difere do informativo anterior; direita: texto pronto, contador de caracteres do SMS, botões Copiar / Baixar pacote / Marcar enviado.
2. **Acompanhamento** (topo da aba Plantão e do Informativo) — informativo vigente, **relógio do próximo radar**, alerta de região descoberta, "emitir?" (F11), números faltando (F15), SMS pendentes de marcação.
3. **Histórico** — tabela com filtros, abrir/duplicar, exportar; gráfico simples por mês.
4. **Fila de importação** — itens a revisar após importar 2020–2026 (primeira vez).

## 5. Modelo de dados e API

```
InformativoMeteorologico
  numero (int), ano (int)  [único por ano]   estado: rascunho|revisado|enviado|cancelado
  emitido_em (datetime)    texto (text)      texto_gerado (text)    texto_livre (bool)
  radar_fonte (str)        radar_quadro_em (datetime)
  criado_por, revisado_por, enviado_por (+ datas)   observacao
InformativoRegiao  (1 por REDEC; 11 por informativo)
  informativo (FK)  regiao (choice das 11 REDECs)
  chuva_atual   (choice: —, fraca, fraca_moderada, moderada, moderada_forte, moderada_ocasion_forte, pontual_muito_forte)
  chuva_prevista (idem)   vento_previsto (choice)   raios (bool)   granizo (bool)   isolada (bool)
  sms_enviado (bool)      sms_enviado_em (datetime null)
```
* **Rotas** (`/api/informativos/`): lista/criar/editar; `proximo-numero/` (reserva); `sugestao/` (F9–F12: classes por REDEC, "emitir?", região descoberta); `historico/export/`; `importar/` (somente comando de gestão, não rota).
* **Permissões:** qualquer usuário logado cria e envia (como o NM); papéis de rascunho/revisão só registram quem fez, não bloqueiam.

## 6. Regras de texto e sugestão de NM

**Frases (derivadas dos 26 informativos de outubro):**
* Cenário: `Núcleo(s) de chuva {intensidade} na(s) região(ões) {lista}.` / `Núcleos de chuva {intensidade} atuam em …` / `… se aproximam da região X, por Minas Gerais.`
* Previsão: `Pancadas {isoladas} de chuva {intensidade}[, com raios,][ e rajadas de vento moderado a ocasionalmente forte,] nas regiões {lista}.` / `Chuva fraca isolada nas demais regiões.` / `Possibilidade de granizo pontual nas regiões {lista}.`
* Rodapé: "Em caso de mudança de cenário, a Defesa Civil Estadual atualizará as informações e emitirá os alertas necessários pelas equipes de monitoramento do CEMADEN-RJ." + "Fiquem atentos aos informativos e alertas emitidos por nossas fontes oficiais." + "Sigam o perfil @defesacivil_rj para informações atualizadas." (nos informativos mais antigos o último parágrafo é "A equipe de meteorologia segue monitorando…": o rodapé fica em configuração).

**Sugestão de NM a partir do informativo (rascunho para aprovação do usuário; sempre sugestão):**
| Previsão do informativo para a REDEC | Sugestão para os municípios da REDEC |
|---|---|
| fraca / fraca a moderada | sem sugestão (NM 0–1) |
| moderada | NM 1 |
| moderada a forte, com raios ou rajadas | NM 2 |
| moderada a forte ocasionalmente muito forte / granizo / rajada muito forte | NM 3 (somente a pedido da meteorologia; nunca NM 4 sem gatilho/fenômeno) |

## 7. Arquivos

| Camada | Arquivo | Mudança |
|---|---|---|
| Backend | `backend/core/models.py` + migração `0026_…` | `InformativoMeteorologico`, `InformativoRegiao` |
| Backend | `backend/core/informativos.py` (novo) | vocabulário, normalização de REDEC/intensidade, geração do texto e agrupamento (testável) |
| Backend | `backend/api/serializers.py`, `views.py`, `urls.py` | rotas acima |
| Backend | `backend/core/management/commands/importar_informativos.py` | importação do histórico |
| Backend | `backend/api/test_informativos.py` | testes (reproduzir os nº 190 e 193; agrupamento; numeração; importação) |
| Frontend | `frontend/src/lib/informativos.ts` | vocabulário, texto, agrupamento, regras do relógio |
| Frontend | `frontend/src/components/producao/Informativo.tsx`, `InformativoHistorico.tsx`, `AcompanhamentoPlantao.tsx` | telas |
| Frontend | `frontend/src/components/ProducaoPanel.tsx` (seletor de equipe) | entrada na aba Produção |
| Frontend | `AlertsPanel.tsx` / `MapView.tsx` | faixa do informativo vigente; botão de recorte de radar |
| Docs | `registro-de-acoes.md`, este arquivo | registro |

## 8. Fases e testes

| Fase | Entrega | Migração em produção |
|---|---|---|
| A | F1–F8 (compositor, texto, numeração, registro, histórico) + testes de texto com os nº 190 e 193 | **Sim** (0026) |
| B | F9–F16 (sugestões, relógio, região descoberta, recorte de radar, lacunas, fluxo de revisão) | Não |
| C | F17–F23 (SMS, sugestão de NM, faixa, mapa, L.O., resumo, página pública) | Não (só se F23) |
| D | F24–F27 (importação, estatísticas, verificação, auditoria) | Importação **em produção só com autorização** |

Testes locais (sempre com banco de teste, nunca em dado real): (1) gerar o texto dos nº 168 a 193 a partir de matrizes montadas à mão e comparar com o docx; (2) importar o CSV no SQLite de teste e conferir contagens por ano (2026 = 193, 2025 = 184); (3) numeração com dois usuários simultâneos; (4) relógio e alerta de região descoberta com leituras simuladas; (5) tela em 375 px.

## 9. Decisões que pedem resposta
1. O fluxo **rascunho → revisado → enviado** entra já no início (F16) ou fica para depois?
2. Cadência do radar: confirmar 30 min / 1 h / 2 h (noite) / 3 h e quando vale cada uma.
3. O informativo vigente aparece na página pública (F23)?
4. A tabela de sugestão de NM da §6 está certa? Quem decide NM 3 a partir da meteorologia?
5. O rodapé é sempre o mesmo ou muda por situação?
6. Importar o histórico completo (2020–2026) ou só 2025–2026?
7. Lista de municípios **não autônomos** do IDAP (para a sugestão de SMS): a diretoria repassa; pode ser carregada como configuração.
