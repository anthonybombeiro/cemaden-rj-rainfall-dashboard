"use client";

import { useMemo } from "react";

import { Previsao } from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeature, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";
import { iconeSrc } from "@/lib/meteorologia";

/** Mapa de previsão por REDEC (sem mapa-base): cada REDEC é pintada pela condição do tempo e tem um cartão com ícone,
 * nome e temperaturas, ligado à região por uma linha. É o mesmo desenho na tela e na imagem exportada (formato de post). */
export const MAPA_W = 712;
export const MAPA_H = 560;
const CARD_W = 114;
const CARD_H = 56;
const INSET = { x: 122, y: 66, w: MAPA_W - 244, h: MAPA_H - 132 };

export function corDoTempo(icone: string | undefined): string {
  if (!icone) return "#f1f5f9";
  if (/Raio/.test(icone)) return "#a78bfa";
  if (/Chuva/.test(icone)) return "#7cb7f5";
  if (icone === "ceuClaro") return "#fcd34d";
  if (icone === "ceuPoucasNuvens") return "#fde9a3";
  if (icone === "ceuParcialmenteNublado") return "#e2e8f0";
  if (icone === "ceuNublado") return "#cbd5e1";
  return "#94a3b8";
}
export const CLASSES_TEMPO: { rotulo: string; cor: string }[] = [
  { rotulo: "Céu claro", cor: "#fcd34d" },
  { rotulo: "Poucas nuvens", cor: "#fde9a3" },
  { rotulo: "Parcialmente nublado", cor: "#e2e8f0" },
  { rotulo: "Nublado/encoberto", cor: "#94a3b8" },
  { rotulo: "Chuva", cor: "#7cb7f5" },
  { rotulo: "Chuva e raios", cor: "#a78bfa" },
];

type Ponto = [number, number];

function centroideMaiorAnel(f: GeoJsonFeature, proj: (lon: number, lat: number) => Ponto): Ponto {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
  let melhor: { area: number; c: Ponto } = { area: -1, c: [0, 0] };
  for (const poly of polys) {
    const anel = poly[0].map(([lon, lat]) => proj(lon, lat));
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < anel.length - 1; i++) {
      const [x0, y0] = anel[i];
      const [x1, y1] = anel[i + 1];
      const k = x0 * y1 - x1 * y0;
      a += k;
      cx += (x0 + x1) * k;
      cy += (y0 + y1) * k;
    }
    a /= 2;
    if (Math.abs(a) > melhor.area && a !== 0) melhor = { area: Math.abs(a), c: [cx / (6 * a), cy / (6 * a)] };
  }
  return melhor.c;
}

/** Coordenada ao longo do contorno do retângulo (sentido horário a partir do canto superior esquerdo) do ponto onde o raio
 * centro→p atravessa a borda. */
function posicaoNoContorno(p: Ponto): number {
  const cx = MAPA_W / 2;
  const cy = MAPA_H / 2;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  const sx = dx === 0 ? Infinity : (dx > 0 ? MAPA_W - cx : cx) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (dy > 0 ? MAPA_H - cy : cy) / Math.abs(dy);
  const s = Math.min(sx, sy);
  const qx = cx + dx * s;
  const qy = cy + dy * s;
  if (Math.abs(qy) < 0.5) return qx;
  if (Math.abs(qx - MAPA_W) < 0.5) return MAPA_W + qy;
  if (Math.abs(qy - MAPA_H) < 0.5) return MAPA_W + MAPA_H + (MAPA_W - qx);
  return 2 * MAPA_W + MAPA_H + (MAPA_H - qy);
}
const PERIMETRO = 2 * (MAPA_W + MAPA_H);
function pontoDoContorno(u: number): Ponto {
  const v = ((u % PERIMETRO) + PERIMETRO) % PERIMETRO;
  if (v <= MAPA_W) return [v, 0];
  if (v <= MAPA_W + MAPA_H) return [MAPA_W, v - MAPA_W];
  if (v <= 2 * MAPA_W + MAPA_H) return [MAPA_W - (v - MAPA_W - MAPA_H), MAPA_H];
  return [0, MAPA_H - (v - 2 * MAPA_W - MAPA_H)];
}
const distCircular = (a: number, b: number) => {
  const d = Math.abs(a - b) % PERIMETRO;
  return Math.min(d, PERIMETRO - d);
};

type Item = { redec: string; nome: string; centro: Ponto; card: Ponto; d: string };

export default function PrevisaoMapaCorpo({
  geo,
  previsoes,
  selecionada,
  onSelecionar,
}: {
  geo: GeoJsonFeatureCollection;
  previsoes: Previsao[];
  selecionada?: string | null;
  onSelecionar?: (redec: string) => void;
}) {
  const itens = useMemo<Item[]>(() => {
    const proj0 = makeProjector(computeBBox(geo), INSET.w, INSET.h, 0);
    const proj = (lon: number, lat: number): Ponto => {
      const [x, y] = proj0(lon, lat);
      return [x + INSET.x, y + INSET.y];
    };
    const base = geo.features.map((f) => ({ redec: f.properties.redec, nome: f.properties.nome, centro: centroideMaiorAnel(f, proj), d: geometryToPath(f.geometry, proj) }));
    // cartões nos pontos do contorno (igualmente espaçados), na mesma ordem em que as regiões aparecem no mapa
    const n = base.length;
    const slots = Array.from({ length: n }, (_, k) => ((k + 0.5) * PERIMETRO) / n);
    const us = base.map((b) => posicaoNoContorno(b.centro));
    const ordem = base.map((_, i) => i).sort((a, b) => us[a] - us[b]);
    let melhorShift = 0;
    let melhorCusto = Infinity;
    for (let s = 0; s < n; s++) {
      let custo = 0;
      ordem.forEach((i, j) => (custo += distCircular(us[i], slots[(j + s) % n])));
      if (custo < melhorCusto) {
        melhorCusto = custo;
        melhorShift = s;
      }
    }
    const out: Item[] = [];
    ordem.forEach((i, j) => {
      const [px, py] = pontoDoContorno(slots[(j + melhorShift) % n]);
      const card: Ponto = [Math.min(Math.max(px, CARD_W / 2 + 4), MAPA_W - CARD_W / 2 - 4), Math.min(Math.max(py, CARD_H / 2 + 4), MAPA_H - CARD_H / 2 - 4)];
      out.push({ ...base[i], card });
    });
    return out;
  }, [geo]);

  const porRedec = useMemo(() => new Map(previsoes.map((p) => [p.regiao, p])), [previsoes]);

  return (
    <div className="relative shrink-0 overflow-hidden rounded-lg bg-sky-50" style={{ width: MAPA_W, height: MAPA_H }}>
      <svg width={MAPA_W} height={MAPA_H} viewBox={`0 0 ${MAPA_W} ${MAPA_H}`} className="absolute inset-0" role="img" aria-label="Previsão do tempo por REDEC">
        {itens.map((it) => {
          const p = porRedec.get(it.redec);
          return (
            <path
              key={it.redec}
              d={it.d}
              fill={corDoTempo(p?.icone)}
              stroke={selecionada === it.redec ? "#1d4ed8" : "#ffffff"}
              strokeWidth={selecionada === it.redec ? 3.5 : 2.5}
              strokeLinejoin="round"
              className={onSelecionar ? "cursor-pointer" : undefined}
              onClick={onSelecionar ? () => onSelecionar(it.redec) : undefined}
            />
          );
        })}
        {itens.map((it) => (
          <g key={`l-${it.redec}`}>
            <line x1={it.centro[0]} y1={it.centro[1]} x2={it.card[0]} y2={it.card[1]} stroke="#475569" strokeWidth={1.3} />
            <circle cx={it.centro[0]} cy={it.centro[1]} r={3.5} fill="#1e293b" stroke="#fff" strokeWidth={1.5} />
          </g>
        ))}
      </svg>
      {itens.map((it) => {
        const p = porRedec.get(it.redec);
        const ativo = selecionada === it.redec;
        return (
          <div
            key={`c-${it.redec}`}
            onClick={onSelecionar ? () => onSelecionar(it.redec) : undefined}
            className={`absolute flex items-center gap-1.5 rounded-lg border bg-white px-1.5 shadow-sm ${ativo ? "border-blue-600 ring-2 ring-blue-500" : "border-slate-300"} ${onSelecionar ? "cursor-pointer" : ""}`}
            style={{ width: CARD_W, height: CARD_H, left: it.card[0] - CARD_W / 2, top: it.card[1] - CARD_H / 2 }}
          >
            {p?.icone ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconeSrc(p.icone)} alt="" width={36} height={36} className="h-9 w-9 shrink-0 object-contain" />
            ) : (
              <div className="h-9 w-9 shrink-0 rounded-full bg-slate-100" />
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[9px] font-bold uppercase tracking-tight text-slate-600">{it.nome}</div>
              {p ? (
                <div className="mt-0.5 flex items-baseline gap-1 whitespace-nowrap">
                  <span className="text-[15px] font-extrabold text-blue-700">{Math.round(p.temperatura_minima)}°</span>
                  <span className="text-[10px] text-slate-400">/</span>
                  <span className="text-[15px] font-extrabold text-red-600">{Math.round(p.temperatura_maxima)}°</span>
                </div>
              ) : (
                <div className="mt-0.5 text-[10px] text-slate-400">sem previsão</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
