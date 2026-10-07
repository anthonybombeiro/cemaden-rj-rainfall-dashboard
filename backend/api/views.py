import datetime
import time
from collections import defaultdict

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Max, Min, Prefetch, Q, Sum
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.gatilhos import aplicar_estado_real, avaliar_gatilhos
from core.municipios import canonico_ou_original
from core.models import (
    AlertEvent,
    AvisoMauTempo,
    GatilhoPluviometrico,
    LeituraQualidade,
    Previsao,
    Reading,
    RiskAlert,
    SireneAcaoTipo,
    Source,
    Station,
)

from .serializers import (
    AlertEventSerializer,
    AvisoMauTempoSerializer,
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
    "macae_ufrj",
    "ecowitt_paracambi",  # incluída em 06/10/2026 (o conector converte o total do dia em balde)
}
PRECIPITACAO_RUNNING_DAILY_SOURCES: set[str] = set()

# Fontes que informam acumulados OFICIAIS por janela (guardados em
# `Station.raw_metadata["acumulados_oficiais"]` = {referencia, acc{chave: mm}}). Na tabela
# de Precipitação (06/10/2026) esses valores substituem o nosso cálculo nas janelas listadas,
# desde que o retrato tenha até `OFICIAL_VALIDADE_H` horas: o oficial inclui dados que chegam
# atrasados e que nunca vimos (INEA: nosso 96 h ficava em média 17,8 mm abaixo do oficial).
# O nosso cálculo continua disponível nas colunas "Calc" das tabelas por rede.
# {slug: {campo de `_calcular_precipitacao`: chave em `acc`}}
OFICIAL_VALIDADE_H = 2
MAPA_ACUMULADOS_OFICIAIS = {
    "alerta_rio": {
        "acumulado_5min_mm": "m05", "acumulado_10min_mm": "m10", "acumulado_15min_mm": "m15",
        "acumulado_30min_mm": "m30", "acumulado_1h_mm": "h01", "acumulado_2h_mm": "h02",
        "acumulado_3h_mm": "h03", "acumulado_4h_mm": "h04", "acumulado_6h_mm": "h06",
        "acumulado_12h_mm": "h12", "acumulado_24h_mm": "h24", "acumulado_96h_mm": "h96",
        "acumulado_mes_mm": "mes",
    },
    "niteroi": {
        "acumulado_5min_mm": "m05", "acumulado_10min_mm": "m10", "acumulado_15min_mm": "m15",
        "acumulado_30min_mm": "m30", "acumulado_1h_mm": "h01", "acumulado_6h_mm": "h06",
        "acumulado_12h_mm": "h12", "acumulado_24h_mm": "h24", "acumulado_36h_mm": "h36",
        "acumulado_48h_mm": "h48", "acumulado_72h_mm": "h72", "acumulado_96h_mm": "h96",
        "acumulado_168h_mm": "h168", "acumulado_1mes_mm": "h720", "acumulado_mes_mm": "mes",
    },
    "inea": {
        "acumulado_1h_mm": "1", "acumulado_4h_mm": "4", "acumulado_24h_mm": "24",
        "acumulado_96h_mm": "96", "acumulado_1mes_mm": "720",
    },
    "macae_ufrj": {"acumulado_1h_mm": "1", "acumulado_24h_mm": "24", "acumulado_96h_mm": "96"},
    "ecowitt_paracambi": {"acumulado_1h_mm": "1", "acumulado_hoje_mm": "hoje", "acumulado_mes_mm": "mes"},
    "cemaden_rj_sirenes": {
        "acumulado_15min_mm": "m15", "acumulado_1h_mm": "1", "acumulado_4h_mm": "4", "acumulado_12h_mm": "12",
        "acumulado_24h_mm": "24", "acumulado_48h_mm": "48", "acumulado_72h_mm": "72", "acumulado_96h_mm": "96",
        "acumulado_mes_mm": "mes",
    },
    "cemaden_mctic": {
        "acumulado_1h_mm": "1", "acumulado_3h_mm": "3", "acumulado_6h_mm": "6", "acumulado_12h_mm": "12",
        "acumulado_24h_mm": "24", "acumulado_48h_mm": "48", "acumulado_72h_mm": "72", "acumulado_96h_mm": "96",
    },
}


def _parse_iso_param(valor):
    if not valor:
        return None
    try:
        dt = datetime.datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt


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
        """`since`/`until` (ISO, qualquer timezone — vira UTC) filtram por
        período; sem eles, continua o comportamento antigo (as `limit` mais
        recentes). Com período, o teto sobe pra 20 mil linhas — página de
        histórico (/estacao) pode pedir até "1 mês" de uma fonte de 5 em 5
        min (~8600 leituras), bem abaixo disso."""
        station = self.get_object()
        qs = station.readings.all()
        if reading_type := request.query_params.get("reading_type"):
            qs = qs.filter(reading_type=reading_type)
        since = _parse_iso_param(request.query_params.get("since"))
        until = _parse_iso_param(request.query_params.get("until"))
        if since:
            qs = qs.filter(timestamp__gte=since)
        if until:
            qs = qs.filter(timestamp__lte=until)
        limit_padrao = 20000 if (since or until) else 500
        limit = min(int(request.query_params.get("limit", limit_padrao)), 20000)
        data = ReadingSerializer(qs[:limit], many=True).data
        return Response(data)

    @action(detail=True, methods=["get"])
    def detalhe(self, request, pk=None):
        """Dados extras da página de detalhe da estação (07/10/2026): chuva acumulada em 1 h e
        24 h (valor OFICIAL da fonte quando ela informa — ver `_aplicar_oficiais` — senão a
        soma dos baldes gravados) para os "baldes" do topo, e as cotas hidrológicas (cm) para
        as linhas do cotagrama. Nunca é a "última leitura": o monitoramento precisa de 1 h e 24 h."""
        station = Station.objects.select_related("source").get(pk=self.get_object().pk)
        entrada = self._calcular_precipitacao([station])[0]
        cota = getattr(station, "cota", None)
        return Response(
            {
                "municipio": canonico_ou_original(station.municipality),
                "rio_monitorado": station.rio_monitorado or (cota.rio if cota else "") or "",
                "regiao_hidrografica": station.regiao_hidrografica or "",
                "bacia": station.bacia or "",
                "acumulado_1h_mm": entrada.get("acumulado_1h_mm"),
                "acumulado_24h_mm": entrada.get("acumulado_24h_mm"),
                "oficial": bool(entrada.get("acumulados_oficiais")),
                "cota": (
                    {
                        "atencao_cm": cota.atencao_cm,
                        "alerta_cm": cota.alerta_cm,
                        "inundacao_cm": cota.inundacao_cm,
                        "extrema_cm": cota.extrema_calculada_cm,
                    }
                    if cota
                    else None
                ),
            }
        )

    @action(detail=True, methods=["get"], url_path="precipitacao-serie")
    def precipitacao_serie(self, request, pk=None):
        """Chuva em baldes de tempo pra plotar barra+linha acumulada — mesma
        ideia do "Precipitação Acumulada em 4h/24h/7 dias" do Rede Salvar do
        CEMADEN nacional (pedido do usuário, 2026-09-28). `janela`: "4h"
        (baldes de 15min), "24h" (baldes de 1h) ou "7d" (baldes de 1 dia)."""
        station = self.get_object()
        janela = request.query_params.get("janela", "24h")
        agora = timezone.now()
        config = {
            "4h": (datetime.timedelta(hours=4), "minute", 15),
            "24h": (datetime.timedelta(hours=24), "hour", 1),
            "7d": (datetime.timedelta(days=7), "day", 1),
        }
        if janela not in config:
            return Response({"detail": "janela deve ser '4h', '24h' ou '7d'."}, status=400)
        duracao, unidade_trunc, passo = config[janela]
        inicio = agora - duracao

        leituras = list(
            Reading.objects.filter(
                station=station, reading_type=Reading.ReadingType.CHUVA_MM, timestamp__gte=inicio, value__gte=0
            ).values("timestamp", "value")
        )

        # Balde em Python (não no banco): pra "4h em baldes de 15min" o
        # Trunc do Django só trunca em unidades fixas (minute/hour/day), não
        # em "grupos de 15" — agrupar por época múltipla do passo resolve
        # sem precisar de SQL cru, e o volume aqui é pequeno (no máximo
        # poucas centenas de leituras de uma estação só).
        baldes: dict[datetime.datetime, float] = {}
        seg_por_balde = {"minute": 60, "hour": 3600, "day": 86400}[unidade_trunc] * passo
        epoch0 = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
        for r in leituras:
            offset = (r["timestamp"] - epoch0).total_seconds()
            inicio_balde = epoch0 + datetime.timedelta(seconds=(offset // seg_por_balde) * seg_por_balde)
            baldes[inicio_balde] = baldes.get(inicio_balde, 0.0) + r["value"]

        serie = [{"inicio": ts.isoformat(), "chuva_mm": round(v, 2)} for ts, v in sorted(baldes.items())]
        total = round(sum(b["chuva_mm"] for b in serie), 2)
        return Response({"janela": janela, "inicio": inicio.isoformat(), "total_mm": total, "serie": serie})

    @action(detail=True, methods=["get"])
    def proximas(self, request, pk=None):
        """As estações mais próximas (linha reta, sem considerar relevo) —
        pro mapinha da página /estacao (pedido do usuário, 2026-09-28).
        `raio_km` (padrão 20) e `limit` (padrão 12)."""
        import math

        station = self.get_object()
        raio_km = float(request.query_params.get("raio_km", 20))
        limit = int(request.query_params.get("limit", 12))

        lat0, lon0 = math.radians(station.latitude), math.radians(station.longitude)
        candidatas = Station.objects.select_related("source").exclude(pk=station.pk).only(
            "id", "name", "station_type", "latitude", "longitude", "municipality", "source__slug"
        )
        proximas = []
        for s in candidatas:
            lat1, lon1 = math.radians(s.latitude), math.radians(s.longitude)
            dlat, dlon = lat1 - lat0, lon1 - lon0
            a = math.sin(dlat / 2) ** 2 + math.cos(lat0) * math.cos(lat1) * math.sin(dlon / 2) ** 2
            distancia_km = 2 * 6371 * math.asin(math.sqrt(a))
            if distancia_km <= raio_km:
                proximas.append((distancia_km, s))
        proximas.sort(key=lambda x: x[0])
        return Response(
            [
                {
                    "id": s.id,
                    "name": s.name,
                    "source": s.source.slug,
                    "station_type": s.station_type,
                    "municipality": canonico_ou_original(s.municipality),
                    "latitude": s.latitude,
                    "longitude": s.longitude,
                    "distancia_km": round(d, 1),
                }
                for d, s in proximas[:limit]
            ]
        )

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
        stations = list(
            self._filtered_stations()
            .filter(station_type=Station.StationType.SIRENE)
            .select_related("sirene_ref", "sirene_ref__source")
        )
        station_ids = [s.id for s in stations]

        eventos = list(
            AlertEvent.objects.filter(rule__name="Sirene de alarme tocando", station_id__in=station_ids)
            .order_by("station_id", "-triggered_at")
            .values("station_id", "value", "triggered_at", "resolved_at")
        )
        ativo = {}
        ultimo = {}
        for ev in eventos:  # já vem do mais novo pro mais antigo por estação
            if ev["resolved_at"] is None:
                ativo.setdefault(ev["station_id"], ev)
            else:
                ultimo.setdefault(ev["station_id"], ev)
        tipos = {t.codigo: t for t in SireneAcaoTipo.objects.all()}

        def info_acao(codigo):
            t = tipos.get(int(codigo)) if codigo is not None else None
            return (t.nome, t.categoria) if t else (f"Acionamento código {int(codigo)}", "outro")

        # Chuva de 1h/24h/96h/30d — pras sirenes com pluviômetro próprio (EAA+P), a
        # partir da leitura da própria estação; pras demais, a partir de `sirene_ref`
        # (estação de referência, auto-preenchida pelo management command
        # populate_sirene_ref ou editada manualmente no Admin — ver core/gatilhos.py
        # e [[sirenes-acionamento-e-niteroi]]). Uma única chamada a
        # `_calcular_precipitacao` cobre estação própria + todas as referências.
        com_pluv = [s for s in stations if (s.raw_metadata or {}).get("tem_pluviometro")]
        refs = {s.sirene_ref for s in stations if s.sirene_ref_id and not (s.raw_metadata or {}).get("tem_pluviometro")}
        acumulados_por_id = {
            entry["id"]: entry for entry in self._calcular_precipitacao(com_pluv + list(refs))
        }

        def _efetiva_id(station):
            if (station.raw_metadata or {}).get("tem_pluviometro"):
                return station.id
            return station.sirene_ref_id

        chuva_1h = {s.id: (acumulados_por_id.get(_efetiva_id(s)) or {}).get("acumulado_1h_mm") for s in stations}
        chuva_24h = {s.id: (acumulados_por_id.get(_efetiva_id(s)) or {}).get("acumulado_24h_mm") for s in stations}
        chuva_96h = {s.id: (acumulados_por_id.get(_efetiva_id(s)) or {}).get("acumulado_96h_mm") for s in stations}
        chuva_30d = {s.id: (acumulados_por_id.get(_efetiva_id(s)) or {}).get("acumulado_1mes_mm") for s in stations}
        # "Sem dado na 1h" agora depende da estação EFETIVA (própria OU REF), não
        # necessariamente da própria sirene — uma sirene sem pluviômetro usa a
        # frescor da leitura da sua referência.
        efetiva_updated_at = {s.id: (acumulados_por_id.get(_efetiva_id(s)) or {}).get("updated_at") for s in stations}
        limite_1h = timezone.now() - datetime.timedelta(hours=1)

        # Gatilhos (GI-GIV) — só fazemos a gestão de 13 municípios (ver
        # GatilhoPluviometrico); os demais ficam com todos os 4 em None ("--").
        gatilhos_por_municipio = {g.municipio: g for g in GatilhoPluviometrico.objects.all()}

        # Última leitura de chuva (só existe pras ~85 sirenes com
        # pluviômetro acoplado) — pega em Python a 1ª ocorrência por
        # estação de uma lista já ordenada (station_id, -timestamp).
        leituras_recentes = Reading.objects.filter(
            station_id__in=station_ids,
            reading_type=Reading.ReadingType.CHUVA_MM,
            value__gte=0,  # ignora o valor-sentinela negativo (-99,99 do Alerta Rio = "sem dado")
            timestamp__gte=timezone.now() - datetime.timedelta(hours=24),
        ).order_by("station_id", "-timestamp").values("station_id", "value", "timestamp")
        ultima_chuva = {}
        for r in leituras_recentes:
            ultima_chuva.setdefault(r["station_id"], r)

        data = []
        for station in stations:
            meta = station.raw_metadata or {}
            chuva = ultima_chuva.get(station.id)
            ev = ativo.get(station.id)
            triggered_at = ev["triggered_at"] if ev else None
            acao_nome, acao_categoria = info_acao(ev["value"]) if ev else (None, None)
            prev = ultimo.get(station.id)
            prev_nome = info_acao(prev["value"])[0] if prev else None
            efetiva_ts = efetiva_updated_at.get(station.id)
            sem_dado_1h = efetiva_ts is None or efetiva_ts < limite_1h
            tocando = triggered_at is not None
            municipio_canonico = canonico_ou_original(station.municipality)
            gatilho_config = gatilhos_por_municipio.get(municipio_canonico)
            status_gatilhos = avaliar_gatilhos(
                gatilho_config,
                None if sem_dado_1h else chuva_1h.get(station.id),
                chuva_24h.get(station.id),
                chuva_96h.get(station.id),
                chuva_30d.get(station.id),
            )
            status_gatilhos = aplicar_estado_real(status_gatilhos, tocando, gatilho_config is not None)
            ref = station.sirene_ref
            data.append(
                {
                    "id": station.id,
                    "external_id": station.external_id,
                    "name": station.name,
                    "municipality": municipio_canonico,
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
                    "tocando": tocando,
                    "tocando_desde": triggered_at,
                    "acao_codigo": int(ev["value"]) if ev else None,
                    "acao_nome": acao_nome,
                    "acao_categoria": acao_categoria,
                    "ultimo_acionamento_nome": prev_nome,
                    "ultimo_acionamento_fim": prev["resolved_at"] if prev else None,
                    "chuva_1h_mm": (None if sem_dado_1h else chuva_1h.get(station.id)),
                    "chuva_24h_mm": chuva_24h.get(station.id),
                    "chuva_96h_mm": chuva_96h.get(station.id),
                    "chuva_30d_mm": chuva_30d.get(station.id),
                    "ultima_chuva_mm": chuva["value"] if chuva else None,
                    "ultima_chuva_em": chuva["timestamp"] if chuva else None,
                    "tipo_sirene": station.tipo_sirene or None,
                    "risco_sirene": station.risco_sirene or None,
                    "ref_id": ref.id if ref else None,
                    "ref_nome": ref.name if ref else None,
                    "gatilho_definido": gatilho_config is not None,
                    "gatilhos": status_gatilhos,
                    "updated_at": station.updated_at,
                }
            )

        # Prioriza o que precisa de atenção: tocando agora primeiro, depois
        # offline, depois o resto em ordem alfabética.
        data.sort(key=lambda e: (not e["tocando"], e["status_estacao"] != Station.Status.INATIVA, e["name"]))
        return Response(data)

    def _calcular_precipitacao(self, stations, usar_oficiais=True):
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
            value__gte=0,  # ignora o valor-sentinela negativo (-99,99 do Alerta Rio = "sem dado")
            timestamp__gte=JANELA_MAX_PYTHON,
        ).values("station_id", "value", "timestamp")

        by_station = defaultdict(list)
        for r in readings:
            by_station[r["station_id"]].append(r)

        def _soma_agregada_por_estacao(cutoff):
            return {
                row["station_id"]: row["total"]
                for row in Reading.objects.filter(
                    station_id__in=station_ids,
                    reading_type=Reading.ReadingType.CHUVA_MM,
                    value__gte=0,
                    timestamp__gte=cutoff,
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
                value__gte=0,
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
            entry["acumulados_oficiais"] = self._aplicar_oficiais(entry, station, now) if usar_oficiais else False
            data.append(entry)

        return data

    @staticmethod
    def _aplicar_oficiais(entry: dict, station, agora) -> bool:
        """Troca, em `entry`, as janelas que a FONTE informa pelos valores oficiais (se o
        retrato tem até OFICIAL_VALIDADE_H h). Devolve True se aplicou. Guarda o nosso cálculo
        original em `entry["calculado"]` (campo -> valor) para auditoria."""
        mapa = MAPA_ACUMULADOS_OFICIAIS.get(station.source.slug)
        snap = (station.raw_metadata or {}).get("acumulados_oficiais") if mapa else None
        if not snap or not snap.get("referencia"):
            return False
        try:
            ref = datetime.datetime.fromisoformat(snap["referencia"])
        except ValueError:
            return False
        if agora - ref > datetime.timedelta(hours=OFICIAL_VALIDADE_H):
            return False
        acc = snap.get("acc") or {}
        calculado = {}
        for campo, chave in mapa.items():
            valor = acc.get(chave)
            if valor is None or valor < 0:
                continue  # "ND"/sentinela: mantém o nosso cálculo
            calculado[campo] = entry.get(campo)
            entry[campo] = valor
        entry["calculado"] = calculado
        if calculado:
            StationViewSet._garantir_janelas_coerentes(entry)
        return bool(calculado)

    # Janelas de chuva em ordem crescente de duração (campos de `_calcular_precipitacao`).
    JANELAS_EM_ORDEM = (
        "acumulado_5min_mm", "acumulado_10min_mm", "acumulado_15min_mm", "acumulado_30min_mm",
        "acumulado_1h_mm", "acumulado_2h_mm", "acumulado_3h_mm", "acumulado_4h_mm", "acumulado_6h_mm",
        "acumulado_12h_mm", "acumulado_24h_mm", "acumulado_36h_mm", "acumulado_48h_mm", "acumulado_72h_mm",
        "acumulado_96h_mm", "acumulado_168h_mm", "acumulado_1mes_mm",
    )

    @staticmethod
    def _garantir_janelas_coerentes(entry: dict) -> None:
        """Depois de trocar algumas janelas pelo valor OFICIAL, as que continuam calculadas por nós
        podem ficar incoerentes (ex.: nosso 6 h = 2 mm abaixo do oficial de 4 h = 5 mm). Uma janela
        maior contém a menor, então nunca pode ser menor: sobe para o maior valor das janelas
        contidas. Só mexe nas janelas ainda calculadas (as oficiais não são alteradas)."""
        oficiais = set((entry.get("calculado") or {}).keys())
        maior = None
        for campo in StationViewSet.JANELAS_EM_ORDEM:
            v = entry.get(campo)
            if v is None:
                continue
            if maior is not None and v < maior and campo not in oficiais:
                entry[campo] = maior
                v = maior
            maior = v if maior is None else max(maior, v)

    @action(detail=False, methods=["get"])
    def cemaden(self, request):
        """Tabela "CEMADEN Nacional" (03/10/2026): estações da fonte
        `cemaden_mctic` (pluviométricas A/B, hidrológicas H e geotécnicas G) com
        os acumulados OFICIAIS da própria fonte (1, 3, 6, 12, 24, 48, 72 e 96 h,
        do `getJson2.php` — mesmos números da Rede Salvar), o código oficial
        da estação, a hora da última leitura e a qualificação dela. Traz
        também os NOSSOS acumulados de 1/24/96 h (soma dos baldes gravados)
        para comparar com os oficiais."""
        stations = list(Station.objects.filter(source__slug="cemaden_mctic"))
        ids = [s.id for s in stations]
        nossos = {e["id"]: e for e in self._calcular_precipitacao(stations, usar_oficiais=False)}

        # Qualificação da última leitura de cada estação (só exceções existem).
        qualidade = {}
        recentes = (
            LeituraQualidade.objects.filter(
                reading__station_id__in=ids,
                reading__timestamp__gte=timezone.now() - datetime.timedelta(hours=6),
            )
            .order_by("reading__station_id", "-reading__timestamp")
            .values("reading__station_id", "reading__timestamp", "qualidade", "motivo")
        )
        for q in recentes:
            qualidade.setdefault(q["reading__station_id"], q)

        data = []
        for station in stations:
            meta = station.raw_metadata or {}
            snap = meta.get("acumulados_oficiais") or {}
            acc = snap.get("acc") or {}
            referencia = snap.get("referencia")
            q = qualidade.get(station.id)
            # Só vale como "qualificação da leitura atual" se for da própria
            # última leitura; senão a leitura atual foi avaliada e é válida.
            q_atual = q if (q and referencia and q["reading__timestamp"].isoformat() == referencia) else None
            nosso = nossos.get(station.id) or {}
            data.append(
                {
                    "id": station.id,
                    "name": station.name,
                    "municipality": canonico_ou_original(station.municipality),
                    "tipo_cemaden": meta.get("tipo_cemaden") or "",
                    "codigo": meta.get("cod_estacao") or "",
                    "idestacao": meta.get("idestacao"),
                    "referencia": referencia,
                    "ultimo_mm": snap.get("ultimo"),
                    "oficial": {j: acc.get(j) for j in ("1", "3", "6", "12", "24", "48", "72", "96")},
                    "nosso_1h_mm": nosso.get("acumulado_1h_mm"),
                    "nosso_24h_mm": nosso.get("acumulado_24h_mm"),
                    "nosso_96h_mm": nosso.get("acumulado_96h_mm"),
                    "qualidade": q_atual["qualidade"] if q_atual else ("valido" if referencia else None),
                    "qualidade_motivo": q_atual["motivo"] if q_atual else "",
                }
            )
        return Response(data)

    REDES_TABELA = (
        "plugfield", "macae_ufrj", "wunderground", "niteroi", "alerta_rio", "inea", "ecowitt_paracambi", "inmet", "redemet",
        "cemaden_rj_sirenes",
    )

    @action(detail=False, methods=["get"])
    def rede(self, request):
        """Tabela individual por fonte (03/10/2026) para as redes sensíveis
        Plugfield, Macaé (UFRJ) e Wunderground — `GET /api/stations/rede/?source=<slug>`.
        Mesmo desenho do `cemaden`: valores OFICIAIS da fonte ao lado dos NOSSOS
        acumulados (soma dos baldes gravados), última observação, variáveis
        meteorológicas atuais, qualificação e código da estação.

        `oficial` depende da fonte: Macaé = {"1","24","96"} (portal);
        Plugfield = {"hoje","mes","ano"} (`rainDay/rainMonth/rainYear`);
        Wunderground = {"hoje","taxa"} (`precipTotal`, `precipRate`);
        Niterói = janelas oficiais {"m05","m15","1","6","12","24","36","48","72","96","168","720","mes"};
        Alerta Rio = {"m05","m15","1","2","3","4","24","96","mes"}."""
        slug = request.query_params.get("source", "")
        if slug not in self.REDES_TABELA:
            return Response({"detail": f"source deve ser um de {list(self.REDES_TABELA)}"}, status=400)
        stations = list(Station.objects.filter(source__slug=slug))
        ids = [st.id for st in stations]
        nossos = {e["id"]: e for e in self._calcular_precipitacao(stations, usar_oficiais=False)}
        agora = timezone.now()

        tipos_atuais = {
            "temperatura_c": "temp",
            "umidade_pct": "umid",
            "vento_ms": "vento_ms",
            "vento_rajada_ms": "rajada_ms",
            "pressao_nm_hpa": "pressao_nm",
            "pressao_hpa": "pressao",
            "vento_dir_graus": "dir",
            "ponto_orvalho_c": "orvalho",
            "temperatura_max_c": "tmax",
            "temperatura_min_c": "tmin",
            "radiacao_wm2": "rad",
            "nivel_m": "nivel",
        }
        atuais: dict = {}
        for sid, rt, valor in (
            Reading.objects.filter(
                station_id__in=ids, reading_type__in=list(tipos_atuais), timestamp__gte=agora - datetime.timedelta(hours=6)
            )
            .order_by("timestamp")
            .values_list("station_id", "reading_type", "value")
        ):
            atuais.setdefault(sid, {})[tipos_atuais[rt]] = valor  # ordem crescente: a última vence

        ultima_leitura = {
            r["station_id"]: r["m"]
            for r in Reading.objects.filter(station_id__in=ids).values("station_id").annotate(m=Max("timestamp"))
        }

        qualidade: dict = {}
        for q in (
            LeituraQualidade.objects.filter(
                reading__station_id__in=ids, reading__timestamp__gte=agora - datetime.timedelta(hours=24)
            )
            .order_by("reading__station_id", "-reading__timestamp")
            .values("reading__station_id", "reading__timestamp", "qualidade", "motivo")
        ):
            qualidade.setdefault(q["reading__station_id"], q)

        data = []
        for st in stations:
            meta = st.raw_metadata or {}
            referencia = None
            oficial: dict = {}
            extra: dict = {}
            codigo = st.external_id
            if slug == "macae_ufrj":
                snap = meta.get("acumulados_oficiais") or {}
                referencia = snap.get("referencia")
                oficial = {j: (snap.get("acc") or {}).get(j) for j in ("1", "24", "96")}
                codigo = meta.get("codigo") or st.external_id
                extra = {"online": (meta.get("estacao") or {}).get("online")}
            elif slug == "plugfield":
                dash = meta.get("dashboard") or {}
                ts_ms = meta.get("lastUpdateTimestamp")
                if ts_ms:
                    referencia = datetime.datetime.fromtimestamp(ts_ms / 1000, tz=datetime.timezone.utc).isoformat()
                oficial = {"hoje": dash.get("rainDay"), "mes": dash.get("rainMonth"), "ano": dash.get("rainYear")}
                codigo = str(meta.get("serialNumber") or st.external_id)
                extra = {"bateria_pct": dash.get("bat"), "intervalo_s": meta.get("refreshInterval"), "modelo": meta.get("stationModel")}
            elif slug == "inea":
                snap = meta.get("acumulados_oficiais") or {}
                referencia = snap.get("referencia")
                oficial = dict(snap.get("acc") or {})
                codigo = str(meta.get("codigo_inea") or st.external_id)
                extra = {"tipo_inea": meta.get("tipo_inea")}
            elif slug == "cemaden_rj_sirenes":
                if not meta.get("tem_pluviometro"):
                    continue  # só as sirenes com pluviômetro entram na tabela de chuva
                snap = meta.get("acumulados_oficiais") or {}
                referencia = snap.get("referencia")
                oficial = dict(snap.get("acc") or {})
                extra = {"redec": meta.get("redec")}
            elif slug == "ecowitt_paracambi":
                snap = meta.get("acumulados_oficiais") or {}
                referencia = snap.get("referencia")
                oficial = dict(snap.get("acc") or {})
                codigo = st.external_id
            elif slug in ("inmet", "redemet"):
                codigo = st.external_id  # INMET: A628; REDEMET: ICAO (ex.: SBJR)
            elif slug in ("niteroi", "alerta_rio"):
                snap = meta.get("acumulados_oficiais") or {}
                referencia = snap.get("referencia")
                acc = snap.get("acc") or {}
                # chaves "h01" -> "1", "h24" -> "24"; "m05"/"m15"/"mes" ficam como estão
                oficial = {(str(int(k[1:])) if k.startswith("h") else k): v for k, v in acc.items()}
                codigo = str(meta.get("codigo") or meta.get("cod") or st.external_id)
                extra = {
                    "atrasada_fonte": snap.get("is_delay"),
                    "localizacao": snap.get("localizacao"),
                    "numero": snap.get("numero"),
                }
            else:  # wunderground
                obs = meta.get("observacao_oficial") or {}
                referencia = obs.get("referencia")
                oficial = {"hoje": obs.get("precip_total_mm"), "taxa": obs.get("precip_rate_mm_h")}
                extra = {"qc_status": obs.get("qc_status"), "software": obs.get("software"), "bairro": obs.get("bairro")}
            if not referencia and ultima_leitura.get(st.id):
                referencia = ultima_leitura[st.id].isoformat()
            n = nossos.get(st.id) or {}
            q = qualidade.get(st.id)
            data.append(
                {
                    "id": st.id,
                    "name": st.name,
                    "municipality": canonico_ou_original(st.municipality),
                    "codigo": codigo,
                    "referencia": referencia,
                    "ultima_leitura": ultima_leitura[st.id].isoformat() if ultima_leitura.get(st.id) else None,
                    "oficial": oficial,
                    "nosso": {
                        "1": n.get("acumulado_1h_mm"),
                        "3": n.get("acumulado_3h_mm"),
                        "6": n.get("acumulado_6h_mm"),
                        "12": n.get("acumulado_12h_mm"),
                        "24": n.get("acumulado_24h_mm"),
                        "48": n.get("acumulado_48h_mm"),
                        "72": n.get("acumulado_72h_mm"),
                        "96": n.get("acumulado_96h_mm"),
                        "hoje": n.get("acumulado_hoje_mm"),
                        "mes": n.get("acumulado_mes_mm"),
                    },
                    "atual": atuais.get(st.id, {}),
                    "extra": extra,
                    "qualidade": q["qualidade"] if q else None,
                    "qualidade_motivo": q["motivo"] if q else "",
                    "qualidade_em": q["reading__timestamp"].isoformat() if q else None,
                }
            )
        return Response(data)

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


class AvisoMauTempoViewSet(viewsets.ReadOnlyModelViewSet):
    """Avisos de mau tempo da Marinha do Brasil (SMM/CHM) para as áreas
    CHARLIE e DELTA da METAREA V, que cobrem o litoral do RJ — ver
    ingestion/connectors/marinha_avisos.py.

    Por padrão só devolve avisos ainda válidos (`valido_ate` no futuro, ou
    sem `valido_ate` conhecido); `?ativo=false` devolve só os já expirados,
    `?ativo=all` devolve o histórico completo. Filtra por `?area=CHARLIE`
    ou `?area=DELTA`."""

    serializer_class = AvisoMauTempoSerializer

    def get_queryset(self):
        qs = AvisoMauTempo.objects.all()
        params = self.request.query_params
        if area := params.get("area"):
            qs = qs.filter(area=area.upper())
        ativo = params.get("ativo", "true")
        agora = timezone.now()
        if ativo == "true":
            qs = qs.filter(Q(valido_ate__isnull=True) | Q(valido_ate__gte=agora))
        elif ativo == "false":
            qs = qs.filter(valido_ate__lt=agora)
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
    def sol(self, request):
        """Nascer e pôr do sol por REDEC no dia (`?data=AAAA-MM-DD`; padrão hoje),
        da tabela de referência 2026-2035 — usado para pré-preencher o
        formulário de previsão. `?regiao=` filtra uma só. {} se fora da tabela."""
        from core.sol import sol_do_dia

        data = request.query_params.get("data") or timezone.localdate().isoformat()
        try:
            datetime.date.fromisoformat(data)
        except ValueError:
            return Response({"detail": "data inválida (use AAAA-MM-DD)."}, status=400)
        dados = sol_do_dia(data)
        if regiao := request.query_params.get("regiao"):
            dados = {k: v for k, v in dados.items() if k == regiao.strip().upper()}
        return Response({"data": data, "regioes": dados})

    @action(detail=False, methods=["get"])
    def ultima(self, request):
        """Previsões da data mais recente cadastrada (uma por região)."""
        ultima = Previsao.objects.aggregate(d=Max("data"))["d"]
        qs = Previsao.objects.filter(data=ultima) if ultima else Previsao.objects.none()
        return Response(self.get_serializer(qs, many=True).data)
