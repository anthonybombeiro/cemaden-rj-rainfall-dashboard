"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { GeoJSON, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

import { MODELOS_GRADE, ModeloGrade, rotuloRun } from "@/lib/modelosGrade";
import CamadaGradeCanvas from "./CamadaGradeCanvas";
import { useEstadoModelo } from "./hooks";
import { LegendaModelo, PontoMeteograma, RankingMunicipios } from "./UiModelo";

type Estado = ReturnType<typeof useEstadoModelo>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Geo = any;

const MODELOS_METEOGRAMA: ModeloGrade[] = ["ifs", "ifs01", "aifs", "icon", "gfs"];

function CapturaMapa({ destinoRef }: { destinoRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    destinoRef.current = map;
  }, [map, destinoRef]);
  return null;
}
const RJ_CENTER: [number, number] = [-22.25, -42.6];
const REDEC_LINE = { color: "#1d4ed8", weight: 2, opacity: 0.8, fillOpacity: 0, interactive: false };
const MUNICIPIO_LINE = { color: "#475569", weight: 0.8, opacity: 0.55, fillOpacity: 0, interactive: false };

/** Mapa interativo próprio de um modelo em grade (quadros da Previsão numérica): campo colorido, setas de vento,
 * valor sob o cursor, legenda e meteograma do ponto clicado (IFS e GFS juntos). */
export default function MapaModelo({ estado }: { estado: Estado }) {
  const [municipios, setMunicipios] = useState<Geo>(null);
  const [redecs, setRedecs] = useState<Geo>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [ponto, setPonto] = useState<{ lat: number; lon: number } | null>(null);
  const painelRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<L.Map | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/rj_municipios.geojson").then((r) => r.json()).then((d) => !cancelado && setMunicipios(d)).catch(() => {});
    fetch("/redecs.geojson").then((r) => r.json()).then((d) => !cancelado && setRedecs(d)).catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);
  useEffect(() => {
    const el = painelRef.current;
    if (el) {
      L.DomEvent.disableScrollPropagation(el);
      L.DomEvent.disableClickPropagation(el);
    }
  });

  const { produto, resultado, geo, meta } = estado;
  const atrib = MODELOS_GRADE.find((m) => m.id === estado.modelo)?.atribuicao;
  return (
    <MapContainer center={RJ_CENTER} zoom={7} className="h-full w-full" scrollWheelZoom>
      <CapturaMapa destinoRef={mapaRef} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <CamadaGradeCanvas geo={geo} resultado={resultado} escala={produto?.escala ?? { rampa: "temp", min: 0, max: 1, un: "" }} opacidade={estado.opacidade} contorno={estado.contorno} onHover={(p) => setHover(p ? p.valor : null)} onClick={setPonto} />
      {municipios && <GeoJSON key="m" data={municipios} style={() => MUNICIPIO_LINE} />}
      {redecs && <GeoJSON key="r" data={redecs} style={() => REDEC_LINE} />}
      {ponto && (
        <Popup position={[ponto.lat, ponto.lon]} maxWidth={380} minWidth={340} eventHandlers={{ remove: () => setPonto(null) }}>
          <PontoMeteograma lat={ponto.lat} lon={ponto.lon} modelos={MODELOS_METEOGRAMA} />
        </Popup>
      )}
      {produto && (
        <div ref={painelRef} className="absolute bottom-1.5 left-1.5 z-[1000] w-44 max-w-[70%] rounded-md border border-gray-200 bg-white/95 p-1.5 shadow sm:bottom-2 sm:left-2 sm:w-56 sm:max-w-[60%] sm:p-2">
          <LegendaModelo escala={produto.escala} rotulo={produto.rotulo} nota={resultado?.nota} valor={hover} />
          {estado.contorno && <p className="mt-0.5 text-[10px] text-gray-600">Contornos: {estado.contorno.rotulo}</p>}
          <div className="hidden sm:block"><RankingMunicipios valores={resultado?.valores ?? null} geo={geo} un={produto.un} rotulo={produto.rotulo} onFoco={(b) => mapaRef.current?.flyToBounds(b, { maxZoom: 10, duration: 0.6 })} /></div>
          {meta && <p className="mt-1 hidden text-[9px] leading-tight text-gray-400 sm:block">{estado.modelo.toUpperCase()} rodada {rotuloRun(meta.run)} · {atrib}</p>}
        </div>
      )}
    </MapContainer>
  );
}
