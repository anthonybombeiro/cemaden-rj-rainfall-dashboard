"use client";

import { useEffect, useState } from "react";

import { ChipSeveridade } from "@/components/FloodHubChip";
import { ATRIBUICAO_FH, PostoFH, ROTULO_TENDENCIA, fetchFloodHub } from "@/lib/floodhub";

/** Bloco "Previsão do Google Flood Hub" no detalhe da estação (postos do Google a até 3 km da estação).
 * O Google prevê VAZÃO (m³/s) em pontos da rede de rios — não é o nível da nossa régua, por isso aparece em gráfico
 * próprio, com os limiares do posto, e não sobre o cotagrama. */

export function GraficoVazao({ p }: { p: PostoFH }) {
  const faixas = (p.previsao?.faixas ?? []).filter((f) => f.valor != null);
  if (faixas.length === 0) return <p className="text-xs text-gray-500">Sem previsão numérica para este posto.</p>;
  const W = 420, H = 150, ML = 40, MR = 22, MT = 10, MB = 24;
  const valores = faixas.map((f) => f.valor as number);
  const lim = [p.limiares.atencao, p.limiares.perigo, p.limiares.extremo].filter((x): x is number => x != null);
  const ymax = Math.max(...valores, ...(lim.length ? [Math.min(...lim.map((l) => l * 1.05), Math.max(...valores) * 4 || 1)] : [0])) * 1.1 || 1;
  const x = (i: number) => ML + (faixas.length === 1 ? 0 : (i * (W - ML - MR)) / (faixas.length - 1));
  const y = (v: number) => MT + (1 - v / ymax) * (H - MT - MB);
  const linhas: [number | null, string, string][] = [
    [p.limiares.atencao, "#eab308", "atenção"],
    [p.limiares.perigo, "#f97316", "perigo"],
    [p.limiares.extremo, "#dc2626", "extremo"],
  ];
  const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label="Vazão prevista pelo Flood Hub">
      <line x1={ML} y1={y(0)} x2={W - MR} y2={y(0)} stroke="#d1d5db" />
      <text x={4} y={y(0) + 3} fontSize="9" fill="#6b7280">0</text>
      {linhas.map(([v, cor, nome]) =>
        v != null && v <= ymax ? (
          <g key={nome}>
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke={cor} strokeDasharray="4 3" />
            <text x={4} y={y(v) + 3} fontSize="9" fill={cor}>{Math.round(v)}</text>
            <text x={W - MR - 2} y={y(v) - 2} fontSize="9" fill={cor} textAnchor="end">{nome}</text>
          </g>
        ) : null,
      )}
      <polyline fill="none" stroke="#2563eb" strokeWidth={2} points={faixas.map((f, i) => `${x(i)},${y(f.valor as number)}`).join(" ")} />
      {faixas.map((f, i) => (
        <g key={f.inicio}>
          <circle cx={x(i)} cy={y(f.valor as number)} r={3} fill="#2563eb" />
          <text x={x(i)} y={H - 8} fontSize="9" fill="#6b7280" textAnchor="middle">{dia(f.inicio)}</text>
        </g>
      ))}
    </svg>
  );
}

export default function FloodHubDetalhe({ stationId }: { stationId: number }) {
  const [postos, setPostos] = useState<PostoFH[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    setPostos(null);
    fetchFloodHub({ estacao: stationId })
      .then((d) => {
        if (!cancelado) setPostos(d.postos);
      })
      .catch(() => {
        if (!cancelado) setPostos([]);
      });
    return () => {
      cancelado = true;
    };
  }, [stationId]);

  if (!postos || postos.length === 0) return null;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3">
      <h2 className="mb-1 text-sm font-bold text-gray-800">Previsão do Google Flood Hub</h2>
      <p className="mb-2 text-[11px] text-gray-500">
        Vazão prevista (m³/s) em pontos do rio a até 3 km desta estação — um indicativo, não o nível da régua. {ATRIBUICAO_FH}
      </p>
      <div className="space-y-4">
        {postos.map((p) => (
          <div key={p.gauge_id}>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <ChipSeveridade sev={p.severidade} />
              <span className="font-medium">{p.nome}</span>
              <span className="text-gray-500">
                {p.estacao ? `${p.estacao.distancia_km.toFixed(1).replace(".", ",")} km da estação` : ""}
                {p.tendencia ? ` · ${ROTULO_TENDENCIA[p.tendencia]}` : ""}
                {p.verificado ? "" : " · posto não verificado pelo Google"}
              </span>
              {p.previsao?.severidade_prevista && (
                <span className="flex items-center gap-1">
                  pico previsto: <ChipSeveridade sev={p.previsao.severidade_prevista} />
                </span>
              )}
            </div>
            <GraficoVazao p={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
