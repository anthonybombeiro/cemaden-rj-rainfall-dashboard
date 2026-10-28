# Nível de Monitoramento (PLANCON 2026/2027)

Implementado em 28/10/2026. Texto-base: `docs/plancon-2026-2027-adequacao-portaria-2458.md` (Portaria MIDR nº 2.458/2026); guia do plantão: componente `frontend/src/components/monitoramento/GuiaPlantao.tsx` (refeito no padrão do painel; a figura da matriz está em `frontend/public/guia/matriz-plancon.jpg`).

## Escala
| NM | Nome | Cor | Piso por risco técnico |
|---|---|---|---|
| 0 | Vigilância | #92d050 | muito baixo |
| 1 | Baixo | #ffff00 | baixo |
| 2 | Moderado | #ffc000 | moderado |
| 3 | Alto | #ff0000 | alto e muito alto |
| 4 | Severo | #c000ff | só por decisão humana |
| 5 | Extremo | #4b0761 | só por decisão humana |

O NM é **por município** (vale o mais alto entre meteorologia, hidrologia e geologia). Vigência máxima de 24 h; vencida, o município aparece hachurado ("em revisão") até novo lançamento.

## Regras aplicadas no lançamento (`core/niveis_monitoramento.py`, `validar_registro`)
- Não pode lançar abaixo do piso do risco técnico vigente.
- **NM 4**: exige gatilho atingido/fenômeno detectado (campo motivo), impacto em até 2 h, área delimitada, população exposta, aprovação (Diretor/Oficial de Ligação) e aviso à COMDEC e à REDEC. **NM 5** pode ter aviso simultâneo, desde que informado o motivo.
- TV/DCA não são permitidos nos NM 2–3; NM 0–1 não geram Idap.
- Erros voltam como `400 {"erros": [...]}`; o formulário mostra as mesmas dicas antes de enviar e pede confirmação para NM ≥ 4.
- O painel **apenas registra o NM**: o envio do Idap/SMS/DCA continua manual (o formulário lembra disso).

## Dados
- `NivelMonitoramento`: um registro vigente por município. `NivelMonitoramentoRegistro`: histórico imutável (nível anterior, equipe, antecedência, área, população, motivo, ferramentas, vigência, aprovação, avisos, lote, quem registrou). Migração `0025_nivel_monitoramento`. Ambos no Admin.
- `core/data/municipio_redec.json`: 92 municípios com REDEC/região (nomes alinhados aos dos alertas de risco), lat/lon e se são autônomos para DCA.

## API (Django/DRF)
| Rota | Acesso | Função |
|---|---|---|
| GET `/api/monitoramento/niveis/` | login | NM vigente por município + resumo |
| POST `/api/monitoramento/registrar/` | login (CSRF) | lança NM para 1+ municípios (atômico, `lote` uuid) |
| GET `/api/monitoramento/registros/` | login | histórico |
| GET `/api/monitoramento/sugestoes/` | login | pendências: risco técnico acima do NM, sirene recente (≤6 h → avaliar NM 4), vigência vencida |
| GET `/api/publico/monitoramento/` | **sem login** | NM, resumo, escala e riscos (sem o campo `responsavel`); cache de 60 s |

Testes: `backend/api/test_monitoramento.py` (8, passando).

## Interface (reorganizada em 28/10/2026)
- **Alertas → Nível de Monitoramento** (`MonitoramentoPanel.tsx`): só a visualização — link e botão de copiar da página pública, cartões por NM (clique destaca os municípios), mapa SVG interativo (`monitoramento/MapaNiveis.tsx`: zoom, arrastar, dica, destaque, contorno das REDECs), tabela por regional e lista dos municípios em NM ≥ 2 com vigência. Ao destacar municípios aparece **"Lançar nível para estes →"**, que abre a aba Produção já com a seleção.
- **Produção** (nova aba principal, `ProducaoPanel.tsx`, mesmo padrão de sub-abas da Geologia): **Lançar nível** (mapa de seleção + `LancarNivel.tsx` com assistente de decisão e as regras do plano), **Pendências** (agrupadas por regional/tipo/nível/fontes; "Abrir no formulário" preenche o lançamento), **Histórico** e **Suporte**.
- **Suporte → Guia do Plantão** (`monitoramento/GuiaPlantao.tsx`): nove seções com os componentes do painel (O que mudou, Os 6 níveis com a figura do PLANCON, Regra das 2 h, Fluxo do envio DCA em nove passos, Por equipe, Campos da Idap, Mensagens modelo com contador de caracteres e copiar, Proibido, Checklist com marcações só no navegador). O assistente de decisão fica no formulário Lançar nível. O guia em HTML embutido (iframe) foi removido, junto com a rota `/api/monitoramento/guia/` e o arquivo `guia_plantao.html`.
- **Página pública `/publico`** (`PublicoMonitoramento.tsx`, `app/publico/page.tsx`): sem login, atualiza a cada 60 s; maior nível vigente, mapa NM, os seis níveis, tabela dos municípios em NM ≥ 2 com vigência, quatro mapas de risco e aviso de que não substitui os alertas oficiais (199/193). Responsiva (cabeçalho empilhado, mapa em proporção fixa, rolagem livre sobre o mapa).
- Servidor: precisa da regra `RewriteRule ^publico/?$ /publico.html [L]` no `.htaccess` (já aplicada; cópia em `deploy/hostgator/htaccess`).

## Testes feitos (local, 28/10/2026)
tsc limpo; backend 9/9; no navegador: busca de município, lançamento de NM 3 (contadores e mapa atualizam), NM 4 completo (com todas as exigências) registrado, NM 4 incompleto lista o que falta, histórico, guia, pendências agrupadas, página pública com a API real. Banco SQLite temporário, sem dado de produção.

## Publicação em produção (28/10/2026)
- Migração `core.0025_nivel_monitoramento` aplicada por `POST /api/admin/migrate/` (sessão do superusuário, após autorização expressa do usuário no chat — o classificador bloqueia sem ela).
- `.htaccess` do servidor ganhou `RewriteRule ^publico/?$ /publico.html [L]` (backup: `.htaccess.bak-publico`).
- Build de produção (`NEXT_PUBLIC_API_BASE_URL=https://cemadenrj.preserve.rio.br/api`) e deploy SFTP: 94 arquivos, 0 falhas.
- Verificado em produção: `/publico` abre sem login (API pública 200, 92 municípios em NM 0, quatro mapas de risco); aba Alertas → Nível de Monitoramento carrega; `sugestoes`, `registros` e `guia` respondem 200. **Nenhum NM foi lançado em produção durante o teste** (dado real).
- Navegadores com o painel aberto podem mostrar a versão antiga até recarregar (service worker); em testes, desregistrar o SW.

## Decisão: escalas distintas
Níveis de risco (Muito baixo a Muito alto, emitidos pela Defesa Civil-RJ nos mapas de Meteorologia/Hidrologia/Geologia) e Níveis de Monitoramento (NM 0 a NM 5) são grandezas diferentes. As legendas dos mapas de risco **não** usam os nomes nem as cores do NM; a legenda do NM existe só no mapa do NM (Alertas, Produção e `/publico`). Decisão do usuário em 28/10/2026.

## Pendente
- Decidir se o lançamento fica restrito a um perfil (hoje qualquer usuário logado).
