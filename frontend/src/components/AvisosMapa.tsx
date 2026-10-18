"use client";

import type { LatLngBoundsExpression, PathOptions } from "leaflet";
import { useEffect, useState } from "react";
import { GeoJSON, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { AvisoMauTempo } from "@/lib/api";
import { humanizarDescricao } from "@/lib/avisosMauTempo";

/** Mapa dos avisos de mau tempo da Marinha (pedido de 18/10/2026, "semelhante ao da Marinha"): cada aviso é o polígono
 * que a Marinha publica na página (convertido no backend para lon/lat), colorido pela categoria, sobre o contorno do RJ.
 * Sem SSR (Leaflet precisa de `window`) — importar com `next/dynamic`. */
export const COR_CATEGORIA: Record<string, { cor: string; rotulo: string }> = {
  vento: { cor: "#2563eb", rotulo: "Vento" },
  onda: { cor: "#d97706", rotulo: "Ondas" },
  ressaca: { cor: "#dc2626", rotulo: "Ressaca" },
};

const BOUNDS_PADRAO: LatLngBoundsExpression = [
  [-28, -49],
  [-20, -39],
];

export default function AvisosMapa({ avisos }: { avisos: AvisoMauTempo[] }) {
  const [rj, setRj] = useState<GeoJSON.GeoJsonObject | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/rj_municipios.geojson")
      .then((r) => r.json())
      .then((g) => {
        if (!cancelado) setRj(g);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const comPoligono = avisos.filter((a) => a.geojson);

  return (
    <div className="relative">
      <MapContainer bounds={BOUNDS_PADRAO} className="h-80 w-full rounded-lg sm:h-[28rem]" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {rj && (
          <GeoJSON
            data={rj}
            style={() => ({ color: "#334155", weight: 1, fillColor: "#94a3b8", fillOpacity: 0.12 }) as PathOptions}
            interactive={false}
          />
        )}
        {comPoligono.map((a) => {
          const c = COR_CATEGORIA[a.categoria]?.cor ?? "#6b7280";
          return (
            <GeoJSON
              key={a.id}
              data={a.geojson as unknown as GeoJSON.GeoJsonObject}
              style={() => ({ color: c, weight: 2, fillColor: c, fillOpacity: 0.18 }) as PathOptions}
            >
              <Tooltip sticky>
                NR {a.numero_externo} · {COR_CATEGORIA[a.categoria]?.rotulo ?? a.tipo}
              </Tooltip>
              <Popup>
                <div className="max-w-[16rem] text-xs">
                  <p className="font-semibold">
                    NR {a.numero_externo} · {COR_CATEGORIA[a.categoria]?.rotulo ?? a.tipo}
                  </p>
                  <p className="mt-1 leading-snug text-gray-700">{humanizarDescricao(a.descricao, a.emitido_em)}</p>
                </div>
              </Popup>
            </GeoJSON>
          );
        })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-white/90 px-2 py-1 text-[11px] shadow">
        {Object.entries(COR_CATEGORIA).map(([k, v]) => (
          <span key={k} className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: v.cor, opacity: 0.8 }} />
            {v.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}
