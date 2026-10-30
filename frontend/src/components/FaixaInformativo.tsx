"use client";

import { useEffect, useState } from "react";

import { Acompanhamento, fetchAcompanhamento, nomeRegiao } from "@/lib/informativo";
import { intervaloVisivel } from "@/lib/intervaloVisivel";
import { fmtDataHora } from "@/lib/nivelMonitoramento";

const COR: Record<number, string> = { 0: "bg-gray-100 text-gray-800 border-gray-300", 1: "bg-sky-100 text-sky-900 border-sky-300", 2: "bg-sky-100 text-sky-900 border-sky-300", 3: "bg-yellow-100 text-yellow-900 border-yellow-300", 4: "bg-orange-200 text-orange-950 border-orange-400", 5: "bg-orange-200 text-orange-950 border-orange-400" };

/** F19: faixa do informativo vigente no topo do painel (número, hora, validade e regiões, com a cor da maior intensidade) e o aviso de "emitir" do plantão.
 * Só aparece com informativo vigente ou aviso de emissão; some sozinha ao fim das 6 h. */
export default function FaixaInformativo() {
  const [a, setA] = useState<Acompanhamento | null>(null);
  useEffect(() => {
    let vivo = true;
    const consultar = () => fetchAcompanhamento().then((r) => { if (vivo) setA(r); }).catch(() => undefined);
    consultar();
    const parar = intervaloVisivel(consultar, 120_000);
    return () => { vivo = false; parar(); };
  }, []);
  if (!a) return null;
  const v = a.vigente;
  const aviso = a.emitir?.emitir ? a.emitir : null;
  if (!v && !aviso) return null;
  const g = v ? Math.min(5, v.maior_gravidade >= 8 ? 5 : v.maior_gravidade >= 5 ? 4 : v.maior_gravidade) : 0;
  return (
    <div className="space-y-1 text-xs">
      {v && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border px-3 py-1.5 ${COR[g]}`}>
          <b>Informativo nº {v.numero}/{v.ano}</b>
          <span>enviado {v.enviado_em ? fmtDataHora(v.enviado_em) : ""}</span>
          <span>válido até {v.vigente_ate ? fmtDataHora(v.vigente_ate) : "—"}</span>
          <span className="min-w-0 truncate">{v.regioes.map(nomeRegiao).join(", ") || "sem regiões"}</span>
          {v.radar_atrasado && <b className="text-red-700">radar atrasado</b>}
        </div>
      )}
      {aviso && (
        <div className={`rounded border px-3 py-1.5 font-semibold ${aviso.urgencia === "alta" ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
          {aviso.urgencia === "alta" ? "Emitir informativo agora: " : "Considere emitir informativo: "}{aviso.motivo}
        </div>
      )}
    </div>
  );
}
