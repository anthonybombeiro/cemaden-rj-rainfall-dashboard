"""Importação do histórico de informativos meteorológicos (planilha de controle 2020-2026).

Três etapas, separadas para que o servidor (sem openpyxl nem shell) só precise da última:
  1. `ler_planilha(wb)`  — lê a planilha e devolve os informativos agrupados por (ano, número) + as linhas para revisão;
  2. `para_json` / `de_json` — o resultado vai para `core/data/informativos_planilha.json` (gerado localmente);
  3. `gravar(grupos)` — grava no banco (repetível: (ano, número) que já existe não é tocado).

Regra de ouro: nunca adivinhar. Uma data em texto ambígua (ex.: 04/10/2022) só é aceita quando a numeração prova qual é: os informativos
são numerados em ordem cronológica, então vale a única leitura que fica entre a data do informativo anterior e a do seguinte."""

from __future__ import annotations

import datetime as dt
import json
import re
from collections import defaultdict
from pathlib import Path

from django.db import transaction
from django.utils import timezone

from core import informativos as inf
from core.models import InformativoMeteorologico, InformativoRegiao

ARQUIVO = Path(__file__).resolve().parent / "data" / "informativos_planilha.json"
COLUNAS = {"numero": 1, "ano": 2, "data": 3, "hora": 4, "regiao": 5, "chuva": 6, "vento": 7, "sms": 8}  # índices (base 0) da planilha
VENTO = {"fraco": "", "moderado": "moderado", "forte": "forte"}


def _sms(valor) -> bool:
    return str(valor or "").strip().upper().replace("Ã", "A") == "SIM"


def _data(valor) -> dt.date | None:
    """Data da célula: datetime válido, ou texto sem ambiguidade (m/d/aaaa quando o 2º número passa de 12; d/m/aaaa quando o 1º passa de 12).
    Texto ambíguo (ex.: 04/10/2022) NÃO é adivinhado aqui — ver `_candidatas` e a resolução pela numeração."""
    if isinstance(valor, dt.datetime):
        return valor.date() if 2019 < valor.year < 2100 else None
    partes = str(valor or "").strip().replace("-", "/").split("/")
    try:
        a, b, ano = (int(x) for x in partes)
    except ValueError:
        return None
    try:
        if a > 12 >= b:
            return dt.date(ano, b, a)
        if b > 12 >= a:
            return dt.date(ano, a, b)
    except ValueError:
        return None
    return None


def _candidatas(valor) -> list[dt.date]:
    """Leituras possíveis de uma data em texto ambígua: d/m/aaaa e m/d/aaaa (ou ddmm/aaaa, formato digitado sem a barra)."""
    texto = str(valor or "").strip().replace("-", "/")
    m = re.fullmatch(r"(\d{2})(\d{2})/(\d{4})", texto)
    if m:
        a, b, ano = int(m[1]), int(m[2]), int(m[3])
    else:
        try:
            a, b, ano = (int(x) for x in texto.split("/"))
        except ValueError:
            return []
    out = []
    for dia, mes in ((a, b), (b, a)):
        try:
            d = dt.date(ano, mes, dia)
        except ValueError:
            continue
        if d not in out and 2019 < d.year < 2100:
            out.append(d)
    return out


def _hora(valor) -> dt.time | None:
    if isinstance(valor, dt.datetime):
        return valor.time()
    if isinstance(valor, dt.time):
        return valor
    try:
        h, m = str(valor).strip().split(":")[:2]
        return dt.time(int(h), int(m))
    except (ValueError, TypeError):
        return None


def _numero(valor) -> int:
    """Número do informativo; aceita o asterisco que a equipe põe para marcar reenvio/correção (ex.: `125*`). Qualquer outra coisa levanta ValueError."""
    return int(float(str(valor).strip().rstrip("*")))


def ler_planilha(wb, anos: list[int] | None = None) -> tuple[dict, list[list]]:
    """Devolve (grupos, revisao). `grupos[(ano, número)] = {"quando": datetime|None, "linhas": [...], "amb": [(texto, hora)]}`."""
    grupos: dict[tuple[int, int], dict] = defaultdict(lambda: {"quando": None, "linhas": [], "amb": []})
    revisao: list[list] = []
    for ws in wb.worksheets:
        if not ws.title.strip().isdigit():
            continue
        if anos and int(ws.title) not in anos:
            continue
        for n, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
            c = {k: (row[i] if i < len(row) else None) for k, i in COLUNAS.items()}
            if c["numero"] in (None, "") or not c["regiao"]:
                continue
            try:
                numero, ano = _numero(c["numero"]), int(float(c["ano"]))
            except (TypeError, ValueError):
                revisao.append([ws.title, n, "número/ano ilegíveis", c["numero"], c["ano"]])
                continue
            data, hora = _data(c["data"]), _hora(c["hora"])
            g = grupos[(ano, numero)]
            if data is None:
                g["amb"].append((str(c["data"]), hora, ws.title, n))
            elif g["quando"] is None and hora:
                g["quando"] = timezone.make_aware(dt.datetime.combine(data, hora))
            regioes = inf.normalizar_regiao(str(c["regiao"]))
            if str(c["chuva"] or "").strip() in ("-", "–"):
                c["chuva"] = ""  # traço = sem chuva significativa nessa REDEC
            intensidade = inf.normalizar_intensidade(str(c["chuva"] or ""))
            if not regioes:
                revisao.append([ws.title, n, "REDEC não reconhecida", numero, c["regiao"]])
                continue
            if str(c["chuva"] or "").strip() and not intensidade:
                revisao.append([ws.title, n, "intensidade não reconhecida", numero, c["chuva"]])
                continue
            vento = VENTO.get(str(c["vento"] or "").strip().lower().split("/")[-1], "")
            for r in regioes:
                g["linhas"].append({"regiao": r, "chuva_prevista": intensidade, "vento_previsto": vento, "sms_enviado": _sms(c["sms"])})
    revisao.extend(_resolver_pela_numeracao(grupos))
    for chave in [k for k, g in grupos.items() if g["quando"] is None]:
        g = grupos.pop(chave)
        revisao.append([str(chave[0]), "", "informativo sem data utilizável (não importado)", chave[1], ""])
        revisao.extend([aba, linha, "data ilegível ou ambígua", chave[1], texto] for texto, _h, aba, linha in g["amb"])
    return dict(grupos), revisao


def _resolver_pela_numeracao(grupos: dict) -> list[list]:
    """Para cada informativo sem data clara, aceita a única leitura que cabe entre o informativo anterior e o seguinte do mesmo ano.
    Devolve as linhas do relatório com o que foi resolvido (aviso, não erro) para o usuário conferir."""
    avisos: list[list] = []
    por_ano: dict[int, list[int]] = defaultdict(list)
    for ano, numero in grupos:
        por_ano[ano].append(numero)
    for (ano, numero), g in sorted(grupos.items()):
        if g["quando"] is not None or not g["amb"]:
            continue
        anteriores = [grupos[(ano, k)]["quando"] for k in sorted(por_ano[ano]) if k < numero and grupos[(ano, k)]["quando"]]
        seguintes = [grupos[(ano, k)]["quando"] for k in sorted(por_ano[ano]) if k > numero and grupos[(ano, k)]["quando"]]
        piso = anteriores[-1].date() if anteriores else None
        teto = seguintes[0].date() if seguintes else None
        for texto, hora, aba, linha in g["amb"]:
            if not hora:
                continue
            validas = [d for d in _candidatas(texto) if (piso is None or d >= piso) and (teto is None or d <= teto)]
            if len(validas) == 1:
                g["quando"] = timezone.make_aware(dt.datetime.combine(validas[0], hora))
                avisos.append([aba, linha, f"data resolvida pela numeração (confira): {texto} → {validas[0].strftime('%d/%m/%Y')}", numero, texto])
                break
    return avisos


def gravar(grupos: dict) -> dict:
    """Grava os informativos que ainda não existem. Devolve contagens."""
    existentes = set(InformativoMeteorologico.objects.values_list("ano", "numero"))
    novos = {k: v for k, v in grupos.items() if k not in existentes}
    with transaction.atomic():
        for (ano, numero), g in sorted(novos.items()):
            i = InformativoMeteorologico.objects.create(
                numero=numero, ano=ano, estado="enviado", emitido_em=g["quando"], enviado_em=g["quando"], enviado_por="Importado da planilha",
                criado_por="Importado da planilha", importado=True, texto_livre=True,
                observacao="Importado da planilha de controle: só previsão e SMS por REDEC (o texto original não consta na planilha).",
            )
            vistos = {}
            for linha in g["linhas"]:
                vistos[linha["regiao"]] = linha  # a última linha da REDEC prevalece
            InformativoRegiao.objects.bulk_create([InformativoRegiao(informativo=i, **linha) for linha in vistos.values()])
    return {"na_planilha": len(grupos), "ja_existiam": len(grupos) - len(novos), "importados": len(novos)}


def para_json(grupos: dict, revisao: list[list]) -> str:
    itens = [{"ano": a, "numero": n, "quando": g["quando"].isoformat(), "linhas": g["linhas"]} for (a, n), g in sorted(grupos.items())]
    return json.dumps({"informativos": itens, "revisao": revisao}, ensure_ascii=False)


def de_json(texto: str) -> tuple[dict, list[list]]:
    d = json.loads(texto)
    grupos = {(i["ano"], i["numero"]): {"quando": dt.datetime.fromisoformat(i["quando"]), "linhas": i["linhas"], "amb": []} for i in d["informativos"]}
    return grupos, d["revisao"]


def importar_do_arquivo(dry_run: bool = False) -> dict:
    """Usado pelo endpoint de administração: lê `core/data/informativos_planilha.json` e grava."""
    grupos, revisao = de_json(ARQUIVO.read_text(encoding="utf-8"))
    existentes = set(InformativoMeteorologico.objects.values_list("ano", "numero"))
    if dry_run:
        return {"dry_run": True, "na_planilha": len(grupos), "ja_existiam": len(set(grupos) & existentes), "a_importar": len(set(grupos) - existentes), "revisao": len(revisao)}
    return {"dry_run": False, **gravar(grupos), "revisao": len(revisao)}
