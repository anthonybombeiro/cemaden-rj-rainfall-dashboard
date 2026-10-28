# Nível de Monitoramento (PLANCON 2026/2027) — implementação em andamento (28/10/2026)

Texto-base: docs/plancon-2026-2027-adequacao-portaria-2458.md (cópia do documento do usuário); guia do plantão: backend/core/data/guia_plantao.html.

## Feito (não publicado em produção)
- Backend: modelos NivelMonitoramento e NivelMonitoramentoRegistro (migração 0025), regras em core/niveis_monitoramento.py, API em api/monitoramento_views.py (niveis, registrar, registros, sugestoes, guia, e /api/publico/monitoramento/ sem login). 9 testes passando (api.test_monitoramento).
- Frontend: aba Alertas > Nível de Monitoramento (mapa SVG interativo, lançamento com assistente e regras, pendências, histórico, guia). tsc sem erros; ainda não testado no navegador.

## Pendente
- Aplicar a migração 0025 em produção (POST /api/admin/migrate/ foi bloqueado pelo classificador do Claude Code; precisa de autorização do usuário).
- Página pública /publico (app/publico/page.tsx, regra no .htaccess do servidor), build, deploy, teste no navegador e no Chrome, legenda dos NM no painel.
