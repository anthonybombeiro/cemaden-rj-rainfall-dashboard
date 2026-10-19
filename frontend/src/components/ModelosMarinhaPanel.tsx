"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import ModelosInmetVisualizador from "@/components/ModelosInmetVisualizador";
import { ModeloVime } from "@/lib/inmet";
import { MODELOS, Modelo, RODADAS, Rodada } from "@/lib/produtosMarinha";

// Fontes disponíveis na aba: modelos da Marinha (imagens) e COSMO do INMET (VIME).
type FonteId = Modelo["id"] | "cosmo7" | "cosmo2p8";
const ABAS: { id: FonteId; rotulo: string; vime?: ModeloVime }[] = [
  { id: "atmosferico", rotulo: "ICON 6,5 km · Marinha" },
  { id: "cosmo7", rotulo: "COSMO 7 km · INMET", vime: "COSMO7" },
  { id: "cosmo2p8", rotulo: "COSMO 2,8 km · INMET", vime: "COSMO2P8" },
  { id: "ondas", rotulo: "Ondas · Marinha" },
  { id: "oceanografico", rotulo: "Oceano · Marinha" },
];

const MS_POR_QUADRO = 700;

/** Visualizador de um modelo (área, produto, rodada) com barra de tempo e animação. */
function Visualizador({ modelo }: { modelo: Modelo }) {
  const [area, setArea] = useState(modelo.areas[0].id);
  const [produto, setProduto] = useState(modelo.produtos[0].id);
  const [rodada, setRodada] = useState<Rodada>("00");
  const [i, setI] = useState(0);
  const [animando, setAnimando] = useState(false);
  const [falhas, setFalhas] = useState<Record<string, boolean>>({});

  const urls = useMemo(() => modelo.horas.map((h) => modelo.url(rodada, area, produto, h)), [modelo, rodada, area, produto]);
  const atual = urls[i];
  const horaAtual = modelo.horas[i];

  // Pré-carrega todos os quadros ao mudar a seleção (animação sem piscar).
  useEffect(() => {
    for (const u of urls) {
      const img = new Image();
      img.src = u;
    }
  }, [urls]);

  useEffect(() => {
    if (!animando) return;
    const t = setInterval(() => setI((x) => (x + 1) % modelo.horas.length), MS_POR_QUADRO);
    return () => clearInterval(t);
  }, [animando, modelo.horas.length]);

  const sel = "rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs sm:text-sm";
  const trocar = (fn: () => void) => {
    fn();
    setFalhas({});
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 text-sm">
        <select aria-label="Área" value={area} onChange={(e) => trocar(() => setArea(e.target.value))} className={sel}>
          {modelo.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.rotulo}
            </option>
          ))}
        </select>
        <select aria-label="Produto" value={produto} onChange={(e) => trocar(() => setProduto(e.target.value))} className={`${sel} max-w-[14rem] sm:max-w-none`}>
          {modelo.produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rotulo}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Rodada">
          {RODADAS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => trocar(() => setRodada(r as Rodada))}
              className={`px-2.5 py-1.5 font-medium ${rodada === r ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}
            >
              {r}Z
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAnimando((a) => !a)}
          className={`flex items-center gap-1 rounded px-2 py-1.5 font-medium ${animando ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        >
          {animando ? <Pause size={15} /> : <Play size={15} />}
          {animando ? "Parar" : "Animar"}
        </button>
      </div>
      <div className="mb-2 flex shrink-0 items-center gap-2 text-xs text-gray-600">
        <button
          type="button"
          disabled={i <= 0}
          onClick={() => {
            setAnimando(false);
            setI(i - 1);
          }}
          className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200 disabled:opacity-40"
          aria-label="Quadro anterior"
        >
          ◀
        </button>
        <input
          type="range"
          min={0}
          max={modelo.horas.length - 1}
          value={i}
          onChange={(e) => {
            setAnimando(false);
            setI(Number(e.target.value));
          }}
          className="min-w-0 flex-1"
          aria-label="Horas de previsão"
        />
        <button
          type="button"
          disabled={i >= modelo.horas.length - 1}
          onClick={() => {
            setAnimando(false);
            setI(i + 1);
          }}
          className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200 disabled:opacity-40"
          aria-label="Próximo quadro"
        >
          ▶
        </button>
        <span className="w-16 shrink-0 text-right font-semibold text-gray-800">+{horaAtual} h</span>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-lg border border-gray-200 bg-white p-1">
        {falhas[atual] ? (
          <p className="p-8 text-center text-sm text-gray-500">Quadro indisponível (a rodada pode ainda não ter sido publicada). Tente a outra rodada.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={atual}
            alt={`${modelo.rotulo} +${horaAtual} h`}
            className="h-auto max-h-full w-auto max-w-full object-contain"
            onError={() => setFalhas((f) => ({ ...f, [atual]: true }))}
          />
        )}
      </div>
    </div>
  );
}

/** Sub-aba "Modelos" (Meteorologia): modelos numéricos da Marinha (atmosférico, ondas, oceano) e COSMO do INMET. */
export default function ModelosMarinhaPanel() {
  const [id, setId] = useState<FonteId>("atmosferico");
  const aba = ABAS.find((a) => a.id === id) ?? ABAS[0];
  const modelo = MODELOS.find((m) => m.id === id);
  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-1 shrink-0 text-sm text-gray-800">
        <span className="font-bold">Modelos numéricos</span>
        <span className="text-xs text-gray-500"> · Marinha (SMM/CHM) e INMET (COSMO)</span>
      </h2>
      <div className="mb-2 flex shrink-0 flex-wrap gap-1 text-sm" role="tablist" aria-label="Modelo">
        {ABAS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={id === m.id}
            onClick={() => setId(m.id)}
            className={`rounded-full px-3 py-1 font-medium ${id === m.id ? "bg-sedec-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {m.rotulo}
          </button>
        ))}
      </div>
      <div className="flex min-h-[28rem] flex-1 flex-col rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
        {aba.vime ? <ModelosInmetVisualizador key={id} modelo={aba.vime} /> : modelo ? <Visualizador key={id} modelo={modelo} /> : null}
      </div>
    </div>
  );
}
