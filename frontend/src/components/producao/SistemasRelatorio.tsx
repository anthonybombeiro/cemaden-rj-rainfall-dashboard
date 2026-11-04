"use client";

import { Copy, Download, FileSpreadsheet, FileText, Image as ImageIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { baixarArquivo, exportarPng, exportarXlsx } from "@/lib/exportacao";
import { dataBrCurta, faixasDeDatas, fetchRelatorioSistemas, MESES, RelatorioSistemas, textoRelatorio, tituloPeriodo } from "@/lib/sistemasRelatorio";

/** Produção → Meteorologia → Sistemas atuantes: relatório mensal ou anual, sintético ou analítico, com texto copiável e exportação MD/XLSX/PNG. */
export default function SistemasRelatorio() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState<number | undefined>(hoje.getMonth() + 1);
  const [analitico, setAnalitico] = useState(false);
  const [r, setR] = useState<RelatorioSistemas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const alvo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    setR(null);
    fetchRelatorioSistemas(ano, mes).then((d) => vivo && (setR(d), setErro(null))).catch((e) => vivo && setErro(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => { vivo = false; };
  }, [ano, mes]);

  const texto = useMemo(() => (r ? textoRelatorio(r, !analitico) : ""), [r, analitico]);
  const ordenados = useMemo(() => (r ? [...r.sistemas].sort((a, b) => b.dias - a.dias).filter((s) => s.dias > 0) : []), [r]);
  const maxDias = Math.max(1, ...ordenados.map((s) => s.dias));
  const nome = r ? `sistemas-atuantes-${r.ano}${r.mes ? `-${String(r.mes).padStart(2, "0")}` : ""}-${analitico ? "analitico" : "sintetico"}` : "sistemas-atuantes";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Texto copiado.");
    } catch {
      setAviso("Não foi possível copiar.");
    }
    setTimeout(() => setAviso(""), 2500);
  };
  const xlsx = () => {
    if (!r) return;
    const rot = (id: string) => r.catalogo.find((c) => c.id === id)?.rotulo ?? id;
    void exportarXlsx(`${nome}.xlsx`, [
      { nome: "Sintético", larguras: [28, 8, 12, 14, 34], linhas: [["Sistema", "Dias", "% dos dias com registro", "Como principal", "Maior sequência"], ...ordenados.map((s) => [s.rotulo, s.dias, s.pct, s.como_principal, s.maior_sequencia.dias ? `${s.maior_sequencia.dias} dia(s): ${dataBrCurta(s.maior_sequencia.inicio!)} a ${dataBrCurta(s.maior_sequencia.fim!)}` : ""])] },
      { nome: "Dia a dia", larguras: [12, 60], linhas: [["Data", "Sistemas"], ...r.analitico.map((d) => [dataBrCurta(d.data), [...d.sistemas.map(rot), d.outro].filter(Boolean).join(" + ")])] },
      ...(r.mes ? [] : [{ nome: "Mês x sistema", linhas: [["Mês", ...r.catalogo.map((c) => c.rotulo)], ...r.meses.filter((m) => m.dias > 0).map((m) => [MESES[m.mes - 1], ...r.catalogo.map((c) => m.contagens[c.id] ?? 0)])] }]),
      { nome: "Dias em branco", linhas: [["Data"], ...r.dias_em_branco.map((d) => [dataBrCurta(d)])] },
    ]);
  };

  const sel = "rounded border border-gray-300 bg-white px-2 py-1 text-sm";
  return (
    <div className="mx-auto max-w-5xl space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select value={mes ?? 0} onChange={(e) => setMes(Number(e.target.value) || undefined)} className={sel} aria-label="Mês">
          <option value={0}>Ano inteiro</option>
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value) || ano)} className={`${sel} w-20`} aria-label="Ano" />
        <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={analitico} onChange={(e) => setAnalitico(e.target.checked)} /> Analítico (dia a dia)</label>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50"><Copy size={13} /> Copiar texto</button>
          <button type="button" onClick={() => baixarArquivo(`${nome}.md`, texto, "text/markdown;charset=utf-8")} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50"><FileText size={13} /> MD</button>
          <button type="button" onClick={xlsx} disabled={!r} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50"><FileSpreadsheet size={13} /> XLSX</button>
          <button type="button" onClick={() => alvo.current && void exportarPng(alvo.current, `${nome}.png`)} disabled={!r} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50"><ImageIcon size={13} /> PNG</button>
        </span>
      </div>
      {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {!r && !erro && <p className="text-xs text-gray-500">Carregando…</p>}
      {r && (
        <div ref={alvo} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <div>
            <h3 className="text-base font-semibold capitalize">Sistemas atuantes — {tituloPeriodo(r)}</h3>
            <p className="text-xs text-gray-600">{dataBrCurta(r.inicio)} a {dataBrCurta(r.fim)} · {r.dias_no_periodo} dias · {r.dias_com_registro} com registro · {r.dias_com_mais_de_um_sistema} com mais de um sistema</p>
          </div>
          {ordenados.length === 0 ? <p className="text-xs text-gray-500">Sem registros no período.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-gray-500"><tr><th className="py-1">Sistema</th><th className="w-1/3">Dias</th><th className="text-right">%</th><th className="text-right">Principal</th><th>Maior sequência</th></tr></thead>
                <tbody>
                  {ordenados.map((s) => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="py-1 font-medium"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: s.cor }} />{s.rotulo}</td>
                      <td><div className="flex items-center gap-2"><div className="h-2.5 rounded" style={{ width: `${(100 * s.dias) / maxDias}%`, background: s.cor }} /><span>{s.dias}</span></div></td>
                      <td className="text-right">{String(s.pct).replace(".", ",")} %</td>
                      <td className="text-right">{s.como_principal}</td>
                      <td>{s.maior_sequencia.dias} dia(s){s.maior_sequencia.inicio ? ` (${dataBrCurta(s.maior_sequencia.inicio).slice(0, 5)} a ${dataBrCurta(s.maior_sequencia.fim!).slice(0, 5)})` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-gray-500">Um dia com mais de um sistema conta para todos eles, então os percentuais podem somar mais de 100 %. Dias em branco ficam fora dos cálculos e interrompem as sequências.</p>
          {r.outros_texto_livre.length > 0 && <p className="text-xs"><b>Texto livre:</b> {r.outros_texto_livre.map((o) => `${o.texto} (${o.dias})`).join("; ")}.</p>}
          {!r.mes && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-500"><tr><th className="py-1 text-left">Mês</th>{r.catalogo.map((c) => <th key={c.id} className="px-1 text-right"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: c.cor }} />{c.rotulo}</th>)}</tr></thead>
                <tbody>
                  {r.meses.filter((m) => m.dias > 0).map((m) => (
                    <tr key={m.mes} className="border-t border-gray-100"><td className="py-1 capitalize">{MESES[m.mes - 1]}</td>{r.catalogo.map((c) => <td key={c.id} className="px-1 text-right">{m.contagens[c.id] ?? 0}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {analitico && (
            <div className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
              {r.analitico.map((d) => (
                <div key={d.data} className="flex gap-2 border-t border-gray-50 py-0.5"><span className="w-12 shrink-0 text-gray-500">{dataBrCurta(d.data).slice(0, 5)}</span>
                  <span className="flex flex-wrap gap-1">{d.sistemas.map((id) => { const c = r.catalogo.find((x) => x.id === id); return <span key={id} className="rounded px-1.5" style={{ background: `${c?.cor}66` }}>{c?.rotulo ?? id}</span>; })}{d.outro && <span className="rounded bg-gray-100 px-1.5">{d.outro}</span>}</span></div>
              ))}
            </div>
          )}
          <p className={`text-xs ${r.dias_em_branco.length ? "text-amber-700" : "text-emerald-700"}`}>
            {r.dias_em_branco.length ? <><b>Dias em branco ({r.dias_em_branco.length}):</b> {faixasDeDatas(r.dias_em_branco)}.</> : "Não há dias em branco no período."}
          </p>
        </div>
      )}
      <p className="text-[11px] text-gray-400"><Download size={11} className="mr-1 inline" />As exportações usam exatamente os números mostrados acima.</p>
    </div>
  );
}
