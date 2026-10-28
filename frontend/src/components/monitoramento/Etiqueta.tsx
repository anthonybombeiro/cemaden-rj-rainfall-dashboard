import { corTextoSobre, ESCALA_NM } from "@/lib/nivelMonitoramento";

/** Selo colorido do Nível de Monitoramento (NM 0–5), usado nas tabelas do painel. */
export default function Etiqueta({ n }: { n: number }) {
  const e = ESCALA_NM[n];
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold leading-none" style={{ background: e.cor, color: corTextoSobre(e.cor) }}>
      {e.sigla}
    </span>
  );
}
