"use client";

import { ESTILO_SEVERIDADE } from "@/lib/floodhub";

/** Etiqueta colorida da severidade do Flood Hub (Sem cheia / Acima do normal / Severo / Extremo). */
export function ChipSeveridade({ sev }: { sev: string | null | undefined }) {
  if (!sev) return <span className="text-gray-400">—</span>;
  const e = ESTILO_SEVERIDADE[sev] ?? ESTILO_SEVERIDADE.UNKNOWN;
  return (
    <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: e.bg, color: e.text }}>
      {e.rotulo}
    </span>
  );
}
