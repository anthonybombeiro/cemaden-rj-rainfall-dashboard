"""Gera backend/ingestion/data/hidro_referencia.json a partir das duas planilhas
de referência (só roda em desenvolvimento — exige openpyxl e as planilhas):

  - Dados_Inundacao_INEA_CPRM.xlsx          -> cotas (atenção/alerta/inundação, cm)
  - InventárioEstaçõesHidrometeorológicas.xlsx -> código ANA plu/flu, rio, região
                                                hidrográfica e bacia

O JSON resultante é o que `core/hidro_ref.py` carrega no banco (inclusive em
produção, via migração — o servidor não tem openpyxl).

Uso (na pasta backend, com o banco de dev populado pelo `ingest inea`):
  python scripts/build_hidro_referencia.py [pasta_das_planilhas]
"""

import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import django
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from core.models import Station  # noqa: E402

PASTA = Path(sys.argv[1] if len(sys.argv) > 1 else "H:/Meu Drive/CEMADEN/DADOS DE REFERENCIA/Hidrologia")
SAIDA = Path(__file__).resolve().parent.parent / "ingestion" / "data" / "hidro_referencia.json"


def norm(s) -> str:
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def numero(v):
    try:
        return round(float(str(v).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None  # "-", "sem cota definida", vazio


def texto(v) -> str:
    v = str(v).replace("\xa0", " ").strip() if v is not None else ""
    return "" if v.lower() in ("não definido", "nao definido", "none", "-") else v


def linhas(nome_arquivo):
    ws = openpyxl.load_workbook(PASTA / nome_arquivo, data_only=True).active
    return [r for r in ws.iter_rows(min_row=2, values_only=True) if any(c is not None for c in r)]


cotas = [r for r in linhas("Dados_Inundacao_INEA_CPRM.xlsx") if r[0]]
inventario = [r for r in linhas("InventárioEstaçõesHidrometeorológicas.xlsx") if r[2]]

cotas_por_nome = defaultdict(list)
for r in cotas:
    cotas_por_nome[norm(r[2])].append(r)
inv_por_codigo = {}
for r in inventario:
    for c in (r[0], r[1]):
        if texto(c):
            inv_por_codigo[texto(c)] = r
inv_por_nome = defaultdict(list)
for r in inventario:
    inv_por_nome[norm(r[2])].append(r)

registros, sem_cota, sem_inv = [], [], []
for st in Station.objects.filter(readings__reading_type="nivel_m").distinct().order_by("source__slug", "name"):
    # --- cota
    cands = cotas_por_nome.get(norm(st.name), [])
    if len(cands) > 1:
        cands = sorted(cands, key=lambda r: (r[1] != "INEA", norm(r[3]) != norm(st.municipality)))
    cota = cands[0] if cands else None
    if not cota:
        sem_cota.append(st.name)

    # --- inventário: código do INEA/ANA primeiro, depois nome (+ município)
    cod = str(st.raw_metadata.get("codigo_inea", "")).strip()
    inv = inv_por_codigo.get(cod)
    if not inv:
        por_nome = inv_por_nome.get(norm(st.name), [])
        exato = [r for r in por_nome if norm(r[8]) == norm(st.municipality)]
        inv = (exato or por_nome or [None])[0]
    if not inv:
        sem_inv.append(st.name)

    reg = {"source": st.source.slug, "external_id": st.external_id, "nome": st.name}
    if inv:
        reg["inventario"] = {
            "ana_codigo_plu": texto(inv[0]),
            "ana_codigo_flu": texto(inv[1]),
            "rio_monitorado": "" if texto(inv[4]).lower().startswith("estação") else texto(inv[4]),
            "regiao_hidrografica": texto(inv[5]),
            "bacia": texto(inv[7]),
        }
    if cota:
        reg["cota"] = {
            "atencao_cm": numero(cota[6]),
            "alerta_cm": numero(cota[7]),
            "inundacao_cm": numero(cota[8]),
            "rio": texto(cota[5]),
            "codigo_referencia": texto(cota[0]),
            "responsavel": texto(cota[1]),
        }
        if not inv or not reg["inventario"]["rio_monitorado"]:
            reg.setdefault("inventario", {})["rio_monitorado"] = texto(cota[5])
    registros.append(reg)

SAIDA.write_text(json.dumps(registros, ensure_ascii=False, indent=1), encoding="utf-8")
com_cota = sum(1 for r in registros if r.get("cota") and r["cota"]["atencao_cm"] is not None)
print(f"{len(registros)} estações -> {SAIDA.name}; com cotas numéricas: {com_cota}")
print("sem linha nas cotas:", sem_cota)
print("sem linha no inventário:", sem_inv)
