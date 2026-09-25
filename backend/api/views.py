import datetime
import time
from collections import defaultdict

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Max, Min, Prefetch, Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.municipios import canonico_ou_original
from core.models import AlertEvent, Previsao, Reading, RiskAlert, Source, Station

from .serializers import (
    AlertEventSerializer,
    PrevisaoSerializer,
    ReadingSerializer,
    RiskAlertSerializer,
    SourceSerializer,
    StationListSerializer,
)

# Cada fonte relata "chuva_mm" com semântica diferente — misturar as duas sem
# distinguir dá número errado (dobra ou infla contagem):
#   - "bucket": o valor é a chuva NA JANELA daquela leitura (ex: Alerta Rio
#     m15 = chuva nos últimos 15min, INMET CHUVA = chuva na última hora).
#     Somar leituras no período é válido.
#   - "running_daily": o valor é um total corrido desde a meia-noite local.
#     Somar leituras dobraria a contagem — o valor mais recente já É o
#     acumulado do dia. Nenhuma fonte ativa usa mais essa categoria desde
#     2026-09-23: Wunderground/Plugfield relatam total corrido na origem
#     (precipTotal/rainDay), mas os conectores já convertem pra "balde" na
#     ingestão (ver bucket_from_running_daily em
#     ingestion/connectors/base.py — pedido do usuário, precisava do dado
#     "escalonado igual às demais" pra consulta futura direto no banco).
#     Mantido aqui só como categoria disponível, caso uma fonte nova
#     apareça sem essa conversão.
PRECIPITACAO_BUCKET_SOURCES = {
    "alerta_rio",
    "cemaden_nacional",
    "inmet",
    "rio_chuva_bairro",
    "cemaden_mctic",
    "niteroi",
    "cemaden_rj_sirenes",
    "inea",
    "wunderground",
    "plugfield",
}
PRECIPITACAO_RUNNING_DAILY_SOURCES: set[str] = set()


class SourceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Source.objects.all()
    serializer_class = SourceSerializer


def tendencia_nivel(valores):
    """Tendência do nível de rio nas 3 últimas leituras (mais antiga → mais
    recente): 'subindo' (nunca cai e terminou acima do início), 'descendo'
    (nunca sobe e terminou abaixo), 'estavel' (todas iguais ou oscilação sem
    direção única) e None se houver menos de 3 leituras."""
    if len(valores) < 3:
        return None
    a, b, c = valores
    if a <= b <= c and c > a:
        return "subindo"
    if a >= b >= c and c < a:
        return "descendo"
    return "estavel"



def extremos_24h(station_ids):
    """{station_id: {temp_max, temp_min, umid_max, umid_min}} das últimas 24h —
    máximo/mínimo entre as leituras instantâneas E os extremos que a própria fonte
    informa (INMET por hora, Plugfield do dia). Uma query agregada por página."""
    ids = list(station_ids)
    if not ids:
        return {}
    R = Reading.ReadingType
    corte = timezone.now() - datetime.timedelta(hours=24)
    linhas = (
        Reading.objects.filter(
            station_id__in=ids,
            timestamp__gte=corte,
            reading_type__in=[
                R.TEMPERATURA_C, R.TEMPERATURA_MAX_C, R.TEMPERATURA_MIN_C,
                R.UMIDADE_PCT, R.UMIDADE_MAX_PCT, R.UMIDADE_MIN_PCT,
            ],
        )
        .values("station_id", "reading_type")
        .annotate(mx=Max("value"), mn=Min("value"))
    )
    tmax, tmin, umax, umin = (defaultdict(list) for _ in range(4))
    for x in linhas:
        sid, t = x["station_id"], x["reading_type"]
        if t in (R.TEMPERATURA_C, R.TEMPERATURA_MAX_C):
            tmax[sid].append(x["mx"])
        if t in (R.TEMPERATURA_C, R.TEMPERATURA_MIN_C):
            tmin[sid].append(x["mn"])
        if t in (R.UMIDADE_PCT, R.UMIDADE_MAX_PCT):
            umax[sid].append(x["mx"])
        if t in (R.UMIDADE_PCT, R.UMIDADE_MIN_PCT):
            umin[sid].append(x["mn"])
    resultado = {}
    for sid in set(tmax) | set(tmin) | set(umax) | set(umin):
        resultado[sid] = {
            "temp_max": max(tmax[sid]) if tmax[sid] else None,
            "temp_min": min(tmin[sid]) if tmin[sid] else None,
            "umid_max": max(umax[sid]) if umax[sid] else None,
            "umid_min": min(umin[sid]) if umin[sid] else None,
        }
    return resultado


def ultimas_leituras(station_ids, dias=3):
    """{station_id: [Reading, ...]} com a leitura mais recente de cada
    (estação, tipo) dentro de `dias`, numa só query agregada (join com o
    MAX(timestamp) agrupado — MySQL 5.7 não tem window function)."""
    ids = list(station_ids)
    if not ids:
        return {}
    cutoff = timezone.now() - datetime.timedelta(days=dias)
    tabela = Reading._meta.db_table
    marcadores = ",".join(["%s"] * len(ids))
    sql = (
        f"SELECT r.id, r.station_id, r.reading_type, r.value, r.timestamp FROM {tabela} r "
        f"JOIN (SELECT station_id, reading_type, MAX(timestamp) AS mx FROM {tabela} "
        f"WHERE station_id IN ({marcadores}) AND timestamp >= %s GROUP BY station_id, reading_type) m "
        "ON r.station_id = m.station_id AND r.reading_type = m.reading_type AND r.timestamp = m.mx"
    )
    por_estacao = defaultdict(list)
    for leitura in Reading.objects.raw(sql, [*ids, cutoff]):
        por_estacao[leitura.station_id].append(leitura)
    return por_estacao



class StationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = StationListSerializer

    def _filtered_stations(self):
        qs = Station.objects.select_related("source")
        params = self.request.query_params
        if municipality := params.get("municipality"):
            qs = qs.filter(municipality__iexact=municipality)
        if station_type := params.get("station_type"):
            qs = qs.filter(station_type=station_type)
        if source := params.get("source"):
            qs = qs.filter(source__slug=source)
        return qs

    def get_queryset(self):
        # SEM prefetch de leituras: o "último valor de cada tipo" vem de UMA
        # query agregada por página (`ultimas_leituras`), em vez de trazer
        # dezenas de milhares de linhas pro Python. O prefetch cru estourava o
        # limite de tempo/memória do CGI do HostGator a cada vez que o volume
        # de leituras crescia (500 em /api/stations/?offset=300 em 2026-09-24,
        # mesmo com cutoff de 2 dias) — ver [[investigacao-500-stations-pagina]].
        return self._filtered_stations()

    def paginate_queryset(self, queryset):
        page = super().paginate_queryset(queryset)
        if page is not None:
            self._latest = ultimas_leituras([s.id for s in page])
            self._extremos = extremos_24h([s.id for s in page])
        return page

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        self._latest = ultimas_leituras([instance.id])
        self._extremos = extremos_24h([instance.id])
        return Response(self.get_serializer(instance).data)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["latest_by_station"] = getattr(self, "_latest", {})
        ctx["extremos_24h"] = getattr(self, "_extremos", {})
        return ctx

    @action(detail=False, methods=["get"])
    def diagnostico(self, request):
        """Diagnóstico READ-ONLY (só `is_superuser`) — reproduz a MESMA
        query/prefetch de `get_queryset()` (mesmo `cutoff`, mesma fatia
        limit/offset) mas devolve só CONTAGENS agregadas em vez de servir
        os dados crus, pra medir o custo real de uma página sem ter o
        MESMO custo que está sendo medido. Existe porque o HostGator não
        dá shell pra investigar isso via `manage.py shell` na hora
        (2026-09-24: `GET /api/stations/?limit=300&offset=300` dando 500
        — ver `[[investigacao-500-stations-pagina]]` na memória do
        projeto). Fica atrás de `is_superuser` (não do
        `X-Admin-Secret` do AdminOpsView) de propósito: é só leitura,
        então a sessão de admin já logada no painel basta, sem precisar
        materializar o segredo de produção pra rodar uma consulta.
        """
        if not request.user.is_superuser:
            return Response({"detail": "Requer admin."}, status=403)

        limit = int(request.query_params.get("limit", 300))
        offset = int(request.query_params.get("offset", 0))
        dias = int(request.query_params.get("days", 7))

        cutoff = timezone.now() - datetime.timedelta(days=dias)
        leituras_recentes = Reading.objects.filter(timestamp__gte=cutoff).order_by("reading_type", "-timestamp")
        qs = self._filtered_stations().prefetch_related(Prefetch("readings", queryset=leituras_recentes))

        t0 = time.monotonic()
        pagina = list(qs[offset : offset + limit])
        tempo_query = time.monotonic() - t0

        t0 = time.monotonic()
        total_leituras = 0
        por_fonte: dict[str, int] = {}
        por_tipo: dict[str, int] = {}
        for estacao in pagina:
            leituras = estacao.readings.all()
            n = len(leituras)
            total_leituras += n
            fonte = estacao.source.slug if estacao.source_id else "?"
            por_fonte[fonte] = por_fonte.get(fonte, 0) + n
            for leitura in leituras:
                por_tipo[leitura.reading_type] = por_tipo.get(leitura.reading_type, 0) + 1
        tempo_iteracao = time.monotonic() - t0

        return Response(
            {
                "limit": limit,
                "offset": offset,
                "days": dias,
                "estacoes_na_pagina": len(pagina),
                "tempo_query_prefetch_s": round(tempo_query, 3),
                "tempo_iteracao_s": round(tempo_iteracao, 3),
                "total_leituras_prefetchadas": total_leituras,
                "media_leituras_por_estacao": round(total_leituras / max(1, len(pagina)), 1),
                "por_fonte": por_fonte,
                "por_tipo": por_tipo,
            }
        )

    @action(detail=True, methods=["get"])
    def readings(self, request, pk=None):
        station = self.get_object()
        qs = station.readings.all()
        if reading_type := request.query_params.get("reading_type"):
            qs = qs.filter(reading_type=reading_type)
        limit = int(request.query_params.get("limit", 500))
        data = ReadingSerializer(qs[:limit], many=True).data
        return Response(data)

    @action(detail=False, methods=["get"])
    def sirenes(self, request):
        """"Consulta por estações" só das sirenes — pedido do usuário
        (2026-09-23): uma tela dedicada mostrando status de cada uma das
        ~225 sirenes (online/offline, tocando agora ou não), no mesmo
        espírito da tela de mesmo nome do próprio portal do CBMERJ (ver
        ingestion/connectors/cemaden_rj_sirenes.py).

        "Offline"/"online" vem de `Station.status` (derivado de
        `fk_idStatusEstacao` no sync). "Tocando agora" NÃO fica guardado
        na Station — o sync só materializa isso como um AlertEvent ativo
        (resolved_at NULL) da regra "Sirene de alarme tocando", então é
        isso que consultamos aqui pra saber o estado atual de acionamento
        e desde quando está tocando.
        """
        stations = list(self._filtered_stations().filter(station_type=Station.StationType.SIRENE))
        station_ids = [s.id for s in stations]

        tocando_desde = {
            ev.station_id: ev.triggered_at
            for ev in AlertEvent.objects.filter(
                rule__name="Sirene de alarme tocando", station_id__in=station_ids, resolved_at__isnull=True
            )
        }

        # Última leitura de chuva (só existe pras ~85 sirenes com
        # pluviômetro acoplado) — pega em Python a 1ª ocorrência por
        # estação de uma lista já ordenada (station_id, -timestamp),
        # mesma técnica de StationListSerializer.get_latest_readings (evita
        # N+1 e evita `.distinct("campo")`, que o MySQL não suporta).
        leituras_recentes = Reading.objects.filter(
            station_id__in=station_ids,
            reading_type=Reading.ReadingType.CHUVA_MM,
            timestamp__gte=timezone.now() - datetime.timedelta(hours=24),
        ).order_by("station_id", "-timestamp").values("station_id", "value", "timestamp")
        ultima_chuva = {}
        for r in leituras_recentes:
            ultima_chuva.setdefault(r["station_id"], r)

        data = []
        for station in stations:
            meta = station.raw_metadata or {}
            chuva = ultima_chuva.get(station.id)
            triggered_at = tocando_desde.get(station.id)
            data.append(
                {
                    "id": station.id,
                    "external_id": station.external_id,
                    "name": station.name,
                    "municipality": canonico_ou_original(station.municipality),
                    "bairro": meta.get("bairro") or "",
                    "rua": meta.get("rua") or "",
                    "numero": meta.get("numero") or "",
                    "redec": meta.get("redec") or "",
                    "grupo": meta.get("grupo") or "",
                    "descricao": meta.get("descricao") or "",
                    "tem_pluviometro": bool(meta.get("tem_pluviometro")),
                    "latitude": station.latitude,
                    "longitude": station.longitude,
                    "status_estacao": station.status,
                    "tocando": triggered_at is not None,
                    "tocando_desde": triggered_at,
                    "ultima_chuva_mm": chuva["value"] if chuva else None,
                    "ultima_chuva_em": chuva["timestamp"] if chuva else None,
                    "updated_at": station.updated_at,
                }
            )

        # Prioriza o que precisa de atenção: tocando agora primeiro, depois
        # offline, depois o resto em ordem alfabética.
        data.sort(key=lambda e: (not e["tocando"], e["status_estacao"] != Station.Status.INATIVA, e["name"]))
        return Response(data)

    def _calcular_precipitacao(self, stations):
        """Chuva acumulada em várias janelas pra uma lista de estações —
        inspirado no formato do Alerta Rio (websempre.rio.rj.gov.br/estacoes/)
        e do portal de sirenes do CEMADEN-RJ. Extraído da action
        `precipitacao` (2026-09-23) pra ser reaproveitado por `hidrologicas`
        também — uma estação hidrológica (nível de rio) frequentemente tem
        um pluviômetro colocado, e o usuário pediu que a tabela de
        hidrológicas mostre ambos os dados usando a MESMA lógica de janelas.

        5min/10min/15min/30min/1h/2h/3h/4h/6h/12h/24h/36h/48h/72h/96h são
        todos derivados das MESMAS leituras já buscadas (até 96h atrás) —
        filtrar em Python por cutoff é essencialmente grátis uma vez que
        as linhas já estão em memória, sem custo de query adicional. Pra
        fontes de cadência mais lenta que a janela (ex: INMET de 1h só
        atualiza de hora em hora), 5min/10min/15min naturalmente saem
        iguais a "Agora" — não é bug, é a granularidade real da fonte.

        168h (7 dias), "1 mês" (janela corrida de 30 dias, não confundir
        com "no mês" abaixo) e "pico" (maior leitura individual nas
        últimas 24h — nosso equivalente ao "TX-15" do Alerta Rio, sem
        assumir literalmente 15min já que a cadência varia por fonte) SÃO
        agregados NO BANCO (Sum/Max agrupados por estação, uma linha por
        estação na resposta) — não traz o histórico bruto de até 30 dias
        pra memória do processo, o que já se mostrou arriscado no
        HostGator (ver o incidente de N+1/payload gigante corrigido antes
        em StationListSerializer). "no mês" (desde o dia 1 do mês
        corrente, hora local — calendário, não janela corrida) também.
        """
        station_ids = [s.id for s in stations]

        now = timezone.now()
        # Campos calculados em Python a partir das leituras já buscadas
        # (até 96h atrás, ver JANELA_MAX_PYTHON abaixo).
        cutoffs = {
            "acumulado_5min_mm": now - datetime.timedelta(minutes=5),
            "acumulado_10min_mm": now - datetime.timedelta(minutes=10),
            "acumulado_15min_mm": now - datetime.timedelta(minutes=15),
            "acumulado_30min_mm": now - datetime.timedelta(minutes=30),
            "acumulado_1h_mm": now - datetime.timedelta(hours=1),
            "acumulado_2h_mm": now - datetime.timedelta(hours=2),
            "acumulado_3h_mm": now - datetime.timedelta(hours=3),
            "acumulado_4h_mm": now - datetime.timedelta(hours=4),
            "acumulado_6h_mm": now - datetime.timedelta(hours=6),
            "acumulado_12h_mm": now - datetime.timedelta(hours=12),
            "acumulado_24h_mm": now - datetime.timedelta(hours=24),
            "acumulado_36h_mm": now - datetime.timedelta(hours=36),
            "acumulado_48h_mm": now - datetime.timedelta(hours=48),
            "acumulado_72h_mm": now - datetime.timedelta(hours=72),
            "acumulado_96h_mm": now - datetime.timedelta(hours=96),
        }
        JANELA_MAX_PYTHON = cutoffs["acumulado_96h_mm"]

        # Campos agregados NO BANCO (janela maior que 96h, ou calendário).
        cutoff_168h = now - datetime.timedelta(hours=168)
        cutoff_1mes_corrido = now - datetime.timedelta(days=30)
        inicio_hoje_local = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
        inicio_mes_calendario = inicio_hoje_local.replace(day=1)

        readings = Reading.objects.filter(
            station_id__in=station_ids,
            reading_type=Reading.ReadingType.CHUVA_MM,
            timestamp__gte=JANELA_MAX_PYTHON,
        ).values("station_id", "value", "timestamp")

        by_station = defaultdict(list)
        for r in readings:
            by_station[r["station_id"]].append(r)

        def _soma_agregada_por_estacao(cutoff):
            return {
                row["station_id"]: row["total"]
                for row in Reading.objects.filter(
                    station_id__in=station_ids, reading_type=Reading.ReadingType.CHUVA_MM, timestamp__gte=cutoff
                )
                .values("station_id")
                .annotate(total=Sum("value"))
            }

        soma_168h_por_estacao = _soma_agregada_por_estacao(cutoff_168h)
        soma_1mes_corrido_por_estacao = _soma_agregada_por_estacao(cutoff_1mes_corrido)
        soma_mes_calendario_por_estacao = _soma_agregada_por_estacao(inicio_mes_calendario)
        pico_24h_por_estacao = {
            row["station_id"]: row["maior"]
            for row in Reading.objects.filter(
                station_id__in=station_ids,
                reading_type=Reading.ReadingType.CHUVA_MM,
                timestamp__gte=cutoffs["acumulado_24h_mm"],
            )
            .values("station_id")
            .annotate(maior=Max("value"))
        }

        data = []
        for station in stations:
            slug = station.source.slug
            kind = (
                "bucket"
                if slug in PRECIPITACAO_BUCKET_SOURCES
                else "running_daily" if slug in PRECIPITACAO_RUNNING_DAILY_SOURCES else None
            )
            rows = sorted(by_station.get(station.id, []), key=lambda r: r["timestamp"])
            latest = rows[-1] if rows else None

            entry = {
                "id": station.id,
                "source": slug,
                "station_type": station.station_type,
                "external_id": station.external_id,
                "name": station.name,
                "municipality": canonico_ou_original(station.municipality),
                "latitude": station.latitude,
                "longitude": station.longitude,
                "updated_at": latest["timestamp"] if latest else None,
                "chuva_agora_mm": None,
                "acumulado_hoje_mm": None,
                "acumulado_168h_mm": None,
                "acumulado_1mes_mm": None,
                "acumulado_mes_mm": None,
                "pico_mm": None,
                **{campo: None for campo in cutoffs},
            }
            if kind == "bucket":
                entry["chuva_agora_mm"] = latest["value"] if latest else None
                for campo, cutoff in cutoffs.items():
                    entry[campo] = sum(r["value"] for r in rows if r["timestamp"] >= cutoff)
                entry["acumulado_hoje_mm"] = sum(
                    r["value"] for r in rows if r["timestamp"] >= inicio_hoje_local
                )
                entry["acumulado_168h_mm"] = soma_168h_por_estacao.get(station.id)
                entry["acumulado_1mes_mm"] = soma_1mes_corrido_por_estacao.get(station.id)
                entry["acumulado_mes_mm"] = soma_mes_calendario_por_estacao.get(station.id)
                entry["pico_mm"] = pico_24h_por_estacao.get(station.id)
            elif kind == "running_daily":
                entry["acumulado_hoje_mm"] = latest["value"] if latest else None
            data.append(entry)

        return data

    @action(detail=False, methods=["get"])
    def precipitacao(self, request):
        """Estações pluviométricas com chuva acumulada em várias janelas —
        ver `_calcular_precipitacao` pra detalhes de como cada janela é
        derivada. Endpoint dedicado (em vez de calcular isso no serializer
        padrão) porque exige somar leituras de "chuva_mm" — caro demais pra
        rodar em toda chamada de /api/stations/, que é usada pelo mapa e
        pela tabela meteorológica onde isso não é necessário.
        """
        stations = list(
            self._filtered_stations()
            .filter(readings__reading_type=Reading.ReadingType.CHUVA_MM)
            .distinct()
        )
        return Response(self._calcular_precipitacao(stations))

    @action(detail=False, methods=["get"])
    def hidrologicas(self, request):
        """Estações HIDROLÓGICAS (nível de rio) — pedido do usuário
        (2026-09-23): tabela dedicada, nível de rio primeiro e chuva depois,
        reaproveitando a mesma lógica de janelas da Precipitação pra chuva
        (ver `_calcular_precipitacao`). "Hidrológica" aqui = qualquer
        estação com pelo menos uma leitura de `nivel_m` (hoje: CEMADEN
        nacional e INEA/Alerta de Cheias) — muitas têm um pluviômetro
        colocado, daí mostrar as duas coisas juntas.

        Nível de rio não "acumula" como chuva (é uma leitura de estado, não
        uma taxa) — por isso as janelas aqui são MÁXIMO/MÍNIMO em vez de
        soma: `nivel_atual_m` (leitura mais recente), `nivel_max_24h_m` e
        `nivel_min_24h_m` (pra dar noção de variação/tendência sem expor o
        histórico bruto).
        """
        stations = list(
            self._filtered_stations()
            .select_related("cota")
            .filter(readings__reading_type=Reading.ReadingType.NIVEL_M)
            .distinct()
        )
        station_ids = [s.id for s in stations]
        now = timezone.now()
        cutoff_24h = now - datetime.timedelta(hours=24)

        leituras_nivel = Reading.objects.filter(
            station_id__in=station_ids,
            reading_type=Reading.ReadingType.NIVEL_M,
            timestamp__gte=cutoff_24h,
        ).values("station_id", "value", "timestamp")
        nivel_por_estacao = defaultdict(list)
        for r in leituras_nivel:
            nivel_por_estacao[r["station_id"]].append(r)

        chuva_por_estacao = {
            entry["id"]: entry for entry in self._calcular_precipitacao(stations)
        }

        data = []
        for station in stations:
            rows = sorted(nivel_por_estacao.get(station.id, []), key=lambda r: r["timestamp"])
            latest = rows[-1] if rows else None
            chuva = chuva_por_estacao.get(station.id, {})
            entry = {
                "id": station.id,
                "source": station.source.slug,
                "station_type": station.station_type,
                "external_id": station.external_id,
                "name": station.name,
                "municipality": canonico_ou_original(station.municipality),
                "latitude": station.latitude,
                "longitude": station.longitude,
                "nivel_atual_m": latest["value"] if latest else None,
                "nivel_max_24h_m": max((r["value"] for r in rows), default=None),
                "nivel_min_24h_m": min((r["value"] for r in rows), default=None),
                "nivel_atualizado_em": latest["timestamp"] if latest else None,
                "tendencia": tendencia_nivel([r["value"] for r in rows[-3:]]),
                "rio_monitorado": station.rio_monitorado,
                "regiao_hidrografica": station.regiao_hidrografica,
                "bacia": station.bacia,
                "ana_codigo_plu": station.ana_codigo_plu,
                "ana_codigo_flu": station.ana_codigo_flu,
            }
            cota = getattr(station, "cota", None)
            entry["cota"] = (
                {
                    "atencao_cm": cota.atencao_cm,
                    "alerta_cm": cota.alerta_cm,
                    "inundacao_cm": cota.inundacao_cm,
                    "extrema_cm": cota.extrema_calculada_cm,
                }
                if cota
                else None
            )
            nivel_cm = latest["value"] * 100 if latest else None
            entry["cota_classe"] = cota.classificar(nivel_cm) if cota else ("sem_cota" if nivel_cm is not None else None)
            # Campos de chuva (mesmas ~20 janelas da Precipitação) — None
            # pra quem não tem pluviômetro colocado, igual ao comportamento
            # já existente em /stations/precipitacao/.
            for campo, valor in chuva.items():
                if campo not in entry:
                    entry[campo] = valor
            # "updated_at" da Precipitação é sobre a chuva; aqui o mais
            # recente entre nível e chuva é o que importa pra coluna
            # "Atualizado em" da tabela.
            candidatos = [entry["nivel_atualizado_em"], chuva.get("updated_at")]
            entry["updated_at"] = max((c for c in candidatos if c), default=None)
            data.append(entry)

        return Response(data)


class AlertEventViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AlertEventSerializer

    def get_queryset(self):
        qs = AlertEvent.objects.select_related("rule", "station").order_by("-triggered_at")
        if self.request.query_params.get("active") == "true":
            qs = qs.filter(resolved_at__isnull=True)
        return qs


class RiskAlertViewSet(viewsets.ReadOnlyModelViewSet):
    """Classificações de risco oficiais da Defesa Civil-RJ (hidrológico,
    geológico, severidade meteorológica, incêndio florestal) — ver
    ingestion/connectors/cemaden_rj_alertas.py."""

    serializer_class = RiskAlertSerializer

    def get_queryset(self):
        qs = RiskAlert.objects.all()
        params = self.request.query_params
        if tipo := params.get("tipo"):
            qs = qs.filter(tipo=tipo)
        if params.get("escopo") == "redec":
            qs = qs.filter(municipio="")
        elif params.get("escopo") == "municipio":
            qs = qs.exclude(municipio="")
        return qs


class PrevisaoViewSet(viewsets.ModelViewSet):
    """Previsão do tempo diária por região. Leitura e escrita para qualquer
    usuário logado (operador ou admin); POST em (data, região) já existente
    sobrescreve. Filtros: ?data=, ?data_inicio=, ?data_fim=, ?regiao=."""

    serializer_class = PrevisaoSerializer

    def get_queryset(self):
        qs = Previsao.objects.all()
        p = self.request.query_params
        if v := p.get("data"):
            qs = qs.filter(data=v)
        if v := p.get("data_inicio"):
            qs = qs.filter(data__gte=v)
        if v := p.get("data_fim"):
            qs = qs.filter(data__lte=v)
        if v := p.get("regiao"):
            qs = qs.filter(regiao=v)
        return qs

    def create(self, request, *args, **kwargs):
        """POST em (data, região) que já existe só substitui se vier
        `substituir: true` — senão 409 `previsao_ja_existe` (evita sobrescrever
        sem querer o que outro operador cadastrou)."""
        dados = request.data
        if not dados.get("substituir"):
            try:
                existe = Previsao.objects.filter(data=dados.get("data"), regiao=dados.get("regiao")).exists()
            except (ValueError, TypeError, DjangoValidationError):
                existe = False  # data inválida: o serializer devolve o erro certo
            if existe:
                return Response({"detail": "previsao_ja_existe"}, status=409)
        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def ultima(self, request):
        """Previsões da data mais recente cadastrada (uma por região)."""
        ultima = Previsao.objects.aggregate(d=Max("data"))["d"]
        qs = Previsao.objects.filter(data=ultima) if ultima else Previsao.objects.none()
        return Response(self.get_serializer(qs, many=True).data)
