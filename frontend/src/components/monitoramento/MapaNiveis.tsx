"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { normalizeMunicipioName } from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeature, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";
import { corTextoSobre, ESCALA_NM, fmtDataHora, NivelMunicipio } from "@/lib/nivelMonitoramento";

const W = 900;
const H = 640;
const SEM_DADO = "#e5e7eb";

let cacheMun: GeoJsonFeatureCollection | null = null;
let cacheRedec: GeoJsonFeatureCollection | null = null;

export type MapaNiveisHandle = { getSvgElement: () => SVGSVGElement | null };

/** Mapa interativo do Nível de Monitoramento por município (SVG, sem biblioteca de mapas — serve também à página pública):
 * cor da escala NM 0–5, contorno das REDECs, zoom (roda, botões, arrastar), nome nos municípios em NM alto, dica ao passar o mouse e
 * seleção por clique. Vigência vencida aparece hachurada ("em revisão"). */
const MapaNiveis = forwardRef<
  MapaNiveisHandle,
  {
    niveis: NivelMunicipio[];
    selecionados?: Set<string>;
    onClique?: (municipio: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
    /** Mostra o nome dos municípios com NM a partir deste nível (padrão 3). */
    rotuloMin?: number;
    altura?: string;
  }
>(function MapaNiveis({ niveis, selecionados, onClique, rotuloMin = 3, altura = "min(70vh, 640px)" }, ref) {
  const svgRef = useRef<SVGSVGElement>(null);
  useImperativeHandle(ref, () => ({ getSvgElement: () => svgRef.current }));
  const [mun, setMun] = useState<GeoJsonFeatureCollection | null>(cacheMun);
  const [redec, setRedec] = useState<GeoJsonFeatureCollection | null>(cacheRedec);
  const [dica, setDica] = useState<{ x: number; y: number; n: NivelMunicipio } | null>(null);
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });
  const arrasto = useRef<{ x: number; y: number; vx: number; vy: number; moveu: boolean } | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (!cacheMun) {
      fetch("/rj_municipios.geojson").then((r) => r.json()).then((d) => { cacheMun = d; if (!cancelado) setMun(d); }).catch(() => {});
    }
    if (!cacheRedec) {
      fetch("/redecs.geojson").then((r) => r.json()).then((d) => { cacheRedec = d; if (!cancelado) setRedec(d); }).catch(() => {});
    }
    return () => { cancelado = true; };
  }, []);

  const porNome = useMemo(() => new Map(niveis.map((n) => [normalizeMunicipioName(n.municipio), n])), [niveis]);
  const projetor = useMemo(() => (mun ? makeProjector(computeBBox(mun), W, H, 10) : null), [mun]);
  const caminhos = useMemo(() => {
    if (!mun || !projetor) return [];
    return mun.features.map((f: GeoJsonFeature) => {
      const [x, y] = centro(f, projetor);
      return { chave: f.properties.nomeNormalizado, nome: f.properties.nome, d: geometryToPath(f.geometry, projetor), cx: x, cy: y };
    });
  }, [mun, projetor]);
  const caminhosRedec = useMemo(() => (redec && projetor ? redec.features.map((f) => geometryToPath(f.geometry, projetor)) : []), [redec, projetor]);

  if (!mun || !projetor) return <div className="p-6 text-center text-sm text-gray-400">Carregando mapa…</div>;

  const zoom = (fator: number, cx = W / 2, cy = H / 2) =>
    setVista((v) => {
      const k = Math.min(10, Math.max(1, v.k * fator));
      const f = k / v.k;
      return limita({ k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f });
    });
  const posicaoSvg = (e: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  return (
    <div className="relative w-full select-none overflow-hidden rounded-lg border border-gray-200 bg-sky-50" style={{ aspectRatio: `${W} / ${H}`, maxHeight: altura }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`h-full w-full ${vista.k > 1 ? "touch-none" : "touch-pan-y"}`}
        role="img"
        aria-label="Mapa do Nível de Monitoramento por município do Estado do Rio de Janeiro"
        preserveAspectRatio="xMidYMid meet"
        onWheel={(e) => {
          e.preventDefault();
          const p = posicaoSvg(e);
          zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
        }}
        onPointerDown={(e) => {
          arrasto.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, moveu: false };
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          if (a && vista.k > 1) {
            const r = svgRef.current!.getBoundingClientRect();
            const dx = ((e.clientX - a.x) / r.width) * W, dy = ((e.clientY - a.y) / r.height) * H;
            if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
            if (a.moveu) setVista((v) => limita({ ...v, x: a.vx + dx, y: a.vy + dy }));
          }
        }}
        onPointerUp={() => setTimeout(() => (arrasto.current = null), 0)}
        onPointerLeave={() => setDica(null)}
      >
        <defs>
          <pattern id="hachura-vencida" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="rgba(255,255,255,0.35)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#111827" strokeWidth="2.5" />
          </pattern>
        </defs>
        <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.k})`}>
          {caminhos.map((c) => {
            const n = porNome.get(c.chave);
            const nivel = n?.nivel ?? 0;
            const sel = !!n && !!selecionados?.has(n.municipio);
            return (
              <g key={c.chave}>
                <path
                  d={c.d}
                  fill={n ? ESCALA_NM[nivel].cor : SEM_DADO}
                  stroke={sel ? "#111827" : "#475569"}
                  strokeWidth={(sel ? 2.4 : 0.5) / vista.k}
                  strokeDasharray={sel ? `${4 / vista.k} ${2 / vista.k}` : undefined}
                  style={{ cursor: onClique ? "pointer" : "default" }}
                  onPointerEnter={(e) => n && setDica({ ...posicaoSvg(e), n })}
                  onPointerMove={(e) => n && setDica({ ...posicaoSvg(e), n })}
                  onClick={(e) => {
                    if (arrasto.current?.moveu) return;
                    if (n && onClique) onClique(n.municipio, e);
                  }}
                />
                {n?.vencida && <path d={c.d} fill="url(#hachura-vencida)" pointerEvents="none" />}
              </g>
            );
          })}
          {caminhosRedec.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="#1d4ed8" strokeWidth={1.6 / vista.k} pointerEvents="none" />
          ))}
          {caminhos.map((c) => {
            const n = porNome.get(c.chave);
            if (!n || n.nivel < rotuloMin) return null;
            const cor = ESCALA_NM[n.nivel].cor;
            return (
              <text key={`t-${c.chave}`} x={c.cx} y={c.cy} textAnchor="middle" fontSize={10 / Math.sqrt(vista.k)} fontWeight={700} fill={corTextoSobre(cor)} stroke={corTextoSobre(cor) === "#ffffff" ? "#00000066" : "#ffffff99"} strokeWidth={2 / vista.k} paintOrder="stroke" pointerEvents="none">
                {c.nome}
              </text>
            );
          })}
        </g>
      </svg>
      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded border border-gray-300 bg-white text-gray-700 shadow">
        <button type="button" className="px-2.5 py-1 text-base leading-none hover:bg-gray-100" onClick={() => zoom(1.4)} aria-label="Ampliar o mapa">+</button>
        <button type="button" className="border-t border-gray-200 px-2.5 py-1 text-base leading-none hover:bg-gray-100" onClick={() => zoom(1 / 1.4)} aria-label="Reduzir o mapa">−</button>
        <button type="button" className="border-t border-gray-200 px-2 py-1 text-[10px] leading-none hover:bg-gray-100" onClick={() => setVista({ k: 1, x: 0, y: 0 })} aria-label="Ver o estado todo">todo</button>
      </div>
      {dica && (
        <div className="pointer-events-none absolute z-10 max-w-[14rem] rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-lg" style={{ left: `${Math.min((dica.x / W) * 100, 70)}%`, top: `${Math.min((dica.y / H) * 100 + 3, 85)}%` }}>
          <p className="font-semibold text-gray-800">{dica.n.municipio}</p>
          <p className="flex items-center gap-1.5 text-gray-600">
            <span className="inline-block h-2.5 w-2.5 rounded-sm border border-black/20" style={{ background: ESCALA_NM[dica.n.nivel].cor }} />
            {ESCALA_NM[dica.n.nivel].sigla} · {ESCALA_NM[dica.n.nivel].nome}
          </p>
          <p className="text-gray-400">{dica.n.regiao}</p>
          {dica.n.nivel >= 2 && dica.n.vigencia_ate && <p className={dica.n.vencida ? "text-red-600" : "text-gray-500"}>{dica.n.vencida ? "Vigência vencida (em revisão)" : `Vigência até ${fmtDataHora(dica.n.vigencia_ate)}`}</p>}
        </div>
      )}
    </div>
  );
});

export default MapaNiveis;

/** Mantém o mapa dentro da moldura ao dar zoom/arrastar. */
function limita(v: { k: number; x: number; y: number }) {
  const minX = W - W * v.k, minY = H - H * v.k;
  return { k: v.k, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

function centro(f: GeoJsonFeature, p: (lon: number, lat: number) => [number, number]): [number, number] {
  const aneis = f.geometry.type === "Polygon" ? [(f.geometry.coordinates as number[][][])[0]] : (f.geometry.coordinates as number[][][][]).map((poly) => poly[0]);
  const maior = aneis.reduce((a, b) => (b.length > a.length ? b : a), aneis[0]);
  let sx = 0, sy = 0;
  for (const [lon, lat] of maior) {
    sx += lon;
    sy += lat;
  }
  return p(sx / maior.length, sy / maior.length);
}
