import re

from rest_framework import serializers

from core.municipios import canonico_ou_original
from core.models import AlertEvent, Previsao, Reading, RiskAlert, Source, Station


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
