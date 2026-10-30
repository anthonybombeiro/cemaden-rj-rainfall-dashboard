from django.db import models
from django.utils import timezone


class Source(models.Model):
    """Uma fonte externa de dados (INMET, CEMADEN nacional, Alerta Rio, ...)."""

    slug = models.SlugField(unique=True, help_text="Identificador usado pelo conector (ex: 'inmet').")
    name = models.CharField(max_length=120)
    website = models.URLField(blank=True)
    description = models.TextField(blank=True)
    enabled = models.BooleanField(default=True)
    last_ingested_at = models.DateTimeField(null=True, blank=True)
    last_ingest_error = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Station(models.Model):
    class StationType(models.TextChoices):
        PLUVIOMETRICA = "pluviometrica", "Pluviométrica (chuva)"
        HIDROLOGICA = "hidrologica", "Hidrológica (nível de rio)"
        METEOROLOGICA = "meteorologica", "Meteorológica (completa)"
        MARE = "mare", "Maré/Oceanográfica"
        SIRENE = "sirene", "Sirene/Alarme"
        OUTRO = "outro", "Outro"

    class Status(models.TextChoices):
        ATIVA = "ativa", "Ativa"
        INATIVA = "inativa", "Inativa"
        DESCONHECIDO = "desconhecido", "Desconhecido"

    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="stations")
    external_id = models.CharField(
        max_length=64, help_text="Código da estação na fonte original (ex: código INMET 'A652')."
    )
    name = models.CharField(max_length=200)
    municipality = models.CharField(max_length=120, blank=True)
    # Inventário hidrometeorológico (INEA/ANA) — preenchido pelo carregamento
    # de referência (core/hidro_ref.py); ver [[hidrologico-cotas-e-inventario]].
    ana_codigo_plu = models.CharField("Código ANA (plu)", max_length=20, blank=True)
    ana_codigo_flu = models.CharField("Código ANA (flu)", max_length=20, blank=True)
    rio_monitorado = models.CharField(max_length=120, blank=True)
    regiao_hidrografica = models.CharField(max_length=120, blank=True)
    bacia = models.CharField(max_length=120, blank=True)
    station_type = models.CharField(max_length=20, choices=StationType.choices, default=StationType.OUTRO)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DESCONHECIDO)
    latitude = models.FloatField()
    longitude = models.FloatField()
    altitude_m = models.FloatField(null=True, blank=True)
    raw_metadata = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Campos específicos de sirene (2026-09-29, pedido do usuário) — só fazem
    # sentido pra station_type=SIRENE, mas ficam direto na Station (mesmo
    # padrão dos campos de inventário hidro acima) pra não precisar de mais
    # uma tabela 1-pra-1. Ficam em branco/nulos pras demais estações.
    class TipoSirene(models.TextChoices):
        EAA = "EAA", "Simples (EAA)"
        EAA_P = "EAA+P", "Com pluviômetro (EAA+P)"
        EAA_H = "EAA+H", "Com estação hidrológica (EAA+H)"
        EAA_M = "EAA+M", "Com estação meteorológica (EAA+M)"

    class RiscoSirene(models.TextChoices):
        GEO = "geo", "Geológico"
        HIDRO = "hidro", "Hidrológico"
        GEO_HIDRO = "geo_hidro", "Geológico + Hidrológico"

    tipo_sirene = models.CharField(
        "Tipo de sirene", max_length=10, choices=TipoSirene.choices, blank=True,
        help_text="EAA/EAA+P são derivados automaticamente (tem ou não pluviômetro); EAA+H/EAA+M são atribuídos manualmente quando essas sirenes existirem.",
    )
    risco_sirene = models.CharField(
        "Tipo de risco (sirene)", max_length=10, choices=RiscoSirene.choices, blank=True,
        help_text="Não vem de nenhuma fonte automática — classificação manual por sirene.",
    )
    sirene_ref = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="sirenes_referenciadas",
        verbose_name="Estação de referência (REF)",
        help_text="Estação com pluviômetro usada pra calcular os gatilhos desta sirene quando ela não tem pluviômetro próprio. "
        "Pré-preenchida automaticamente com a estação pluviométrica mais próxima dentro de 2km (ver management command "
        "populate_sirene_ref) — editável aqui manualmente.",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["source", "external_id"], name="unique_station_per_source")
        ]
        indexes = [models.Index(fields=["latitude", "longitude"])]
        ordering = ["name"]

    def save(self, *args, **kwargs):
        from core.municipios import canonico_ou_original

        self.municipality = canonico_ou_original(self.municipality)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.source.slug}/{self.external_id})"


class Reading(models.Model):
    class ReadingType(models.TextChoices):
        CHUVA_MM = "chuva_mm", "Chuva acumulada (mm)"
        NIVEL_M = "nivel_m", "Nível do rio (m)"
        TEMPERATURA_C = "temperatura_c", "Temperatura (°C)"
        UMIDADE_PCT = "umidade_pct", "Umidade relativa (%)"
        VENTO_MS = "vento_ms", "Vento (m/s)"
        VENTO_RAJADA_MS = "vento_rajada_ms", "Rajada de vento (m/s)"
        VENTO_DIR_GRAUS = "vento_dir_graus", "Direção do vento (graus)"
        MARE_M = "mare_m", "Maré (m)"
        VAZAO_M3S = "vazao_m3s", "Vazão (m³/s)"
        # Extras meteorológicos (2026-09-25). max/min vêm da FONTE (INMET: extremo da
        # hora; Plugfield: extremo do dia até agora; Alerta Rio: min/max informados).
        TEMPERATURA_MAX_C = "temperatura_max_c", "Temperatura máxima (°C)"
        TEMPERATURA_MIN_C = "temperatura_min_c", "Temperatura mínima (°C)"
        UMIDADE_MAX_PCT = "umidade_max_pct", "Umidade máxima (%)"
        UMIDADE_MIN_PCT = "umidade_min_pct", "Umidade mínima (%)"
        PRESSAO_HPA = "pressao_hpa", "Pressão na estação (hPa)"
        PRESSAO_NM_HPA = "pressao_nm_hpa", "Pressão ao nível do mar (hPa)"
        PONTO_ORVALHO_C = "ponto_orvalho_c", "Ponto de orvalho (°C)"
        RADIACAO_WM2 = "radiacao_wm2", "Radiação solar (W/m²)"
        UV_INDICE = "uv_indice", "Índice UV"
        SENSACAO_TERMICA_C = "sensacao_termica_c", "Sensação térmica (°C)"

    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name="readings")
    reading_type = models.CharField(max_length=20, choices=ReadingType.choices)
    value = models.FloatField()
    timestamp = models.DateTimeField(help_text="Sempre em UTC.")
    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["station", "reading_type", "timestamp"], name="unique_reading_per_station_type_time"
            )
        ]
        indexes = [models.Index(fields=["station", "reading_type", "-timestamp"])]
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.station.name} · {self.get_reading_type_display()} = {self.value} @ {self.timestamp:%Y-%m-%d %H:%M}"


class AlertRule(models.Model):
    class Comparison(models.TextChoices):
        GTE = "gte", "Maior ou igual a"
        LTE = "lte", "Menor ou igual a"

    class Severity(models.TextChoices):
        ATENCAO = "atencao", "Atenção"
        ALERTA = "alerta", "Alerta"
        ALERTA_MAXIMO = "alerta_maximo", "Alerta máximo"

    name = models.CharField(max_length=150)
    reading_type = models.CharField(max_length=20, choices=Reading.ReadingType.choices)
    comparison = models.CharField(max_length=3, choices=Comparison.choices, default=Comparison.GTE)
    threshold_value = models.FloatField()
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.ATENCAO)
    station = models.ForeignKey(
        Station, on_delete=models.CASCADE, related_name="alert_rules", null=True, blank=True,
        help_text="Deixe em branco para aplicar a regra a todas as estações do tipo de leitura.",
    )
    municipality = models.CharField(max_length=120, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-severity", "name"]

    def save(self, *args, **kwargs):
        from core.municipios import canonico_ou_original

        self.municipality = canonico_ou_original(self.municipality)
        super().save(*args, **kwargs)

    def __str__(self):
        alvo = self.station.name if self.station else (self.municipality or "todas as estações")
        return f"{self.name} ({alvo})"

    def is_triggered_by(self, value: float) -> bool:
        if self.comparison == self.Comparison.GTE:
            return value >= self.threshold_value
        return value <= self.threshold_value


class RiskAlert(models.Model):
    """Classificação de risco oficial da Defesa Civil-RJ (CEMADEN-RJ/SEDEC),
    consumida da API pública de integração Power BI do painel GridLab
    (`/integracao/envia/cemaden/` — ver docs/fontes-de-dados.md). Diferente
    de `AlertRule`/`AlertEvent` (que são regras DESTE sistema disparadas por
    leitura de estação): aqui é a classificação já pronta que a Defesa Civil
    emite por REDEC ou por município.

    Guarda só o estado ATUAL por (tipo, redec, município) — não o histórico
    completo que a fonte expõe (esse histórico pode passar de 40MB por
    tipo; sem uso operacional aqui, e cada sync sobrescreve o registro via
    upsert)."""

    class Tipo(models.TextChoices):
        HIDROLOGICO = "hidrologico", "Aviso Hidrológico"
        GEOLOGICO = "geologico", "Aviso Geológico"
        METEOROLOGICO = "meteorologico", "Nível de Severidade Meteorológica"
        INCENDIO = "incendio", "Risco de Incêndio Florestal"

    class Risco(models.TextChoices):
        MUITO_BAIXO = "muito_baixo", "Muito baixo"
        BAIXO = "baixo", "Baixo"
        MODERADO = "moderado", "Moderado"
        ALTO = "alto", "Alto"
        MUITO_ALTO = "muito_alto", "Muito alto"

    tipo = models.CharField(max_length=20, choices=Tipo.choices)
    redec = models.CharField(max_length=40, help_text="Regional de Defesa Civil (ex: 'SERRANA I').")
    municipio = models.CharField(
        max_length=120, blank=True,
        help_text="Só preenchido pra tipos com granularidade municipal (hoje: só Geológico).",
    )
    risco = models.CharField(max_length=20, choices=Risco.choices)
    numero_externo = models.CharField(
        max_length=20, blank=True, help_text="ID do boletim/aviso na fonte original."
    )
    responsavel = models.CharField(max_length=120, blank=True)
    criado_em = models.DateTimeField(null=True, blank=True)
    atualizado_em = models.DateTimeField(null=True, blank=True)
    fonte = models.CharField(max_length=120, blank=True, default="CEMADEN-RJ - SEDEC")
    raw_payload = models.JSONField(default=dict, blank=True)
    ingested_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["tipo", "redec", "municipio"], name="unique_risk_alert_scope")
        ]
        ordering = ["tipo", "redec", "municipio"]

    def save(self, *args, **kwargs):
        from core.municipios import canonico_ou_original

        self.municipio = canonico_ou_original(self.municipio)
        super().save(*args, **kwargs)

    def __str__(self):
        alvo = self.municipio or self.redec
        return f"{self.get_tipo_display()} · {alvo} · {self.get_risco_display()}"


class AlertEvent(models.Model):
    rule = models.ForeignKey(AlertRule, on_delete=models.CASCADE, related_name="events")
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name="alert_events")
    reading = models.ForeignKey(Reading, on_delete=models.SET_NULL, null=True, blank=True)
    value = models.FloatField()
    triggered_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-triggered_at"]

    @property
    def active(self) -> bool:
        return self.resolved_at is None

    def __str__(self):
        estado = "ativo" if self.active else "resolvido"
        return f"{self.rule.name} · {self.station.name} · {estado}"


class Previsao(models.Model):
    """Previsão do tempo diária por região (REDEC) — substitui o sistema
    legado contingenciaverao.rj.gov.br/CTRLADM (uma linha por região/dia)."""

    REGIOES = [
        "BAIXADA FLUMINENSE", "BAIXADA LITORÂNEA", "CAPITAL", "COSTA VERDE", "METROPOLITANA",
        "NORTE", "NOROESTE", "SERRANA I", "SERRANA II", "SUL I", "SUL II",
    ]

    class Vento(models.TextChoices):
        FRACO = "Fraco", "Fraco"
        FRACO_MODERADO = "Fraco/Moderado", "Fraco/Moderado"
        MODERADO = "Moderado", "Moderado"
        MODERADO_FORTE = "Moderado/Forte", "Moderado/Forte"
        FORTE = "Forte", "Forte"

    class Icone(models.TextChoices):
        CEU_CLARO = "ceuClaro", "Céu claro"
        POUCAS_NUVENS = "ceuPoucasNuvens", "Poucas nuvens"
        PARCIALMENTE_NUBLADO = "ceuParcialmenteNublado", "Parcialmente nublado"
        PARCIALMENTE_NUBLADO_CHUVA = "ceuParcialmenteNubladoChuva", "Parcialmente nublado com chuva"
        PARCIALMENTE_NUBLADO_CHUVA_RAIOS = "ceuParcialmenteNubladoChuvaRaios", "Parcialmente nublado com chuva e raios"
        NUBLADO = "ceuNublado", "Nublado"
        NUBLADO_CHUVA = "ceuNubladoChuva", "Nublado com chuva"
        NUBLADO_CHUVA_RAIOS = "ceuNubladoChuvaRaios", "Nublado com chuva e raios"
        ENCOBERTO = "ceuEncoberto", "Encoberto"
        ENCOBERTO_CHUVA = "ceuEncobertoChuva", "Encoberto com chuva"
        ENCOBERTO_CHUVA_RAIO = "ceuEncobertoChuvaRaio", "Encoberto com chuva e raio"

    data = models.DateField(db_index=True)
    regiao = models.CharField(max_length=30, choices=[(r, r) for r in REGIOES])
    temperatura_maxima = models.SmallIntegerField()
    temperatura_minima = models.SmallIntegerField()
    umidade_maxima = models.PositiveSmallIntegerField()
    umidade_minima = models.PositiveSmallIntegerField()
    vento_velocidade = models.CharField(max_length=20, choices=Vento.choices, default=Vento.FRACO)
    vento_direcao = models.CharField(max_length=20, blank=True)
    nascer_sol = models.CharField(max_length=5, blank=True)
    por_sol = models.CharField(max_length=5, blank=True)
    comentario = models.CharField(max_length=200, blank=True)
    icone = models.CharField(max_length=40, choices=Icone.choices, blank=True)
    origem = models.CharField(max_length=10, default="painel", help_text="'painel' ou 'legado' (importado).")
    legado_id = models.PositiveIntegerField(null=True, blank=True, unique=True)
    criado_por = models.CharField(max_length=150, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_por = models.CharField(max_length=150, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["data", "regiao"], name="unique_previsao_data_regiao")]
        ordering = ["-data", "regiao"]

    def __str__(self):
        return f"{self.data} · {self.regiao}"


class PrevisaoDia(models.Model):
    """Texto geral do estado para a previsão de um dia (um por data).

    Fecha o dia depois das 11 REDECs: resume céu, chuva e vento do estado e é o texto que abre a mensagem do Telegram, o
    mapa da previsão e as artes (story/post). O painel propõe um texto a partir das previsões lançadas; o operador edita."""

    data = models.DateField(unique=True)
    texto_geral = models.TextField(blank=True, max_length=600)
    criado_por = models.CharField(max_length=150, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_por = models.CharField(max_length=150, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-data"]
        verbose_name = "texto geral da previsão do dia"
        verbose_name_plural = "textos gerais da previsão"

    def __str__(self):
        return f"{self.data} · {self.texto_geral[:40]}"


class CotaHidrologica(models.Model):
    """Cotas de referência (cm) de uma estação hidrológica. Editável pelo Django
    Admin. Classificação do nível atual:
      < atenção  -> normal (verde)      >= atenção   -> atenção (laranja)
      >= alerta  -> alerta (vermelho)   >= inundação -> transbordo (roxo)
      >= extrema -> extrema (rosa), onde extrema = `extrema_cm` se preenchida,
      senão 20% acima da cota de inundação (transbordo)."""

    station = models.OneToOneField(Station, on_delete=models.CASCADE, related_name="cota")
    atencao_cm = models.FloatField(null=True, blank=True)
    alerta_cm = models.FloatField(null=True, blank=True)
    inundacao_cm = models.FloatField("Transbordo (inundação) cm", null=True, blank=True)
    extrema_cm = models.FloatField(
        null=True, blank=True, help_text="Vazio = 20% acima da cota de inundação (calculado)."
    )
    rio = models.CharField(max_length=120, blank=True)
    codigo_referencia = models.CharField(max_length=20, blank=True, help_text="CODIGO na planilha INEA/CPRM.")
    responsavel = models.CharField(max_length=40, blank=True)
    observacao = models.CharField(max_length=200, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "cota hidrológica"
        verbose_name_plural = "cotas hidrológicas"

    @property
    def extrema_calculada_cm(self):
        if self.extrema_cm is not None:
            return self.extrema_cm
        return self.inundacao_cm * 1.2 if self.inundacao_cm is not None else None

    def classificar(self, nivel_cm):
        """Devolve 'normal'|'atencao'|'alerta'|'transbordo'|'extrema'|'sem_cota'|None (sem leitura)."""
        if nivel_cm is None:
            return None
        if self.atencao_cm is None and self.alerta_cm is None and self.inundacao_cm is None:
            return "sem_cota"
        extrema = self.extrema_calculada_cm
        if extrema is not None and nivel_cm >= extrema:
            return "extrema"
        if self.inundacao_cm is not None and nivel_cm >= self.inundacao_cm:
            return "transbordo"
        if self.alerta_cm is not None and nivel_cm >= self.alerta_cm:
            return "alerta"
        if self.atencao_cm is not None and nivel_cm >= self.atencao_cm:
            return "atencao"
        return "normal"

    def __str__(self):
        return f"Cotas · {self.station.name}"


class SireneAcaoTipo(models.Model):
    """Nome de cada código de acionamento (`fk_idStatusAcaoEstacao`) do portal de
    sirenes. Editável no Admin: códigos novos aparecem aqui sozinhos (com nome
    provisório) na primeira vez que o sync os vê. Pelo código do próprio portal:
    4 (e 0) = normal / retorno à normalidade e 1 = estação mobilizada."""

    class Categoria(models.TextChoices):
        NORMAL = "normal", "Normal / retorno à normalidade"
        AVISO = "aviso", "Aviso de chuva"
        TESTE = "teste", "Teste de manutenção"
        MOBILIZACAO = "mobilizacao", "Mobilização"
        OUTRO = "outro", "Outro / a confirmar"

    codigo = models.IntegerField(unique=True)
    nome = models.CharField(max_length=80)
    categoria = models.CharField(max_length=15, choices=Categoria.choices, default=Categoria.OUTRO)
    observacao = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["codigo"]
        verbose_name = "tipo de acionamento de sirene"
        verbose_name_plural = "tipos de acionamento de sirene"

    def __str__(self):
        return f"{self.codigo} · {self.nome}"


class GatilhoPluviometrico(models.Model):
    """Gatilhos pluviométricos de acionamento de sirene, por município
    (2026-09-29, pedido do usuário — planilha repassada pela Defesa Civil).

    Cada gatilho é INDEPENDENTE dos demais (pode disparar só um, vários, ou
    nenhum, dependendo da situação dos acumulados) — confirmado pelo
    usuário. GI usa só a chuva de 1h; GII/GIII/GIV têm DUAS condições que
    precisam ser atingidas SIMULTANEAMENTE (1h + a janela mais longa da
    coluna). Threshold em branco = gatilho não definido pra esse município
    (mostra "--" na tabela, não "não atingido").

    Só fazemos a gestão de 13 municípios (os que a Defesa Civil nos
    repassou) — os demais ficam sem registro aqui mesmo, de propósito (ver
    [[sirenes-acionamento-e-niteroi]]).
    """

    municipio = models.CharField(max_length=120, unique=True)
    gatilho_i_1h_mm = models.FloatField("Gatilho I — chuva 1h (mm)", null=True, blank=True)
    gatilho_ii_1h_mm = models.FloatField("Gatilho II — chuva 1h (mm)", null=True, blank=True)
    gatilho_ii_24h_mm = models.FloatField("Gatilho II — chuva 24h (mm)", null=True, blank=True)
    gatilho_iii_1h_mm = models.FloatField("Gatilho III — chuva 1h (mm)", null=True, blank=True)
    gatilho_iii_96h_mm = models.FloatField("Gatilho III — chuva 96h (mm)", null=True, blank=True)
    gatilho_iv_1h_mm = models.FloatField("Gatilho IV — chuva 1h (mm)", null=True, blank=True)
    gatilho_iv_30d_mm = models.FloatField("Gatilho IV — chuva 30 dias (mm)", null=True, blank=True)

    class Meta:
        ordering = ["municipio"]
        verbose_name = "gatilho pluviométrico (por município)"
        verbose_name_plural = "gatilhos pluviométricos (por município)"

    def save(self, *args, **kwargs):
        from core.municipios import canonico_ou_original

        self.municipio = canonico_ou_original(self.municipio)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.municipio


class AvisoMauTempo(models.Model):
    """Avisos de mau tempo do Serviço Meteorológico Marinho (SMM/CHM,
    Marinha do Brasil) para a METAREA V — ver
    ingestion/connectors/marinha_avisos.py e docs/fontes-de-dados.md
    (seção "Avisos de mau tempo").

    Só ingerimos as áreas CHARLIE e DELTA, que juntas cobrem o litoral do
    RJ (confirmado pelo diretor do CEMADEN-RJ, usuário deste projeto).
    Cada boletim tem um número sequencial próprio da fonte (`numero_externo`,
    único em toda a METAREA V, não só dentro de uma área) — usado como chave
    de upsert. Diferente de `RiskAlert` (que guarda só o estado atual por
    escopo), aqui mantemos o histórico: vários avisos podem estar
    simultaneamente válidos pra uma mesma área, e um aviso expirado
    continua sendo um registro histórico útil (não é sobrescrito por um
    novo, tem seu próprio número)."""

    class Area(models.TextChoices):
        CHARLIE = "CHARLIE", "Área Charlie"
        DELTA = "DELTA", "Área Delta"

    numero_externo = models.CharField(
        max_length=20, unique=True, help_text="Ex: '716/2026' — número do boletim na fonte."
    )
    area = models.CharField(max_length=10, choices=Area.choices)
    tipo = models.CharField(
        max_length=80, help_text="Texto do tipo de aviso como vem da fonte (ex: 'VENTO FORTE', 'MAR GROSSO')."
    )
    descricao = models.TextField(help_text="Texto completo do aviso (área geográfica, intensidade, etc).")
    emitido_em = models.DateTimeField(null=True, blank=True)
    valido_ate = models.DateTimeField(null=True, blank=True)
    fonte = models.CharField(max_length=120, blank=True, default="Marinha do Brasil - SMM/CHM")
    raw_payload = models.JSONField(default=dict, blank=True)
    # 18/10/2026: polígono do aviso (o mesmo do mapa da página da Marinha, convertido para lon/lat) e filtro geográfico.
    categoria = models.CharField(max_length=20, blank=True, help_text="vento | onda | ressaca (da página da Marinha).")
    geojson = models.JSONField(null=True, blank=True, help_text="Geometria Polygon (lon, lat) da área do aviso.")
    afeta_rj = models.BooleanField(default=True, help_text="Área do aviso toca o litoral do RJ (até 100 km da costa).")
    sem_poligono = models.BooleanField(default=False)
    ingested_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-emitido_em", "area"]
        verbose_name = "aviso de mau tempo (Marinha)"
        verbose_name_plural = "avisos de mau tempo (Marinha)"

    def __str__(self):
        return f"{self.area} · {self.tipo} · NR {self.numero_externo}"


class AcumuladoOficial(models.Model):
    """Acumulado de chuva informado PRONTO pela própria fonte (03/10/2026).

    Existe pra comparar com o nosso acumulado, calculado somando os baldes que
    gravamos em `Reading` — que perde chuva quando uma rodada de ingestão
    falha ou a fonte publica mais rápido que o cron (ver
    docs/fontes-de-dados.md, "Auditoria de acumulados de chuva"). Hoje só o
    CEMADEN Nacional (`getJson2.php`) alimenta isto; guarda 1 h, 24 h e 96 h,
    uma vez por hora por estação (a 1ª leitura de cada hora), pra não inflar o
    banco. O retrato completo (1…96 h) da última leitura fica em
    `Station.raw_metadata["acumulados_oficiais"]`."""

    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name="acumulados_oficiais")
    janela_h = models.PositiveSmallIntegerField(help_text="Janela do acumulado em horas (1, 24 ou 96).")
    valor_mm = models.FloatField()
    referencia = models.DateTimeField(help_text="Horário (UTC) da última leitura da estação a que o acumulado se refere.")
    coletado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["station", "janela_h", "referencia"], name="unique_acumulado_oficial")
        ]
        indexes = [models.Index(fields=["station", "janela_h", "-referencia"])]
        ordering = ["-referencia"]
        verbose_name = "acumulado oficial da fonte"
        verbose_name_plural = "acumulados oficiais da fonte"

    def __str__(self):
        return f"{self.station.name} · {self.janela_h}h = {self.valor_mm} @ {self.referencia:%Y-%m-%d %H:%M}"


class LeituraQualidade(models.Model):
    """Qualificação de uma leitura (03/10/2026, inspirada na coluna
    "Qualificação: válido" da Rede Salvar do CEMADEN). Só se grava a exceção:
    leitura SEM registro aqui foi avaliada e considerada válida (a regra só
    existe a partir de 03/10/2026 e hoje só roda no CEMADEN Nacional; leituras
    antigas ou de outras fontes não foram avaliadas). Regras em
    `core/qualidade.py` — controle de qualidade PRÓPRIO (faixa física e data),
    não o da Rede Salvar."""

    class Qualidade(models.TextChoices):
        SUSPEITO = "suspeito", "Suspeito"
        INVALIDO = "invalido", "Inválido"

    reading = models.OneToOneField(Reading, on_delete=models.CASCADE, related_name="qualidade")
    qualidade = models.CharField(max_length=10, choices=Qualidade.choices)
    motivo = models.CharField(max_length=120)
    avaliado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "qualificação de leitura"
        verbose_name_plural = "qualificações de leitura"

    def __str__(self):
        return f"{self.get_qualidade_display()} — {self.motivo}"


class FloodHubGauge(models.Model):
    """Posto do Google Flood Hub (Flood Forecasting API) na região do RJ (16/10/2026).

    Dois tipos de posto: `ANA_*` (estações reais da ANA, sem modelo: só situação, sem previsão) e
    `hybas_*` (pontos virtuais da rede de rios, com modelo próprio do Google: previsão de VAZÃO em
    m³/s com limiares de atenção/perigo/extremo; a maioria ainda não é "quality verified")."""

    gauge_id = models.CharField(max_length=64, unique=True)
    source = models.CharField(max_length=20, blank=True)
    site_name = models.CharField(max_length=200, blank=True)
    river = models.CharField(max_length=200, blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    municipio = models.CharField(max_length=120, blank=True)
    has_model = models.BooleanField(default=False)
    quality_verified = models.BooleanField(default=False)
    unit = models.CharField(max_length=30, blank=True, help_text="CUBIC_METERS_PER_SECOND ou METERS.")
    warning = models.FloatField(null=True, blank=True)
    danger = models.FloatField(null=True, blank=True)
    extreme = models.FloatField(null=True, blank=True)
    estacao = models.ForeignKey(
        Station, null=True, blank=True, on_delete=models.SET_NULL, related_name="floodhub_gauges",
        help_text="Estação hidrológica nossa mais próxima (até 3 km), se houver.",
    )
    distancia_estacao_km = models.FloatField(null=True, blank=True)
    # situação mais recente (floodStatus)
    severity = models.CharField(max_length=20, blank=True)
    trend = models.CharField(max_length=20, blank=True)
    status_emitido_em = models.DateTimeField(null=True, blank=True)
    previsao_inicio = models.DateTimeField(null=True, blank=True)
    previsao_fim = models.DateTimeField(null=True, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    metadados_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["municipio", "site_name", "gauge_id"]
        verbose_name = "posto Flood Hub"
        verbose_name_plural = "postos Flood Hub"

    def __str__(self):
        return f"{self.gauge_id} · {self.site_name or self.river or self.municipio}"


class FloodHubForecast(models.Model):
    """Previsão emitida para um posto (guardada para consulta e para a validação previsão × observado)."""

    gauge = models.ForeignKey(FloodHubGauge, on_delete=models.CASCADE, related_name="previsoes")
    emitida_em = models.DateTimeField()
    faixas = models.JSONField(default=list, help_text="[{inicio, fim, valor}] — valor na unidade do posto.")
    coletada_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["gauge", "emitida_em"], name="unique_floodhub_forecast")]
        indexes = [models.Index(fields=["gauge", "-emitida_em"])]
        ordering = ["-emitida_em"]

    def __str__(self):
        return f"{self.gauge.gauge_id} @ {self.emitida_em:%Y-%m-%d %H:%M}"


class FloodHubSituacao(models.Model):
    """Histórico diário da situação (severidade) de cada posto — a última de cada dia local —
    para comparar com o observado (aba de validação)."""

    gauge = models.ForeignKey(FloodHubGauge, on_delete=models.CASCADE, related_name="situacoes")
    dia = models.DateField()
    severity = models.CharField(max_length=20)
    trend = models.CharField(max_length=20, blank=True)
    emitido_em = models.DateTimeField()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["gauge", "dia"], name="unique_floodhub_situacao_dia")]
        ordering = ["-dia"]


class FloodHubEvento(models.Model):
    """Evento do Google Flood Hub: "inundação significativa" (vários postos, vários dias) ou "chuva repentina"
    (flash flood, probabilidade em 24 h). Guardamos os eventos do Brasil com a marca `afeta_rj`; só os que tocam o RJ
    levam o contorno (`geojson`). `ativo` = veio na última consulta."""

    class Tipo(models.TextChoices):
        SIGNIFICATIVO = "significativo", "Inundação significativa"
        FLASH = "flash", "Chuva repentina (flash flood)"

    tipo = models.CharField(max_length=15, choices=Tipo.choices)
    chave = models.CharField(max_length=200, help_text="ID do polígono do evento (estável enquanto o evento não muda).")
    nivel = models.CharField(max_length=20, blank=True, help_text="flash: provavel | muito_provavel; significativo: vazio.")
    inicio = models.DateTimeField(null=True, blank=True)
    fim = models.DateTimeField(null=True, blank=True)
    emitido_em = models.DateTimeField(null=True, blank=True)
    periodo_horas = models.PositiveSmallIntegerField(null=True, blank=True)
    area_km2 = models.FloatField(null=True, blank=True)
    populacao = models.BigIntegerField(null=True, blank=True)
    gauge_ids = models.JSONField(default=list, blank=True)
    afeta_rj = models.BooleanField(default=False)
    geojson = models.JSONField(null=True, blank=True)
    ativo = models.BooleanField(default=True)
    visto_em = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tipo", "chave"], name="unique_floodhub_evento")]
        ordering = ["-emitido_em", "-inicio"]
        verbose_name = "evento Flood Hub"
        verbose_name_plural = "eventos Flood Hub"

    def __str__(self):
        return f"{self.get_tipo_display()} · {self.chave[:12]}…"


class RecomendacaoAlarme(models.Model):
    """Recomendação de alarme/acionamento de sirene emitida pelo CEMADEN-RJ (risco geológico).

    Substitui a planilha de controle "Recomendação Cemaden" (campos NÚMERO, MUNICÍPIO, DATA, HORA, PROBABILIDADE,
    ESTAÇÃO, ÍNDICE, GATILHO, ACIONARAM?, SIRENES, RESPONSÁVEL, OBSERVAÇÃO) e acrescenta as colunas de chuva e o estágio
    operacional que a planilha já trazia. Pedido do usuário, 22/10/2026.
    """

    class Probabilidade(models.TextChoices):
        BAIXA = "Baixa", "Baixa"
        MODERADA = "Moderada", "Moderada"
        ALTA = "Alta", "Alta"
        MUITO_ALTA = "Muito Alta", "Muito Alta"

    class Gatilho(models.TextChoices):
        I = "I", "I"  # noqa: E741
        II = "II", "II"
        III = "III", "III"
        IV = "IV", "IV"

    class Estagio(models.TextChoices):
        ATENCAO = "ATENÇÃO", "Atenção"
        ALERTA = "ALERTA", "Alerta"
        ALERTA_MAXIMO = "ALERTA MÁXIMO", "Alerta máximo"

    numero = models.CharField(max_length=12, unique=True, help_text="NN_AAAA (sequencial do ano da recomendação).")
    municipio = models.CharField(max_length=120, db_index=True)
    data = models.DateField(db_index=True)
    hora = models.TimeField()
    probabilidade = models.CharField(max_length=12, choices=Probabilidade.choices)
    estacao = models.CharField("estação pluviométrica", max_length=250, blank=True)
    indice_alcancado = models.CharField("índice alcançado (texto livre)", max_length=200, blank=True)
    chuva_1h_mm = models.FloatField(null=True, blank=True)
    chuva_24h_mm = models.FloatField(null=True, blank=True)
    chuva_96h_mm = models.FloatField(null=True, blank=True)
    chuva_30d_mm = models.FloatField(null=True, blank=True)
    gatilho = models.CharField(max_length=15, blank=True, help_text="Gatilho(s) atingido(s): I, II, III e/ou IV; vários separados por vírgula (ex.: \"I,IV\").")
    estagio_operacional = models.CharField(max_length=15, choices=Estagio.choices, blank=True)
    # A recomendação é enviada primeiro; a validação (acionaram? quantas e quais sirenes?) vem depois — enquanto isso,
    # `acionaram` fica nulo ("aguardando validação").
    acionaram = models.BooleanField(null=True, blank=True, default=None, help_text="O município acionou a(s) sirene(s) após a recomendação? Nulo = aguardando validação.")
    sirenes_qtd = models.PositiveSmallIntegerField("quantidade de sirenes acionadas", null=True, blank=True)
    sirenes_acionadas = models.TextField(blank=True, help_text="Nomes das sirenes acionadas (texto livre).")
    validado_por = models.CharField(max_length=150, blank=True)
    validado_em = models.DateTimeField(null=True, blank=True)
    responsavel = models.CharField(max_length=150, blank=True)
    observacao = models.TextField(blank=True)
    origem = models.CharField(max_length=12, default="painel", help_text="'painel' ou 'planilha' (importada).")
    criado_por = models.CharField(max_length=150, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_por = models.CharField(max_length=150, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-data", "-hora", "-id"]
        verbose_name = "recomendação de alarme"
        verbose_name_plural = "recomendações de alarme"

    def save(self, *args, **kwargs):
        from core.municipios import canonico_ou_original

        self.municipio = canonico_ou_original(self.municipio)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.numero} · {self.municipio}"


class AcionamentoMunicipio(models.Model):
    """Mobilização de sirene feita pelo PRÓPRIO município, sem recomendação do CEMADEN-RJ (aba "Acionamento pelo Município"
    da planilha de controle). Qualquer um dos 92 municípios (inclui os autônomos, como Angra)."""

    municipio = models.CharField(max_length=120, db_index=True)
    data = models.DateField(db_index=True)
    hora = models.TimeField(null=True, blank=True)
    probabilidade = models.CharField(max_length=12, blank=True, help_text="Probabilidade de deslizamento na hora (texto da planilha, normalizado).")
    sirene = models.TextField(blank=True, help_text="Nome(s) da(s) sirene(s) mobilizada(s).")
    tipo_alarme = models.CharField(max_length=30, default="MOBILIZAÇÃO")
    quantidade = models.PositiveSmallIntegerField(null=True, blank=True)
    responsavel = models.CharField("responsável/usuário do município", max_length=150, blank=True)
    observacao = models.TextField(blank=True)
    origem = models.CharField(max_length=12, default="painel")
    criado_por = models.CharField(max_length=150, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_por = models.CharField(max_length=150, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-data", "-hora", "-id"]
        verbose_name = "acionamento pelo município"
        verbose_name_plural = "acionamentos pelo município"

    def save(self, *args, **kwargs):
        from core.municipios import canonico_ou_original

        self.municipio = canonico_ou_original(self.municipio)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.municipio} · {self.data}"


class MunicipioComSirene(models.Model):
    """Municípios que aparecem na aba "Acionamentos do município" (os que têm sirenes). Editável no Admin do Django:
    marque/desmarque `ativo` ou inclua outro município quando passar a ter sirenes. Inicia com 17: os 13 que o CEMADEN-RJ
    gerencia + Rio de Janeiro, Niterói, Angra dos Reis e Mangaratiba (decisão do usuário, 22/10/2026)."""

    municipio = models.CharField(max_length=120, unique=True)
    ativo = models.BooleanField(default=True, help_text="Desmarque para tirar da lista sem apagar o histórico.")
    observacao = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["municipio"]
        verbose_name = "município com sirenes (acionamento pelo município)"
        verbose_name_plural = "municípios com sirenes (acionamento pelo município)"

    def save(self, *args, **kwargs):
        from core.municipios import canonico_ou_original

        self.municipio = canonico_ou_original(self.municipio)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.municipio


class NivelMonitoramento(models.Model):
    """Nível de Monitoramento (NM 0 a NM 5, PLANCON 2026/2027) VIGENTE de cada município — uma linha por município.

    Município sem linha = NM 0 (Vigilância). O NM é lançado por um plantonista (inserção humana); o histórico completo fica em
    `NivelMonitoramentoRegistro`. Regras de validação em core/niveis_monitoramento.py."""

    municipio = models.CharField(max_length=120, unique=True)
    nivel = models.PositiveSmallIntegerField(default=0)
    vigencia_ate = models.DateTimeField(null=True, blank=True, help_text="Fim da vigência (máx. 24 h para NM 2+); vencida = revisar.")
    registro = models.ForeignKey("NivelMonitoramentoRegistro", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    origem = models.CharField(max_length=10, default="humano", help_text="humano (lançado por um plantonista) ou automatico (gerado pelo sistema a partir dos mapas de risco).")
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["municipio"]
        verbose_name = "nível de monitoramento vigente"
        verbose_name_plural = "níveis de monitoramento vigentes"

    def __str__(self):
        return f"{self.municipio} · NM {self.nivel}"


class NivelMonitoramentoRegistro(models.Model):
    """Histórico (só acrescenta) dos lançamentos de Nível de Monitoramento: quem, quando, por quê, aprovação e avisos prévios."""

    municipio = models.CharField(max_length=120, db_index=True)
    nivel = models.PositiveSmallIntegerField()
    nivel_anterior = models.PositiveSmallIntegerField(default=0)
    equipe = models.CharField(max_length=3, blank=True, help_text="met, hid ou geo.")
    antecedencia = models.CharField(max_length=10, blank=True, help_text="mais_2h, ate_2h ou em_curso.")
    area_delimitada = models.BooleanField(default=False)
    populacao_exposta = models.BooleanField(default=False)
    motivo = models.TextField(blank=True)
    ferramentas = models.CharField(max_length=200, blank=True, help_text="Ferramentas da Idap usadas, separadas por vírgula.")
    vigencia_ate = models.DateTimeField(null=True, blank=True)
    aprovado_por = models.CharField(max_length=150, blank=True)
    comdec_avisada_em = models.DateTimeField(null=True, blank=True)
    redec_avisada_em = models.DateTimeField(null=True, blank=True)
    aviso_simultaneo = models.BooleanField(default=False)
    aviso_motivo = models.CharField(max_length=300, blank=True)
    encerramento = models.BooleanField(default=False, help_text="Retorno à normalidade (cancelamento/encerramento do alerta, não alerta novo).")
    lote = models.CharField(max_length=36, blank=True, db_index=True, help_text="Identificador do lançamento em lote (vários municípios de uma vez).")
    origem = models.CharField(max_length=10, default="humano", help_text="humano ou automatico (sistema).")
    sinais = models.JSONField(default=list, blank=True, help_text="Sinais que sustentaram o nível (só nos registros automáticos).")
    registrado_por = models.CharField(max_length=150, blank=True)
    registrado_em = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-registrado_em", "-id"]
        verbose_name = "registro de nível de monitoramento"
        verbose_name_plural = "registros de nível de monitoramento"

    def __str__(self):
        return f"{self.municipio} · NM {self.nivel_anterior}→{self.nivel} · {self.registrado_em:%d/%m %H:%M}"


class ConfiguracaoNm(models.Model):
    """Configuração e estado da automação do Nível de Monitoramento (uma linha só, pk=1; editável no Admin).

    O sistema gera sozinho, a partir dos mapas de risco (hidrológico, geológico e severidade meteorológica), os níveis que não dependem de validação
    humana, até `nivel_maximo_auto` (padrão NM 2). Acima disso só sugere (aba Produção → Pendências). NM 4 e NM 5 são sempre decisão humana."""

    ativo = models.BooleanField(default=True, help_text="Desligue para o sistema parar de gerar níveis sozinho.")
    nivel_maximo_auto = models.PositiveSmallIntegerField(default=2, help_text="Maior NM que o sistema pode gerar sem validação (0 a 3; NM 4 e 5 nunca).")
    ultima_execucao = models.DateTimeField(null=True, blank=True)
    ultimo_resumo = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "automação do nível de monitoramento"
        verbose_name_plural = "automação do nível de monitoramento"

    @classmethod
    def obter(cls) -> "ConfiguracaoNm":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        self.nivel_maximo_auto = max(0, min(int(self.nivel_maximo_auto), 3))
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Automação do NM · {'ativa' if self.ativo else 'desligada'} · até NM {self.nivel_maximo_auto}"


# ---------------------------------------------------------------- Informativo meteorológico (29/10/2026)
class InformativoMeteorologico(models.Model):
    """Informativo meteorológico do CEMADEN-RJ (nº/AAAA): cenário atual e previsão das próximas 6 h por REDEC, no modelo de texto do grupo de operadores.

    O texto é gerado a partir da matriz por REDEC (`InformativoRegiao`) e pode ser ajustado à mão; guarda-se o texto final E a matriz. A numeração reinicia
    a cada ano e o número é reservado ao criar o rascunho. Fluxo: rascunho → revisado → enviado (ou cancelado, nunca apagado). Documentação: docs/informativo-meteorologico.md."""

    class Estado(models.TextChoices):
        RASCUNHO = "rascunho", "Rascunho"
        REVISADO = "revisado", "Revisado"
        ENVIADO = "enviado", "Enviado"
        CANCELADO = "cancelado", "Cancelado"

    numero = models.PositiveIntegerField()
    ano = models.PositiveIntegerField(db_index=True)
    estado = models.CharField(max_length=10, choices=Estado.choices, default=Estado.RASCUNHO, db_index=True)
    emitido_em = models.DateTimeField(null=True, blank=True, db_index=True, help_text="Data e hora que vão no texto (padrão: agora ao criar).")
    texto = models.TextField(blank=True, help_text="Texto final (gerado e/ou ajustado à mão).")
    texto_gerado = models.TextField(blank=True, help_text="Último texto gerado pela matriz (para saber se houve ajuste manual).")
    texto_livre = models.BooleanField(default=False, help_text="Modo texto livre: casos fora do padrão; a matriz não gera o texto.")
    aproximacao_regioes = models.JSONField(default=list, blank=True, help_text="REDECs de que núcleos de chuva se aproximam.")
    aproximacao_por = models.CharField(max_length=40, blank=True, help_text="De onde vêm (ex.: Minas Gerais).")
    aproximacao_intensidade = models.CharField(max_length=40, blank=True)
    radar_fonte = models.CharField(max_length=120, blank=True, help_text="Ex.: Radar Tool INEA (Pico do Couto).")
    radar_quadro_em = models.DateTimeField(null=True, blank=True, help_text="Hora do quadro de radar anexado.")
    publico = models.BooleanField(default=True, help_text="Mostrar na página pública enquanto vigente (6 h).")
    observacao = models.CharField(max_length=300, blank=True)
    motivo_cancelamento = models.CharField(max_length=300, blank=True)
    criado_por = models.CharField(max_length=150, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    revisado_por = models.CharField(max_length=150, blank=True)
    revisado_em = models.DateTimeField(null=True, blank=True)
    enviado_por = models.CharField(max_length=150, blank=True)
    enviado_em = models.DateTimeField(null=True, blank=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    historico = models.JSONField(default=list, blank=True, help_text="Quem fez o quê e quando (criou, editou, revisou, enviou, cancelou).")
    importado = models.BooleanField(default=False, help_text="Veio da planilha de controle (2020-2026).")

    class Meta:
        ordering = ["-ano", "-numero"]
        constraints = [models.UniqueConstraint(fields=["ano", "numero"], name="unique_informativo_numero_por_ano")]
        verbose_name = "informativo meteorológico"
        verbose_name_plural = "informativos meteorológicos"

    def __str__(self):
        return f"Informativo nº {self.numero}/{self.ano} · {self.get_estado_display()}"


class InformativoRegiao(models.Model):
    """Uma linha por REDEC do informativo: chuva atual, chuva prevista nas 6 h e complementos; SMS enviado (SIM/NÃO) para o controle."""

    informativo = models.ForeignKey(InformativoMeteorologico, on_delete=models.CASCADE, related_name="regioes")
    regiao = models.CharField(max_length=30)
    chuva_atual = models.CharField(max_length=40, blank=True)
    raios_atual = models.BooleanField(default=False)
    chuva_prevista = models.CharField(max_length=40, blank=True)
    vento_previsto = models.CharField(max_length=40, blank=True, help_text="Rajadas: moderado | moderado_ocasion_forte | forte.")
    raios = models.BooleanField(default=False)
    granizo = models.BooleanField(default=False)
    isolada = models.BooleanField(default=False)
    sms_enviado = models.BooleanField(default=False)
    sms_enviado_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["informativo", "regiao"], name="unique_informativo_regiao")]
        ordering = ["informativo", "regiao"]
        verbose_name = "região do informativo"
        verbose_name_plural = "regiões do informativo"

    def __str__(self):
        return f"{self.informativo} · {self.regiao}"


class InformativoEnvio(models.Model):
    """Envio registrado de um informativo já enviado: reenvios do radar (vários por informativo, cada um com o radar escolhido e a hora do quadro) e
    canais da Idap (SMS, Google Alertas, TV por assinatura, DCA) com a validação por outra pessoa. O painel NÃO envia: registra o que a equipe fez."""

    class Tipo(models.TextChoices):
        RADAR = "radar", "Radar"
        IDAP = "idap", "Idap"

    informativo = models.ForeignKey(InformativoMeteorologico, on_delete=models.CASCADE, related_name="envios")
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    canal = models.CharField(max_length=40, help_text="Radar | SMS | Google Alertas | TV por assinatura | DCA.")
    detalhe = models.CharField(max_length=160, blank=True, help_text="Radar e produto usados (ex.: Radar Tool INEA (Guaratiba)).")
    quadro_em = models.DateTimeField(null=True, blank=True, help_text="Hora do quadro de radar enviado.")
    regioes = models.JSONField(default=list, blank=True)
    protocolo = models.CharField(max_length=80, blank=True, help_text="Número/identificação do disparo na Idap.")
    autorizado_por = models.CharField(max_length=120, blank=True, help_text="Quem autorizou (ok do diretor) — Idap.")
    observacao = models.CharField(max_length=300, blank=True)
    enviado_em = models.DateTimeField(default=timezone.now)
    enviado_por = models.CharField(max_length=150, blank=True)
    validado_em = models.DateTimeField(null=True, blank=True)
    validado_por = models.CharField(max_length=150, blank=True)

    class Meta:
        ordering = ["-enviado_em", "-id"]
        verbose_name = "envio do informativo"
        verbose_name_plural = "envios do informativo"

    def __str__(self):
        return f"{self.informativo} · {self.canal}"


class ConfiguracaoInformativo(models.Model):
    """Textos e regras configuráveis do informativo (uma linha só, pk=1; Admin): rodapé do texto e cadência do radar."""

    rodape = models.TextField(
        default=(
            "Em caso de mudança de cenário, a Defesa Civil Estadual atualizará as informações e emitirá os alertas necessários pelas equipes de monitoramento do CEMADEN-RJ." "\n"
            "Fiquem atentos aos informativos e alertas emitidos por nossas fontes oficiais." "\n"
            "Sigam o perfil @defesacivil_rj para informações atualizadas."
        ),
        blank=True,
    )
    radar_fonte = models.CharField(max_length=120, default="Radar Tool INEA (Pico do Couto)")
    validade_horas = models.PositiveSmallIntegerField(default=6, help_text="Validade do informativo (renovar a cada 6 h se a chuva continua).")
    cadencia_radar_min = models.JSONField(
        default=dict, blank=True,
        help_text='Minutos entre reenvios do radar: {"intenso": 30, "moderada": 60, "noite": 120, "noite_fraca": 180}. Vazio = padrão do protocolo.',
    )

    class Meta:
        verbose_name = "configuração do informativo"
        verbose_name_plural = "configuração do informativo"

    @classmethod
    def obter(cls) -> "ConfiguracaoInformativo":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return "Configuração do informativo"

