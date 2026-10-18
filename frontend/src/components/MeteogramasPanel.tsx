"use client";

import { useState } from "react";

import { PONTOS_METEOGRAMA, RODADAS, Rodada, urlMeteograma } from "@/lib/produtosMarinha";

/** Sub-aba "Meteogramas" (Meteorologia): gráficos de previsão (ICON-LAM 6,5 km, 5 dias) do SMM/CHM para os pontos do RJ. */
export default function MeteogramasPanel() {
  const [ponto, setPonto] = useState(0);
  const [rodada, setRodada] = useState<Rodada>("00");
  const p = PONTOS_METEOGRAMA[ponto];
  const [erro, setErro] = useState<Record<string, boolean>>({});

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Meteogramas do RJ</span>
        <span className="text-xs text-gray-500"> · MB/SMM/CHM (ICON-LAM 6,5 km, 5 dias)</span>
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <select
          aria-label="Ponto"
          value={ponto}
          onChange={(e) => {
            setPonto(Number(e.target.value));
            setErro({});
          }}
          className="rounded border border-gray-300 bg-white px-2 py-1.5"
        >
          {PONTOS_METEOGRAMA.map((x, i) => (
            <option key={x.arquivo} value={i}>
              {x.nome}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Rodada">
          {RODADAS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRodada(r);
                setErro({});
              }}
              className={`px-3 py-1.5 font-medium ${rodada === r ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
            >
              {r}Z
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">A data de referência está no cabeçalho de cada gráfico (Ref).</span>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {([0, 1] as const).map((g) => {
          const url = urlMeteograma(p, rodada, g);
          return (
            <figure key={`${p.arquivo}-${rodada}-${g}`} className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
              <figcaption className="mb-1 text-xs font-semibold text-gray-600">
                {g === 0 ? "Pressão, temperatura, umidade e vento" : "Visibilidade, precipitação e nuvens"}
              </figcaption>
              {erro[url] ? (
                <p className="p-6 text-center text-sm text-gray-500">Gráfico indisponível nesta rodada.</p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`Meteograma ${p.nome} ${g + 1}`} className="mx-auto w-full max-w-xl" onError={() => setErro((e) => ({ ...e, [url]: true }))} />
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
