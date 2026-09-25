import json
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parent.parent / "ingestion" / "data" / "hidro_referencia.json"

CAMPOS_INVENTARIO = ("ana_codigo_plu", "ana_codigo_flu", "rio_monitorado", "regiao_hidrografica", "bacia")


def carregar_referencia(Station, CotaHidrologica, arquivo=ARQUIVO, sobrescrever=False):
    """Aplica hidro_referencia.json no banco: inventário na Station e cotas em
    CotaHidrologica (uma linha por estação). Idempotente. Por padrão NÃO mexe em
    cotas que já existem (podem ter sido editadas no Admin) nem em campos de
    inventário já preenchidos; `sobrescrever=True` reaplica tudo do arquivo.
    Devolve (estacoes_atualizadas, cotas_criadas, nao_encontradas)."""
    dados = json.loads(Path(arquivo).read_text(encoding="utf-8"))
    atualizadas = criadas = 0
    faltando = []
    for reg in dados:
        st = Station.objects.filter(source__slug=reg["source"], external_id=reg["external_id"]).first()
        if st is None:
            faltando.append(reg["external_id"])
            continue
        mudou = False
        for campo, valor in (reg.get("inventario") or {}).items():
            if campo in CAMPOS_INVENTARIO and valor and (sobrescrever or not getattr(st, campo)):
                setattr(st, campo, valor)
                mudou = True
        if mudou:
            st.save()
            atualizadas += 1
        cota = reg.get("cota")
        if cota:
            existente = CotaHidrologica.objects.filter(station=st).first()
            if existente is None:
                CotaHidrologica.objects.create(station=st, **cota)
                criadas += 1
            elif sobrescrever:
                for k, v in cota.items():
                    setattr(existente, k, v)
                existente.save()
    return atualizadas, criadas, faltando
