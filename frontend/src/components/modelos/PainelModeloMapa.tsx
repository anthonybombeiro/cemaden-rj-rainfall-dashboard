"use client";

import L from "leaflet";
import { Layers } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Popup } from "react-leaflet";

import { MODELOS_GRADE, ModeloGrade, rotuloRun } from "@/lib/modelosGrade";
import CamadaGradeCanvas from "./CamadaGradeCanvas";
import { useEstadoModelo } from "./hooks";
import { BarraTempoModelo, LegendaModelo, PontoMeteograma, SeletoresModelo } from "./UiModelo";

/** Camada "Modelo numérico" da aba Mapa (renderiza DENTRO do MapContainer): campo de IFS/GFS sobre o mapa de estações, com
 * produto, hora, animação, transparência, valor sob o cursor e meteograma do ponto clicado. Desligada por padrão. */
export default function PainelModeloMapa() {
  const [ativo, setAtivo] = useState(false);
  const [aberto, setAberto] = useState(false);
  const estado = useEstadoModelo("ifs", ativo);
  const [hover, setHover] = useState<number | null>(null);
  const [ponto, setPonto] = useState<{ lat: number; lon: number } | null>(null);
  const botoesRef = useRef<HTMLDivElement | null>(null);
  const barraRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    for (const el of [botoesRef.current, barraRef.current]) {
      if (el) {
        L.DomEvent.disableScrollPropagation(el);
        L.DomEvent.disableClickPropagation(el);
      }
    }
  });

  const { produto, resultado, geo, meta, hora, runMs } = estado;
  const atrib = MODELOS_GRADE.find((m) => m.id === estado.modelo)?.atribuicao;
  return (
    <>
      {ativo && (
        <CamadaGradeCanvas
          geo={geo}
          resultado={resultado}
          escala={produto?.escala ?? { rampa: "temp", min: 0, max: 1, un: "" }}
          opacidade={estado.opacidade}
          onHover={(p) => setHover(p ? p.valor : null)}
          onClick={setPonto}
        />
      )}
      {ativo && ponto && (
        <Popup position={[ponto.lat, ponto.lon]} maxWidth={380} minWidth={340} eventHandlers={{ remove: () => setPonto(null) }}>
          <PontoMeteograma lat={ponto.lat} lon={ponto.lon} modelos={["ifs", "gfs"] as ModeloGrade[]} />
        </Popup>
      )}

      <div ref={botoesRef} className="absolute left-[10px] top-[5.6rem] z-[1000] max-w-[calc(100vw-1.5rem)]">
        <button
          type="button"
          onClick={() => {
            if (!ativo) {
              setAtivo(true);
              setAberto(true);
            } else setAberto((a) => !a);
          }}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold shadow ${ativo ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
          aria-expanded={aberto}
          title="Camada de previsão numérica (IFS/GFS)"
        >
          <Layers size={14} aria-hidden />
          Modelo numérico
        </button>
        {ativo && aberto && (
          <div className="mt-1.5 w-72 max-w-[80vw] rounded-md border border-gray-200 bg-white p-2.5 text-xs shadow-lg">
            <SeletoresModelo modelo={estado.modelo} onModelo={estado.setModelo} produtos={estado.produtos} produtoId={estado.produtoId} onProduto={estado.setProdutoId} opacidade={estado.opacidade} onOpacidade={estado.setOpacidade} />
            {estado.erro && <p className="mt-2 text-red-600">Dados do modelo indisponíveis no momento.</p>}
            {estado.carregando && !estado.erro && <p className="mt-2 text-gray-500">Carregando grade…</p>}
            <button type="button" onClick={() => { setAtivo(false); setPonto(null); setHover(null); }} className="mt-2 w-full rounded bg-gray-100 px-2 py-1 font-medium text-gray-700 hover:bg-gray-200">
              Desligar camada
            </button>
          </div>
        )}
      </div>

      {ativo && produto && hora !== null && (
        <div ref={barraRef} className="absolute bottom-14 left-1/2 z-[1000] w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-md border border-gray-200 bg-white/95 p-2 shadow-lg sm:bottom-3 sm:w-[min(26rem,calc(100vw-24rem))] lg:w-[34rem]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 sm:grid-cols-1">
            <LegendaModelo escala={produto.escala} rotulo={produto.rotulo} nota={resultado?.nota} valor={hover} />
            <BarraTempoModelo horas={produto.horas} runMs={runMs} hora={hora} onHora={estado.irParaHora} tocando={estado.tocando} onTocar={estado.setTocando} />
            {meta && <p className="text-[9px] leading-tight text-gray-400">{estado.modelo.toUpperCase()} rodada {rotuloRun(meta.run)} · {atrib} · clique no mapa para o meteograma</p>}
          </div>
        </div>
      )}
    </>
  );
}
