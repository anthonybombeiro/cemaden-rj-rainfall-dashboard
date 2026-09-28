"use client";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { EstacaoProxima, SOURCE_COLORS, SOURCE_LABELS } from "@/lib/api";

/** Mapinha da página /estacao (pedido do usuário, 2026-09-28): a própria
 * estação em destaque + as mais próximas ao redor, num raio pequeno — não
 * é o mapa geral do painel (sem filtro/legenda), só um localizador. Sem
 * SSR (Leaflet precisa de `window`) — importar com `next/dynamic` no
 * componente pai, mesmo padrão do MapView em Dashboard.tsx. */
export default function StationMiniMap({
  nome,
  latitude,
  longitude,
  proximas,
}: {
  nome: string;
  latitude: number;
  longitude: number;
  proximas: EstacaoProxima[];
}) {
  return (
    <MapContainer center={[latitude, longitude]} zoom={11} className="h-64 w-full rounded-lg sm:h-72" scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {proximas.map((p) => (
        <CircleMarker
          key={`${p.source}-${p.id}`}
          center={[p.latitude, p.longitude]}
          radius={6}
          pathOptions={{ color: SOURCE_COLORS[p.source] ?? "#6b7280", fillColor: SOURCE_COLORS[p.source] ?? "#6b7280", fillOpacity: 0.8, weight: 1.5 }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">{p.name}</p>
              <p className="text-gray-500">
                {SOURCE_LABELS[p.source] ?? p.source} · {p.distancia_km} km
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      <CircleMarker
        center={[latitude, longitude]}
        radius={10}
        pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.9, weight: 3 }}
      >
        <Popup>{nome}</Popup>
      </CircleMarker>
    </MapContainer>
  );
}
