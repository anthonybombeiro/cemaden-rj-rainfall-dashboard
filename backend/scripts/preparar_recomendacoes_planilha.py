"""Converte a planilha de controle "Recomendação (Sirene) 2020 a 2026" (.xlsx) em backend/core/data/recomendacoes_planilha.json
e escreve um relatório de anomalias (docs/recomendacoes-planilha-relatorio.md).

Uso:  python backend/scripts/preparar_recomendacoes_planilha.py caminho/da/planilha.xlsx

Regras (decididas lendo a planilha de 22/10/2026):
* abas Recomendação_2020 … _2026; a aba "2021_2022" só contribui com as linhas de **2021** (as de 2022 repetem a aba 2022);
* datas/horas são células reais (sem ambiguidade dia/mês);
* "Acionaram?" SIM/NÃO; "Sirenes acionadas" numérico = quantidade, texto = nomes;
* o texto do índice é mantido; os mm de 1h/24h/96h/30d vêm das colunas (2020–2022) ou são lidos do texto (2023–2026);
  quando há mais de um pluviômetro na mesma linha, valem os MAIORES valores e o texto completo fica em `indice_alcancado`;
* aba "Acionamento pelo Município" → lista separada (mobilizações feitas pelo próprio município).
"""
import datetime
import json
import re
import sys
from collections import Counter
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "backend"))
from core.municipios import canonico_ou_original, is_municipio_valido  # noqa: E402

SAIDA = RAIZ / "backend" / "core" / "data" / "recomendacoes_planilha.json"
RELATORIO = RAIZ / "docs" / "recomendacoes-planilha-relatorio.md"

PROB = {"baixa": "Baixa", "baixo": "Baixa", "moderada": "Moderada", "alta": "Alta", "muito alta": "Muito Alta", "muiot alta": "Muito Alta", "muito ata": "Muito Alta", "muito alto": "Muito Alta"}


def txt(v):
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).replace("\xa0", " ")).strip()


def num(v):
    """Número da célula (float/str com vírgula) ou None; textos como 'Indisponível', '-' viram None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    t = txt(v).replace(",", ".")
    if not re.fullmatch(r"-?\d+(\.\d+)?", t):
        return None
    return float(t)


def maior_dos_valores(v):
    """'57.4 53.2 47.0' (vários pluviômetros na mesma linha) -> 57.4; número simples -> ele mesmo."""
    if v is None:
        return None, False
    if isinstance(v, (int, float)):
        return float(v), False
    partes = re.findall(r"\d+(?:[.,]\d+)?", txt(v))
    vals = [float(p.replace(",", ".")) for p in partes]
    return (max(vals) if vals else None), len(vals) > 1


JANELAS = [
    (re.compile(r"^(1\s*h|1\s*hora|1\s*horas)$"), "chuva_1h_mm"),
    (re.compile(r"^(24\s*h|24\s*horas)$"), "chuva_24h_mm"),
    (re.compile(r"^(96\s*h|96\s*horas|96)$"), "chuva_96h_mm"),
    (re.compile(r"^(30\s*dias|30dias|1\s*m[eê]s)$"), "chuva_30d_mm"),
]


def mm_do_texto(texto):
    """Lê '46.2 mm em 1 hora + 522.4 em 30 dias', '54 mm/1hora 435.8/ 30 dias', '50.6 mm em 1h e 121.6/24h'…"""
    t = txt(texto).lower()
    out = {}
    for m in re.finditer(r"(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*(?:em|/)\s*(\d+\s*(?:horas?|h|dias?|min(?:utos)?|m[eê]s)|\d+(?=\s|$)|1\s*m[eê]s)", t):
        valor = float(m.group(1).replace(",", "."))
        janela = re.sub(r"\s+", " ", m.group(2)).strip()
        for rx, campo in JANELAS:
            if rx.match(janela) and campo not in out:
                out[campo] = valor
    return out


def hora_de(v):
    if isinstance(v, datetime.datetime):
        return v.time()
    if isinstance(v, datetime.time):
        return v
    t = txt(v)
    m = re.fullmatch(r"(\d{1,2})[h:](\d{2})", t)
    return datetime.time(int(m.group(1)), int(m.group(2))) if m else None


def data_de(v):
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    return None


def lista_sirenes(v):
    """Coluna SIRENES ACIONADAS: número = quantidade; texto = nomes."""
    if isinstance(v, (int, float)):
        return int(v), ""
    t = txt(v)
    if t in ("", "-", "—"):
        return None, ""
    if re.fullmatch(r"\d+", t):
        return int(t), ""
    return None, t


def prob_de(v):
    return PROB.get(txt(v).lower(), "")


def gatilho_de(v):
    t = txt(v).upper().replace("L", "I")
    return t if t in ("I", "II", "III", "IV") else ""


def estagio_de(v):
    t = txt(v).upper()
    return t if t in ("ATENÇÃO", "ALERTA", "ALERTA MÁXIMO") else ""


def main(caminho):
    wb = openpyxl.load_workbook(caminho, data_only=True)
    nomes = {ws.title: ws for ws in wb}

    def aba(prefixo):
        return next(ws for t, ws in nomes.items() if t.replace("ç", "c").replace("ã", "a").lower().startswith(prefixo))

    recs, anomalias, vistos = {}, [], Counter()

    def adicionar(ano_aba, cab, linha, linha_idx):
        g = lambda nome: linha[cab[nome]] if nome in cab and cab[nome] < len(linha) else None  # noqa: E731
        numero = txt(g("numero")).replace(" ", "")
        if not re.fullmatch(r"\d{2,3}_\d{4}", numero):
            return
        municipio = canonico_ou_original(txt(g("municipio")))
        ref = f"{ano_aba}!{numero} (linha {linha_idx})"
        if not is_municipio_valido(municipio):
            anomalias.append((ref, f"município fora da lista: {txt(g('municipio'))!r}"))
        data, hora = data_de(g("data")), hora_de(g("hora"))
        if data is None or hora is None:
            anomalias.append((ref, "data/hora ausente ou inválida"))
            return
        if str(data.year) != numero.split("_")[1]:
            anomalias.append((ref, f"ano da data ({data.year}) difere do ano do número"))
        indice_txt = txt(g("indice"))
        mm = {}
        multi = False
        for campo, col in (("chuva_1h_mm", "mm1h"), ("chuva_24h_mm", "mm24h"), ("chuva_96h_mm", "mm96h"), ("chuva_30d_mm", "mm30d")):
            if col in cab:
                v, varios = maior_dos_valores(g(col))
                multi = multi or varios
                if v is not None:
                    mm[campo] = v
        if not mm:
            mm = mm_do_texto(indice_txt)
        if not mm:
            anomalias.append((ref, f"chuva não identificada no índice: {indice_txt!r}"))
        acion = txt(g("acionaram")).upper().replace("Ã", "A")
        acionaram = True if acion == "SIM" else False if acion == "NAO" else None
        qtd, nomes_sirenes = lista_sirenes(g("sirenes"))
        if acionaram is False and (qtd or 0) > 0:
            anomalias.append((ref, f"'NÃO' acionaram mas quantidade de sirenes = {qtd}"))
        if acionaram is True and not qtd and not nomes_sirenes:
            anomalias.append((ref, "'SIM' acionaram sem quantidade/nomes de sirenes"))
        if acionaram is False and qtd is None:
            qtd = 0
        if not prob_de(g("prob")):
            anomalias.append((ref, f"probabilidade não reconhecida: {txt(g('prob'))!r}"))
        gat_original = txt(g("gatilho"))
        if gatilho_de(g("gatilho")) == "" and gat_original not in ("", "-"):
            anomalias.append((ref, f"gatilho não reconhecido: {gat_original!r}"))
        rec = {
            "numero": numero,
            "municipio": municipio,
            "data": data.isoformat(),
            "hora": hora.strftime("%H:%M"),
            "probabilidade": prob_de(g("prob")) or "Alta",
            "estacao": txt(g("estacao")),
            "indice_alcancado": indice_txt,
            **{k: mm.get(k) for k in ("chuva_1h_mm", "chuva_24h_mm", "chuva_96h_mm", "chuva_30d_mm")},
            "gatilho": gatilho_de(g("gatilho")),
            "estagio_operacional": estagio_de(g("estagio")),
            "acionaram": acionaram,
            "sirenes_qtd": qtd,
            "sirenes_acionadas": nomes_sirenes,
            "responsavel": txt(g("responsavel")),
            "observacao": txt(g("obs")),
            "varios_pluviometros": multi,
        }
        if multi:
            anomalias.append((ref, "mais de um pluviômetro na mesma linha: mm = maiores valores (texto completo preservado)"))
        vistos[numero] += 1
        if numero in recs:
            anomalias.append((ref, "número repetido em outra aba — mantida a primeira ocorrência"))
            return
        recs[numero] = rec

    def cabecalho(ws):
        nomes_col = [txt(c.value).lower() for c in ws[1]]
        mapa = {}
        for i, n in enumerate(nomes_col):
            if n.startswith("n") and "recomenda" in n:
                mapa["numero"] = i
            elif n.startswith("munic"):
                mapa["municipio"] = i
            elif n == "data":
                mapa["data"] = i
            elif n == "hora":
                mapa["hora"] = i
            elif n.startswith("probabilidade"):
                mapa["prob"] = i
            elif n.startswith("esta") and "pluvi" in n:
                mapa["estacao"] = i
            elif n.startswith("índice") or n.startswith("indice"):
                mapa["indice"] = i
            elif n == "mm/1h":
                mapa["mm1h"] = i
            elif n == "mm/24h":
                mapa["mm24h"] = i
            elif n == "mm/96h":
                mapa["mm96h"] = i
            elif n == "30dias":
                mapa["mm30d"] = i
            elif n == "gatilho":
                mapa["gatilho"] = i
            elif n.startswith("estágio") or n.startswith("estagio"):
                mapa["estagio"] = i
            elif n.startswith("acionaram"):
                mapa["acionaram"] = i
            elif n.startswith("sirenes"):
                mapa["sirenes"] = i
            elif n.startswith("respons"):
                mapa["responsavel"] = i
            elif n.startswith("observ"):
                mapa["obs"] = i
        return mapa

    for ws in wb:
        titulo = ws.title
        if titulo.startswith("Acionamento"):
            continue
        cab = cabecalho(ws)
        if "numero" not in cab:
            continue
        # aba 2021_2022: a coluna final chamada OBSERVAÇÃO traz, na verdade, o responsável
        if "2021_2022" in titulo:
            cab["responsavel"] = cab.pop("obs")
        for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
            if "2021_2022" in titulo and not txt(row[cab["numero"]]).endswith("_2021"):
                continue
            adicionar(titulo, cab, row, i)

    # ---- acionamentos pelo município
    ws = aba("acionamento")
    acion = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any(row):
            continue
        municipio = canonico_ou_original(txt(row[0]))
        data, hora = data_de(row[1]), hora_de(row[2])
        ref = f"Acionamento pelo Município (linha {i})"
        if data is None:
            anomalias.append((ref, f"data inválida: {row[1]!r}"))
            continue
        if data.year < 2020:
            anomalias.append((ref, f"data suspeita ({data.isoformat()}) — provável erro de digitação; mantida como está para conferência"))
        if not is_municipio_valido(municipio):
            anomalias.append((ref, f"município fora da lista: {txt(row[0])!r}"))
        qtd = row[6]
        acion.append(
            {
                "municipio": municipio,
                "data": data.isoformat(),
                "hora": hora.strftime("%H:%M") if hora else None,
                "probabilidade": prob_de(row[3]),
                "sirene": "" if txt(row[4]) in ("-", "") else txt(row[4]),
                "tipo_alarme": txt(row[5]).upper().replace("MOBILIZAÇAO", "MOBILIZAÇÃO") or "MOBILIZAÇÃO",
                "quantidade": int(qtd) if isinstance(qtd, (int, float)) else None,
                "responsavel": "" if txt(row[7]) in ("-", "") else txt(row[7]),
                "observacao": txt(row[8]) if len(row) > 8 else "",
            }
        )

    lista = sorted(recs.values(), key=lambda r: (r["data"], r["hora"], r["numero"]))
    SAIDA.write_text(json.dumps({"recomendacoes": lista, "acionamentos_municipio": acion}, ensure_ascii=False, indent=1), encoding="utf-8")

    por_ano = Counter(r["numero"].split("_")[1] for r in lista)
    linhas = [
        "# Relatório da planilha de recomendações (2020–2026)",
        "",
        f"Gerado por `backend/scripts/preparar_recomendacoes_planilha.py` em {datetime.date.today().isoformat()}.",
        "",
        f"* **Recomendações:** {len(lista)} (por ano: " + ", ".join(f"{a}: {n}" for a, n in sorted(por_ano.items())) + ")",
        f"* **Acionamentos pelo município:** {len(acion)}",
        f"* Municípios distintos: {len({r['municipio'] for r in lista})}",
        f"* Validadas (acionaram SIM/NÃO): {sum(r['acionaram'] is not None for r in lista)}; sem informação: {sum(r['acionaram'] is None for r in lista)}",
        "",
        "## Pontos a conferir",
        "",
    ]
    linhas += [f"* `{ref}` — {msg}" for ref, msg in anomalias] or ["* nenhum"]
    RELATORIO.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(f"{len(lista)} recomendações, {len(acion)} acionamentos do município, {len(anomalias)} pontos a conferir")


if __name__ == "__main__":
    main(sys.argv[1])
