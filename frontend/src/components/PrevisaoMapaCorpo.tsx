"use client";

import { Droplets, FileText, Sunrise, Sunset, Wind } from "lucide-react";
import { useMemo } from "react";

import { Previsao } from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeature, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";
import { iconeDominante, iconeSrc, ICONES_TEMPO } from "@/lib/meteorologia";

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

const TAMANHOS: Record<VarianteCartao, { badge: string; nome: string; sit: string; temp: string; sol: string; info: string; icone: number; iconeInfo: number; pad: string }> = {
  story: { badge: "h-9 w-9 text-[20px]", nome: "text-[22px] leading-[26px]", sit: "text-[18px] leading-[22px]", temp: "h-10 text-[32px] leading-10", sol: "text-[17px]", info: "text-[18px] leading-[22px]", icone: 46, iconeInfo: 20, pad: "px-4 py-2" },
  feed: { badge: "h-7 w-7 text-[16px]", nome: "text-[18px] leading-[21px]", sit: "text-[14px] leading-[17px]", temp: "h-8 text-[26px] leading-8", sol: "text-[14px]", info: "text-[14px] leading-[18px]", icone: 38, iconeInfo: 16, pad: "px-3 py-1.5" },
  tela: { badge: "h-6 w-6 text-[12px]", nome: "text-sm", sit: "text-xs", temp: "text-2xl", sol: "text-xs", info: "text-xs", icone: 44, iconeInfo: 15, pad: "p-3" },
};

/** Cartão de uma REDEC com todos os dados: situação, mín/máx, nascer/pôr do Sol da região, umidade, vento e comentário.
 * Os ícones de umidade, vento e Sol são os mesmos dos cartões da aba Previsão CEMADEN-RJ (Lucide: gota, vento, nascer e pôr do sol). */
export function CartaoRedec({ regiao, p, variante, ativo, onClick, comentarioPx, ocultarComentario }: { regiao: string; p?: Previsao; variante: VarianteCartao; ativo?: boolean; onClick?: () => void; comentarioPx?: number; ocultarComentario?: boolean }) {
  const n = ORDEM_REDEC.indexOf(regiao) + 1;
  const fixo = variante !== "tela"; // story/feed: tamanhos em px, comentário ajustado ao espaço
  const tam = TAMANHOS[variante];
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
              <span className="flex items-center gap-1">
                <Sunrise size={tam.iconeInfo} className="shrink-0 text-amber-500" /> {hm(p.nascer_sol)}
              </span>
              <span className="flex items-center gap-1">
                <Sunset size={tam.iconeInfo} className="shrink-0 text-amber-700" /> {hm(p.por_sol)}
              </span>
            </div>
          </div>
          <div className={`flex shrink-0 flex-wrap gap-x-3 text-slate-700 ${tam.info}`}>
            <span className="flex items-center gap-1">
              <Droplets size={tam.iconeInfo} className="shrink-0 text-sky-600" /> {variante === "feed" ? "UR" : "Umidade"} {textoUmidade(p)}
            </span>
            <span className="flex items-center gap-1">
              <Wind size={tam.iconeInfo} className="shrink-0 text-orange-500" /> {variante === "feed" ? "" : "Vento "}{textoVento(p)}
            </span>
          </div>
          {p.comentario && !ocultarComentario && (
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

/** Cartão do texto geral do estado: mesmo tamanho e estrutura dos cartões das REDECs, é o primeiro dos 12 cartões (1 geral + 11 REDECs) na
 * tela e nas artes. O ícone é a imagem do clima mais frequente entre as REDECs. Sem texto: na tela mostra um lembrete; nas artes não aparece. */
export function CartaoGeral({ texto, previsoes, variante, lembrete = true, area }: { texto?: string; previsoes: Previsao[]; variante: VarianteCartao; lembrete?: boolean; area?: { largura: number; altura: number; max: number } }) {
  const t = (texto ?? "").trim();
  const tam = TAMANHOS[variante];
  if (!t) {
    if (variante !== "tela" || !lembrete) return null;
    return (
      <div className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-dashed border-amber-300 bg-amber-50 text-amber-800 ${tam.pad}`}>
        <div className="flex items-center gap-2">
          <span className={`flex shrink-0 items-center justify-center rounded-full bg-amber-600 text-white ${tam.badge}`}>
            <FileText size={14} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className={`truncate font-bold uppercase tracking-tight ${tam.nome}`}>Previsão geral</div>
            <div className={`truncate ${tam.sit}`}>Texto ainda não escrito</div>
          </div>
        </div>
        <p className="mt-1 text-xs leading-relaxed">O texto geral deste dia é preenchido no fim do cadastro (Meteorologia → Cadastro), depois das 11 REDECs.</p>
      </div>
    );
  }
  const icone = iconeDominante(previsoes.map((x) => x.icone));
  const fixo = variante !== "tela";
  const px = area ? ajustarComentarioPx(t.length, area.largura, area.altura, area.max, 12) : variante === "story" ? ajustarComentarioPx(t.length, 480, 124, 28, 12) : variante === "feed" ? ajustarComentarioPx(t.length, 470, 62, 20, 10) : undefined;
  return (
    <div className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-blue-300 bg-blue-50 ${area ? "h-full w-full" : ""} ${tam.pad}`} aria-label="Previsão geral do estado">
      <div className="flex items-center gap-2">
        <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#0f4c81] text-white ${tam.badge}`}>
          <FileText size={variante === "story" ? 20 : variante === "feed" ? 16 : 14} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className={`truncate font-bold uppercase tracking-tight text-[#0f4c81] ${tam.nome}`}>Previsão geral</div>
          <div className={`truncate text-slate-600 ${tam.sit}`}>Estado do Rio de Janeiro</div>
        </div>
        {icone && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconeSrc(icone)} alt="" width={tam.icone} height={tam.icone} className="shrink-0 object-contain" style={{ width: tam.icone, height: tam.icone }} />
        )}
      </div>
      <p
        className={`mt-1 min-h-0 text-slate-800 ${fixo ? "overflow-hidden" : "text-sm leading-relaxed"}`}
        style={fixo && px ? { fontSize: px, lineHeight: `${Math.round(px * 1.22)}px` } : undefined}
      >
        {t}
      </p>
    </div>
  );
}

/** Comentário igual em todas as REDECs + texto geral escrito: nas artes o comentário não se repete nos 11 cartões (já está no texto geral). */
export const comentarioRepetido = (previsoes: Previsao[], textoGeral?: string): boolean => {
  if (!(textoGeral ?? "").trim() || previsoes.length < 2) return false;
  const c = (previsoes[0].comentario ?? "").trim();
  return !!c && previsoes.every((p) => (p.comentario ?? "").trim() === c);
};

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

/** Legenda das cores do mapa como cartão: ocupa o lugar do texto geral nas artes quando ele não foi escrito. */
function CartaoLegenda({ fonte, quadro }: { fonte: number; quadro: number }) {
  return (
    <div className="flex min-w-0 flex-col justify-center overflow-hidden rounded-lg border border-slate-300 bg-white px-4 py-2">
      <div className="mb-1 font-bold uppercase tracking-tight text-slate-700" style={{ fontSize: fonte }}>
        Cores do mapa
      </div>
      <div className="grid grid-flow-col grid-cols-2 grid-rows-3 gap-x-3 gap-y-1 text-slate-700" style={{ fontSize: fonte * 0.9 }}>
        {CLASSES_TEMPO.map((c) => (
          <span key={c.rotulo} className="flex items-center gap-1.5 whitespace-nowrap">
            <i className="inline-block shrink-0 rounded-sm border border-black/10" style={{ background: c.cor, width: quadro, height: quadro }} />
            {c.rotulo}
          </span>
        ))}
      </div>
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

/** Rodapé das artes: faixa azul de ponta a ponta como o cabeçalho, mais baixa, com uma linha curta. */
function Rodape({ altura, fonte }: { altura: number; fonte: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center bg-[#0f4c81] px-10 text-center text-sky-100" style={{ height: altura, fontSize: fonte }}>
      <span>
        <strong className="text-white">Defesa Civil RJ</strong> · Previsão do CEMADEN-RJ · Emergência: 199 ou 193
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- composições exportáveis
type ConfigArte = {
  variante: "story" | "feed";
  largura: number;
  altura: number;
  cab: { altura: number; fonteTitulo: number; logo: number };
  rodape: { altura: number; fonte: number };
  /** Peso (flex) do cartão geral; o bloco do mapa pesa `geral + 1`, para as duas colunas fecharem na mesma altura (5 cartões + mapa × 6 cartões + geral). */
  geral: number;
  /** Largura relativa da coluna da esquerda (mapa) frente à da direita. */
  esq: number;
  pad: string;
  gap: string;
  raio: number;
  mapa: { largura: number; altura: number };
  legenda: string;
  area: { largura: number; altura: number; max: number };
  comentario: { altura: number; max: number };
  legendaCartao: { fonte: number; quadro: number };
};

/** Legenda numa linha longa sobre tudo; abaixo, duas colunas: à esquerda o mapa sobre os 5 primeiros cartões; à direita o texto geral sobre os outros 6. */
function CorpoArte({ cfg, geo, previsoes, titulo, data, textoGeral }: { cfg: ConfigArte; geo: GeoJsonFeatureCollection; previsoes: Previsao[]; titulo: string; data: string; textoGeral?: string }) {
  const itens = ordenar(previsoes);
  const temGeral = !!(textoGeral ?? "").trim();
  const ocultar = comentarioRepetido(previsoes, textoGeral);
  const comentarioPx = ajustarComentarioPx(ocultar ? 0 : maiorComentario(previsoes), 484, cfg.comentario.altura, cfg.comentario.max);
  const cartao = ({ regiao, p }: (typeof itens)[number]) => (
    <CartaoRedec key={regiao} regiao={regiao} p={p} variante={cfg.variante} comentarioPx={comentarioPx} ocultarComentario={ocultar} />
  );
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: cfg.largura, height: cfg.altura }}>
      <Cabecalho titulo={titulo} data={data} altura={cfg.cab.altura} fonteTitulo={cfg.cab.fonteTitulo} logo={cfg.cab.logo} />
      <LegendaTempo className={`shrink-0 whitespace-nowrap ${cfg.legenda}`} />
      <div className={`flex min-h-0 flex-1 ${cfg.pad} ${cfg.gap}`}>
        <div className={`flex min-w-0 flex-col ${cfg.gap}`} style={{ flex: `${cfg.esq} 1 0` }}>
          <div className="min-h-0 rounded-lg bg-sky-50" style={{ flex: `${cfg.geral + 1} 1 0` }}>
            <MapaRedec geo={geo} previsoes={previsoes} largura={cfg.mapa.largura} altura={cfg.mapa.altura} raioNumero={cfg.raio} className="h-full w-full" />
          </div>
          {itens.slice(0, 5).map((it) => (
            <div key={it.regiao} className="flex min-h-0" style={{ flex: "1 1 0" }}>
              <div className="flex min-w-0 flex-1 flex-col [&>*]:flex-1">{cartao(it)}</div>
            </div>
          ))}
        </div>
        <div className={`flex min-w-0 flex-1 flex-col ${cfg.gap}`}>
          <div className="flex min-h-0" style={{ flex: `${cfg.geral} 1 0` }}>
            {temGeral ? (
              <CartaoGeral texto={textoGeral} previsoes={previsoes} variante={cfg.variante} area={cfg.area} />
            ) : (
              <div className="flex min-w-0 flex-1 flex-col [&>*]:flex-1">
                <CartaoLegenda fonte={cfg.legendaCartao.fonte} quadro={cfg.legendaCartao.quadro} />
              </div>
            )}
          </div>
          {itens.slice(5).map((it) => (
            <div key={it.regiao} className="flex min-h-0" style={{ flex: "1 1 0" }}>
              <div className="flex min-w-0 flex-1 flex-col [&>*]:flex-1">{cartao(it)}</div>
            </div>
          ))}
        </div>
      </div>
      <Rodape altura={cfg.rodape.altura} fonte={cfg.rodape.fonte} />
    </div>
  );
}

export const STORY_W = 1080;
export const STORY_H = 1920;
const CFG_STORY: ConfigArte = {
  variante: "story",
  largura: STORY_W,
  altura: STORY_H,
  cab: { altura: 170, fonteTitulo: 46, logo: 84 },
  rodape: { altura: 58, fonte: 24 },
  geral: 1.1,
  esq: 1.15,
  pad: "px-4 pb-2.5",
  gap: "gap-2.5",
  raio: 15,
  mapa: { largura: 556, altura: 464 },
  legenda: "py-2.5 text-[21px]",
  area: { largura: 445, altura: 165, max: 30 },
  comentario: { altura: 80, max: 20 },
  legendaCartao: { fonte: 19, quadro: 18 },
};
/** Story vertical 1080×1920: mapa e 5 REDECs à esquerda; texto geral e 6 REDECs à direita, com sol, umidade, vento e o comentário. */
export function CorpoStory(props: { geo: GeoJsonFeatureCollection; previsoes: Previsao[]; titulo: string; data: string; textoGeral?: string }) {
  return <CorpoArte cfg={CFG_STORY} {...props} />;
}

export const FEED_W = 1080;
export const FEED_H = 1350;
const CFG_FEED: ConfigArte = {
  variante: "feed",
  largura: FEED_W,
  altura: FEED_H,
  cab: { altura: 120, fonteTitulo: 40, logo: 68 },
  rodape: { altura: 46, fonte: 19 },
  geral: 1.4,
  esq: 1,
  pad: "px-3 pb-2",
  gap: "gap-2",
  raio: 12,
  mapa: { largura: 524, altura: 352 },
  legenda: "py-2 text-[17px]",
  area: { largura: 490, altura: 145, max: 26 },
  comentario: { altura: 40, max: 15 },
  legendaCartao: { fonte: 15, quadro: 14 },
};
/** Post de feed 1080×1350 (4:5): mesmo conteúdo do story em formato menor. */
export function CorpoFeed(props: { geo: GeoJsonFeatureCollection; previsoes: Previsao[]; titulo: string; data: string; textoGeral?: string }) {
  return <CorpoArte cfg={CFG_FEED} {...props} />;
}
