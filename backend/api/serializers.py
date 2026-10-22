import re

from rest_framework import serializers

from core.municipios import canonico_ou_original
from core.sol import sol_para
from django.utils import timezone

from core.models import (
    AcionamentoMunicipio,
    AlertEvent,
    AvisoMauTempo,
    GatilhoPluviometrico,
    MunicipioComSirene,
    Previsao,
    Reading,
    RecomendacaoAlarme,
    RiskAlert,
    Source,
    Station,
)


class SourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = ["id", "slug", "name", "website", "enabled", "last_ingested_at", "last_ingest_error"]


class LatestReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reading
        fields = ["reading_type", "value", "timestamp"]


class StationListSerializer(serializers.ModelSerializer):
    source = serializers.SlugRelatedField(slug_field="slug", read_only=True)
    latest_readings = serializers.SerializerMethodField()
    extremos_24h = serializers.SerializerMethodField()

    class Meta:
        model = Station
        fields = [
            "id",
            "source",
            "external_id",
            "name",
            "municipality",
            "station_type",
            "status",
            "latitude",
            "longitude",
            "altitude_m",
            "latest_readings",
            "extremos_24h",
        ]

    def get_extremos_24h(self, obj: Station):
        return self.context.get("extremos_24h", {}).get(obj.id)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["municipality"] = canonico_ou_original(data.get("municipality") or "")
        return data

    def get_latest_readings(self, obj: Station):
        # Calculado em lote pela view (StationViewSet.ultimas_leituras) e
        # passado via contexto — nada de query por estação aqui.
        leituras = self.context.get("latest_by_station", {}).get(obj.id, [])
        return LatestReadingSerializer(leituras, many=True).data


class ReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reading
        fields = ["id", "reading_type", "value", "timestamp"]


class RiskAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = RiskAlert
        fields = [
            "id",
            "tipo",
            "redec",
            "municipio",
            "risco",
            "numero_externo",
            "responsavel",
            "criado_em",
            "atualizado_em",
            "fonte",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["municipio"] = canonico_ou_original(data.get("municipio") or "")
        return data


class AvisoMauTempoSerializer(serializers.ModelSerializer):
    class Meta:
        model = AvisoMauTempo
        fields = [
            "id",
            "numero_externo",
            "area",
            "tipo",
            "descricao",
            "emitido_em",
            "valido_ate",
            "fonte",
            "categoria",
            "geojson",
            "cor",
        ]

    cor = serializers.SerializerMethodField()

    def get_cor(self, obj):
        return (obj.raw_payload or {}).get("cor")


class AlertEventSerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source="station.name", read_only=True)
    rule_name = serializers.CharField(source="rule.name", read_only=True)
    severity = serializers.CharField(source="rule.severity", read_only=True)

    class Meta:
        model = AlertEvent
        fields = ["id", "rule_name", "severity", "station", "station_name", "value", "triggered_at", "resolved_at"]


class PrevisaoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Previsao
        fields = [
            "id", "data", "regiao", "temperatura_maxima", "temperatura_minima",
            "umidade_maxima", "umidade_minima", "vento_velocidade", "vento_direcao",
            "nascer_sol", "por_sol", "comentario", "icone", "origem",
            "criado_por", "criado_em", "atualizado_por", "atualizado_em",
        ]
        read_only_fields = ["origem", "criado_por", "criado_em", "atualizado_por", "atualizado_em"]
        # A unicidade (data, regiao) é tratada como "sobrescreve" no create.
        validators = []

    def validate(self, attrs):
        def get(k):
            return attrs.get(k, getattr(self.instance, k, None))

        if get("temperatura_minima") > get("temperatura_maxima"):
            raise serializers.ValidationError("Temperatura mínima não pode ser maior que a máxima.")
        if get("umidade_minima") > get("umidade_maxima"):
            raise serializers.ValidationError("Umidade mínima não pode ser maior que a máxima.")
        for k in ("umidade_maxima", "umidade_minima"):
            if not 0 <= get(k) <= 100:
                raise serializers.ValidationError("Umidade deve estar entre 0 e 100.")
        for k in ("nascer_sol", "por_sol"):
            v = get(k)
            if v and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
                raise serializers.ValidationError("Horário do sol deve estar no formato HH:MM.")
        return attrs

    def create(self, validated_data):
        quem = self.context["request"].user
        nome = quem.first_name or quem.username
        data, regiao = validated_data.pop("data"), validated_data.pop("regiao")
        # Nascer/pôr do sol: se o operador não informou, entra automaticamente da
        # tabela de referência por REDEC (2026-2035); o valor gravado segue editável.
        if not validated_data.get("nascer_sol") or not validated_data.get("por_sol"):
            sol = sol_para(regiao, data)
            if sol:
                validated_data["nascer_sol"] = validated_data.get("nascer_sol") or sol[0]
                validated_data["por_sol"] = validated_data.get("por_sol") or sol[1]
        obj, criado = Previsao.objects.get_or_create(
            data=data, regiao=regiao,
            defaults={**validated_data, "criado_por": nome, "atualizado_por": nome},
        )
        if not criado:
            for k, v in validated_data.items():
                setattr(obj, k, v)
            obj.atualizado_por = nome
            obj.save()
        return obj

    def update(self, instance, validated_data):
        quem = self.context["request"].user
        validated_data["atualizado_por"] = quem.first_name or quem.username
        return super().update(instance, validated_data)


class RecomendacaoAlarmeSerializer(serializers.ModelSerializer):
    """Recomendação de alarme (risco geológico). Fluxo em duas etapas: 1) envio (município, data/hora, estação, chuva, gatilho)
    e 2) validação posterior (acionaram? quantas e quais sirenes?). Sem `acionaram` a recomendação fica "aguardando validação".
    O número (NN_AAAA) é gerado quando não informado."""

    validada = serializers.SerializerMethodField()

    class Meta:
        model = RecomendacaoAlarme
        fields = [
            "id", "numero", "municipio", "data", "hora", "probabilidade", "estacao", "indice_alcancado",
            "chuva_1h_mm", "chuva_24h_mm", "chuva_96h_mm", "chuva_30d_mm", "gatilho", "estagio_operacional",
            "acionaram", "sirenes_qtd", "sirenes_acionadas", "responsavel", "observacao", "origem", "validada",
            "validado_por", "validado_em", "criado_por", "criado_em", "atualizado_por", "atualizado_em",
        ]
        read_only_fields = ["origem", "validada", "validado_por", "validado_em", "criado_por", "criado_em", "atualizado_por", "atualizado_em"]
        extra_kwargs = {"numero": {"required": False, "allow_blank": True}, "acionaram": {"required": False, "allow_null": True}}

    def get_validada(self, obj):
        return obj.acionaram is not None

    def validate_municipio(self, v):
        from core.municipios import canonico_ou_original, is_municipio_valido

        v = canonico_ou_original((v or "").strip())
        if not is_municipio_valido(v):
            raise serializers.ValidationError("Município inválido (use um dos 92 municípios do RJ).")
        # só recomendamos para os municípios cujas sirenes o CEMADEN-RJ gerencia (os que têm gatilhos cadastrados)
        gerenciados = set(GatilhoPluviometrico.objects.values_list("municipio", flat=True))
        if gerenciados and v not in gerenciados:
            raise serializers.ValidationError("O CEMADEN-RJ só emite recomendação para os municípios com gestão de sirenes: " + ", ".join(sorted(gerenciados)) + ".")
        return v

    def validate_numero(self, v):
        v = (v or "").strip()
        if v and not re.fullmatch(r"\d{2,3}_\d{4}", v):
            raise serializers.ValidationError("Número no formato NN_AAAA (ex.: 07_2026).")
        return v

    def validate_gatilho(self, v):
        """Um ou mais gatilhos (I, II, III, IV) — ex.: "IV,I" vira "I,IV" (ordem crescente, sem repetição)."""
        partes = [p.strip().upper() for p in re.split(r"[,;+/ ]+", v or "") if p.strip()]
        ordem = ["I", "II", "III", "IV"]
        invalidos = [p for p in partes if p not in ordem]
        if invalidos:
            raise serializers.ValidationError("Gatilho deve ser I, II, III e/ou IV.")
        return ",".join(g for g in ordem if g in partes)

    def validate(self, attrs):
        def get(k):
            return attrs.get(k, getattr(self.instance, k, None))

        for k in ("chuva_1h_mm", "chuva_24h_mm", "chuva_96h_mm", "chuva_30d_mm"):
            v = get(k)
            if v is not None and (v < 0 or v > 2000):
                raise serializers.ValidationError({k: "Valor de chuva fora do intervalo plausível (0 a 2000 mm)."})
        acionaram = get("acionaram")
        qtd = get("sirenes_qtd")
        nomes = (get("sirenes_acionadas") or "").strip() not in ("", "-", "—")
        if acionaram is None and (nomes or qtd):
            raise serializers.ValidationError({"acionaram": "Informe se o município acionou (Sim/Não) antes de lançar as sirenes."})
        if acionaram is False and (nomes or (qtd or 0) > 0):
            raise serializers.ValidationError({"sirenes_acionadas": "Há sirenes informadas, mas 'Acionaram?' está como Não."})
        numero = attrs.get("numero")
        if numero:
            qs = RecomendacaoAlarme.objects.filter(numero=numero)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"numero": "Já existe uma recomendação com esse número."})
        return attrs

    def _nome(self):
        quem = self.context["request"].user
        return quem.first_name or quem.username

    def create(self, validated_data):
        nome = self._nome()
        validated_data["criado_por"] = validated_data["atualizado_por"] = nome
        if not (validated_data.get("responsavel") or "").strip():
            validated_data["responsavel"] = nome
        if not validated_data.get("numero"):
            validated_data["numero"] = proximo_numero_recomendacao(validated_data["data"].year)
        if validated_data.get("acionaram") is not None:
            validated_data["validado_por"] = nome
            validated_data["validado_em"] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        nome = self._nome()
        validated_data["atualizado_por"] = nome
        if "numero" in validated_data and not validated_data["numero"]:
            validated_data.pop("numero")
        # primeira validação (acionaram deixou de ser nulo): registra quem validou e quando
        if instance.acionaram is None and validated_data.get("acionaram") is not None:
            validated_data["validado_por"] = nome
            validated_data["validado_em"] = timezone.now()
        return super().update(instance, validated_data)


def proximo_numero_recomendacao(ano: int) -> str:
    """Próximo NN_AAAA do ano (maior sequencial existente + 1; começa em 01)."""
    maior = 0
    for n in RecomendacaoAlarme.objects.filter(numero__endswith=f"_{ano}").values_list("numero", flat=True):
        try:
            maior = max(maior, int(n.split("_")[0]))
        except ValueError:
            continue
    return f"{maior + 1:02d}_{ano}"


class AcionamentoMunicipioSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcionamentoMunicipio
        fields = [
            "id", "municipio", "data", "hora", "probabilidade", "sirene", "tipo_alarme", "quantidade", "responsavel",
            "observacao", "origem", "criado_por", "criado_em", "atualizado_por", "atualizado_em",
        ]
        read_only_fields = ["origem", "criado_por", "criado_em", "atualizado_por", "atualizado_em"]
        extra_kwargs = {"hora": {"required": False, "allow_null": True}}

    def validate_municipio(self, v):
        from core.municipios import canonico_ou_original, is_municipio_valido

        v = canonico_ou_original((v or "").strip())
        if not is_municipio_valido(v):
            raise serializers.ValidationError("Município inválido (use um dos 92 municípios do RJ).")
        # só os municípios com sirenes (lista editável no Admin: "Municípios com sirenes")
        ativos = set(MunicipioComSirene.objects.filter(ativo=True).values_list("municipio", flat=True))
        if ativos and v not in ativos:
            raise serializers.ValidationError("Município fora da lista de municípios com sirenes (a lista é editada no Admin do painel).")
        return v

    def create(self, validated_data):
        quem = self.context["request"].user
        nome = quem.first_name or quem.username
        validated_data["criado_por"] = validated_data["atualizado_por"] = nome
        return super().create(validated_data)

    def update(self, instance, validated_data):
        quem = self.context["request"].user
        validated_data["atualizado_por"] = quem.first_name or quem.username
        return super().update(instance, validated_data)
