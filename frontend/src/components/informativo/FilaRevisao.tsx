"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchPendentes, nomeRegiao, Pendente, resolverPendente } from "@/lib/informativo";

/** F24: informativos da planilha de controle que não tinham data utilizável (ficaram fora da importação). Quem sabe a data e a hora completa o informativo aqui. */
export default function FilaRevisao({ onMudou }: { onMudou: () => void }) {
  const [fila, setFila] = useState<Pendente[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const carregar = useCallback(() => fetchPendentes().then((r) => setFila(r.pendentes)).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);
  if (!fila) return erro ? <p className="text-xs text-red-700">{erro}</p> : null;
  if (fila.length === 0 && !ok) return null;
  return (
    <details className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950" open={fila.length > 0}>
      <summary className="cursor-pointer font-semibold">Importação do histórico: {fila.length} informativo(s) sem data (a revisar)</summary>
      <p className="mt-1">A planilha tinha esses informativos sem data legível (erro de célula ou data ambígua). Informe a data e a hora para completar o histórico; nada é adivinhado.</p>
      {ok && <p className="mt-1 font-medium text-emerald-800">{ok}</p>}
      {erro && <p className="mt-1 text-red-700">{erro}</p>}
      <ul className="mt-2 space-y-2">{fila.map((p) => <Linha key={`${p.ano}-${p.numero}`} p={p} onFeito={(m) => { setOk(m); setErro(null); carregar(); onMudou(); }} onErro={setErro} />)}</ul>
    </details>
  );
}

function Linha({ p, onFeito, onErro }: { p: Pendente; onFeito: (m: string) => void; onErro: (m: string) => void }) {
  const [data, setData] = useState("");
  const [hora, setHora] = useState(p.horas[0] ?? "");
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    setOcupado(true);
    try {
      await resolverPendente({ ano: p.ano, numero: p.numero, data, hora });
      onFeito(`Informativo nº ${p.numero}/${p.ano} completado.`);
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Falha ao completar.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <li className="rounded border border-amber-200 bg-white p-2">
      <p><b>Nº {p.numero}/{p.ano}</b>{p.linhas.length ? ` — ${p.linhas.map((l) => nomeRegiao(l.regiao)).join(", ")}` : " — sem regiões na planilha"}{p.datas_texto.length ? ` · valor na planilha: ${p.datas_texto.join(", ")}` : " · sem data na planilha"}</p>
      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1" /></label>
        <label className="flex flex-col gap-0.5">Hora<input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1" /></label>
        <button type="button" disabled={ocupado || !data || !hora} onClick={salvar} className="rounded bg-gray-800 px-3 py-1.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50">Completar</button>
      </div>
    </li>
  );
}
