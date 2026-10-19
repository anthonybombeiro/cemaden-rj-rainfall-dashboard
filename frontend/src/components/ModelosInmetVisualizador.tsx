"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { AREAS_VIME, fetchParametrosVime, fetchQuadrosVime, fetchRodadasVime, ModeloVime, Opcao, QuadroVime } from "@/lib/inmet";

const MS_POR_QUADRO = 700;
const PARAM_PADRAO = ["prec24h", "Vento10m", "T2mPress", "T2m"];

/** Visualizador dos modelos COSMO do INMET (VIME): área, produto, rodada, barra de tempo e animação.
 * Cada série traz todos os quadros de uma vez (~4 MB), por isso só carrega depois de escolher o produto. */
export default function ModelosInmetVisualizador({ modelo }: { modelo: ModeloVime }) {
  const [area, setArea] = useState("SE");
  const [params, setParams] = useState<Opcao[]>([]);
  const [param, setParam] = useState("");
  const [rodadas, setRodadas] = useState<Opcao[]>([]);
  const [rodada, setRodada] = useState("");
  const [quadros, setQuadros] = useState<QuadroVime[]>([]);
  const [i, setI] = useState(0);
  const [animando, setAnimando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetchParametrosVime(modelo, area)
      .then((l) => {
        if (cancelado) return;
        setParams(l);
        setParam((p) => (l.some((x) => x.sigla === p) ? p : l.find((x) => PARAM_PADRAO.includes(x.sigla))?.sigla ?? l[0]?.sigla ?? ""));
      })
      .catch(() => !cancelado && setErro("Lista de produtos do INMET indisponível."));
    return () => {
      cancelado = true;
    };
  }, [modelo, area]);

  useEffect(() => {
    if (!param) return;
    let cancelado = false;
    fetchRodadasVime(modelo, area, param)
      .then((l) => {
        if (cancelado) return;
        setRodadas(l);
        setRodada(l[0]?.sigla ?? "");
      })
      .catch(() => !cancelado && setErro("Rodadas do INMET indisponíveis."));
    return () => {
      cancelado = true;
    };
  }, [modelo, area, param]);

  useEffect(() => {
    if (!param || !rodada) return;
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregando(true);
      setAnimando(false);
      setErro(null);
    });
    fetchQuadrosVime(modelo, area, param, rodada)
      .then((q) => {
        if (cancelado) return;
        const ord = [...q].sort((a, b) => a.validade - b.validade);
        setQuadros(ord);
        setI(0);
        if (!ord.length) setErro("Sem quadros para esta combinação.");
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar os quadros do INMET."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [modelo, area, param, rodada]);

  useEffect(() => {
    if (!animando || quadros.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % quadros.length), MS_POR_QUADRO);
    return () => clearInterval(t);
  }, [animando, quadros.length]);

  const q = quadros[i];
  const sel = "rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs sm:text-sm";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 text-sm">
        <select aria-label="Área" value={area} onChange={(e) => setArea(e.target.value)} className={sel}>
          {AREAS_VIME.map((a) => (
            <option key={a.sigla} value={a.sigla}>
              {a.nome}
            </option>
          ))}
        </select>
        <select aria-label="Produto" value={param} onChange={(e) => setParam(e.target.value)} className={`${sel} max-w-[14rem] sm:max-w-md`}>
          {params.map((p) => (
            <option key={p.sigla} value={p.sigla}>
              {p.nome}
            </option>
          ))}
        </select>
        <select aria-label="Rodada" value={rodada} onChange={(e) => setRodada(e.target.value)} className={sel}>
          {rodadas.slice(0, 8).map((r) => (
            <option key={r.sigla} value={r.sigla}>
              {r.nome}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={quadros.length < 2}
          onClick={() => setAnimando((a) => !a)}
          className={`flex items-center gap-1 rounded px-2 py-1.5 font-medium disabled:opacity-40 ${animando ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        >
          {animando ? <Pause size={15} /> : <Play size={15} />}
          {animando ? "Parar" : "Animar"}
        </button>
      </div>
      <div className="mb-2 flex shrink-0 items-center gap-2 text-xs text-gray-600">
        <button type="button" disabled={i <= 0} onClick={() => { setAnimando(false); setI(i - 1); }} className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200 disabled:opacity-40" aria-label="Quadro anterior">
          ◀
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(quadros.length - 1, 0)}
          value={i}
          onChange={(e) => {
            setAnimando(false);
            setI(Number(e.target.value));
          }}
          className="min-w-0 flex-1"
          aria-label="Horas de previsão"
        />
        <button type="button" disabled={i >= quadros.length - 1} onClick={() => { setAnimando(false); setI(i + 1); }} className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200 disabled:opacity-40" aria-label="Próximo quadro">
          ▶
        </button>
        <span className="w-16 shrink-0 text-right font-semibold text-gray-800">{q ? `+${q.validade} h` : ""}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto rounded-lg border border-gray-200 bg-white p-1">
        {carregando ? (
          <p className="p-8 text-center text-sm text-gray-400">Carregando quadros do INMET (até ~4 MB)…</p>
        ) : erro ? (
          <p className="p-8 text-center text-sm text-gray-500">{erro}</p>
        ) : q ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.base64} alt={`${modelo} ${param} +${q.validade} h`} className="h-auto max-h-full w-auto max-w-full object-contain" />
        ) : null}
      </div>
    </div>
  );
}
