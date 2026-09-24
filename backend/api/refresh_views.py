"""
Botão "atualizar agora" (pedido do usuário, 2026-09-23) nas tabelas de
Precipitação/Dados Meteorológicos/Sirenes — dispara a MESMA ingestão que o
Cron Job do cPanel já roda periodicamente, mas sob demanda, sobrepondo o
ciclo agendado.

Diferente de `/api/admin/run/` (admin_views.py — exige um segredo
compartilhado, existe só pra automação/cron sem shell no HostGator): este
endpoint usa a sessão normal do painel (`IsAuthenticated`, igual ao resto
da API) — qualquer usuário logado pode disparar, painel de uso interno com
poucas contas.

Roda TODOS os conectores do REGISTRY (chuva/meteorológico/nível de rio) +
a sincronização das sirenes, EM PARALELO (thread por fonte) — mesmo
conjunto pras 3 tabelas, já que o pedido do usuário foi "todas as
estações rodam uma atualização", não uma fonte por vez.

Testado sequencial primeiro (um `run()` depois do outro): mais de 90s no
total, o que estouraria qualquer timeout razoável de request HTTP síncrono
— sem infraestrutura de fila/worker assíncrono no HostGator (Celery está
configurado mas não roda como worker de verdade lá, foi substituído por
Cron Jobs), rodar em paralelo com threads (I/O-bound — cada conector é
basicamente esperando resposta de rede, não CPU) é o jeito de encaixar
isso num único request-response síncrono: o tempo total fica limitado ao
conector mais lento, não à soma de todos. Django ORM é thread-safe pra
esse uso (cada thread pega sua própria conexão de banco automaticamente).
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger("ingestion")


def _rodar_conector(slug: str) -> str:
    from ingestion.connectors import get_connector

    try:
        return get_connector(slug).run().summary()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha ao atualizar %s via /api/refresh/", slug)
        return f"erro: {exc}"


def _rodar_sirenes() -> str:
    from ingestion.connectors import cemaden_rj_sirenes

    try:
        return cemaden_rj_sirenes.sync().summary()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Falha ao atualizar sirenes via /api/refresh/")
        return f"erro: {exc}"


class RefreshNowView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from ingestion.connectors import REGISTRY

        resultados = {}
        with ThreadPoolExecutor(max_workers=len(REGISTRY) + 1) as executor:
            futuros = {executor.submit(_rodar_conector, slug): slug for slug in REGISTRY}
            futuros[executor.submit(_rodar_sirenes)] = "cemaden_rj_sirenes"
            for futuro in as_completed(futuros):
                resultados[futuros[futuro]] = futuro.result()

        return Response({"ok": True, "resultados": resultados})
