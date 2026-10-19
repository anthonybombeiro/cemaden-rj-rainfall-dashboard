"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import AnaliseSinoticaInmet from "@/components/AnaliseSinoticaInmet";
import { Carta, fetchCartas } from "@/lib/cartasSinoticas";

// Leaflet precisa de `window` — sem SSR.
const CartasSinoticasMapa = dynamic(() => import("@/components/CartasSinoticasMapa"), {
  ssr: false,
  loading: () => <div className="flex h-80 items-center justify-center text-sm text-gray-400">Carregando mapa…</div>,
});

/** Sub-aba "Cartas sinóticas" (Meteorologia): carta da Marinha embutida no mapa, com animação das 7 últimas e comparação de 2 cartas. */
export default function CartasSinoticasPanel() {
  const [cartas, setCartas] = useState<Carta[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fonte, setFonte] = useState<"marinha" | "inmet">("marinha");

  useEffect(() => {
    let cancelado = false;
    fetchCartas()
      .then((c) => {
        if (!cancelado) setCartas(c);
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro ao carregar as cartas sinóticas.");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-gray-50 p-2 sm:p-3">
      <div className="mb-1 flex shrink-0 flex-wrap items-center gap-2">
        <h2 className="text-sm text-gray-800">
          <span className="font-bold">Cartas sinóticas</span>
          <span className="text-xs text-gray-500"> · {fonte === "marinha" ? "MB/SMM/CHM (últimos 7 dias, 00Z e 12Z)" : "INMET (análise com texto, 00Z e 12Z)"}</span>
        </h2>
        <div className="flex overflow-hidden rounded border border-gray-300 text-sm" role="group" aria-label="Fonte">
          {(["marinha", "inmet"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFonte(f)} className={`px-3 py-1 font-medium ${fonte === f ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
              {f === "marinha" ? "Marinha" : "INMET"}
            </button>
          ))}
        </div>
      </div>

      {fonte === "inmet" ? (
        <div className="flex min-h-[28rem] flex-1 flex-col rounded-lg border border-gray-200 bg-gray-50 p-2 shadow-sm">
          <AnaliseSinoticaInmet />
        </div>
      ) : null}

      {fonte === "marinha" && erro && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}

      {fonte !== "marinha" ? null : loading ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : cartas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Nenhuma carta disponível no momento.
        </div>
      ) : (
        <div className="flex min-h-[28rem] flex-1 flex-col rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
          <CartasSinoticasMapa cartas={cartas} />
        </div>
      )}
    </div>
  );
}
