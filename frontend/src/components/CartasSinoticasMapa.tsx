"use client";

import { useState } from "react";
import { MapContainer, TileLayer, WMSTileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { CARTAS_WMS_URL, Carta } from "@/lib/cartasSinoticas";

/** Mapa com a carta sinótica da Marinha (IDEM-DHN, WMS) sobre o mapa-base, com seletor de carta e opacidade.
 * Sem SSR (Leaflet precisa de `window`) — importar com `next/dynamic`. */
export default function CartasSinoticasMapa({ cartas }: { cartas: Carta[] }) {
  const [idx, setIdx] = useState(0);
  const [opacidade, setOpacidade] = useState(0.9);
  const atual = cartas[idx];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <span className="text-gray-600">Carta:</span>
          <select
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1"
          >
            {cartas.map((c, i) => (
              <option key={c.camada} value={i}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={idx >= cartas.length - 1}
          onClick={() => setIdx(idx + 1)}
          className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
        >
          ◀ Anterior
        </button>
        <button
          type="button"
          disabled={idx <= 0}
          onClick={() => setIdx(idx - 1)}
          className="rounded bg-gray-100 px-2 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
        >
          Próxima ▶
        </button>
        <label className="flex items-center gap-1">
          <span className="text-gray-600">Opacidade</span>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={opacidade}
            onChange={(e) => setOpacidade(Number(e.target.value))}
          />
        </label>
      </div>
      <MapContainer center={[-20, -40]} zoom={4} minZoom={2} className="h-[26rem] w-full rounded-lg sm:h-[34rem]" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Carta: Marinha do Brasil (IDEM-DHN)'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {atual && (
          <WMSTileLayer
            key={atual.camada}
            url={CARTAS_WMS_URL}
            layers={atual.camada}
            format="image/png"
            transparent
            opacity={opacidade}
          />
        )}
      </MapContainer>
    </div>
  );
}
