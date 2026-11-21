"""Monitoramento dos rios (21/11/2026): estações hidrológicas automáticas agrupadas por REDEC e por rio, com a série horária do nível.

Base da aba Hidrologia > "Monitoramento dos rios" (equivalente à tabela que a REDEC monta à mão: Transb., 08h…Atual, Fonte).
- REDEC: pelo município da estação (`core/data/municipio_redec.json`); as estações de MG da bacia do Muriaé ficam na REDEC Noroeste.
- Rio: `Station.rio_monitorado` (inventário do INEA; editável no Admin) → senão a tabela `RIO_POR_ESTACAO` abaixo (estações da ANA, que vêm sem rio no inventário).
  Quem ficar sem rio aparece como "Rio a definir": basta preencher `rio_monitorado` no Admin da estação.
- Fora da tabela: usinas e barramentos (Cgh/Pch/Uel/Uhe/Ugh), que não são monitoramento de rio.
- Hora cheia (horário de Brasília): vale a última leitura até aquela hora, no máximo 60 min antes (INEA lê a cada 15 min; ANA, de 15 a 60)."""

from __future__ import annotations

import datetime as dt
import re
import unicodedata

from django.utils import timezone

from core.models import Reading, Station
from core.municipios import canonico_ou_original
from core.niveis_monitoramento import municipios_redec

SEM_RIO = "Rio a definir"
USINAS = re.compile(r"^(cgh|pch|uel|uhe|ugh)\b", re.IGNORECASE)
# Município de MG (SGB/CPRM, bacia do Muriaé) → REDEC Noroeste (mesma regra de `fetchMunicipioRedecMap` no front)
MG_NOROESTE = {"patrocinio do muriae", "carangola"}

# Nome da estação (sem acento, minúsculo) → rio. Só entra o que é conhecido com segurança; o resto fica "Rio a definir".
RIO_POR_ESTACAO = {
    "aperibe": "Rio Pomba",
    "santo antonio de padua ii": "Rio Pomba",
    "campos - ponte municipal": "Rio Paraíba do Sul",
    "itaocara": "Rio Paraíba do Sul",
    "paraiba do sul": "Rio Paraíba do Sul",
    "sao fidelis": "Rio Paraíba do Sul",
    "carangola": "Rio Carangola",
    "porciuncula": "Rio Carangola",
    "cardoso moreira": "Rio Muriaé",
    "itaperuna": "Rio Muriaé",
    "patrocinio do muriae": "Rio Muriaé",
    "guapimirim": "Rio Guapimirim",
    "lagoa feia - fazenda modelo e caraes": "Lagoa Feia",
    "yacht club lagoa de cima": "Lagoa de Cima",
    "manuel duarte": "Rio Preto",
    "ponte do baiao": "Rio Macaé",
}
# Grafias do inventário do INEA a corrigir
RIO_CORRIGIDO = {"macacu": "Rio Macacu", "lagoa dp campelo": "Lagoa do Campelo"}
FONTE_ROTULO = {"inea": "INEA", "ana": "ANA"}
JANELAS_H = (12, 24, 48)


def _sem_acento(txt: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", txt or "") if unicodedata.category(c) != "Mn").lower().strip()


def eh_usina(nome: str) -> bool:
    return bool(USINAS.match((nome or "").strip()))


def rio_da_estacao(station: Station) -> str:
    bruto = (station.rio_monitorado or "").strip()
    if bruto:
        return RIO_CORRIGIDO.get(_sem_acento(bruto), bruto)
    return RIO_POR_ESTACAO.get(_sem_acento(re.sub(r"\s+", " ", station.name or "")), SEM_RIO)


def redec_da_estacao(station: Station) -> tuple[int | None, str]:
    mun = canonico_ou_original(station.municipality or "")
    info = municipios_redec().get(mun)
    if info:
        return info["redec"], info["regiao"]
    if _sem_acento(mun) in MG_NOROESTE:
        return 11, "NOROESTE"
    return None, ""


def marcas_horarias(horas: int, agora: dt.datetime | None = None) -> list[dt.datetime]:
    """Horas cheias (horário local) das últimas `horas` horas, da mais antiga à mais nova (a mais nova é a hora cheia atual)."""
    agora = timezone.localtime(agora or timezone.now())
    ultima = agora.replace(minute=0, second=0, microsecond=0)
    return [ultima - dt.timedelta(hours=i) for i in range(horas - 1, -1, -1)]


def _valor_na_hora(leituras: list[tuple[dt.datetime, float]], marca: dt.datetime) -> float | None:
    """Última leitura em (marca - 60 min, marca]. `leituras` ordenada por horário."""
    ini = marca - dt.timedelta(minutes=60)
    escolhido = None
    for ts, v in leituras:
        if ts > marca:
            break
        if ts > ini:
            escolhido = v
    return escolhido


def montar(horas: int = 12, agora: dt.datetime | None = None) -> dict:
    if horas not in JANELAS_H:
        raise ValueError(f"horas deve ser uma de {JANELAS_H}")
    agora = agora or timezone.now()
    marcas = marcas_horarias(horas, agora)
    desde = marcas[0] - dt.timedelta(minutes=60)
    estacoes = [
        s
        for s in Station.objects.filter(readings__reading_type=Reading.ReadingType.NIVEL_M).select_related("source", "cota").distinct()
        if not eh_usina(s.name)
    ]
    ids = [s.id for s in estacoes]
    por_estacao: dict[int, list[tuple[dt.datetime, float]]] = {i: [] for i in ids}
    for r in Reading.objects.filter(station_id__in=ids, reading_type=Reading.ReadingType.NIVEL_M, timestamp__gte=desde).order_by("timestamp").values("station_id", "timestamp", "value"):
        por_estacao[r["station_id"]].append((r["timestamp"], r["value"]))
    ultimas = {}
    for r in Reading.objects.filter(station_id__in=ids, reading_type=Reading.ReadingType.NIVEL_M, timestamp__gte=agora - dt.timedelta(days=7)).order_by("timestamp").values("station_id", "timestamp", "value"):
        ultimas[r["station_id"]] = r  # a mais nova sobrescreve
    saida = []
    for s in estacoes:
        cota = getattr(s, "cota", None)
        redec, regiao = redec_da_estacao(s)

        def classe(v_m):
            if v_m is None:
                return None
            return cota.classificar(v_m * 100) if cota else "sem_cota"

        serie = []
        for m in marcas:
            v = _valor_na_hora(por_estacao[s.id], m)
            serie.append({"v": v, "c": classe(v)})
        ult = ultimas.get(s.id)
        atual_m = ult["value"] if ult else None
        saida.append(
            {
                "id": s.id,
                "name": s.name,
                "municipality": canonico_ou_original(s.municipality or ""),
                "redec": redec,
                "regiao": regiao,
                "rio": rio_da_estacao(s),
                "fonte": FONTE_ROTULO.get(s.source.slug, s.source.slug.upper()),
                "transbordo_m": (cota.inundacao_cm / 100 if cota and cota.inundacao_cm is not None else None),
                "atual_m": atual_m,
                "atual_em": ult["timestamp"].isoformat() if ult else None,
                "atual_classe": classe(atual_m),
                "serie": serie,
            }
        )
    saida.sort(key=lambda e: (e["redec"] or 99, e["rio"] == SEM_RIO, e["rio"], e["municipality"], e["name"]))
    return {"gerado_em": agora.isoformat(), "horas": [m.isoformat() for m in marcas], "estacoes": saida}
