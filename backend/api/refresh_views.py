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


SIRENES_SOURCE_SLUG = "cemaden_rj_sirenes"
# Piso entre dois syncs de sirene disparados por painéis abertos: cada sync faz
# login completo no portal da GridLab, e vários painéis abertos ao mesmo tempo
# não podem virar rajada de logins (risco de bloqueio da conta de serviço).
SIRENES_INTERVALO_MIN_S = 90
# Acima disso a tela avisa que o status de sirenes pode estar defasado.
SIRENES_OBSOLETO_S = 300


def _ultima_sincronizacao_sirenes():
    from django.db.models import Max

    from core.models import Station

    return Station.objects.filter(source__slug=SIRENES_SOURCE_SLUG).aggregate(m=Max("updated_at"))["m"]


class SirenesStatusView(APIView):
    """Idade do último sync de sirenes (o `updated_at` das estações é regravado
    a cada sync que chega ao fim). Existe porque o toque de sirene é dado de
    segurança: se o sync parar (cron, portal fora, login recusado), o painel
    mostraria "0 sirenes tocando" — um falso "tudo normal". A tela usa isto
    para exibir um alerta vermelho quando `obsoleto` for verdadeiro."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.utils import timezone

        ultima = _ultima_sincronizacao_sirenes()
        idade = (timezone.now() - ultima).total_seconds() if ultima else None
        return Response(
            {
                "ultima_sincronizacao": ultima,
                "idade_s": idade,
                "obsoleto": idade is None or idade > SIRENES_OBSOLETO_S,
            }
        )


class RefreshSirenesView(APIView):
    """Sync de sirenes disparado pelo painel aberto — reforço do Cron Job do
    cPanel (que roda a cada 15 min; ver docs/operacao-cron-e-producao.md), não
    substituição. Pula se o último sync tem menos de SIRENES_INTERVALO_MIN_S."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.utils import timezone

        ultima = _ultima_sincronizacao_sirenes()
        if ultima is not None:
            idade = (timezone.now() - ultima).total_seconds()
            if idade < SIRENES_INTERVALO_MIN_S:
                return Response({"ok": True, "pulado": True, "idade_s": idade})
        return Response({"ok": True, "pulado": False, "resultado": _rodar_sirenes()})


class RefreshRedemetView(APIView):
    """Atualiza SÓ as estações da REDEMET (uma chamada em lote, poucos
    segundos). Chamado pelo próprio painel aberto a cada ~15min (Dashboard.tsx)
    — a REDEMET não tinha Cron Job no cPanel (que o usuário não controla pra
    adicionar), então só rodava no "atualizar agora" manual: 1 única leitura
    guardada por estação desde o início, sem histórico (pedido do usuário,
    02/10/2026). Como o conector busca as últimas 3h de METAR e grava com
    get_or_create, chamar de vários painéis ao mesmo tempo é inofensivo."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({"ok": True, "resultado": _rodar_conector("redemet")})


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
