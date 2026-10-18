"""Gera frontend/public/mares-AAAA.json a partir das tábuas de maré em PDF da Marinha (CHM/DHN) para os portos do RJ.

Os PDFs são anuais (um por porto) e ficam em assets.marinha.mil.br/.../files/dados_de_mare/ (o site do CHM exige Cloudflare,
mas o servidor assets não). Cada PDF traz, por mês e dia, 3-4 pares HORA/ALTURA (m) em horário local (UTC-3).

Uso (uma vez por ano, em dezembro, quando a Marinha publicar as tábuas do ano seguinte):
    python backend/scripts/gerar_mares_marinha.py 2026
Requer: pip install pymupdf  e o `curl` no PATH (o Python não reconhece a cadeia de certificados do servidor da Marinha;
        o curl usa o repositório do sistema).
Fonte da lista/nomes dos PDFs: https://www.marinha.mil.br/chm/tabuas-de-mare-6 (muda o sufixo a cada ano).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

import pymupdf

BASE = "https://assets.marinha.mil.br/chm/sites/www.marinha.mil.br.chm/files/dados_de_mare/"
# (código no nome do arquivo, nome do arquivo SEM extensão) — conforme a página "Tábuas de Maré 2026" do CHM.
PORTOS_RJ_2026 = [
    (40, "Porto do Rio de Janeiro (Ilha Fiscal)", "40 - PORTO DO RIO DE JANEIRO - I FISCAL - 130 - 132"),
    (41, "Porto de Itaguaí", "41 - PORTO DE ITAGUAÍ - 133 - 135"),
    (43, "Terminal da Ilha Guaíba", "43 - TERMINAL DA ILHA GUAÍBA - 139 - 141"),
    (44, "Porto de Angra dos Reis", "44 - PORTO DE ANGRA DOS REIS - 142 -144"),
    (42, "Porto do Forno (Arraial do Cabo)", "42 - PORTO DO FORNO - 136 - 138"),
    (38, "Porto do Açu (São João da Barra)", "38 - PORTO DO AÇU - 124 - 126"),
    (39, "Terminal Marítimo de Imbetiba (Macaé)", "39 - TERMINAL MARÍTIMO DE IMBETIBA - 127 - 129"),
]
MESES = ["janeiro", "fevereiro", "março", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
NUM_MES = {"janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}
RE_HORA = re.compile(r"^(\d{4})\s+(-?\d+\.\d+)$")
RE_DIA = re.compile(r"^\d{2}$")


def _graus(texto: str):
    """'22� 53'.8 S' → -22.8967 (graus decimais; S e W negativos). O PDF perde o símbolo de grau na extração."""
    nums = re.findall(r"\d+(?:'\.\d+)?", texto)
    if len(nums) < 2:
        return None
    graus = float(nums[0]) + float(nums[1].replace("'.", ".")) / 60.0
    return round(-graus if re.search(r"[SW]", texto) else graus, 4)


def parse_pdf(dados: bytes, ano: int) -> dict:
    doc = pymupdf.open(stream=dados, filetype="pdf")
    linhas = []
    for pagina in doc:
        linhas.extend(l.strip() for l in pagina.get_text().splitlines() if l.strip())
    cabecalho = " ".join(linhas[:12])
    nome = next((l for l in linhas[:12] if "ESTADO" in l.upper() or "(" in l), linhas[0])
    nome = re.sub(r"\s*-\s*\d{4}$", "", nome).strip()
    lat = re.search(r"Latitude\s+(.+)", "\n".join(linhas[:12]))
    lon = re.search(r"Longitude\s+(.+)", "\n".join(linhas[:12]))
    nm = re.search(r"M[ée�]dio\s+(-?\d+\.\d+)\s*m", cabecalho) or re.search(r"(\d+\.\d+)\s*m", cabecalho)
    dias: dict[str, list] = {}
    mes = None
    dia = None
    for l in linhas:
        baixo = l.lower()
        if baixo in NUM_MES:
            mes = NUM_MES[baixo]
            dia = None
            continue
        if mes is None:
            continue
        if RE_DIA.match(l):
            dia = int(l)
            continue
        m = RE_HORA.match(l)
        if m and dia:
            try:
                chave = dt.date(ano, mes, dia).isoformat()
            except ValueError:
                continue
            hh, mm = m.group(1)[:2], m.group(1)[2:]
            dias.setdefault(chave, []).append([f"{hh}:{mm}", float(m.group(2))])
    for k in dias:
        dias[k].sort(key=lambda x: x[0])
    return {"nome": nome, "latitude": _graus(lat.group(1)) if lat else None, "longitude": _graus(lon.group(1)) if lon else None, "nivel_medio": float(nm.group(1)) if nm else None, "dias": dias}


def main(ano: int) -> None:
    portos = []
    for codigo, nome, arquivo in PORTOS_RJ_2026:
        url = BASE + quote(arquivo + ".pdf")
        r = subprocess.run(["curl", "-sf", "-m", "60", "-A", "Mozilla/5.0", url], capture_output=True, check=True)
        p = parse_pdf(r.stdout, ano)
        p["codigo"] = codigo
        p["nome"] = nome
        n = len(p["dias"])
        print(f"{codigo} {nome}: {n} dias, nível médio {p['nivel_medio']}, lat {p['latitude']} lon {p['longitude']}")
        if n < 360:
            print("  AVISO: poucos dias extraídos — conferir o PDF")
        portos.append(p)
    saida = Path(__file__).resolve().parents[2] / "frontend" / "public" / f"mares-{ano}.json"
    saida.write_text(json.dumps({"ano": ano, "fonte": "Marinha do Brasil — CHM/DHN, Tábuas de Maré " + str(ano), "portos": portos}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("gravado", saida, saida.stat().st_size, "bytes")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today().year)
