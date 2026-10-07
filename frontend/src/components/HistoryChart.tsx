"use client";

import { useMemo, useRef, useState } from "react";

import { Reading } from "@/lib/api";

const WIDTH = 760;
const HEIGHT = 220;
const PAD_LEFT = 48;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;
const LINE_COLOR = "#2563eb"; // tailwind blue-600, mesma cor usada nos botões ativos do app

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function formatShortTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatValue(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** Arredonda pra um passo "redondo" (1/2/5 × potência de 10) — evita ticks
 * tipo "17.3" no eixo Y. */
function niceStep(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const raw = range / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * magnitude;
}

/** Gráfico de linha de uma série só (histórico de um tipo de leitura numa
 * estação) — sem legenda porque o título da seção já diz o que é plotado. */
export default function HistoryChart({ readings, unit }: { readings: Reading[]; unit?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // readings vem do backend do mais recente pro mais antigo — o gráfico lê
  // da esquerda (mais antigo) pra direita (mais recente), como qualquer
  // série temporal.
  const ascending = useMemo(() => [...readings].reverse(), [readings]);

  const { points, minValue, maxValue, yTicks, valueToY } = useMemo(() => {
    if (ascending.length === 0) {
      return {
        points: [] as { x: number; y: number; reading: Reading }[],
        minValue: 0,
        maxValue: 0,
        yTicks: [] as number[],
        valueToY: (v: number) => v,
      };
    }
    const times = ascending.map((r) => new Date(r.timestamp).getTime());
    const values = ascending.map((r) => r.value);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // Dá uma folga de 10% pra linha não colar no topo/base do gráfico; se
    // todos os valores forem iguais, abre uma faixa mínima artificial.
    const pad = (rawMax - rawMin || Math.abs(rawMax) || 1) * 0.1;
    const min = rawMin - pad;
    const max = rawMax + pad;
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const toY = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * plotH;

    const pts = ascending.map((r, i) => {
      const t = new Date(r.timestamp).getTime();
      const x = maxTime === minTime ? PAD_LEFT + plotW / 2 : PAD_LEFT + ((t - minTime) / (maxTime - minTime)) * plotW;
      return { x, y: toY(r.value), reading: r, index: i };
    });

    const step = niceStep(max - min, 4);
    const firstTick = Math.ceil(min / step) * step;
    const ticks: number[] = [];
    for (let v = firstTick; v <= max; v += step) ticks.push(Math.round(v * 1000) / 1000);

    return { points: pts, minValue: rawMin, maxValue: rawMax, yTicks: ticks, valueToY: toY };
  }, [ascending]);

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - relX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  };

  if (ascending.length === 0) {
    return <div className="p-4 text-sm text-gray-400">Sem histórico disponível para este período.</div>;
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const last = points[points.length - 1];

  return (
    <div className="w-full">
      <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-pan-y"
        role="img"
        aria-label={`Gráfico de histórico com ${points.length} leituras, variando de ${formatValue(minValue)} a ${formatValue(maxValue)}${unit ? ` ${unit}` : ""}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick) => {
          const y = valueToY(tick);
          return (
            <g key={tick}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={y} textAnchor="end" dominantBaseline="middle" className="fill-gray-500 text-[10px]">
                {formatValue(tick)}
              </text>
            </g>
          );
        })}

        <text x={PAD_LEFT} y={HEIGHT - 8} textAnchor="start" className="fill-gray-500 text-[10px]">
          {formatShortTimestamp(ascending[0].timestamp)}
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 8} textAnchor="end" className="fill-gray-500 text-[10px]">
          {formatShortTimestamp(ascending[ascending.length - 1].timestamp)}
        </text>

        <path d={pathD} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* marcador do último ponto, com anel na cor da superfície pra não se confundir com a linha */}
        <circle cx={last.x} cy={last.y} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={2} />

        {hovered && (
          <>
            <line x1={hovered.x} x2={hovered.x} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill={LINE_COLOR} stroke="white" strokeWidth={2} />
          </>
        )}
      </svg>
        {/* Tooltip flutuante (07/10/2026: "ter os detalhes quando o foco estiver sobre o gráfico") */}
        {hovered && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 rounded-md border border-gray-200 bg-white/95 p-2 text-[11px] leading-snug text-gray-700 shadow-lg"
            style={hovered.x > WIDTH * 0.62 ? { right: `${100 - (hovered.x / WIDTH) * 100 + 2}%` } : { left: `${(hovered.x / WIDTH) * 100 + 2}%` }}
          >
            <div className="font-bold text-gray-900">{formatTimestamp(hovered.reading.timestamp)}</div>
            <div className="mt-0.5">
              Valor: <strong className="text-gray-900">{formatValue(hovered.reading.value)}</strong>
              {unit ? ` ${unit}` : ""}
            </div>
            <div className="text-gray-500">
              Período: mín {formatValue(minValue)} · máx {formatValue(maxValue)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-1 flex min-h-[1.5rem] items-center justify-between text-xs text-gray-600">
        <span>
          Mín: <strong className="text-gray-800">{formatValue(minValue)}</strong> · Máx:{" "}
          <strong className="text-gray-800">{formatValue(maxValue)}</strong>
        </span>
        {hovered && (
          <span className="rounded bg-gray-100 px-2 py-0.5">
            {formatTimestamp(hovered.reading.timestamp)} — <strong className="text-gray-900">{formatValue(hovered.reading.value)}</strong>
            {unit ? ` ${unit}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
