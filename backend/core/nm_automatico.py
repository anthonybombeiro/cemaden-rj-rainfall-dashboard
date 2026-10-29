"""Automação do Nível de Monitoramento (NM) a partir dos mapas de risco e de outros produtos tabulares.

Ideia: os mapas de risco (hidrológico, geológico e severidade meteorológica) já são automáticos e cada nível de risco tem um **piso** de NM na matriz do PLANCON
(muito baixo → NM 0, baixo → NM 1, moderado → NM 2, alto e muito alto → NM 3). O sistema gera sozinho o NM até `ConfiguracaoNm.nivel_maximo_auto` (padrão NM 2);
o que passa disso vira **sugestão** para o plantonista (aba Produção → Pendências). NM 4 e NM 5 dependem de gatilho atingido, impacto em até 2 h, área delimitada,
aprovação e aviso à COMDEC/REDEC e **nunca** são gerados pelo sistema.

Regras de convivência com o trabalho humano (documentadas em docs/nivel-monitoramento-plancon.md):
- um nível lançado por plantonista, ainda ativo, nunca é alterado pelo sistema (NM 2+ ativo = vigência não vencida; NM 0–1 = lançado há menos de 6 h);
- o sistema só mexe em município sem linha, com linha automática, ou com linha humana vencida;
- subir é imediato; descer só depois de 3 h no nível anterior (histerese), para não oscilar a cada leitura;
- NM 2+ automático tem vigência de 24 h e é renovado (novo registro) quando restam menos de 6 h e o risco continua;
- tudo fica no histórico (`NivelMonitoramentoRegistro`) com `origem="automatico"`, os sinais que sustentaram o nível e o responsável "Sistema (automático)".
"""

from __future__ import annotations

import datetime as dt
import logging
import uuid

from django.db import transaction
from django.utils import timezone

from core.models import ConfiguracaoNm, NivelMonitoramento, NivelMonitoramentoRegistro, Reading, RiskAlert
from core.municipios import MUNICIPIOS_CANONICOS, canonico_ou_original
from core.niveis_monitoramento import PISO_POR_RISCO, VIGENCIA_MAX_H, municipios_redec

logger = logging.getLogger(__name__)

SISTEMA = "Sistema (automático)"
COM_GRANULARIDADE_MUNICIPAL = {RiskAlert.Tipo.GEOLOGICO, RiskAlert.Tipo.HIDROLOGICO}
TIPOS_CHUVA = [RiskAlert.Tipo.HIDROLOGICO, RiskAlert.Tipo.GEOLOGICO, RiskAlert.Tipo.METEOROLOGICO]
EQUIPE_DO_TIPO = {RiskAlert.Tipo.HIDROLOGICO: "hid", RiskAlert.Tipo.GEOLOGICO: "geo", RiskAlert.Tipo.METEOROLOGICO: "met"}

RENOVAR_QUANDO_RESTAM_H = 6
HISTERESE_BAIXAR_H = 3
BLOQUEIO_HUMANO_NM01_H = 6
IDADE_MAX_COTA_H = 3

# Tabela de níveis dos produtos tabulares → NM (piso). Só o risco técnico é automático; as demais fontes viram sugestão.
NM_POR_CLASSE_COTA = {"atencao": 1, "alerta": 2, "transbordo": 3, "extrema": 3}


def riscos_por_municipio() -> dict[str, list[dict]]:
    """Município → fontes de risco (hidrológico, geológico, severidade meteorológica) com o piso de NM de cada uma. Hidrológico e geológico têm alerta por
    município; a severidade meteorológica vale para a REDEC do município."""
    redec = municipios_redec()
    alertas = list(RiskAlert.objects.filter(tipo__in=TIPOS_CHUVA))
    municipais = {(a.tipo, a.municipio): a for a in alertas if a.municipio}
    por_redec = {(a.tipo, a.redec): a for a in alertas if not a.municipio}
    out: dict[str, list[dict]] = {}
    for m in MUNICIPIOS_CANONICOS:
        regiao = redec.get(m, {}).get("regiao", "")
        for tipo in TIPOS_CHUVA:
            a = municipais.get((tipo, m))
            if a is None and tipo not in COM_GRANULARIDADE_MUNICIPAL:
                a = por_redec.get((tipo, regiao))
            if a is not None:
                out.setdefault(m, []).append(
                    {"fonte": "risco", "tipo": tipo, "risco": a.risco, "atualizado_em": a.atualizado_em, "piso": PISO_POR_RISCO.get(a.risco, 0)}
                )
    return out


def cotas_por_municipio(agora: dt.datetime | None = None) -> dict[str, list[dict]]:
    """Município → estações hidrológicas com leitura recente (≤ 3 h) cujo nível já passou da cota de atenção; `piso` vem de NM_POR_CLASSE_COTA."""
    from core.models import CotaHidrologica

    agora = agora or timezone.now()
    desde = agora - dt.timedelta(hours=IDADE_MAX_COTA_H)
    out: dict[str, list[dict]] = {}
    for cota in CotaHidrologica.objects.select_related("station"):
        est = cota.station
        leitura = Reading.objects.filter(station=est, reading_type=Reading.ReadingType.NIVEL_M, timestamp__gte=desde).order_by("-timestamp").first()
        if leitura is None:
            continue
        classe = cota.classificar(leitura.value * 100)
        piso = NM_POR_CLASSE_COTA.get(classe or "")
        if not piso:
            continue
        out.setdefault(canonico_ou_original(est.municipality), []).append(
            {"fonte": "cota", "estacao": est.name, "rio": cota.rio or est.rio_monitorado, "classe": classe, "nivel_cm": round(leitura.value * 100), "atualizado_em": leitura.timestamp, "piso": piso}
        )
    return out


def _texto_sinais(fontes: list[dict]) -> str:
    partes = []
    for f in fontes:
        if f["fonte"] == "risco":
            partes.append(f"{RiskAlert.Tipo(f['tipo']).label}: risco {RiskAlert.Risco(f['risco']).label.lower()}")
        elif f["fonte"] == "cota":
            partes.append(f"cota {f['classe']} em {f['estacao']}")
    return "; ".join(partes)


def _humano_ativo(n: NivelMonitoramento, agora: dt.datetime) -> bool:
    if n.origem != "humano":
        return False
    if n.nivel >= 2:
        return n.vigencia_ate is None or n.vigencia_ate >= agora
    return agora - n.atualizado_em < dt.timedelta(hours=BLOQUEIO_HUMANO_NM01_H)


def sincronizar(agora: dt.datetime | None = None, forcar: bool = False) -> dict:
    """Aplica a automação do NM. Devolve o resumo (também gravado em `ConfiguracaoNm.ultimo_resumo`)."""
    agora = agora or timezone.now()
    cfg = ConfiguracaoNm.obter()
    if not cfg.ativo and not forcar:
        return {"ativo": False, "executado_em": agora.isoformat()}
    teto = cfg.nivel_maximo_auto
    riscos = riscos_por_municipio()
    resumo = {"ativo": True, "teto": teto, "criados": 0, "renovados": 0, "rebaixados": 0, "mantidos": 0, "bloqueados_por_humano": 0, "sem_dado": 0}
    with transaction.atomic():
        atuais = {n.municipio: n for n in NivelMonitoramento.objects.select_for_update().all()}
        lote = str(uuid.uuid4())
        for m in MUNICIPIOS_CANONICOS:
            fontes = riscos.get(m)
            atual = atuais.get(m)
            if not fontes:
                resumo["sem_dado"] += 1
                continue
            if atual and _humano_ativo(atual, agora):
                resumo["bloqueados_por_humano"] += 1
                continue
            maximo = max(f["piso"] for f in fontes)
            alvo = min(maximo, teto)
            nivel_atual = atual.nivel if atual else 0
            decisivas = [f for f in fontes if f["piso"] == maximo] if maximo else fontes
            acao = None
            if alvo > nivel_atual:
                acao = "criado"
            elif alvo < nivel_atual:
                recente = atual is not None and atual.origem == "automatico" and agora - atual.atualizado_em < dt.timedelta(hours=HISTERESE_BAIXAR_H)
                acao = None if recente else "rebaixado"
            elif alvo >= 2 and atual is not None and atual.origem == "automatico" and atual.vigencia_ate and atual.vigencia_ate - agora < dt.timedelta(hours=RENOVAR_QUANDO_RESTAM_H):
                acao = "renovado"
            elif atual is not None and atual.origem == "humano" and alvo >= 2 and alvo == nivel_atual:
                acao = "criado"  # o humano venceu e o risco continua: o sistema assume com o mesmo nível
            if acao is None:
                resumo["mantidos"] += 1
                continue
            vigencia = agora + dt.timedelta(hours=VIGENCIA_MAX_H) if alvo >= 2 else None
            equipe = EQUIPE_DO_TIPO.get(decisivas[0].get("tipo", ""), "")
            motivo = f"Gerado automaticamente a partir dos mapas de risco (piso do PLANCON): {_texto_sinais(decisivas) or 'sem risco'}."
            reg = NivelMonitoramentoRegistro.objects.create(
                municipio=m, nivel=alvo, nivel_anterior=nivel_atual, equipe=equipe, motivo=motivo, vigencia_ate=vigencia,
                encerramento=alvo <= 1 and nivel_atual > alvo, lote=lote, registrado_por=SISTEMA, origem="automatico",
                sinais=[{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in f.items()} for f in decisivas],
            )
            NivelMonitoramento.objects.update_or_create(municipio=m, defaults={"nivel": alvo, "vigencia_ate": vigencia, "registro": reg, "origem": "automatico"})
            resumo[{"criado": "criados", "rebaixado": "rebaixados", "renovado": "renovados"}[acao]] += 1
    cfg.ultima_execucao = agora
    cfg.ultimo_resumo = {**resumo, "executado_em": agora.isoformat()}
    cfg.save(update_fields=["ultima_execucao", "ultimo_resumo"])
    return cfg.ultimo_resumo


def sincronizar_se_vencido(minutos: int = 10) -> dict | None:
    """Carona nos jobs de ingestão do cron (não há como criar cron novo pela API do cPanel): roda `sincronizar` se a última execução tem mais de `minutos`.
    Nunca levanta erro (a ingestão não pode ser afetada)."""
    try:
        cfg = ConfiguracaoNm.obter()
        if not cfg.ativo:
            return None
        if cfg.ultima_execucao and timezone.now() - cfg.ultima_execucao < dt.timedelta(minutes=minutos):
            return None
        return sincronizar()
    except Exception:  # noqa: BLE001
        logger.exception("Falha na automação do NM (carona)")
        return None
