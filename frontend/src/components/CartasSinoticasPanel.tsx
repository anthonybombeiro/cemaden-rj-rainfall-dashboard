"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

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
      <h2 className="mb-1 shrink-0 text-sm text-gray-800">
        <span className="font-bold">Cartas sinóticas</span>
        <span className="text-xs text-gray-500"> · MB/SMM/CHM (últimos 7 dias, 00Z e 12Z)</span>
      </h2>

      {erro && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}

      {loading ? (
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
