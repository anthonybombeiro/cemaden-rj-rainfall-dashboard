"use client";

import { useMemo } from "react";

import { Previsao } from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeature, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";
import { iconeSrc, ICONES_TEMPO } from "@/lib/meteorologia";

/** Previsão do CEMADEN-RJ por REDEC: mapa (sem mapa-base) com as regiões numeradas e cartões com TODOS os dados do dia
 * (situação, mín/máx, umidade, vento, comentário). Três composições do mesmo conteúdo: tela (responsiva), post (quadrado)
 * e story (1080×1920). */

/** Ordem fixa (a numeração do mapa e dos cartões). */
export const ORDEM_REDEC = ["CAPITAL", "METROPOLITANA", "BAIXADA FLUMINENSE", "COSTA VERDE", "SUL I", "SUL II", "SERRANA I", "SERRANA II", "BAIXADA LITORÂNEA", "NORTE", "NOROESTE"];
export const nomeBonito = (r: string) => r.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/ i$/i, " I").replace(/ ii$/i, " II");

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
  { rotulo: "Parc. nublado", cor: "#e2e8f0" },
  { rotulo: "Nublado/encoberto", cor: "#94a3b8" },
  { rotulo: "Chuva", cor: "#7cb7f5" },
  { rotulo: "Chuva e raios", cor: "#a78bfa" },
];
export const rotuloTempo = (icone: string) => ICONES_TEMPO.find((i) => i.key === icone)?.label ?? icone;
const r0 = (n: number) => Math.round(Number(n));
export const textoVento = (p: Previsao) => `${p.vento_velocidade}${p.vento_direcao ? ` (${p.vento_direcao})` : ""}`;
export const textoUmidade = (p: Previsao) => `${r0(p.umidade_minima)}–${r0(p.umidade_maxima)}%`;

// ---------------------------------------------------------------- mapa
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

/** Mapa das REDECs pintado pela condição do tempo, com o número de cada região. Escala pelo `viewBox` (use `className` para o tamanho). */
export function MapaRedec({
  geo,
  previsoes,
  largura = 720,
  altura = 400,
  selecionada,
  onSelecionar,
  raioNumero = 13,
  className,
}: {
  geo: GeoJsonFeatureCollection;
  previsoes: Previsao[];
  largura?: number;
  altura?: number;
  selecionada?: string | null;
  onSelecionar?: (redec: string) => void;
  raioNumero?: number;
  className?: string;
}) {
  const itens = useMemo(() => {
    const proj = makeProjector(computeBBox(geo), largura, altura, 6);
    return geo.features.map((f) => ({ redec: f.properties.redec, d: geometryToPath(f.geometry, proj), centro: centroideMaiorAnel(f, proj) }));
  }, [geo, largura, altura]);
  const por = useMemo(() => new Map(previsoes.map((p) => [p.regiao, p])), [previsoes]);
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className={className} role="img" aria-label="Previsão do tempo por REDEC">
      {itens.map((it) => (
        <path
          key={it.redec}
          d={it.d}
          fill={corDoTempo(por.get(it.redec)?.icone)}
          stroke={selecionada === it.redec ? "#1d4ed8" : "#ffffff"}
          strokeWidth={selecionada === it.redec ? 4 : 2.5}
          strokeLinejoin="round"
          className={onSelecionar ? "cursor-pointer" : undefined}
          onClick={onSelecionar ? () => onSelecionar(it.redec) : undefined}
        />
      ))}
      {itens.map((it) => {
        const n = ORDEM_REDEC.indexOf(it.redec) + 1;
        return (
          <g key={`n-${it.redec}`} pointerEvents="none">
            <circle cx={it.centro[0]} cy={it.centro[1]} r={raioNumero} fill="#0f2a4a" stroke="#fff" strokeWidth={2} />
            <text x={it.centro[0]} y={it.centro[1] + raioNumero * 0.36} textAnchor="middle" fontSize={raioNumero * 1.05} fontWeight="700" fill="#fff">
              {n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- cartão
export type VarianteCartao = "tela" | "feed" | "story";
const hm = (t?: string) => (t ? t.slice(0, 5) : "—");

/** Maior tamanho de letra (px) em que o maior comentário cabe em `altura` px de uma caixa de `largura` px (estimativa por largura média do caractere). */
export function ajustarComentarioPx(maiorTexto: number, largura: number, altura: number, max: number, min = 10): number {
  for (let px = max; px >= min; px--) {
    const porLinha = Math.floor(largura / (px * 0.54));
    const linhas = Math.ceil(maiorTexto / Math.max(porLinha, 1));
    if (linhas * px * 1.2 <= altura) return px;
  }
  return min;
}

/** Cartão de uma REDEC com todos os dados: situação, mín/máx, nascer/pôr do Sol da região, umidade, vento e comentário. */
export function CartaoRedec({ regiao, p, variante, ativo, onClick, comentarioPx }: { regiao: string; p?: Previsao; variante: VarianteCartao; ativo?: boolean; onClick?: () => void; comentarioPx?: number }) {
  const n = ORDEM_REDEC.indexOf(regiao) + 1;
  const fixo = variante !== "tela"; // story/feed: tamanhos em px, comentário ajustado ao espaço
  const tam =
    variante === "story"
      ? { badge: "h-9 w-9 text-[20px]", nome: "text-[22px] leading-[26px]", sit: "text-[18px] leading-[22px]", temp: "h-10 text-[32px] leading-10", sol: "text-[17px]", info: "text-[18px] leading-[22px]", icone: 46, pad: "px-4 py-2" }
      : variante === "feed"
        ? { badge: "h-7 w-7 text-[16px]", nome: "text-[18px] leading-[21px]", sit: "text-[14px] leading-[17px]", temp: "h-8 text-[26px] leading-8", sol: "text-[14px]", info: "text-[14px] leading-[18px]", icone: 38, pad: "px-3 py-1.5" }
        : { badge: "h-6 w-6 text-[12px]", nome: "text-sm", sit: "text-xs", temp: "text-2xl", sol: "text-xs", info: "text-xs", icone: 44, pad: "p-3" };
  return (
    <div
      onClick={onClick}
      className={`flex min-w-0 flex-col overflow-hidden rounded-lg border bg-white ${ativo ? "border-blue-600 ring-2 ring-blue-500" : "border-slate-300"} ${onClick ? "cursor-pointer" : ""} ${tam.pad}`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#0f2a4a] font-bold text-white ${tam.badge}`}>{n}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className={`truncate font-bold uppercase tracking-tight text-slate-800 ${tam.nome}`}>{nomeBonito(regiao)}</div>
          <div className={`truncate text-slate-600 ${tam.sit}`}>{p ? rotuloTempo(p.icone) : "Sem previsão"}</div>
        </div>
        {p?.icone && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconeSrc(p.icone)} alt="" width={tam.icone} height={tam.icone} className="shrink-0 object-contain" style={{ width: tam.icone, height: tam.icone }} />
        )}
      </div>
      {p && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 whitespace-nowrap">
            <div className={`flex items-baseline gap-1.5 font-extrabold ${tam.temp}`}>
              <span className="text-blue-700">{r0(p.temperatura_minima)}°</span>
              <span className="text-[0.5em] font-normal text-slate-400">mín / máx</span>
              <span className="text-red-600">{r0(p.temperatura_maxima)}°</span>
            </div>
            <div className={`flex gap-2 text-slate-600 ${tam.sol}`} title="Nascer e pôr do Sol na região">
              <span>🌅 {hm(p.nascer_sol)}</span>
              <span>🌇 {hm(p.por_sol)}</span>
            </div>
          </div>
          <div className={`flex shrink-0 flex-wrap gap-x-3 text-slate-700 ${tam.info}`}>
            <span>💧 {variante === "feed" ? "UR" : "Umidade"} {textoUmidade(p)}</span>
            <span>💨 {variante === "feed" ? "" : "Vento "}{textoVento(p)}</span>
          </div>
          {p.comentario && (
            <p
              className={`mt-1 min-h-0 text-slate-600 ${fixo ? "overflow-hidden" : "text-xs leading-relaxed"}`}
              style={fixo && comentarioPx ? { fontSize: comentarioPx, lineHeight: `${Math.round(comentarioPx * 1.2)}px` } : undefined}
            >
              {p.comentario}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function LegendaTempo({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-slate-600 ${className ?? "text-[10px]"}`}>
      {CLASSES_TEMPO.map((c) => (
        <span key={c.rotulo} className="flex items-center gap-1">
          <i className="inline-block h-[0.9em] w-[0.9em] rounded-sm border border-black/10" style={{ background: c.cor }} />
          {c.rotulo}
        </span>
      ))}
    </div>
  );
}

const ordenar = (previsoes: Previsao[]) => ORDEM_REDEC.map((r) => ({ regiao: r, p: previsoes.find((x) => x.regiao === r) }));
const maiorComentario = (previsoes: Previsao[]) => Math.max(0, ...previsoes.map((x) => (x.comentario ?? "").length));

function Cabecalho({ titulo, data, altura, fonteTitulo, logo }: { titulo: string; data: string; altura: number; fonteTitulo: number; logo: number }) {
  return (
    <div className="flex shrink-0 items-center justify-between bg-[#0f4c81] px-10" style={{ height: altura }}>
      <div className="min-w-0 text-white">
        <div className="font-extrabold leading-tight" style={{ fontSize: fonteTitulo }}>
          {titulo}
        </div>
        <div className="text-sky-100" style={{ fontSize: Math.round(fonteTitulo * 0.6) }}>
          {data}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-defesa-civil.png" alt="" style={{ height: logo, width: "auto" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-cemadenrj.png" alt="" style={{ height: logo, width: "auto" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- composições exportáveis
export const STORY_W = 1080;
export const STORY_H = 1920;
/** Story vertical 1080×1920: logos, mapa e os 11 cartões (2 colunas) com sol, umidade, vento e o comentário inteiro. */
export function CorpoStory({ geo, previsoes, titulo, data }: { geo: GeoJsonFeatureCollection; previsoes: Previsao[]; titulo: string; data: string }) {
  const itens = ordenar(previsoes);
  const comentarioPx = ajustarComentarioPx(maiorComentario(previsoes), 484, 100, 20);
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: STORY_W, height: STORY_H }}>
      <Cabecalho titulo={titulo} data={data} altura={170} fonteTitulo={46} logo={84} />
      <div className="shrink-0 bg-sky-50" style={{ height: 290 }}>
        <MapaRedec geo={geo} previsoes={previsoes} largura={1080} altura={290} raioNumero={17} className="h-full w-full" />
      </div>
      <LegendaTempo className="shrink-0 py-2 text-[18px]" />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5 px-4 pb-2" style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
        {itens.map(({ regiao, p }) => (
          <CartaoRedec key={regiao} regiao={regiao} p={p} variante="story" comentarioPx={comentarioPx} />
        ))}
        <div className="flex flex-col justify-center rounded-lg bg-[#0f4c81] px-5 py-3 text-white">
          <div className="text-[22px] font-bold">Defesa Civil RJ</div>
          <div className="text-[17px] leading-snug text-sky-100">Previsão do CEMADEN-RJ · acompanhe os alertas e siga as orientações da Defesa Civil. Emergência: 199</div>
        </div>
      </div>
    </div>
  );
}

export const FEED_W = 1080;
export const FEED_H = 1350;
/** Post de feed 1080×1350 (4:5): mesmo conteúdo do story em formato menor. */
export function CorpoFeed({ geo, previsoes, titulo, data }: { geo: GeoJsonFeatureCollection; previsoes: Previsao[]; titulo: string; data: string }) {
  const itens = ordenar(previsoes);
  const comentarioPx = ajustarComentarioPx(maiorComentario(previsoes), 484, 36, 15);
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: FEED_W, height: FEED_H }}>
      <Cabecalho titulo={titulo} data={data} altura={120} fonteTitulo={40} logo={68} />
      <div className="shrink-0 bg-sky-50" style={{ height: 215 }}>
        <MapaRedec geo={geo} previsoes={previsoes} largura={1080} altura={215} raioNumero={13} className="h-full w-full" />
      </div>
      <LegendaTempo className="shrink-0 py-1.5 text-[15px]" />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 px-3 pb-2" style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
        {itens.map(({ regiao, p }) => (
          <CartaoRedec key={regiao} regiao={regiao} p={p} variante="feed" comentarioPx={comentarioPx} />
        ))}
        <div className="flex flex-col justify-center rounded-lg bg-[#0f4c81] px-4 py-2 text-white">
          <div className="text-[18px] font-bold">Defesa Civil RJ</div>
          <div className="text-[14px] leading-snug text-sky-100">Previsão do CEMADEN-RJ · acompanhe os alertas e siga as orientações da Defesa Civil. Emergência: 199</div>
        </div>
      </div>
    </div>
  );
}
