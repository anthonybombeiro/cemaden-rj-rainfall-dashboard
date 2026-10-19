"use client";

import { useEffect, useState } from "react";

import { AnaliseSinotica, fetchAnalises, fetchCartaAnalise } from "@/lib/inmet";

const rotulo = (a: AnaliseSinotica) => `${a.data.split("T")[0].split("-").reverse().join("/")} ${a.hora}Z`;

/** Análise sinótica do INMET: carta (América do Sul) + texto do meteorologista responsável. */
export default function AnaliseSinoticaInmet() {
  const [analises, setAnalises] = useState<AnaliseSinotica[]>([]);
  const [i, setI] = useState(0);
  const [cartaDe, setCartaDe] = useState<{ k: string; img: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetchAnalises()
      .then((l) => {
        setAnalises(l);
        if (!l.length) setErro("O INMET não publicou análise sinótica recente.");
      })
      .catch(() => setErro("Análise sinótica indisponível no INMET no momento."))
      .finally(() => setCarregando(false));
  }, []);

  const atual = analises[i];
  const chave = atual ? `${atual.data}-${atual.hora}` : "";
  const carta = cartaDe && cartaDe.k === chave ? cartaDe.img : null;
  useEffect(() => {
    if (!atual) return;
    let cancelado = false;
    fetchCartaAnalise(atual)
      .then((c) => {
        if (!cancelado) setCartaDe({ k: chave, img: c });
      })
      .catch(() => {
        if (!cancelado) setCartaDe({ k: chave, img: null });
      });
    return () => {
      cancelado = true;
    };
  }, [atual, chave]);

  if (carregando) return <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {erro && <div className="mb-2 rounded bg-amber-50 p-2 text-sm text-amber-800">{erro}</div>}
      {atual && (
        <>
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 text-sm">
            <select aria-label="Análise" value={i} onChange={(e) => setI(Number(e.target.value))} className="rounded border border-gray-300 bg-white px-2 py-1.5">
              {analises.map((a, k) => (
                <option key={`${a.data}-${a.hora}`} value={k}>
                  {rotulo(a)}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">Análise de {atual.responsavel} · INMET</span>
          </div>
          <div className="grid min-h-0 flex-1 gap-3 overflow-auto lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-2">
              {carta ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={carta} alt={`Carta sinótica INMET ${rotulo(atual)}`} className="mx-auto h-auto w-full max-w-3xl" />
              ) : (
                <p className="p-8 text-center text-sm text-gray-400">Carregando carta…</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="mb-1 text-sm font-bold text-gray-700">Análise ({rotulo(atual)})</h3>
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{atual.descricao}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
