"use client";

import { useMemo } from "react";

import { SerieBalde } from "@/lib/api";

const WIDTH = 720;
const HEIGHT = 200;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;

function formatShort(iso: string, janela: "4h" | "24h" | "7d"): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions =
    janela === "7d"
      ? { day: "2-digit", month: "2-digit" }
      : { hour: "2-digit", minute: "2-digit" };
  try {
    return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...opts });
  } catch {
    return iso;
  }
}

/** Barra por balde de tempo + linha de acumulado — mesmo padrão visual do
 * "Precipitação Acumulada" do Rede Salvar (CEMADEN nacional), pedido do
 * usuário 2026-09-28. Sem legenda de eixo Y à direita (acumulado reusa a
 * mesma escala da barra — os valores aqui são tipicamente pequenos o
 * bastante pra não precisar de dois eixos). */
export default function AccumulationChart({
  serie,
  janela,
  totalMm,
}: {
  serie: SerieBalde[];
  janela: "4h" | "24h" | "7d";
  totalMm: number;
}) {
  const { barras, linha, maxY, ticksY } = useMemo(() => {
    if (serie.length === 0) return { barras: [], linha: "", maxY: 1, ticksY: [0] };
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = serie.length;
    const larguraBarra = Math.min(28, (plotW / n) * 0.7);

    let acumulado = 0;
    const acumulados = serie.map((b) => (acumulado += b.chuva_mm));
    const maiorValor = Math.max(...serie.map((b) => b.chuva_mm), ...acumulados, 1);
    const maxYArred = Math.ceil(maiorValor * 1.15 * 10) / 10 || 1;

    const x = (i: number) => PAD_LEFT + ((i + 0.5) / n) * plotW;
    const y = (v: number) => PAD_TOP + (1 - v / maxYArred) * plotH;

    const bs = serie.map((b, i) => ({
      x: x(i) - larguraBarra / 2,
      y: y(b.chuva_mm),
      w: larguraBarra,
      h: PAD_TOP + plotH - y(b.chuva_mm),
      inicio: b.inicio,
      valor: b.chuva_mm,
    }));
    const linhaD = acumulados.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

    const passo = maxYArred / 4;
    const ticks = [0, passo, passo * 2, passo * 3, maxYArred].map((v) => Math.round(v * 10) / 10);

    return { barras: bs, linha: linhaD, maxY: maxYArred, ticksY: ticks };
  }, [serie]);

  if (serie.length === 0) {
    return <div className="p-4 text-sm text-gray-400">Sem leituras de chuva nesta janela.</div>;
  }

  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const yOf = (v: number) => PAD_TOP + (1 - v / maxY) * plotH;
  const mostrarLabelIdx = (i: number) => {
    const passo = Math.ceil(serie.length / 8);
    return i % passo === 0 || i === serie.length - 1;
  };

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full">
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yOf(t)} y2={yOf(t)} stroke="#f1f5f9" strokeWidth={1} />
            <text x={PAD_LEFT - 6} y={yOf(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-400 text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {barras.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 0)} fill="#7dd3fc" />
        ))}
        <path d={linha} fill="none" stroke="#0369a1" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {serie.map((b, i) =>
          mostrarLabelIdx(i) ? (
            <text
              key={b.inicio}
              x={PAD_LEFT + ((i + 0.5) / serie.length) * (WIDTH - PAD_LEFT - PAD_RIGHT)}
              y={HEIGHT - 10}
              textAnchor="middle"
              className="fill-gray-500 text-[9px]"
            >
              {formatShort(b.inicio, janela)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-600">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-sky-300" /> Observado
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-sky-800" /> Acumulado
          </span>
        </span>
        <span>
          Total: <strong className="text-gray-900">{totalMm.toFixed(1)} mm</strong>
        </span>
      </div>
    </div>
  );
}
