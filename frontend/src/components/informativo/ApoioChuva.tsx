"use client";

import { useCallback, useEffect, useState } from "react";

import { Apoio, fetchApoio, ItemRegiao, nomeRegiao, REGIOES_ORDEM } from "@/lib/informativo";

const COR_CLASSE: Record<string, string> = { fraca: "bg-sky-100 text-sky-900", moderada: "bg-yellow-100 text-yellow-900", forte: "bg-orange-200 text-orange-950", muito_forte: "bg-red-200 text-red-950" };

/** Apoio ao compositor (F9, F10, F12): o que as estações e a previsão do dia sugerem para a matriz. Só preenche campos vazios; o técnico confirma cada região. */
export default function ApoioChuva({ itens, desabilitado, onAplicar }: { itens: ItemRegiao[]; desabilitado: boolean; onAplicar: (novos: ItemRegiao[], resumo: string) => void }) {
  const [a, setA] = useState<Apoio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => fetchApoio().then((d) => { setA(d); setErro(null); }).catch((e) => setErro(e.message)), []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 120_000);
    return () => clearInterval(t);
  }, [carregar]);

  const preencher = () => {
    if (!a) return;
    let n = 0;
    const novos = itens.map((i) => {
      const s = a.sugestao.find((x) => x.regiao === i.regiao);
      if (!s) return i;
      const f = { ...i };
      if (!f.chuva_atual && s.chuva_atual) { f.chuva_atual = s.chuva_atual; n++; }
      if (!f.chuva_prevista && s.chuva_prevista) { f.chuva_prevista = s.chuva_prevista; f.raios = f.raios || s.raios; n++; }
      return f;
    });
    onAplicar(novos, n ? `${n} campo(s) preenchidos pela sugestão. Confira cada região antes de enviar.` : "Nada a preencher: os campos sugeridos já estão preenchidos.");
  };
  const copiarUltimo = () => {
    if (!a?.ultimo) return;
    const ult = a.ultimo;
    onAplicar(REGIOES_ORDEM.map((r) => { const x = ult.itens.find((i) => i.regiao === r); return x ? { ...x, sms_enviado: false } : itens.find((i) => i.regiao === r)!; }), `Matriz copiada do informativo nº ${ult.numero}/${ult.ano}. Ajuste o que mudou.`);
  };

  if (erro) return <p className="text-xs text-red-700">Apoio indisponível: {erro}</p>;
  if (!a) return <p className="text-xs text-gray-500">Consultando estações e previsão…</p>;
  const regioes = Object.entries(a.chuva_atual).sort((x, y) => y[1].max_1h_mm - x[1].max_1h_mm);
  return (
    <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b>Sugestão pelas estações e pela previsão do dia</b>
        <span className="flex flex-wrap gap-1.5">
          <button type="button" disabled={desabilitado || a.sugestao.length === 0} onClick={preencher} className="rounded bg-sky-800 px-2.5 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-50">Preencher a matriz</button>
          <button type="button" disabled={desabilitado || !a.ultimo} onClick={copiarUltimo} className="rounded border border-sky-300 bg-white px-2.5 py-1.5 font-medium hover:bg-sky-100 disabled:opacity-50">Copiar o último{a.ultimo ? ` (nº ${a.ultimo.numero})` : ""}</button>
        </span>
      </div>
      {regioes.length === 0 ? (
        <p>Nenhuma estação com chuva nos últimos 90 min.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {regioes.map(([r, c]) => (
            <span key={r} className={`rounded px-2 py-1 ${COR_CLASSE[c.classe]}`} title={`${c.estacao} (${c.municipio})`}>{nomeRegiao(r)}: <b>{c.rotulo}</b> {c.max_1h_mm} mm/h</span>
          ))}
        </div>
      )}
      {a.descobertas.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 p-1.5 font-medium text-amber-900">
          Fora do informativo vigente: {a.descobertas.map((d) => `${nomeRegiao(d.regiao)} (${d.rotulo.toLowerCase()}, ${d.max_1h_mm} mm/h em ${d.municipio})`).join("; ")}.
        </p>
      )}
      {a.sugestao.length > 0 && (
        <details>
          <summary className="cursor-pointer">Por que sugeriu isso ({a.sugestao.length} região(ões))</summary>
          <ul className="mt-1 space-y-0.5">{a.sugestao.map((s) => <li key={s.regiao}><b>{nomeRegiao(s.regiao)}</b>: {s.motivos.join(" · ")}</li>)}</ul>
        </details>
      )}
      <p className="text-[11px] text-sky-800">{a.aviso}</p>
    </div>
  );
}
