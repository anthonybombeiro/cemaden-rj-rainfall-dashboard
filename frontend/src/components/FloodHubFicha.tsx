"use client";

import { X } from "lucide-react";

import { GraficoVazao } from "@/components/FloodHubDetalhe";
import { ChipSeveridade } from "@/components/FloodHubChip";
import { ATRIBUICAO_FH, ObservadoFH, PostoFH, ROTULO_TENDENCIA, severidadeEfetiva } from "@/lib/floodhub";

/** Ficha do posto do Flood Hub (clique na tabela ou no mapa), no estilo da ficha do site do Google:
 * tendência, informações do medidor e gráfico. A API pública do Google NÃO entrega o contorno nem a área da bacia
 * (o site usa dados internos), então a ficha mostra o que a API fornece e o nível que nós lemos na estação casada. */

const COR_COTA: Record<string, string> = { atencao: "#f97316", alerta: "#dc2626", inundacao: "#7e22ce", extrema: "#db2777" };

function GraficoNivel({ o }: { o: ObservadoFH }) {
  const pts = o.serie.map(([t, v]) => ({ t: new Date(t).getTime(), v }));
  if (pts.length < 2) return <p className="text-xs text-gray-500">Poucas leituras nas últimas 72 h.</p>;
  const W = 420, H = 160, ML = 40, MR = 22, MT = 10, MB = 24;
  const cotas = o.cotas_cm ? Object.entries(o.cotas_cm).filter(([, v]) => v != null) as [string, number][] : [];
  const vmax = Math.max(...pts.map((p) => p.v));
  const vmin = Math.min(...pts.map((p) => p.v));
  const topoCota = cotas.length ? Math.min(...cotas.map(([, v]) => v)) : null;
  // eixo cobre as leituras e a primeira cota acima delas (sem esmagar a curva com cotas muito distantes)
  const proxima = cotas.map(([, v]) => v).filter((v) => v >= vmax).sort((a, b) => a - b)[0];
  const ymax = Math.max(vmax, proxima ?? vmax) * 1.08 || 1;
  const ymin = Math.min(0, vmin);
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = (t: number) => ML + ((t - t0) / Math.max(1, t1 - t0)) * (W - ML - MR);
  const y = (v: number) => MT + (1 - (v - ymin) / (ymax - ymin)) * (H - MT - MB);
  const dias: number[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getTime() + 86_400_000)) {
    const m = new Date(d); m.setHours(0, 0, 0, 0);
    if (m.getTime() >= t0) dias.push(m.getTime());
  }
  void topoCota;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xl" role="img" aria-label="Nível observado nas últimas 72 horas">
      <line x1={ML} y1={y(ymin)} x2={W - MR} y2={y(ymin)} stroke="#d1d5db" />
      <text x={4} y={y(ymin) + 3} fontSize="9" fill="#6b7280">{Math.round(ymin)}</text>
      <text x={4} y={y(ymax) + 9} fontSize="9" fill="#6b7280">{Math.round(ymax)}</text>
      {cotas.map(([k, v]) =>
        v <= ymax ? (
          <g key={k}>
            <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke={COR_COTA[k]} strokeDasharray="4 3" />
            <text x={W - MR - 2} y={y(v) - 2} fontSize="9" fill={COR_COTA[k]} textAnchor="end">{k === "inundacao" ? "transbordo" : k}</text>
          </g>
        ) : null,
      )}
      <polygon fill="#bfdbfe" opacity={0.5} points={`${x(t0)},${y(ymin)} ${pts.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} ${x(t1)},${y(ymin)}`} />
      <polyline fill="none" stroke="#2563eb" strokeWidth={2} points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} />
      {dias.map((d) => (
        <text key={d} x={x(d)} y={H - 8} fontSize="9" fill="#6b7280" textAnchor="middle">
          {new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </text>
      ))}
    </svg>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-gray-400">{rotulo}</dt>
      <dd className="text-sm text-gray-800">{valor || "—"}</dd>
    </div>
  );
}

export default function FloodHubFicha({
  posto,
  onClose,
  onOpenStation,
}: {
  posto: PostoFH;
  onClose: () => void;
  onOpenStation?: (id: number) => void;
}) {
  const sev = severidadeEfetiva(posto);
  const o = posto.observado;
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:max-w-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-900">{posto.nome}</h2>
            <p className="text-xs text-gray-600">{[posto.rio, posto.municipio || "fora do RJ"].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <ChipSeveridade sev={sev} />
          {posto.tendencia && <span>{ROTULO_TENDENCIA[posto.tendencia]}</span>}
          {posto.previsao?.pico != null && (
            <span>pico previsto {Math.round(posto.previsao.pico)} m³/s ({posto.previsao.severidade_prevista === "NO_FLOODING" ? "sem cheia" : "acima do limiar"})</span>
          )}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{posto.verificado ? "verificado pelo Google" : "NÃO verificado pelo Google — usar com cautela"}</span>
        </div>

        {posto.previsao && posto.previsao.faixas.length > 0 && (
          <section className="mb-3">
            <h3 className="mb-1 text-sm font-semibold text-gray-800">Tendência — vazão prevista pelo Google (m³/s)</h3>
            <GraficoVazao p={posto} />
          </section>
        )}

        {o ? (
          <section className="mb-3">
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Nível observado (últimas 72 h) — estação {posto.estacao?.nome}
              {posto.estacao ? ` (${posto.estacao.distancia_km.toFixed(1).replace(".", ",")} km)` : ""}
            </h3>
            <p className="mb-1 text-xs text-gray-600">
              Agora {o.nivel_cm.toFixed(0)} cm
              {o.tendencia ? ` · ${ROTULO_TENDENCIA[o.tendencia]} (${o.variacao_6h_cm! > 0 ? "+" : ""}${o.variacao_6h_cm} cm em 6 h)` : ""}
              {o.classe_cota ? ` · cota: ${o.classe_cota}` : ""}
            </p>
            <GraficoNivel o={o} />
          </section>
        ) : (
          !posto.previsao && (
            <p className="mb-3 rounded bg-gray-50 p-2 text-xs text-gray-600">
              {posto.tem_modelo
                ? "Sem previsão emitida para este posto agora."
                : posto.estacao
                  ? `O Google não faz previsão para postos da ANA (só a situação atual). A estação nossa ${posto.estacao.nome} (mesmo rio) não tem leituras de nível nas últimas 72 h.`
                  : "O Google não faz previsão para postos da ANA (só a situação atual) e não há estação nossa do mesmo rio por perto para mostrar o nível."}
            </p>
          )
        )}

        <section className="mb-3">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">Informações do posto</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Campo rotulo="ID" valor={posto.gauge_id} />
            <Campo rotulo="Origem" valor={posto.fonte === "HYBAS" ? "HYBAS (ponto virtual da rede de rios)" : posto.fonte} />
            <Campo rotulo="Lat / Lon" valor={`${posto.latitude.toFixed(4)}, ${posto.longitude.toFixed(4)}`} />
            <Campo rotulo="Rio" valor={posto.rio} />
            <Campo rotulo="Município" valor={posto.municipio || "fora do RJ"} />
            <Campo rotulo="Modelo de previsão" valor={posto.tem_modelo ? "sim" : "não (só situação)"} />
            {posto.limiares.atencao != null && (
              <Campo
                rotulo="Limiares (m³/s)"
                valor={`${Math.round(posto.limiares.atencao)} / ${Math.round(posto.limiares.perigo ?? 0)} / ${Math.round(posto.limiares.extremo ?? 0)}`}
              />
            )}
            <Campo rotulo="Emitido" valor={posto.emitido_em ? new Date(posto.emitido_em).toLocaleString("pt-BR") : null} />
          </dl>
          <p className="mt-2 text-[11px] text-gray-500">
            Contorno e área da bacia: não fornecidos pela API pública do Google (o site do Flood Hub usa dados internos).
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-gray-500">{ATRIBUICAO_FH}</span>
          {posto.estacao && onOpenStation && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenStation(posto.estacao!.id);
              }}
              className="rounded border border-blue-600 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              Ver histórico da estação {posto.estacao.nome}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
