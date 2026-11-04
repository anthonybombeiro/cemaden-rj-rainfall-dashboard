/** Relatório dos sistemas atuantes (04/11/2026). Rota `/api/sistemas-atuantes/relatorio/`; regras em backend/core/sistemas_relatorio.py. */
import { getJson } from "@/lib/api";

export type SistemaResumo = {
  id: string; rotulo: string; cor: string; dias: number; pct: number; como_principal: number;
  maior_sequencia: { dias: number; inicio: string | null; fim: string | null };
};
export type RelatorioSistemas = {
  ano: number; mes: number | null; inicio: string; fim: string; dias_no_periodo: number; dias_com_registro: number;
  dias_com_mais_de_um_sistema: number; dias_em_branco: string[]; sistemas: SistemaResumo[];
  outros_texto_livre: { texto: string; dias: number }[];
  analitico: { data: string; sistemas: string[]; outro: string }[];
  meses: { mes: number; dias: number; registrados: number; contagens: Record<string, number> }[];
  catalogo: { id: string; rotulo: string; cor: string }[];
};

export const fetchRelatorioSistemas = (ano: number, mes?: number) => getJson<RelatorioSistemas>(`/sistemas-atuantes/relatorio/?ano=${ano}${mes ? `&mes=${mes}` : ""}`);

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const dataBrCurta = (iso: string) => iso.split("-").reverse().join("/");

/** Agrupa datas consecutivas em faixas ("01/04 a 03/04, 07/04") para listar os dias em branco. */
export function faixasDeDatas(isos: string[]): string {
  const dias = [...isos].sort();
  const faixas: string[] = [];
  let i = 0;
  while (i < dias.length) {
    let j = i;
    while (j + 1 < dias.length && (new Date(dias[j + 1]).getTime() - new Date(dias[j]).getTime()) / 864e5 === 1) j++;
    const a = dataBrCurta(dias[i]).slice(0, 5);
    faixas.push(i === j ? a : `${a} a ${dataBrCurta(dias[j]).slice(0, 5)}`);
    i = j + 1;
  }
  return faixas.join(", ");
}

export const tituloPeriodo = (r: RelatorioSistemas) => (r.mes ? `${MESES[r.mes - 1]} de ${r.ano}` : `ano de ${r.ano}`);

/** Texto (Markdown) do relatório, para copiar ou baixar. `sintetico` = só as tabelas de resumo; senão acrescenta o dia a dia. */
export function textoRelatorio(r: RelatorioSistemas, sintetico: boolean): string {
  const rot = (id: string) => r.catalogo.find((c) => c.id === id)?.rotulo ?? id;
  const L: string[] = [`# Sistemas atuantes — ${tituloPeriodo(r)} (${sintetico ? "sintético" : "analítico"})`, ""];
  L.push(`Período: ${dataBrCurta(r.inicio)} a ${dataBrCurta(r.fim)} · ${r.dias_no_periodo} dias · ${r.dias_com_registro} com registro · ${r.dias_com_mais_de_um_sistema} com mais de um sistema.`, "");
  L.push("| Sistema | Dias | % dos dias com registro | Como principal | Maior sequência |", "|---|---:|---:|---:|---|");
  for (const s of [...r.sistemas].sort((a, b) => b.dias - a.dias).filter((s) => s.dias > 0)) {
    const q = s.maior_sequencia;
    L.push(`| ${s.rotulo} | ${s.dias} | ${String(s.pct).replace(".", ",")} % | ${s.como_principal} | ${q.dias} dia(s)${q.inicio ? ` (${dataBrCurta(q.inicio).slice(0, 5)} a ${dataBrCurta(q.fim!).slice(0, 5)})` : ""} |`);
  }
  L.push("", "Um dia com mais de um sistema conta para todos eles; os percentuais podem somar mais de 100 %.");
  if (r.outros_texto_livre.length) L.push("", "Texto livre: " + r.outros_texto_livre.map((o) => `${o.texto} (${o.dias})`).join("; ") + ".");
  if (!r.mes) {
    L.push("", "## Dias por mês", "", `| Mês | ${r.catalogo.map((c) => c.rotulo).join(" | ")} |`, `|---|${r.catalogo.map(() => "---:").join("|")}|`);
    for (const m of r.meses.filter((m) => m.dias > 0)) L.push(`| ${MESES[m.mes - 1]} | ${r.catalogo.map((c) => m.contagens[c.id] ?? 0).join(" | ")} |`);
  }
  if (!sintetico) {
    L.push("", "## Dia a dia", "");
    for (const d of r.analitico) L.push(`- ${dataBrCurta(d.data)}: ${[...d.sistemas.map(rot), d.outro].filter(Boolean).join(" + ")}`);
  }
  L.push("", r.dias_em_branco.length ? `**Dias em branco (${r.dias_em_branco.length}, fora dos cálculos):** ${faixasDeDatas(r.dias_em_branco)}.` : "Não há dias em branco no período.");
  return L.join("\n");
}
