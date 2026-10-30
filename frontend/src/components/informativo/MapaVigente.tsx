"use client";

import type { LatLngBoundsExpression, PathOptions } from "leaflet";
import { useEffect, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { COR_GRAVIDADE, corGravidade, INTENSIDADES, ItemRegiao, nomeRegiao } from "@/lib/informativo";

/** Mapa das REDECs coloridas pela chuva prevista do informativo vigente (mesmo padrão do mapa dos avisos de mau tempo).
 * Sem SSR (Leaflet precisa de `window`) — importar com `next/dynamic`. */

const BOUNDS: LatLngBoundsExpression = [[-23.5, -45.1], [-20.7, -40.9]];

export default function MapaVigente({ itens }: { itens: ItemRegiao[] }) {
  const [redecs, setRedecs] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    let cancelado = false;
    fetch("/redecs.geojson").then((r) => r.json()).then((g) => { if (!cancelado) setRedecs(g); }).catch(() => undefined);
    return () => { cancelado = true; };
  }, []);
  const por = new Map(itens.map((i) => [i.regiao, i]));
  return (
    <div className="relative">
      <MapContainer bounds={BOUNDS} className="h-72 w-full rounded-lg sm:h-96" scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {redecs && (
          <GeoJSON
            key={itens.map((i) => `${i.regiao}${i.chuva_prevista}`).join("|")}
            data={redecs}
            style={(f) => {
              const it = por.get(String(f?.properties?.redec));
              const c = corGravidade(it?.chuva_prevista || it?.chuva_atual || "");
              return { color: "#334155", weight: 1.5, fillColor: c, fillOpacity: it?.chuva_prevista || it?.chuva_atual ? 0.55 : 0.12 } as PathOptions;
            }}
            onEachFeature={(f, layer) => {
              const it = por.get(String(f.properties?.redec));
              const rot = (c: string) => INTENSIDADES.find((i) => i.chave === c)?.rotulo ?? "—";
              layer.bindTooltip(`${nomeRegiao(String(f.properties?.redec))} · prevista: ${it?.chuva_prevista ? rot(it.chuva_prevista) : "sem informação"}${it?.raios ? " · raios" : ""}${it?.granizo ? " · granizo" : ""}`, { sticky: true });
            }}
          />
        )}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-white/90 px-2 py-1 text-[11px] shadow">
        {[["fraca", "Fraca"], ["moderada", "Moderada"], ["moderada_forte", "Forte"], ["moderada_muito_forte", "Muito forte"]].map(([k, r]) => (
          <span key={k} className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: corGravidade(k) }} />{r}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_GRAVIDADE[0] }} />Sem informação</span>
      </div>
    </div>
  );
}
