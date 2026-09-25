from django.db import models


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
