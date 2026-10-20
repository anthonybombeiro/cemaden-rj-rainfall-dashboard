"use client";

import type { Map as LeafletMap } from "leaflet";
import { Maximize, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap, WMSTileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { CARTAS_WMS_URL, Carta } from "@/lib/cartasSinoticas";
import { AnaliseSinotica, fetchCartaAnalise } from "@/lib/inmet";

/** Um painel de carta sinótica. Cada painel escolhe a SUA fonte (Marinha ou INMET) e a SUA carta, de modo que dois painéis
 * lado a lado comparam qualquer combinação (INMET×Marinha, Marinha×Marinha em horários diferentes, INMET×INMET).
 * Marinha: mapa Leaflet com a carta (WMS) e opacidade; INMET: imagem da carta e, abaixo, o texto da análise.
 * Os dois têm animação. Sem SSR (Leaflet) — importar com `next/dynamic`. */
const FRAMES_ANIMACAO = 7;
const MS_POR_QUADRO = 1000;
const CENTRO: [number, number] = [-23, -41];
const LIMITES_CARTA: [[number, number], [number, number]] = [
  [-70, -90],
  [20, 0],
];
const zoomInicial = () => (typeof window !== "undefined" && window.innerWidth < 640 ? 4 : 5);

type Registro = { mapas: Record<string, LeafletMap>; trava: boolean };
const registro: Registro = { mapas: {}, trava: false };

/** Registra o mapa e replica o movimento nos demais (quando os dois painéis são da Marinha, zoom e arrasto andam juntos). */
function Sincronizador({ id }: { id: string }) {
  const map = useMap();
  useEffect(() => {
    registro.mapas[id] = map;
    const ao_mover = () => {
      if (registro.trava) return;
      registro.trava = true;
      for (const [outro, m] of Object.entries(registro.mapas)) if (outro !== id) m.setView(map.getCenter(), map.getZoom(), { animate: false });
      registro.trava = false;
    };
    map.on("move", ao_mover);
    return () => {
      map.off("move", ao_mover);
      delete registro.mapas[id];
    };
  }, [id, map]);
  return null;
}

export type FonteCarta = "marinha" | "inmet";
const rotuloAnalise = (a: AnaliseSinotica) => `${a.data.split("T")[0].split("-").reverse().join("/")} ${a.hora}Z`;
const cacheCartaInmet = new Map<string, string | null>();
const chaveAnalise = (a: AnaliseSinotica) => `${a.data}-${a.hora}`;

const botao = "rounded bg-gray-100 px-2 py-1.5 text-gray-700 hover:bg-gray-200 disabled:opacity-40";

export default function PainelCarta({
  id,
  cartas,
  analises,
  fonteInicial,
}: {
  id: string;
  cartas: Carta[];
  analises: AnaliseSinotica[];
  fonteInicial: FonteCarta;
}) {
  const [fonte, setFonte] = useState<FonteCarta>(fonteInicial);
  const [idxM, setIdxM] = useState(0); // 0 = mais recente
  const [idxI, setIdxI] = useState(0);
  const [opacidade, setOpacidade] = useState(0.9);
  const [animando, setAnimando] = useState(false);
  const [cartaInmet, setCartaInmet] = useState<Record<string, string | null>>({});

  const marinha = fonte === "marinha";
  const total = marinha ? cartas.length : analises.length;
  const idx = marinha ? idxM : idxI;
  const setIdx = marinha ? setIdxM : setIdxI;
  const quadrosAnim = marinha ? Math.min(FRAMES_ANIMACAO, total) : total;

  // animação: da mais antiga para a mais recente (em laço)
  useEffect(() => {
    if (!animando || quadrosAnim < 2) return;
    let i = Math.min(idx, quadrosAnim - 1);
    const t = setInterval(() => {
      i = i - 1 < 0 ? quadrosAnim - 1 : i - 1;
      setIdx(i);
    }, MS_POR_QUADRO);
    return () => clearInterval(t);
  }, [animando, quadrosAnim]); // eslint-disable-line react-hooks/exhaustive-deps

  // cartas do INMET: carrega a escolhida e, na animação, todas
  useEffect(() => {
    if (marinha) return;
    const alvo = animando ? analises : analises[idxI] ? [analises[idxI]] : [];
    let cancelado = false;
    for (const a of alvo) {
      const k = chaveAnalise(a);
      if (cacheCartaInmet.has(k)) {
        Promise.resolve().then(() => !cancelado && setCartaInmet((c) => (k in c ? c : { ...c, [k]: cacheCartaInmet.get(k) ?? null })));
        continue;
      }
      fetchCartaAnalise(a)
        .then((img) => {
          cacheCartaInmet.set(k, img);
          if (!cancelado) setCartaInmet((c) => ({ ...c, [k]: img }));
        })
        .catch(() => !cancelado && setCartaInmet((c) => ({ ...c, [k]: null })));
    }
    return () => {
      cancelado = true;
    };
  }, [marinha, animando, analises, idxI]);

  const frames = useMemo(() => (animando && marinha ? cartas.slice(0, FRAMES_ANIMACAO).reverse() : cartas[idxM] ? [cartas[idxM]] : []), [animando, marinha, cartas, idxM]);
  const atualM = cartas[idxM];
  const atualI = analises[idxI];
  const restaurar = () => {
    for (const m of Object.values(registro.mapas)) m.fitBounds(LIMITES_CARTA, { animate: false });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 text-sm">
        <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Fonte da carta">
          {(["marinha", "inmet"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setAnimando(false);
                setFonte(f);
              }}
              className={`px-2.5 py-1.5 font-medium ${fonte === f ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
            >
              {f === "marinha" ? "Marinha" : "INMET"}
            </button>
          ))}
        </div>
        <select
          aria-label="Carta"
          value={idx}
          onChange={(e) => {
            setAnimando(false);
            setIdx(Number(e.target.value));
          }}
          className="rounded border border-gray-300 bg-white px-1.5 py-1.5"
        >
          {marinha ? cartas.map((c, i) => <option key={c.camada} value={i}>{c.rotulo}</option>) : analises.map((a, i) => <option key={chaveAnalise(a)} value={i}>{rotuloAnalise(a)}</option>)}
        </select>
        <button type="button" title="Carta anterior" aria-label="Carta anterior" disabled={idx >= total - 1} onClick={() => { setAnimando(false); setIdx(idx + 1); }} className={botao}>
          ◀
        </button>
        <button type="button" title="Próxima carta" aria-label="Próxima carta" disabled={idx <= 0} onClick={() => { setAnimando(false); setIdx(idx - 1); }} className={botao}>
          ▶
        </button>
        <button
          type="button"
          disabled={quadrosAnim < 2}
          title={`Animar as ${quadrosAnim} cartas mais recentes`}
          onClick={() => setAnimando((a) => !a)}
          className={`flex items-center gap-0.5 rounded px-1.5 py-1.5 font-medium disabled:opacity-40 ${animando ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        >
          {animando ? <Pause size={15} /> : <Play size={15} />}
          {animando ? "Parar" : "Animar"}
        </button>
        {marinha && (
          <>
            <button type="button" title="Voltar o zoom para a carta inteira" aria-label="Carta inteira" onClick={restaurar} className={`flex items-center gap-1 ${botao}`}>
              <Maximize size={15} />
              <span className="hidden sm:inline">Carta inteira</span>
            </button>
            <label className="flex items-center gap-1 text-gray-600" title="Opacidade da carta">
              <span className="hidden sm:inline">Opacidade</span>
              <input type="range" min={0.2} max={1} step={0.05} value={opacidade} onChange={(e) => setOpacidade(Number(e.target.value))} className="w-14 sm:w-24" />
            </label>
          </>
        )}
      </div>

      {marinha && atualM ? (
        <div className="relative h-[calc(100dvh-17rem)] min-h-[20rem] w-full">
          <MapContainer center={CENTRO} zoom={zoomInicial()} minZoom={2} className="h-full w-full rounded-lg" scrollWheelZoom>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Carta: Marinha do Brasil (IDEM-DHN)' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="saturate-50 brightness-110" />
            {frames.map((c) => (
              <WMSTileLayer key={c.camada} url={CARTAS_WMS_URL} layers={c.camada} format="image/png" transparent opacity={c.camada === atualM.camada ? opacidade : 0} />
            ))}
            <Sincronizador id={id} />
          </MapContainer>
          <div className="pointer-events-none absolute right-2 top-2 z-[500] rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white shadow">{atualM.rotulo}</div>
        </div>
      ) : null}

      {!marinha && atualI ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="relative flex h-[calc(100dvh-24rem)] min-h-[16rem] items-center justify-center rounded border border-gray-200 bg-gray-50 p-1">
            {cartaInmet[chaveAnalise(atualI)] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cartaInmet[chaveAnalise(atualI)] as string} alt={`Carta sinótica INMET ${rotuloAnalise(atualI)}`} className="max-h-full max-w-full object-contain" />
            ) : chaveAnalise(atualI) in cartaInmet ? (
              <p className="text-sm text-gray-500">Carta indisponível.</p>
            ) : (
              <p className="text-sm text-gray-400">Carregando carta…</p>
            )}
            <div className="pointer-events-none absolute right-2 top-2 rounded bg-blue-700 px-2 py-1 text-xs font-bold text-white shadow">{rotuloAnalise(atualI)}</div>
          </div>
          <div className="mt-2 rounded border border-gray-200 bg-white p-3">
            <h3 className="mb-1 text-sm font-bold text-gray-700">
              Análise do INMET · {rotuloAnalise(atualI)} <span className="text-xs font-normal text-gray-500">({atualI.responsavel})</span>
            </h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{atualI.descricao}</p>
          </div>
        </div>
      ) : null}
      {!marinha && !atualI && <p className="p-6 text-center text-sm text-gray-500">O INMET não publicou análise sinótica recente.</p>}
    </div>
  );
}
