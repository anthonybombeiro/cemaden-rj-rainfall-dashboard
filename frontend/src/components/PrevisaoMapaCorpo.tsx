"use client";

import { Droplets, FileText, Sunrise, Sunset, Wind } from "lucide-react";
import { useMemo } from "react";

import { Previsao } from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeature, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";
import { iconeDominante, iconeSrc, ICONES_TEMPO } from "@/lib/meteorologia";

/** Previsão do CEMADEN-RJ por REDEC: mapa neutro (sem cor por condição) com o ícone do tempo de cada região e cartões com TODOS os dados do dia
 * (situação, mín/máx, umidade, vento, comentário). Composições do mesmo conteúdo: tela (responsiva), post (quadrado), story (1080×1920) e carrossel
 * de dois slides (mapa grande com ícone e temperaturas + detalhes por região). */

/** Ordem fixa (a numeração do mapa e dos cartões). */
export const ORDEM_REDEC = ["CAPITAL", "METROPOLITANA", "BAIXADA FLUMINENSE", "COSTA VERDE", "SUL I", "SUL II", "SERRANA I", "SERRANA II", "BAIXADA LITORÂNEA", "NORTE", "NOROESTE"];
export const nomeBonito = (r: string) => r.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/ i$/i, " I").replace(/ ii$/i, " II");

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

/** Afasta marcadores que se sobrepõem (caixas `larg`×`alt` centradas nos pontos) sem sair de `[0,W]×[0,H]`. Determinístico. */
function afastar(origem: Ponto[], larg: number, alt: number, W: number, H: number): Ponto[] {
  const p = origem.map(([x, y]) => [x, y] as Ponto);
  const lim = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  for (let it = 0; it < 400; it++) {
    let mexeu = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const dx = p[j][0] - p[i][0];
        const dy = p[j][1] - p[i][1];
        const ox = larg - Math.abs(dx);
        const oy = alt - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        mexeu = true;
        if (ox < oy) {
          const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.5);
          p[i][0] -= s;
          p[j][0] += s;
        } else {
          const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 0.5);
          p[i][1] -= s;
          p[j][1] += s;
        }
      }
    }
    for (const q of p) {
      q[0] = lim(q[0], larg / 2, W - larg / 2);
      q[1] = lim(q[1], alt / 2, H - alt / 2);
    }
    if (!mexeu) break;
  }
  return p;
}

/** "numeros": só o número da região. "icone": ícone do tempo do dia com o número num selo. "balao": ícone e mínima/máxima num balão com o número. */
export type ModoMapa = "numeros" | "icone" | "balao";
const NEUTRO = "#dde5ee";

function Selo({ x, y, r, n }: { x: number; y: number; r: number; n: number }) {
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={r} fill="#0f2a4a" stroke="#fff" strokeWidth={2} />
      <text x={x} y={y + r * 0.36} textAnchor="middle" fontSize={r * 1.05} fontWeight="700" fill="#fff">
        {n}
      </text>
    </g>
  );
}

/** Mapa das REDECs sem cor por condição (a cor sugeria chuva o dia todo): regiões neutras, cada uma com o ícone do tempo do dia e o número.
 * Marcadores que se sobrepõem (sudoeste do Estado) são afastados e ligados à região por uma linha. Escala pelo `viewBox` (use `className` para o tamanho). */
export function MapaRedec({
  geo,
  previsoes,
  largura = 720,
  altura = 400,
  selecionada,
  onSelecionar,
  raioNumero = 13,
  modo = "numeros",
  tamIcone = 44,
  balao = { icone: 56, fonte: 28 },
  className,
}: {
  geo: GeoJsonFeatureCollection;
  previsoes: Previsao[];
  largura?: number;
  altura?: number;
  selecionada?: string | null;
  onSelecionar?: (redec: string) => void;
  raioNumero?: number;
  modo?: ModoMapa;
  tamIcone?: number;
  balao?: { icone: number; fonte: number };
  className?: string;
}) {
  const bw = 12 + balao.icone + 8 + Math.round(balao.fonte * 1.9) + 12;
  const bh = balao.icone + 14;
  const itens = useMemo(() => {
    const pad = modo === "balao" ? Math.round(bw * 0.25) : modo === "icone" ? Math.round(tamIcone * 0.5) : 6;
    const proj = makeProjector(computeBBox(geo), largura, altura, pad);
    const base = geo.features.map((f) => ({ redec: f.properties.redec, d: geometryToPath(f.geometry, proj), centro: centroideMaiorAnel(f, proj) }));
    let marcador = base.map((b) => b.centro);
    if (modo === "icone") marcador = afastar(marcador, tamIcone + 8, tamIcone + 8, largura, altura);
    if (modo === "balao") marcador = afastar(marcador, bw + 8, bh + 8, largura, altura);
    return base.map((b, i) => ({ ...b, marcador: marcador[i] }));
  }, [geo, largura, altura, modo, tamIcone, bw, bh]);
  const por = useMemo(() => new Map(previsoes.map((p) => [p.regiao, p])), [previsoes]);
  const distMin = modo === "balao" ? bh / 2 + 6 : tamIcone / 2 + 4;
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className={className} role="img" aria-label="Previsão do tempo por REDEC">
      {itens.map((it) => (
        <path
          key={it.redec}
          d={it.d}
          fill={selecionada === it.redec ? "#bfdbfe" : NEUTRO}
          stroke={selecionada === it.redec ? "#1d4ed8" : "#ffffff"}
          strokeWidth={selecionada === it.redec ? 4 : 2.5}
          strokeLinejoin="round"
          className={onSelecionar ? "cursor-pointer" : undefined}
          onClick={onSelecionar ? () => onSelecionar(it.redec) : undefined}
        />
      ))}
      {modo !== "numeros" &&
        itens.map((it) => {
          if (Math.hypot(it.marcador[0] - it.centro[0], it.marcador[1] - it.centro[1]) <= distMin) return null;
          return (
            <g key={`l-${it.redec}`} pointerEvents="none">
              <line x1={it.centro[0]} y1={it.centro[1]} x2={it.marcador[0]} y2={it.marcador[1]} stroke="#475569" strokeWidth={2} />
              <circle cx={it.centro[0]} cy={it.centro[1]} r={4.5} fill="#0f2a4a" stroke="#fff" strokeWidth={1.5} />
            </g>
          );
        })}
      {itens.map((it) => {
        const n = ORDEM_REDEC.indexOf(it.redec) + 1;
        const p = por.get(it.redec);
        const [cx, cy] = it.marcador;
        if (modo === "numeros" || !p?.icone) return <Selo key={`n-${it.redec}`} x={cx} y={cy} r={raioNumero} n={n} />;
        if (modo === "icone") {
          return (
            <g key={`n-${it.redec}`} pointerEvents="none">
              <circle cx={cx} cy={cy} r={tamIcone / 2 + 3} fill="#fff" stroke="#94a3b8" strokeWidth={1.5} />
              <image href={iconeSrc(p.icone)} x={cx - tamIcone / 2} y={cy - tamIcone / 2} width={tamIcone} height={tamIcone} preserveAspectRatio="xMidYMid meet" />
              <Selo x={cx - tamIcone / 2 - 2} y={cy - tamIcone / 2 - 2} r={raioNumero} n={n} />
            </g>
          );
        }
        const esq = cx - bw / 2;
        const topo = cy - bh / 2;
        const xt = esq + 12 + balao.icone + 8;
        return (
          <g key={`n-${it.redec}`} pointerEvents="none">
            <rect x={esq} y={topo} width={bw} height={bh} rx={14} fill="#fff" stroke="#94a3b8" strokeWidth={2} />
            <image href={iconeSrc(p.icone)} x={esq + 12} y={cy - balao.icone / 2} width={balao.icone} height={balao.icone} preserveAspectRatio="xMidYMid meet" />
            <text x={xt} y={cy - balao.fonte * 0.1} fontSize={balao.fonte} fontWeight="800" fill="#dc2626">
              {r0(p.temperatura_maxima)}°
            </text>
            <text x={xt} y={cy + balao.fonte * 0.95} fontSize={balao.fonte} fontWeight="800" fill="#1d4ed8">
              {r0(p.temperatura_minima)}°
            </text>
            <Selo x={esq + 2} y={topo + 2} r={raioNumero} n={n} />
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
  story: { badge: "h-9 w-9 text-[20px]", nome: "text-[22px] leading-[26px]", sit: "text-[19px] leading-[23px]", temp: "text-[34px] leading-[38px]", sol: "text-[18px]", info: "text-[20px] leading-[24px]", icone: 46, iconeInfo: 22, pad: "px-4 py-2" },
  feed: { badge: "h-7 w-7 text-[16px]", nome: "text-[18px] leading-[21px]", sit: "text-[14px] leading-[17px]", temp: "text-[28px] leading-8", sol: "text-[14px]", info: "text-[14px] leading-[18px]", icone: 38, iconeInfo: 16, pad: "px-3 py-1.5" },
  tela: { badge: "h-6 w-6 text-[12px]", nome: "text-sm", sit: "text-xs", temp: "text-2xl", sol: "text-xs", info: "text-xs", icone: 44, iconeInfo: 15, pad: "p-3" },
};

/** Cartão de uma REDEC com todos os dados: situação, mínima e máxima (no canto onde ficava o ícone, que agora está no mapa), umidade, nascer/pôr do Sol,
 * vento e comentário. Os ícones de umidade, vento e Sol são os mesmos dos cartões da aba Previsão CEMADEN-RJ (Lucide). */
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
          <div className={`line-clamp-2 text-slate-600 ${tam.sit}`}>{p ? rotuloTempo(p.icone) : "Sem previsão"}</div>
        </div>
        {p && (
          <div className={`flex shrink-0 items-baseline gap-1 whitespace-nowrap font-extrabold ${tam.temp}`} title="Mínima / máxima">
            <span className="text-blue-700">{r0(p.temperatura_minima)}°</span>
            <span className="text-[0.55em] font-normal text-slate-400">/</span>
            <span className="text-red-600">{r0(p.temperatura_maxima)}°</span>
          </div>
        )}
      </div>
      {p && (
        <>
          <div className={`mt-0.5 flex shrink-0 items-center justify-between gap-2 whitespace-nowrap text-slate-700 ${tam.info}`}>
            <span className="flex items-center gap-1">
              <Droplets size={tam.iconeInfo} className="shrink-0 text-sky-600" /> {variante === "feed" ? "UR" : "Umidade"} {textoUmidade(p)}
            </span>
            <span className={`flex gap-2 text-slate-600 ${tam.sol}`} title="Nascer e pôr do Sol na região">
              <span className="flex items-center gap-1">
                <Sunrise size={tam.iconeInfo} className="shrink-0 text-amber-500" /> {hm(p.nascer_sol)}
              </span>
              <span className="flex items-center gap-1">
                <Sunset size={tam.iconeInfo} className="shrink-0 text-amber-700" /> {hm(p.por_sol)}
              </span>
            </span>
          </div>
          <div className={`flex shrink-0 items-center gap-1 text-slate-700 ${tam.info}`}>
            <Wind size={tam.iconeInfo} className="shrink-0 text-orange-500" /> {variante === "feed" ? "" : "Vento "}
            {textoVento(p)}
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

/** Cartão do texto geral do estado: mesmo tamanho e estrutura dos cartões das REDECs na tela e nas artes. O ícone é a imagem do clima mais frequente
 * entre as REDECs. Sem texto: na tela mostra um lembrete; nas artes não aparece. Com `area`, o texto ocupa o cartão inteiro com a letra maior possível. */
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
type PropsArte = { geo: GeoJsonFeatureCollection; previsoes: Previsao[]; titulo: string; data: string; textoGeral?: string };
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
  tamIcone: number;
  mapa: { largura: number; altura: number };
  area: { largura: number; altura: number; max: number };
  comentario: { altura: number; max: number };
};

const Linha = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-0" style={{ flex: "1 1 0" }}>
    <div className="flex min-w-0 flex-1 flex-col [&>*]:flex-1">{children}</div>
  </div>
);

/** Uma imagem só: à esquerda o mapa (ícone do tempo e número em cada região) sobre os 5 primeiros cartões; à direita o texto geral sobre os outros 6. */
function CorpoArte({ cfg, geo, previsoes, titulo, data, textoGeral }: PropsArte & { cfg: ConfigArte }) {
  const itens = ordenar(previsoes);
  const temGeral = !!(textoGeral ?? "").trim();
  const ocultar = comentarioRepetido(previsoes, textoGeral);
  const comentarioPx = ajustarComentarioPx(ocultar ? 0 : maiorComentario(previsoes), 484, cfg.comentario.altura, cfg.comentario.max);
  const cartao = ({ regiao, p }: (typeof itens)[number]) => <CartaoRedec key={regiao} regiao={regiao} p={p} variante={cfg.variante} comentarioPx={comentarioPx} ocultarComentario={ocultar} />;
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: cfg.largura, height: cfg.altura }}>
      <Cabecalho titulo={titulo} data={data} altura={cfg.cab.altura} fonteTitulo={cfg.cab.fonteTitulo} logo={cfg.cab.logo} />
      <div className={`flex min-h-0 flex-1 pt-2.5 ${cfg.pad} ${cfg.gap}`}>
        <div className={`flex min-w-0 flex-col ${cfg.gap}`} style={{ flex: `${cfg.esq} 1 0` }}>
          <div className="min-h-0 rounded-lg bg-sky-50" style={{ flex: `${cfg.geral + 1} 1 0` }}>
            <MapaRedec geo={geo} previsoes={previsoes} largura={cfg.mapa.largura} altura={cfg.mapa.altura} raioNumero={cfg.raio} modo="icone" tamIcone={cfg.tamIcone} className="h-full w-full" />
          </div>
          {itens.slice(0, 5).map((it) => (
            <Linha key={it.regiao}>{cartao(it)}</Linha>
          ))}
        </div>
        <div className={`flex min-w-0 flex-1 flex-col ${cfg.gap}`}>
          <div className="flex min-h-0" style={{ flex: `${cfg.geral} 1 0` }}>
            {temGeral && <CartaoGeral texto={textoGeral} previsoes={previsoes} variante={cfg.variante} area={cfg.area} />}
          </div>
          {itens.slice(5).map((it) => (
            <Linha key={it.regiao}>{cartao(it)}</Linha>
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
  esq: 1.3,
  pad: "px-4 pb-2.5",
  gap: "gap-2.5",
  raio: 12,
  tamIcone: 58,
  mapa: { largura: 587, altura: 477 },
  area: { largura: 415, altura: 170, max: 30 },
  comentario: { altura: 100, max: 24 },
};
/** Story vertical 1080×1920 (uma imagem). */
export function CorpoStory(props: PropsArte) {
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
  esq: 1.15,
  pad: "px-3 pb-2",
  gap: "gap-2",
  raio: 10,
  tamIcone: 44,
  mapa: { largura: 560, altura: 363 },
  area: { largura: 455, altura: 145, max: 26 },
  comentario: { altura: 38, max: 15 },
};
/** Post de feed 1080×1350 (4:5, uma imagem). */
export function CorpoFeed(props: PropsArte) {
  return <CorpoArte cfg={CFG_FEED} {...props} />;
}

// ---------------------------------------------------------------- carrossel (2 slides)
type ConfigSlide = {
  variante: "story" | "feed";
  largura: number;
  altura: number;
  cab: { altura: number; fonteTitulo: number; logo: number };
  rodape: { altura: number; fonte: number };
  /** Altura do bloco do texto geral (com margens) abaixo do mapa no slide 1. */
  textoAltura: number;
  textoArea: { largura: number; altura: number; max: number };
  mapa: { largura: number; altura: number };
  balao: { icone: number; fonte: number };
  raio: number;
  pad: string;
  gap: string;
  indice: { largura: number; altura: number; raio: number };
  comentario: { altura: number; max: number };
};

/** Slide 1: mapa grande com um balão por região (ícone do tempo, máxima e mínima, número) e o texto geral embaixo. */
function SlideMapa({ cfg, geo, previsoes, titulo, data, textoGeral }: PropsArte & { cfg: ConfigSlide }) {
  const temGeral = !!(textoGeral ?? "").trim();
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: cfg.largura, height: cfg.altura }}>
      <Cabecalho titulo={titulo} data={data} altura={cfg.cab.altura} fonteTitulo={cfg.cab.fonteTitulo} logo={cfg.cab.logo} />
      <div className="min-h-0 flex-1 bg-sky-50">
        <MapaRedec geo={geo} previsoes={previsoes} largura={cfg.mapa.largura} altura={cfg.mapa.altura} raioNumero={cfg.raio} modo="balao" balao={cfg.balao} className="h-full w-full" />
      </div>
      {temGeral && (
        <div className="shrink-0 bg-sky-50 px-4 pb-3" style={{ height: cfg.textoAltura }}>
          <CartaoGeral texto={textoGeral} previsoes={previsoes} variante={cfg.variante} area={cfg.textoArea} />
        </div>
      )}
      <Rodape altura={cfg.rodape.altura} fonte={cfg.rodape.fonte} />
    </div>
  );
}

/** Slide 2: os 11 cartões com todos os detalhes e, na 12ª célula, um mapa de referência só com os números. */
function SlideDetalhes({ cfg, geo, previsoes, data, textoGeral }: PropsArte & { cfg: ConfigSlide }) {
  const itens = ordenar(previsoes);
  const ocultar = comentarioRepetido(previsoes, textoGeral);
  const comentarioPx = ajustarComentarioPx(ocultar ? 0 : maiorComentario(previsoes), 484, cfg.comentario.altura, cfg.comentario.max);
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: cfg.largura, height: cfg.altura }}>
      <Cabecalho titulo="Previsão por região" data={data} altura={cfg.cab.altura} fonteTitulo={cfg.cab.fonteTitulo} logo={cfg.cab.logo} />
      <div className={`grid min-h-0 flex-1 grid-cols-2 pt-2.5 ${cfg.pad} ${cfg.gap}`} style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
        {itens.map(({ regiao, p }) => (
          <CartaoRedec key={regiao} regiao={regiao} p={p} variante="story" comentarioPx={comentarioPx} ocultarComentario={ocultar} />
        ))}
        <div className="min-h-0 overflow-hidden rounded-lg border border-slate-300 bg-sky-50">
          <MapaRedec geo={geo} previsoes={previsoes} largura={cfg.indice.largura} altura={cfg.indice.altura} raioNumero={cfg.indice.raio} modo="numeros" className="h-full w-full" />
        </div>
      </div>
      <Rodape altura={cfg.rodape.altura} fonte={cfg.rodape.fonte} />
    </div>
  );
}

const SLIDE_STORY: ConfigSlide = {
  variante: "story",
  largura: STORY_W,
  altura: STORY_H,
  cab: CFG_STORY.cab,
  rodape: CFG_STORY.rodape,
  textoAltura: 420,
  textoArea: { largura: 1000, altura: 280, max: 44 },
  mapa: { largura: 1080, altura: 1272 },
  balao: { icone: 74, fonte: 38 },
  raio: 17,
  pad: "px-4 pb-2.5",
  gap: "gap-2.5",
  indice: { largura: 519, altura: 258, raio: 14 },
  comentario: { altura: 118, max: 26 },
};
const SLIDE_FEED: ConfigSlide = {
  variante: "feed",
  largura: FEED_W,
  altura: FEED_H,
  cab: CFG_FEED.cab,
  rodape: CFG_FEED.rodape,
  textoAltura: 220,
  textoArea: { largura: 1010, altura: 120, max: 32 },
  mapa: { largura: 1080, altura: 964 },
  balao: { icone: 58, fonte: 30 },
  raio: 13,
  pad: "px-3 pb-2",
  gap: "gap-2",
  indice: { largura: 524, altura: 180, raio: 11 },
  comentario: { altura: 40, max: 20 },
};
export type FormatoCarrossel = "story" | "feed";
export const carrosselMapa = (f: FormatoCarrossel, props: PropsArte) => <SlideMapa cfg={f === "story" ? SLIDE_STORY : SLIDE_FEED} {...props} />;
export const carrosselDetalhes = (f: FormatoCarrossel, props: PropsArte) => <SlideDetalhes cfg={f === "story" ? SLIDE_STORY : SLIDE_FEED} {...props} />;
