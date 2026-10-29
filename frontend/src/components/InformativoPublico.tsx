"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL } from "@/lib/api";
import { fmtDataHora } from "@/lib/nivelMonitoramento";

type Publico = { numero: number; ano: number; texto: string; enviado_em: string; vigente_ate: string } | null;

/** Informativo meteorológico vigente (enviado, marcado como público e dentro das 6 h) na página pública; some sozinho quando vence. */
export default function InformativoPublico() {
  const [i, setI] = useState<Publico>(null);
  useEffect(() => {
    const carregar = () =>
      fetch(`${API_BASE_URL}/publico/informativo/`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setI(d?.informativo ?? null))
        .catch(() => undefined);
    carregar();
    const t = setInterval(() => { if (document.visibilityState === "visible") carregar(); }, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!i) return null;
  return (
    <section aria-labelledby="informativo-met">
      <h2 id="informativo-met" className="mb-2 text-sm font-bold text-gray-800">Informativo meteorológico vigente</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <pre className="whitespace-pre-wrap break-words font-sans text-[0.8125rem] leading-relaxed text-gray-800">{i.texto}</pre>
        <p className="mt-2 text-[0.6875rem] text-gray-500">Nº {i.numero}/{i.ano}, enviado em {fmtDataHora(i.enviado_em)}; vale até {fmtDataHora(i.vigente_ate)}.</p>
      </div>
    </section>
  );
}
