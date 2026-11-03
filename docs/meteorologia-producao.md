# Produção da Meteorologia (03/11/2026)

Entrega dos itens 1 a 8 pedidos em 03/11/2026 a partir do levantamento de protocolos (`docs/protocolos-meteorologia-levantamento.md`). O painel **não envia nada** (Telegram, Idap, e-mail, redes): entrega texto/arte prontos e registra o que a equipe fez.

## O que foi feito

| # | Item | Onde | Estado |
|---|---|---|---|
| 1 | Calendário de dias com chuva ≥ 10 mm/dia, por REDEC | Resumo 24 h → Mensal | publicado |
| 2 | Aviso da previsão de amanhã às **16 h** (era 15 h 30) | faixa âmbar (`PrevisaoAmanhaBanner`) | publicado |
| 3 | Alertas de limiar | faixa no Resumo 24 h e em Produção → Meteorologia → Plantão | publicado |
| 4 | Suporte de Meteorologia (Idap, Cell Broadcast, severidade) | Produção → Meteorologia → Suporte | **só local** (ver `docs/suporte-meteorologia-proposta.md`) |
| 5 | Arte dos 10 maiores acumulados em 24 h (base 06 h) | Produção → Meteorologia → Acumulados | tabela/texto publicados; **arte só local** (aguarda aprovação do modelo) |
| 6 | Aviso meteorológico (nº/AAAA, vigência, SMS/TV Idap) | Produção → Meteorologia → Aviso | registro publicado; **arte só local** |
| 7 | Livro de ocorrências e passagem de plantão | Produção → Meteorologia → Livro de ocorrências | publicado |
| 8 | Checklist do plantão 07 h → 07 h, compartilhado | Produção → Meteorologia → Plantão | publicado |

"Só local" = atrás da variável `NEXT_PUBLIC_MET_EXPERIMENTAL=1` (definida apenas no `frontend-local` do `.claude/launch.json`). Sem ela, o build de produção nem inclui o código (import condicional com `lazy`).

## Regras

* **Limiares** (`api/meteorologia_views.py`): chuva **> 25 mm em 1 h** em qualquer estação ("reportar no 00 e avisar a meteorologista"); **3 ou mais estações com 40 mm ou mais em 24 h** ("fazer a tabela de acumulados"; o protocolo escrito dizia 30 mm); umidade **< 30 %** (último valor da última hora e meia). Soma das leituras (não usa o valor oficial da fonte). Só estações com município de alguma REDEC do RJ. Cache de 2 min. `GET /api/meteorologia/limiares/`.
* **Calendário de chuva:** `GET /api/resumo/chuva-calendario/?mes=AAAA-MM&limiar=10`. Dia civil local (o dia é calculado somando o deslocamento de fuso à hora UTC, sem depender de tabelas de fuso do MySQL); soma por estação e dia; mostra o dia se alguma estação (do estado ou da REDEC escolhida) somou o limiar. Cores pela maior chuva (≥ 10, ≥ 30, ≥ 70 mm, como o Resumo). Clique no dia lista as estações.
* **Acumulados:** `GET /api/meteorologia/acumulados/?ref=AAAA-MM-DDTHH:MM&n=10`. Janela de 24 h que termina às 06 h (padrão: a última 06 h já passada), leitura das 06 h inclusive. Um município por linha (estação de maior valor). Rótulos da arte: INMET, ANA, INEA, Alerta Rio, CEMADEN/MCTI, CEMADEN-RJ, "DC <município>" (Plugfield e redes municipais). **Weather Underground fica de fora** (a arte é pública e os termos proíbem redistribuir). Municípios sem REDEC (ex.: estações de MG do Muriaé) ficam de fora. Aviso "3+ estações > 40 mm: tabela recomendada". Janelas passadas usam só a soma das leituras (o valor oficial da fonte só existe para a janela que termina agora).
* **Aviso meteorológico:** `core.AvisoMeteorologico`; nº reservado ao criar (reinicia por ano; número cancelado não é reaproveitado); rascunho → emitido → (reaberto) / cancelado com motivo; emitido só aceita edição dos dados do Idap; SMS ≤ 146 e TV ≤ 62 caracteres (validado no backend); registro do envio Idap (enviado, municípios, protocolo). Endpoints `/api/avisos-meteorologicos/`.
* **Checklist:** itens e horários em `core/plantao.py` (do protocolo 2026; trocar o protocolo = trocar a lista). Turno identificado pela data em que começou às 07 h (antes das 07 h vale o turno de ontem). Marca compartilhada (`ItemPlantao`: quem e quando). Itens condicionais ("se houver": acumulados) não contam como pendência. Segunda e quinta mostram "Tendência"; dia 10 mostra o simulado das 10 h. Pendências do turno anterior no topo. `GET/POST /api/plantao/checklist/`.
* **Livro de ocorrências:** `core.OcorrenciaPlantao` (um por turno). Informativos enviados, avisos emitidos e envios da Idap do turno entram sozinhos; o técnico completa técnicos, operador e demais ocorrências; o texto sai no formato do procedimento 03 (assunto "Ocorrências Gerais – dd/mm/aa hh/mmh"). **Os e-mails dos destinatários não estão no código**: ficam em Admin → Configuração do plantão (um por linha). `GET/POST /api/plantao/livro/`.
* **Arte dos acumulados:** 1024×1280 (modelo do anexo). Cabeçalho, ícones e rodapé são recortes do modelo (`frontend/public/arte/`). **Arte do aviso:** desenho do aviso nº 013/2025 do protocolo (faixa laranja, cartão branco, rodapé); texto com `**negrito**`, ajusta o tamanho ao comprimento; legenda de chuva opcional. Existe um segundo modelo no protocolo (aviso nº 014/2025, fundo azul com legenda) que pode ser adotado no lugar.

## Banco

Migração `core/0035_meteorologia_producao`: `AvisoMeteorologico`, `OcorrenciaPlantao`, `ItemPlantao`, `ConfiguracaoPlantao`. Todas novas, nada alterado nas existentes.

## Testes

`api/test_meteorologia.py` (19 testes: acumulados, calendário no fuso local, limiares, aviso, checklist, livro). Suíte completa: 149 testes OK. Local: banco de teste SQLite e navegador com dados fictícios; nada gravado em produção.

## Decisões em aberto

* Hora do item "Revisar e enviar a previsão" no checklist: mantida em 15 h 30 (protocolo escrito); o aviso passou para 16 h por pedido. Confirmar se o item deve ir para 16 h.
* Nomes das regiões na arte: oficiais de 11 REDECs (Sul I, Sul II…), não "Sul" como no modelo antigo.
* Fonte "CEMADEN/MCTI" na arte (como no modelo anexo); nas telas segue "CEMADEN/MCTIC".
* Rajada "muito forte" (76 × 100 km/h) e escalas de chuva únicas (`lib/limiares.ts`): seguem pendentes.

## Como publicar sem a arte e sem o Suporte (enquanto não forem aprovados)

O `lazy` atrás de `NEXT_PUBLIC_MET_EXPERIMENTAL` impede que a arte e o Suporte apareçam, mas o bundler ainda gera o código deles num pacote separado (nunca carregado). Para o código nem subir, no **build de produção** (cópia em `C:/Users/antho/tmp-build/.../frontend`) substituir antes de compilar `AcumuladosArte.tsx`, `AvisoArte.tsx` e `SuporteMeteorologia.tsx` por um stub (`export default function Stub(_props: Record<string, unknown>) { return null; }`) e apagar `public/arte/`; depois do deploy, copiar de volta os originais. Conferir com `grep -rl "SIGA NOSSAS REDES" out` (esperado: 0). Para liberar: copiar os originais, definir `NEXT_PUBLIC_MET_EXPERIMENTAL=1` no build e implantar.

## Desempenho (aprendizado)

Consultas em `Reading` **sem filtro de estação** varrem a tabela inteira no MySQL (o índice é por estação + tipo + hora): o calendário levou 84 s e os limiares passaram de 100 s. Com `station_id__in=<estações do RJ>` caíram para ~1 s (calendário de um mês cheio: ~12 s). Sempre filtrar por estação.
