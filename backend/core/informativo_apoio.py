"""Apoio ao plantão do informativo meteorológico (fases B a D da proposta).

* F9  `chuva_atual_por_redec`: a maior chuva de 1 h das estações de cada REDEC, na escala única de chuva (fraca, moderada, forte, muito forte);
* F10 `previsao_do_dia_por_redec`: o que a previsão do dia (ícone de chuva/raios) sugere para cada REDEC;
* F11 `quando_emitir` e F12 `regioes_descobertas`: avisos do plantão comparando a chuva observada com o informativo vigente;
* F18 `sugestoes_nm`: sugestão de NM (sempre só sugestão) para os municípios das REDECs do informativo vigente;
* F26 `verificar`: o que o informativo previu × o que as estações mediram nas 6 h seguintes (tabela de contingência e índices).

Tudo aqui é leitura e sugestão: nada grava no banco nem decide pelo técnico."""

from __future__ import annotations

import datetime as dt
from collections import defaultdict

from django.db.models import Sum
from django.db.models.functions import TruncHour
from django.utils import timezone

from core import informativos as inf
from core.models import Previsao, Reading, Station
from core.municipios import canonico_ou_original
from core.niveis_monitoramento import municipios_redec

# Escala única de chuva em 1 h (a mesma da tabela de Precipitação e do portal de sirenes).
FAIXAS_1H = [(50.0, "muito_forte", "Muito forte"), (25.1, "forte", "Forte"), (5.1, "moderada", "Moderada"), (0.2, "fraca", "Fraca")]
ORDEM_CLASSE = {"fraca": 1, "moderada": 2, "forte": 3, "muito_forte": 4}
# Como a classe medida vira a intensidade do informativo (a matriz usa a escala do texto; o técnico confirma).
INTENSIDADE_DA_CLASSE = {"fraca": "fraca", "moderada": "moderada", "forte": "moderada_forte", "muito_forte": "pontual_muito_forte"}
IDADE_MAX_LEITURA_MIN = 90  # leitura mais velha que isso não conta como "chuva agora"
JANELA_VERIFICACAO_H = 6
LIMITE_MODERADA_MM = 5.1
CACHE_S = 120


def classe_1h(mm: float | None) -> tuple[str, str] | None:
    if mm is None:
        return None
    for limite, chave, rotulo in FAIXAS_1H:
        if mm > limite if chave == "muito_forte" else mm >= limite:
            return chave, rotulo
    return None


def _redec_do_municipio() -> dict[str, str]:
    return {m: d.get("regiao", "") for m, d in municipios_redec().items()}


def chuva_atual_por_redec(agora: dt.datetime | None = None) -> dict[str, dict]:
    """REDEC → {max_1h_mm, classe, rotulo, estacao, municipio, atualizado_em, estacoes_com_chuva, intensidade_sugerida}. Só REDECs com alguma chuva (≥ 0,2 mm/h)
    em estação com leitura dos últimos 90 min."""
    from api.views import StationViewSet  # import tardio: evita ciclo no carregamento

    agora = agora or timezone.now()
    redec_de = _redec_do_municipio()
    recentes = list(
        Station.objects.select_related("source").filter(readings__reading_type=Reading.ReadingType.CHUVA_MM, readings__timestamp__gte=agora - dt.timedelta(hours=3)).distinct()
    )
    por_regiao: dict[str, list[dict]] = defaultdict(list)
    for e in StationViewSet()._calcular_precipitacao(recentes):
        mm, atualizado = e.get("acumulado_1h_mm"), e.get("updated_at")
        if mm is None or atualizado is None or (agora - atualizado) > dt.timedelta(minutes=IDADE_MAX_LEITURA_MIN):
            continue
        regiao = redec_de.get(canonico_ou_original(e.get("municipality") or "") or "")
        if regiao:
            por_regiao[regiao].append({"mm": float(mm), "estacao": e["name"], "municipio": e["municipality"], "atualizado_em": atualizado})
    out: dict[str, dict] = {}
    for regiao, lista in por_regiao.items():
        topo = max(lista, key=lambda x: x["mm"])
        classe = classe_1h(topo["mm"])
        if classe is None:
            continue
        out[regiao] = {
            "max_1h_mm": round(topo["mm"], 1),
            "classe": classe[0],
            "rotulo": classe[1],
            "estacao": topo["estacao"],
            "municipio": topo["municipio"],
            "atualizado_em": topo["atualizado_em"],
            "estacoes_com_chuva": sum(1 for x in lista if x["mm"] >= 0.2),
            "intensidade_sugerida": INTENSIDADE_DA_CLASSE[classe[0]],
        }
    return out


def chuva_atual_cacheada(agora: dt.datetime | None = None) -> dict[str, dict]:
    """`chuva_atual_por_redec` com cache curto (o painel consulta a cada minuto e o cálculo lê até 96 h de leituras)."""
    from django.core.cache import cache

    if agora is not None:  # chamada com horário explícito (testes): sem cache
        return chuva_atual_por_redec(agora)
    dado = cache.get("informativo:chuva_atual")
    if dado is None:
        dado = chuva_atual_por_redec()
        cache.set("informativo:chuva_atual", dado, CACHE_S)
    return dado


def previsao_do_dia_por_redec(dia: dt.date | None = None) -> dict[str, dict]:
    """REDEC → sugestão para a previsão das próximas 6 h a partir do ícone da previsão do dia (a previsão não traz intensidade: chuva sem raios sugere
    'fraca a moderada'; chuva com raios sugere 'moderada' com raios). Regiões sem chuva no ícone não entram."""
    dia = dia or timezone.localdate()
    out: dict[str, dict] = {}
    for p in Previsao.objects.filter(data=dia):
        icone = p.icone or ""
        if "Chuva" not in icone:
            continue
        raios = "Raio" in icone
        out[p.regiao.upper()] = {"icone": icone, "raios": raios, "chuva_prevista": "moderada" if raios else "fraca_moderada", "fonte": f"previsão do dia {dia:%d/%m}"}
    return out


def gravidade_da_classe(classe: str) -> int:
    return inf.gravidade(INTENSIDADE_DA_CLASSE.get(classe, ""))


def regioes_descobertas(itens: list[dict], chuva: dict[str, dict]) -> list[dict]:
    """REDECs com chuva ≥ moderada agora que o informativo vigente não cobre (sem cenário atual nem previsão de pelo menos chuva moderada)."""
    cobertas = {i["regiao"] for i in itens if inf.gravidade(i.get("chuva_atual") or "") >= 3 or inf.gravidade(i.get("chuva_prevista") or "") >= 3}
    return [
        {"regiao": r, "rotulo": c["rotulo"], "max_1h_mm": c["max_1h_mm"], "estacao": c["estacao"], "municipio": c["municipio"]}
        for r, c in sorted(chuva.items()) if ORDEM_CLASSE[c["classe"]] >= 2 and r not in cobertas
    ]


def quando_emitir(vigente: dict | None, chuva: dict[str, dict], agora: dt.datetime) -> dict:
    """Aviso do plantão (protocolo 7.1: emitir com chuva moderada a forte; renovar a cada 6 h). `vigente` = {itens, vigente_ate, numero, ano} ou None."""
    fortes = sorted(r for r, c in chuva.items() if ORDEM_CLASSE[c["classe"]] >= 3)
    moderadas = sorted(r for r, c in chuva.items() if ORDEM_CLASSE[c["classe"]] == 2)
    if vigente is None:
        if fortes:
            return {"emitir": True, "urgencia": "alta", "regioes": fortes, "motivo": f"Chuva forte em {inf.lista_pt([inf.nome_bonito(r) for r in fortes])} e nenhum informativo vigente."}
        if moderadas:
            return {"emitir": True, "urgencia": "media", "regioes": moderadas, "motivo": f"Chuva moderada em {inf.lista_pt([inf.nome_bonito(r) for r in moderadas])} e nenhum informativo vigente."}
        return {"emitir": False, "urgencia": "", "regioes": [], "motivo": ""}
    descobertas = regioes_descobertas(vigente["itens"], chuva)
    if descobertas:
        nomes = [inf.nome_bonito(d["regiao"]) for d in descobertas]
        return {"emitir": True, "urgencia": "alta" if any(d["rotulo"] in ("Forte", "Muito forte") for d in descobertas) else "media", "regioes": [d["regiao"] for d in descobertas],
                "motivo": f"{inf.lista_pt(nomes)} com chuva e fora do informativo nº {vigente['numero']}/{vigente['ano']}: avise a meteorologista."}
    restante = vigente["vigente_ate"] - agora
    if restante < dt.timedelta(minutes=45) and chuva:
        return {"emitir": True, "urgencia": "media", "regioes": sorted(chuva), "motivo": "Informativo a vencer e ainda há chuva: renovar."}
    return {"emitir": False, "urgencia": "", "regioes": [], "motivo": ""}


def sugestoes_nm(itens: list[dict], numero: int, ano: int, niveis_por_municipio: dict[str, dict]) -> list[dict]:
    """Sugestões de NM vindas do informativo vigente (tabela do §6 da proposta, só sugestão): uma por município das REDECs com NM sugerido ≥ 2 e acima do vigente."""
    por_regiao = {i["regiao"]: i for i in itens}
    out = []
    for m, n in niveis_por_municipio.items():
        item = por_regiao.get(n["regiao"])
        if not item or not item.get("chuva_prevista"):
            continue
        nm, so_a_pedido = inf.nm_sugerido(item)
        if nm >= 2 and nm > n["nivel"]:
            out.append({"municipio": m, "regiao": n["regiao"], "atual": n["nivel"], "sugerido": nm, "so_a_pedido": so_a_pedido,
                        "fonte": {"tipo": "informativo", "numero": numero, "ano": ano, "regiao": n["regiao"], "chuva_prevista": item["chuva_prevista"], "raios": bool(item.get("raios")), "granizo": bool(item.get("granizo"))}})
    return out


# ---------------------------------------------------------------- verificação (F26)
def indices(hits: int, falsos: int, perdas: int, negativos: int) -> dict:
    """Índices usuais de verificação de eventos (Wilks): POD, FAR, CSI, viés e acurácia; None quando o denominador é zero."""
    def razao(a, b):
        return round(a / b, 3) if b else None

    return {"acertos": hits, "falsos_alarmes": falsos, "perdas": perdas, "acertos_negativos": negativos,
            "pod": razao(hits, hits + perdas), "far": razao(falsos, hits + falsos), "csi": razao(hits, hits + falsos + perdas),
            "vies": razao(hits + falsos, hits + perdas), "acuracia": razao(hits + negativos, hits + falsos + perdas + negativos)}


def chuva_maxima_1h(inicio: dt.datetime, fim: dt.datetime) -> dict[str, dict]:
    """REDEC → maior chuva em 1 h civil (soma das leituras de uma hora cheia) entre `inicio` e `fim`, entre todas as estações com chuva gravada."""
    redec_de = _redec_do_municipio()
    est = {s["id"]: s for s in Station.objects.values("id", "name", "municipality")}
    topo: dict[str, dict] = {}
    linhas = (
        Reading.objects.filter(reading_type=Reading.ReadingType.CHUVA_MM, timestamp__gte=inicio, timestamp__lt=fim)
        .annotate(h=TruncHour("timestamp")).values("station_id", "h").annotate(total=Sum("value"))
    )
    for l in linhas:
        e = est.get(l["station_id"])
        if not e or l["total"] is None:
            continue
        regiao = redec_de.get(canonico_ou_original(e["municipality"] or "") or "")
        if regiao and (regiao not in topo or l["total"] > topo[regiao]["mm"]):
            topo[regiao] = {"mm": float(l["total"]), "estacao": e["name"]}
    return topo


def verificar(informativos: list[dict]) -> dict:
    """`informativos` = [{numero, ano, emitido_em, itens}]. Para cada um: previsto = REDEC com chuva prevista de gravidade ≥ 5 (moderada a forte ou mais);
    observado = chuva de 1 h ≥ 5,1 mm (moderada ou mais) em alguma estação da REDEC nas 6 h seguintes. Devolve o detalhe por informativo e os índices do conjunto."""
    total = {"h": 0, "f": 0, "m": 0, "n": 0}
    detalhe = []
    agora = timezone.now()
    for i in informativos:
        fim = i["emitido_em"] + dt.timedelta(hours=JANELA_VERIFICACAO_H)
        if fim > agora:  # a janela ainda não fechou
            continue
        obs = chuva_maxima_1h(i["emitido_em"], fim)
        previstas = {x["regiao"] for x in i["itens"] if inf.gravidade(x.get("chuva_prevista") or "") >= 5}
        linhas = []
        c = {"h": 0, "f": 0, "m": 0, "n": 0}
        for r in inf.REGIOES:
            ocorreu = obs.get(r, {}).get("mm", 0) >= LIMITE_MODERADA_MM
            previu = r in previstas
            chave = "h" if previu and ocorreu else "f" if previu else "m" if ocorreu else "n"
            c[chave] += 1
            if previu or ocorreu:
                linhas.append({"regiao": r, "previu": previu, "ocorreu": ocorreu, "max_1h_mm": round(obs[r]["mm"], 1) if r in obs else None, "estacao": obs.get(r, {}).get("estacao"),
                               "resultado": {"h": "acerto", "f": "falso alarme", "m": "perda", "n": ""}[chave]})
        for k in total:
            total[k] += c[k]
        detalhe.append({"numero": i["numero"], "ano": i["ano"], "emitido_em": i["emitido_em"], "regioes": linhas, **indices(c["h"], c["f"], c["m"], c["n"])})
    return {"janela_h": JANELA_VERIFICACAO_H, "criterio": "Previsto: moderada a forte ou mais. Observado: chuva de 1 h ≥ 5,1 mm numa estação da REDEC nas 6 h seguintes.",
            "informativos": detalhe, "total": indices(total["h"], total["f"], total["m"], total["n"])}
