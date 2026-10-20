"use client";

import dynamic from "next/dynamic";
import { Columns2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Carta, fetchCartas } from "@/lib/cartasSinoticas";
import { AnaliseSinotica, fetchAnalises } from "@/lib/inmet";
import { useMedia } from "@/lib/useMedia";

// Leaflet precisa de `window` — sem SSR.
const PainelCarta = dynamic(() => import("@/components/PainelCarta"), {
  ssr: false,
  loading: () => <div className="flex h-80 flex-1 items-center justify-center text-sm text-gray-400">Carregando mapa…</div>,
});

/** Sub-aba "Cartas sinóticas": 1 painel, ou 2 lado a lado (PC) com fonte e carta independentes em cada um
 * (Marinha × INMET, Marinha × Marinha em horários diferentes, INMET × INMET). */
export default function CartasSinoticasPanel() {
  const [cartas, setCartas] = useState<Carta[]>([]);
  const [analises, setAnalises] = useState<AnaliseSinotica[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparar, setComparar] = useState(false);
  const grande = useMedia("(min-width: 1024px)");

  useEffect(() => {
    let cancelado = false;
    Promise.allSettled([fetchCartas(), fetchAnalises()]).then(([c, a]) => {
      if (cancelado) return;
      if (c.status === "fulfilled") setCartas(c.value);
      if (a.status === "fulfilled") setAnalises(a.value);
      if (c.status === "rejected" && a.status === "rejected") setErro("Cartas sinóticas indisponíveis no momento (Marinha e INMET).");
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const dois = comparar && grande;
  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-gray-50 p-2 sm:p-3">
      <div className="mb-1 flex shrink-0 flex-wrap items-center gap-2">
        <h2 className="text-sm text-gray-800">
          <span className="font-bold">Cartas sinóticas</span>
          <span className="text-xs text-gray-500"> · MB/SMM/CHM e INMET (00Z e 12Z)</span>
        </h2>
        <button
          type="button"
          onClick={() => setComparar((c) => !c)}
          className={`hidden items-center gap-1 rounded px-2.5 py-1 text-sm font-medium lg:flex ${comparar ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          title="Comparar duas cartas lado a lado"
        >
          <Columns2 size={15} />
          Comparar 2
        </button>
      </div>
      {erro && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
      {loading ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : (
        <div className={`grid min-h-0 flex-1 gap-2 ${dois ? "grid-cols-2" : "grid-cols-1"}`}>
          <div className="flex min-h-[28rem] min-w-0">
            <PainelCarta id="A" cartas={cartas} analises={analises} fonteInicial={cartas.length ? "marinha" : "inmet"} />
          </div>
          {dois && (
            <div className="flex min-h-[28rem] min-w-0">
              <PainelCarta id="B" cartas={cartas} analises={analises} fonteInicial={analises.length ? "inmet" : "marinha"} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
