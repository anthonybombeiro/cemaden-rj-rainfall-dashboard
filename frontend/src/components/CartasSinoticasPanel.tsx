"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Carta, fetchCartas, urlCartaOriginal } from "@/lib/cartasSinoticas";

// Leaflet precisa de `window` — sem SSR.
const CartasSinoticasMapa = dynamic(() => import("@/components/CartasSinoticasMapa"), {
  ssr: false,
  loading: () => <div className="flex h-80 items-center justify-center text-sm text-gray-400">Carregando mapa…</div>,
});

/** Sub-aba "Cartas sinóticas" (Meteorologia): mapa com a carta da Marinha embutida e as cartas originais, 2 por vez. */
export default function CartasSinoticasPanel() {
  const [cartas, setCartas] = useState<Carta[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(0);

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

  const totalPaginas = Math.max(1, Math.ceil(cartas.length / 2));
  const par = cartas.slice(pagina * 2, pagina * 2 + 2);

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-800">Cartas sinóticas</h2>
        <span className="text-xs text-gray-500">Marinha do Brasil — SMM/CHM, via IDEM-DHN (últimos ~7 dias, 00Z e 12Z)</span>
      </div>

      {erro && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}

      {loading ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : cartas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          Nenhuma carta disponível no momento.
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-gray-700">Mapa com a carta embutida</h3>
            <CartasSinoticasMapa cartas={cartas} />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-gray-700">Cartas originais (2 por vez)</h3>
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  disabled={pagina <= 0}
                  onClick={() => setPagina(pagina - 1)}
                  className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                >
                  ◀ Mais recentes
                </button>
                <span className="text-xs text-gray-500">
                  {pagina + 1} / {totalPaginas}
                </span>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas - 1}
                  onClick={() => setPagina(pagina + 1)}
                  className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
                >
                  Mais antigas ▶
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {par.map((c) => (
                <figure key={c.camada} className="rounded border border-gray-200 p-2">
                  <figcaption className="mb-1 flex items-center justify-between text-sm font-semibold text-gray-700">
                    <span>Carta de {c.rotulo}</span>
                    <a
                      href={urlCartaOriginal(c.camada, 1500)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-normal text-blue-600 hover:underline"
                    >
                      Abrir em tamanho grande
                    </a>
                  </figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlCartaOriginal(c.camada)} alt={`Carta sinótica ${c.rotulo}`} loading="lazy" className="w-full bg-white" />
                </figure>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-400">
              Imagem gerada a partir da camada da carta no IDEM-DHN (Marinha do Brasil); mostra as isóbaras, frentes, centros de pressão e a
              METAREA V sem o mapa-base.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
