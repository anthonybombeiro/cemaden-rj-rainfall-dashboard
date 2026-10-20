"use client";

import { useRef, useState } from "react";

import { useMedia } from "@/lib/useMedia";

export type PontoMare = { t: number; h: number }; // t = minutos desde 00:00 do dia exibido (pode ser <0 ou >1440)
export type ExtremoMare = { t: number; h: number; tipo: "Preamar" | "Baixa-mar"; hhmm: string };

const nf = (v: number) => v.toFixed(2).replace(".", ",");
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Altura estimada por interpolação cossenoidal entre extremos consecutivos (aproximação usual entre preamar e baixa-mar). */
export function alturaEm(pontos: PontoMare[], t: number): number | null {
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (t >= a.t && t <= b.t) return (a.h + b.h) / 2 + ((a.h - b.h) / 2) * Math.cos((Math.PI * (t - a.t)) / (b.t - a.t));
  }
  return null;
}

/** Nascer e pôr do Sol (minutos do dia, horário de Brasília UTC-3) para uma data e coordenadas (algoritmo "sunrise equation"). */
export function solNascerOcaso(dataIso: string, lat: number, lon: number): { nascer: number; ocaso: number } | null {
  const [y, m, d] = dataIso.split("-").map(Number);
  const rad = Math.PI / 180;
  const J = Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5;
  const n = Math.round(J - 2451545.0 + 0.0008);
  const lw = lon; // longitude: oeste negativo, leste positivo (convenção da "sunrise equation")
  const Jestrela = n - lw / 360;
  const M = (357.5291 + 0.98560028 * Jestrela) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lam = (M + C + 180 + 102.9372) % 360;
  const Jtrans = 2451545.0 + Jestrela + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lam * rad);
  const dec = Math.asin(Math.sin(lam * rad) * Math.sin(23.4397 * rad));
  const cosw = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec));
  if (cosw < -1 || cosw > 1) return null;
  const w0 = Math.acos(cosw) / rad;
  const paraMin = (jd: number) => {
    const utc = (jd - 2440587.5) * 86400000;
    const local = utc - 3 * 3600000; // UTC-3
    const dia0 = Date.UTC(y, m - 1, d);
    return (local - dia0) / 60000;
  };
  return { nascer: paraMin(Jtrans - w0 / 360), ocaso: paraMin(Jtrans + w0 / 360) };
}

/** Gráfico da maré do dia: curva, preamar/baixa-mar com valor e hora, Sol (nascer) e Lua (pôr do Sol), "agora" e leitura da altura
 * a cada instante ao passar o mouse/dedo. Escala de hora em hora em telas grandes e de 3 em 3 h nas pequenas. */
export default function MareGrafico({
  pontos,
  extremos,
  nivelMedio,
  agora,
  sol,
}: {
  pontos: PontoMare[];
  extremos: ExtremoMare[];
  nivelMedio: number | null;
  agora: number | null;
  sol: { nascer: number; ocaso: number } | null;
}) {
  const grande = useMedia("(min-width: 1024px)");
  const ref = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const W = grande ? 1200 : 720;
  const H = grande ? 380 : 300;
  const fs = grande ? 15 : 12;
  const m = { l: grande ? 52 : 40, r: 16, t: 46, b: 30 };
  const visiveis = pontos.filter((p) => p.t >= -180 && p.t <= 1620).map((p) => p.h);
  if (visiveis.length === 0) return null;
  const min = Math.floor((Math.min(...visiveis) - 0.15) * 10) / 10;
  const max = Math.ceil((Math.max(...visiveis) + 0.2) * 10) / 10;
  const x = (t: number) => m.l + (t / 1440) * (W - m.l - m.r);
  const y = (h: number) => m.t + (1 - (h - min) / (max - min)) * (H - m.t - m.b);
  const passo = grande ? 10 : 15;
  const curva: string[] = [];
  for (let t = 0; t <= 1440; t += passo) {
    const h = alturaEm(pontos, t);
    if (h != null) curva.push(`${curva.length ? "L" : "M"}${x(t).toFixed(1)},${y(h).toFixed(1)}`);
  }
  const area = `${curva.join(" ")} L${x(1440)},${H - m.b} L${x(0)},${H - m.b} Z`;
  const passoY = max - min > 1.2 ? 0.5 : 0.25;
  const linhasY: number[] = [];
  for (let v = Math.ceil(min / passoY) * passoY; v <= max; v += passoY) linhasY.push(Math.round(v * 100) / 100);
  const horas = grande ? Array.from({ length: 25 }, (_, i) => i) : [0, 3, 6, 9, 12, 15, 18, 21, 24];

  const aoMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vx = ((e.clientX - r.left) / r.width) * W;
    const t = ((vx - m.l) / (W - m.l - m.r)) * 1440;
    setCursor(Math.min(Math.max(t, 0), 1440));
  };
  const hCursor = cursor !== null ? alturaEm(pontos, cursor) : null;
  const subindo = cursor !== null && alturaEm(pontos, cursor + 10) !== null && hCursor !== null ? (alturaEm(pontos, cursor + 10) as number) > hCursor : null;

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y select-none" role="img" aria-label="Curva da maré no dia" onPointerMove={aoMover} onPointerLeave={() => setCursor(null)}>
      <defs>
        <linearGradient id="gMare" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {linhasY.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#e5e7eb" />
          <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={fs - 2} fill="#6b7280">
            {nf(v)}
          </text>
        </g>
      ))}
      {horas.map((hh) => (
        <g key={hh}>
          <line x1={x(hh * 60)} x2={x(hh * 60)} y1={m.t} y2={H - m.b} stroke={hh % 3 === 0 ? "#e5e7eb" : "#f3f4f6"} />
          <text x={x(hh * 60)} y={H - 9} textAnchor="middle" fontSize={fs - 2} fill="#6b7280">
            {String(hh).padStart(2, "0")}h
          </text>
        </g>
      ))}
      {nivelMedio != null && nivelMedio >= min && nivelMedio <= max && (
        <g>
          <line x1={m.l} x2={W - m.r} y1={y(nivelMedio)} y2={y(nivelMedio)} stroke="#9ca3af" strokeDasharray="5 4" />
          <text x={W - m.r - 4} y={y(nivelMedio) - 4} textAnchor="end" fontSize={fs - 3} fill="#6b7280">
            nível médio {nf(nivelMedio)} m
          </text>
        </g>
      )}
      <path d={area} fill="url(#gMare)" />
      <path d={curva.join(" ")} fill="none" stroke="#2563eb" strokeWidth={grande ? 3.5 : 3} strokeLinejoin="round" />

      {sol && sol.nascer >= 0 && sol.nascer <= 1440 && (
        <g>
          <circle cx={x(sol.nascer)} cy={m.t - 22} r={grande ? 11 : 9} fill="#f59e0b" />
          <text x={x(sol.nascer)} y={m.t - 4} textAnchor="middle" fontSize={fs - 2} fill="#6b7280">
            {hhmm(sol.nascer)}
          </text>
        </g>
      )}
      {sol && sol.ocaso >= 0 && sol.ocaso <= 1440 && (
        <g>
          <text x={x(sol.ocaso)} y={m.t - 14} textAnchor="middle" fontSize={grande ? 22 : 18} fill="#64748b">
            ☾
          </text>
          <text x={x(sol.ocaso)} y={m.t - 1} textAnchor="middle" fontSize={fs - 2} fill="#6b7280">
            {hhmm(sol.ocaso)}
          </text>
        </g>
      )}

      {extremos.map((e) => (
        <g key={`${e.t}-${e.h}`}>
          <circle cx={x(e.t)} cy={y(e.h)} r={grande ? 7 : 6} fill="#fff" stroke={e.tipo === "Preamar" ? "#2563eb" : "#d97706"} strokeWidth="3" />
          <text x={x(e.t)} y={e.tipo === "Preamar" ? y(e.h) - 14 : y(e.h) + 26} textAnchor="middle" fontSize={fs + 1} fontWeight="700" fill="#111827">
            {nf(e.h)} m
          </text>
          <text x={x(e.t)} y={e.tipo === "Preamar" ? y(e.h) - 14 - (fs + 3) : y(e.h) + 26 + (fs + 3)} textAnchor="middle" fontSize={fs - 2} fill="#6b7280">
            {e.hhmm}
          </text>
        </g>
      ))}

      {agora != null && agora >= 0 && agora <= 1440 && (
        <g>
          <line x1={x(agora)} x2={x(agora)} y1={m.t} y2={H - m.b} stroke="#9ca3af" strokeDasharray="4 4" />
          {alturaEm(pontos, agora) != null && <circle cx={x(agora)} cy={y(alturaEm(pontos, agora) as number)} r={grande ? 8 : 6} fill="#ef4444" stroke="#fff" strokeWidth="2.5" />}
          <text x={x(agora)} y={m.t + 12} textAnchor="middle" fontSize={fs - 2} fontWeight="600" fill="#ef4444">
            Agora
          </text>
        </g>
      )}

      {cursor !== null && hCursor !== null && (
        <g pointerEvents="none">
          <line x1={x(cursor)} x2={x(cursor)} y1={m.t} y2={H - m.b} stroke="#1d4ed8" strokeWidth="1.5" />
          <circle cx={x(cursor)} cy={y(hCursor)} r="6" fill="#1d4ed8" stroke="#fff" strokeWidth="2" />
          {(() => {
            const larg = 132;
            const bx = Math.min(Math.max(x(cursor) - larg / 2, m.l), W - m.r - larg);
            const by = Math.max(y(hCursor) - 62, m.t);
            return (
              <g>
                <rect x={bx} y={by} width={larg} height={46} rx="8" fill="#111827" opacity="0.92" />
                <text x={bx + larg / 2} y={by + 19} textAnchor="middle" fontSize={fs + 1} fontWeight="700" fill="#fff">
                  {hhmm(cursor)} · {nf(hCursor)} m
                </text>
                <text x={bx + larg / 2} y={by + 37} textAnchor="middle" fontSize={fs - 2} fill="#cbd5e1">
                  {subindo === null ? "" : subindo ? "↑ enchendo" : "↓ vazando"}
                </text>
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}
