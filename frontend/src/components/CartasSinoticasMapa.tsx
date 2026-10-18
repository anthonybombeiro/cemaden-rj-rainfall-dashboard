"use client";

import type { Map as LeafletMap } from "leaflet";
import { Columns2, Maximize, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap, WMSTileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { CARTAS_WMS_URL, Carta } from "@/lib/cartasSinoticas";

/** Mapa(s) com a carta sinótica da Marinha (IDEM-DHN, WMS) sobre um mapa-base claro com contornos e nomes.
 * Modos: uma carta; animação com as 7 últimas; ou comparação de 2 cartas lado a lado com pan/zoom sincronizados.
 * Sem SSR (Leaflet precisa de `window`) — importar com `next/dynamic`. */
const FRAMES_ANIMACAO = 7;
const MS_POR_QUADRO = 900;
const CENTRO: [number, number] = [-23, -41];
// Limites da carta (lat/lon) para o botão "carta inteira".
const LIMITES_CARTA: [[number, number], [number, number]] = [
  [-70, -90],
  [20, 0],
];
const zoomInicial = () => (typeof window !== "undefined" && window.innerWidth < 640 ? 4 : 5);

type Registro = { mapas: Record<string, LeafletMap>; trava: boolean };
// Registro dos mapas montados (só há um grupo por vez nesta aba).
const registro: Registro = { mapas: {}, trava: false };

/** Registra o mapa e replica os movimentos nos demais (modo comparação). */
function Sincronizador({ id }: { id: string }) {
  const map = useMap();
  useEffect(() => {
    const reg = registro;
    reg.mapas[id] = map;
    const ao_mover = () => {
      if (reg.trava) return;
      reg.trava = true;
      for (const [outro, m] of Object.entries(reg.mapas)) {
        if (outro !== id) m.setView(map.getCenter(), map.getZoom(), { animate: false });
      }
      reg.trava = false;
    };
    map.on("move", ao_mover);
    return () => {
      map.off("move", ao_mover);
      delete reg.mapas[id];
    };
  }, [id, map]);
  return null;
}

function MapaCarta({
  id,
  frames,
  atual,
  opacidade,
}: {
  id: string;
  frames: Carta[];
  atual: Carta;
  opacidade: number;
}) {
  return (
    <div className="relative h-full min-h-0 flex-1">
      <MapContainer center={CENTRO} zoom={zoomInicial()} minZoom={2} className="h-full w-full rounded-lg" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Carta: Marinha do Brasil (IDEM-DHN)'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="saturate-50 brightness-110"
        />
        {frames.map((c) => (
          <WMSTileLayer
            key={c.camada}
            url={CARTAS_WMS_URL}
            layers={c.camada}
            format="image/png"
            transparent
            opacity={c.camada === atual.camada ? opacidade : 0}
          />
        ))}
        <Sincronizador id={id} />
      </MapContainer>
      <div className="pointer-events-none absolute right-2 top-2 z-[500] rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white shadow">
        {atual.rotulo}
      </div>
    </div>
  );
}

export default function CartasSinoticasMapa({ cartas }: { cartas: Carta[] }) {
  const [idx, setIdx] = useState(0); // 0 = mais recente
  const [opacidade, setOpacidade] = useState(0.9);
  const [comparar, setComparar] = useState(false);
  const [animando, setAnimando] = useState(false);

  // Animação: da mais antiga das 7 últimas até a mais recente, em laço.
  const quadros = useMemo(() => cartas.slice(0, FRAMES_ANIMACAO).reverse(), [cartas]);
  useEffect(() => {
    if (!animando || quadros.length < 2) return;
    let i = quadros.findIndex((c) => c.camada === cartas[idx]?.camada);
    if (i < 0) i = 0;
    const t = setInterval(() => {
      i = (i + 1) % quadros.length;
      setIdx(cartas.indexOf(quadros[i]));
    }, MS_POR_QUADRO);
    return () => clearInterval(t);
  }, [animando, quadros, cartas]); // eslint-disable-line react-hooks/exhaustive-deps

  const atual = cartas[idx];
  const anterior = cartas[idx + 1]; // no modo comparação: esquerda = carta anterior, direita = selecionada
  const passo = comparar ? 2 : 1;
  const botao = "rounded bg-gray-100 px-1.5 py-1.5 text-gray-700 hover:bg-gray-200 disabled:opacity-40";

  if (!atual) return null;
  const mostrandoComparacao = comparar && !animando && anterior;
  // No modo único (e na animação) carrega só as 7 últimas se animando; senão apenas a selecionada.
  const framesUnico = animando ? quadros : [atual];

  const restaurar = () => {
    for (const m of Object.values(registro.mapas)) m.fitBounds(LIMITES_CARTA, { animate: false });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1 text-sm">
        <select
          aria-label="Carta"
          value={idx}
          onChange={(e) => {
            setAnimando(false);
            setIdx(Number(e.target.value));
          }}
          className="rounded border border-gray-300 bg-white px-1 py-1 text-xs sm:text-sm"
        >
          {cartas.map((c, i) => (
            <option key={c.camada} value={i}>
              {c.rotulo}
            </option>
          ))}
        </select>
        <button type="button" title="Carta anterior" aria-label="Carta anterior" disabled={idx >= cartas.length - passo} onClick={() => { setAnimando(false); setIdx(Math.min(idx + passo, cartas.length - 1)); }} className={botao}>
          ◀<span className="hidden sm:inline"> Anterior</span>
        </button>
        <button type="button" title="Próxima carta" aria-label="Próxima carta" disabled={idx <= 0} onClick={() => { setAnimando(false); setIdx(Math.max(idx - passo, 0)); }} className={botao}>
          <span className="hidden sm:inline">Próxima </span>▶
        </button>
        <button
          type="button"
          title={`Animar as ${Math.min(FRAMES_ANIMACAO, cartas.length)} últimas cartas`}
          onClick={() => {
            setComparar(false);
            setAnimando((a) => !a);
          }}
          className={`flex items-center gap-0.5 rounded px-1.5 py-1.5 font-medium ${animando ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        >
          {animando ? <Pause size={15} /> : <Play size={15} />}
          {animando ? "Parar" : "Animar"}
        </button>
        <button
          type="button"
          title="Comparar 2 cartas lado a lado"
          onClick={() => {
            setAnimando(false);
            setComparar((c) => !c);
          }}
          className={`hidden items-center gap-1 rounded px-2 py-1.5 font-medium lg:flex ${comparar ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          <Columns2 size={15} />
          Comparar 2
        </button>
        <button type="button" title="Voltar o zoom para a carta inteira" aria-label="Carta inteira" onClick={restaurar} className={`flex items-center gap-1 ${botao}`}>
          <Maximize size={15} />
          <span className="hidden sm:inline">Carta inteira</span>
        </button>
        <label className="flex items-center gap-1 text-gray-600" title="Opacidade da carta">
          <span className="hidden sm:inline">Opacidade</span>
          <input type="range" min={0.2} max={1} step={0.05} value={opacidade} onChange={(e) => setOpacidade(Number(e.target.value))} className="w-14 sm:w-24" />
        </label>
      </div>

      {mostrandoComparacao ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
          <MapaCarta key="a" id="a" frames={[anterior]} atual={anterior} opacidade={opacidade} />
          <MapaCarta key="b" id="b" frames={[atual]} atual={atual} opacidade={opacidade} />
        </div>
      ) : (
        <MapaCarta key="u" id="u" frames={framesUnico} atual={atual} opacidade={opacidade} />
      )}
    </div>
  );
}
