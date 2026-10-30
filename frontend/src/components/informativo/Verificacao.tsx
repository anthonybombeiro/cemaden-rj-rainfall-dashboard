"use client";

import { useEffect, useState } from "react";

import { fetchVerificacao, nomeRegiao, Verificacao as Dados } from "@/lib/informativo";
import { fmtDataHora } from "@/lib/nivelMonitoramento";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const COR: Record<string, string> = { acerto: "bg-emerald-100 text-emerald-900", "falso alarme": "bg-amber-100 text-amber-900", perda: "bg-red-100 text-red-900" };

/** F26: o que cada informativo previu (moderada a forte ou mais) × o que as estações mediram nas 6 h seguintes. */
export default function Verificacao() {
  const [dias, setDias] = useState(30);
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetchVerificacao(dias).then((r) => { if (vivo) { setD(r); setErro(null); } }).catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [dias]);
  if (erro) return <p className="text-sm text-red-700">{erro}</p>;
  if (!d) return <p className="text-sm text-gray-500">Calculando (lê as chuvas medidas, pode levar alguns segundos)…</p>;
  const t = d.total;
  return (
    <div className="max-w-4xl space-y-3 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="flex flex-col gap-0.5 text-xs">Período
          <select value={dias} onChange={(e) => { setD(null); setDias(Number(e.target.value)); }} className="rounded border border-gray-300 px-1.5 py-1">
            {[7, 15, 30, 60, 90].map((n) => <option key={n} value={n}>Últimos {n} dias</option>)}
          </select>
        </label>
        <p className="max-w-xl text-xs text-gray-600">{d.criterio}</p>
      </div>
      {d.informativos.length === 0 ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-gray-700">Nenhum informativo com janela de {d.janela_h} h encerrada neste período.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Acertos", t.acertos], ["Falsos alarmes", t.falsos_alarmes], ["Perdas", t.perdas], ["Acertos negativos", t.acertos_negativos]].map(([r, v]) => (
              <div key={r as string} className="rounded-md border border-gray-200 bg-white p-2 text-center"><p className="text-xl font-bold tabular-nums">{v}</p><p className="text-xs text-gray-600">{r}</p></div>
            ))}
          </div>
          <p className="text-xs text-gray-700">
            Detecção (POD): <b>{pct(t.pod)}</b> · Falsos alarmes (FAR): <b>{pct(t.far)}</b> · Índice de sucesso (CSI): <b>{pct(t.csi)}</b> · Viés: <b>{t.vies ?? "—"}</b> · Acurácia: <b>{pct(t.acuracia)}</b>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-xs">
              <thead className="border-b text-gray-500"><tr><th className="py-1.5 pr-2">Nº</th><th className="pr-2">Emitido</th><th className="pr-2">Resultado por região (só onde previu ou ocorreu)</th></tr></thead>
              <tbody>
                {d.informativos.map((i) => (
                  <tr key={`${i.ano}-${i.numero}`} className="border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-2 font-medium">{i.numero}/{i.ano}</td>
                    <td className="pr-2 whitespace-nowrap">{fmtDataHora(i.emitido_em)}</td>
                    <td className="space-x-1 space-y-1 pr-2">
                      {i.regioes.length === 0 ? <span className="text-gray-500">sem eventos previstos nem medidos</span> : i.regioes.map((r) => (
                        <span key={r.regiao} className={`inline-block rounded px-1.5 py-0.5 ${COR[r.resultado] ?? "bg-gray-100"}`} title={r.estacao ? `${r.estacao}: ${r.max_1h_mm} mm/h` : "sem chuva medida"}>{nomeRegiao(r.regiao)}: {r.resultado}{r.max_1h_mm !== null ? ` (${r.max_1h_mm} mm/h)` : ""}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[11px] text-gray-500">{d.observacao}</p>
    </div>
  );
}
