"use client";

import { Droplets, FileText, Sunrise, Sunset, Wind } from "lucide-react";
import { useMemo } from "react";

import { Previsao, REDECS } from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeature, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";
import { iconeDominante, iconeSrc, ICONES_TEMPO } from "@/lib/meteorologia";

/** Previsão do CEMADEN-RJ por REDEC: mapa neutro (sem cor por condição) com o ícone do tempo de cada região e cartões com TODOS os dados do dia
 * (situação, mín/máx, umidade, vento, comentário). Composições do mesmo conteúdo: tela (responsiva), post (quadrado), story (1080×1920) e carrossel
 * de dois slides (mapa grande com ícone e temperaturas + detalhes por região). */

/** Ordem e numeração oficiais das REDECs (a mesma de `REDECS`): a numeração do mapa e dos cartões. */
export const ORDEM_REDEC: readonly string[] = REDECS;
export const nomeBonito = (r: string) => r.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/ i$/i, " I").replace(/ ii$/i, " II");

export const rotuloTempo = (icone: string) => ICONES_TEMPO.find((i) => i.key === icone)?.label ?? icone;
const r0 = (n: number) => Math.round(Number(n));
export const textoVento = (p: Previsao) => `${p.vento_velocidade}${p.vento_direcao ? ` (${p.vento_direcao})` : ""}`;
export const textoUmidade = (p: Previsao) => `${r0(p.umidade_minima)}–${r0(p.umidade_maxima)}%`;
/** Vento em poucas letras para o balão do mapa: "Fraco/Mod. NW-SW". */
export const ventoCurto = (p: Previsao) => `${p.vento_velocidade.replace(/Moderado/g, "Mod.")}${p.vento_direcao ? ` ${p.vento_direcao}` : ""}`;

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

/** Posiciona cada marcador (caixa `larg`×`alt`) no espaço livre ao redor do Estado, o mais perto possível do ponto da região (estilo mapa do INEA: balões
 * em volta, ligados à região por uma linha curta). Rasteriza o contorno num canvas pequeno (passo de 6 px, com folga) e escolhe, região a região, a posição livre
 * mais próxima que não toque o Estado nem os marcadores já postos; as regiões da borda escolhem primeiro. Depois uma busca local move cada balão para a posição livre de menor custo (linha curta, sem cruzar outra linha nem outro balão). Determinístico. */
function posicionarEntorno(ds: string[], ancoras: Ponto[], W: number, H: number, larg: number, alt: number): Ponto[] {
  if (typeof document === "undefined") return ancoras;
  const passo = 6;
  const folga = 7;
  const cols = Math.ceil(W / passo);
  const linhas = Math.ceil(H / passo);
  const cv = document.createElement("canvas");
  cv.width = cols;
  cv.height = linhas;
  const ctx = cv.getContext("2d");
  if (!ctx) return ancoras;
  ctx.scale(1 / passo, 1 / passo);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = folga * 2;
  ctx.lineJoin = "round";
  for (const d of ds) {
    const path = new Path2D(d);
    ctx.fill(path);
    ctx.stroke(path);
  }
  const alfa = ctx.getImageData(0, 0, cols, linhas).data;
  // imagem integral da ocupação: soma de células ocupadas num retângulo em O(1)
  const larguraI = cols + 1;
  const soma = new Uint32Array(larguraI * (linhas + 1));
  for (let j = 0; j < linhas; j++) {
    let linha = 0;
    for (let i = 0; i < cols; i++) {
      linha += alfa[(j * cols + i) * 4 + 3] > 20 ? 1 : 0;
      soma[(j + 1) * larguraI + i + 1] = soma[j * larguraI + i + 1] + linha;
    }
  }
  const ocupadas = (i0: number, j0: number, i1: number, j1: number) => soma[(j1 + 1) * larguraI + i1 + 1] - soma[j0 * larguraI + i1 + 1] - soma[(j1 + 1) * larguraI + i0] + soma[j0 * larguraI + i0];
  const mc = Math.ceil(larg / 2 / passo);
  const ml = Math.ceil(alt / 2 / passo);
  const gap = 8;
  const melhor = (ancora: Ponto, postos: Ponto[]): { p: Ponto; d: number } | null => {
    let achado: { p: Ponto; d: number } | null = null;
    for (let j = ml; j < linhas - ml; j++) {
      for (let i = mc; i < cols - mc; i++) {
        const x = i * passo + passo / 2;
        const y = j * passo + passo / 2;
        const d = (x - ancora[0]) ** 2 + (y - ancora[1]) ** 2;
        if (achado && d >= achado.d) continue;
        if (ocupadas(i - mc, j - ml, i + mc, j + ml) > 0) continue;
        if (postos.some((q) => Math.abs(q[0] - x) < larg + gap && Math.abs(q[1] - y) < alt + gap)) continue;
        achado = { p: [x, y], d };
      }
    }
    return achado;
  };
  // as regiões cuja melhor posição livre está mais perto (as da borda) escolhem primeiro
  const ordem = ancoras
    .map((a, i) => ({ i, d: melhor(a, [])?.d ?? Infinity }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.i);
  const out: Ponto[] = ancoras.map((a) => [a[0], a[1]] as Ponto);
  const postos: Ponto[] = [];
  for (const i of ordem) {
    const m = melhor(ancoras[i], postos);
    if (m) {
      out[i] = m.p;
      postos.push(m.p);
    }
  }
  // refino: cada balão tenta as posições livres e fica com a de menor custo = comprimento da linha + penalidade por cruzar outra linha ou outro balão
  const cand: Ponto[] = [];
  for (let j = ml; j < linhas - ml; j += 2) for (let i = mc; i < cols - mc; i += 2) if (ocupadas(i - mc, j - ml, i + mc, j + ml) === 0) cand.push([i * passo + passo / 2, j * passo + passo / 2]);
  const hw = larg / 2;
  const hh = alt / 2;
  const lim = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
  const ponta = (a: Ponto, c: Ponto): Ponto => [lim(a[0], c[0] - hw, c[0] + hw), lim(a[1], c[1] - hh, c[1] + hh)];
  const orient = (a: Ponto, b: Ponto, c: Ponto) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const cruza = (a: Ponto, b: Ponto, c: Ponto, d: Ponto) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
  const bate = (a: Ponto, b: Ponto, c: Ponto) => {
    const x0 = c[0] - hw + 2;
    const x1 = c[0] + hw - 2;
    const y0 = c[1] - hh + 2;
    const y1 = c[1] + hh - 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const pp = [-dx, dx, -dy, dy];
    const qq = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]];
    let t0 = 0;
    let t1 = 1;
    for (let k = 0; k < 4; k++) {
      if (pp[k] === 0) {
        if (qq[k] < 0) return false;
      } else {
        const t = qq[k] / pp[k];
        if (pp[k] < 0) {
          if (t > t1) return false;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return false;
          if (t < t1) t1 = t;
        }
      }
    }
    return true;
  };
  const custo = (i: number, pos: Ponto) => {
    const ei = ponta(ancoras[i], pos);
    let c = Math.hypot(ancoras[i][0] - ei[0], ancoras[i][1] - ei[1]);
    for (let j = 0; j < out.length; j++) {
      if (j === i) continue;
      const ej = ponta(ancoras[j], out[j]);
      if (cruza(ancoras[i], ei, ancoras[j], ej)) c += 600;
      if (bate(ancoras[i], ei, out[j])) c += 500;
      if (bate(ancoras[j], ej, pos)) c += 500;
    }
    return c;
  };
  for (let volta = 0; volta < 10; volta++) {
    let mudou = false;
    for (let i = 0; i < out.length; i++) {
      let melhorC = custo(i, out[i]);
      let melhorP = out[i];
      for (const c of cand) {
        if (out.some((q, j) => j !== i && Math.abs(q[0] - c[0]) < larg + gap && Math.abs(q[1] - c[1]) < alt + gap)) continue;
        const k = custo(i, c);
        if (k < melhorC - 0.5) [melhorC, melhorP] = [k, c];
      }
      if (melhorP !== out[i]) {
        out[i] = melhorP;
        mudou = true;
      }
    }
    // troca de posições entre pares quando o custo total cai (as caixas têm o mesmo tamanho)
    const total = () => out.reduce((acc, _, i) => acc + custo(i, out[i]), 0);
    let atual = total();
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        [out[i], out[j]] = [out[j], out[i]];
        const novo = total();
        if (novo < atual - 0.5) {
          atual = novo;
          mudou = true;
        } else [out[i], out[j]] = [out[j], out[i]];
      }
    }
    if (!mudou) break;
  }
  return out;
}

/** "numeros": só o número da região. "icone": ícone do tempo sobre a região, com o número num selo (afasta o que se sobrepõe). "entorno": marcadores em volta do
 * Estado, ligados às regiões por uma linha (ícone, ou balão com ícone e mínima/máxima se `comTemp`). */
export type ModoMapa = "numeros" | "icone" | "entorno";
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

/** Mapa das REDECs sem cor por condição (a cor sugeria chuva o dia todo): regiões neutras com o ícone do tempo do dia e o número de cada uma.
 * Escala pelo `viewBox` (use `className` para o tamanho). */
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
  comTemp = false,
  balao = { icone: 56, fonte: 28 },
  margemMapa,
  posicoes,
  ajustes,
  className,
  style,
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
  /** modo "entorno": balão com ícone, máxima e mínima (em vez de só o ícone). */
  comTemp?: boolean;
  /** `info`: tamanho da letra das linhas de umidade e vento no balão (sem ele, o balão leva só ícone e temperaturas). */
  balao?: { icone: number; fonte: number; info?: number };
  /** Espaço (px do viewBox) deixado em volta do Estado; no modo "entorno" é onde os marcadores cabem. */
  margemMapa?: number;
  /** modo "entorno": posição de cada balão (na ordem das REDECs) em fração do retângulo do mapa; sem isso, o posicionamento é automático. */
  posicoes?: Record<string, [number, number]>;
  /** modo "entorno": desloca o ponto da região onde a linha termina (fração do retângulo do mapa), para a linha não encostar em outra. */
  ajustes?: Record<string, [number, number]>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const detalhes = comTemp && balao.info !== undefined;
  const linhaH = detalhes ? Math.round((balao.info ?? 0) * 1.4) : 0;
  const topoH = Math.max(balao.icone, Math.round(balao.fonte * 2.05)) + 12;
  const bw = detalhes ? Math.round((balao.info ?? 0) * 12.1) : 12 + balao.icone + 8 + Math.round(balao.fonte * 1.9) + 12;
  const bh = detalhes ? topoH + 2 * linhaH + 6 : balao.icone + 14;
  const caixaW = comTemp ? bw : tamIcone + 6;
  const caixaH = comTemp ? bh : tamIcone + 6;
  const itens = useMemo(() => {
    const pad = margemMapa ?? (modo === "entorno" ? 40 : modo === "icone" ? Math.round(tamIcone * 0.5) : 6);
    const proj = makeProjector(computeBBox(geo), largura, altura, pad);
    const bb = computeBBox(geo);
    const [x0, y0] = proj(bb.minLon, bb.maxLat);
    const [x1, y1] = proj(bb.maxLon, bb.minLat);
    const base = geo.features.map((f) => {
      const c = centroideMaiorAnel(f, proj);
      const aj = ajustes?.[f.properties.redec];
      return { redec: f.properties.redec, d: geometryToPath(f.geometry, proj), centro: (aj ? [c[0] + aj[0] * (x1 - x0), c[1] + aj[1] * (y1 - y0)] : c) as Ponto };
    });
    let marcador = base.map((b) => b.centro);
    if (modo === "icone") marcador = afastar(marcador, tamIcone + 8, tamIcone + 8, largura, altura);
    if (modo === "entorno" && posicoes && ORDEM_REDEC.every((r) => posicoes[r])) {
      marcador = base.map((b) => {
        const [u, v] = posicoes[b.redec];
        return [x0 + u * (x1 - x0), y0 + v * (y1 - y0)] as Ponto;
      });
    } else if (modo === "entorno") marcador = posicionarEntorno(base.map((b) => b.d), marcador, largura, altura, caixaW + raioNumero, caixaH + raioNumero);
    return base.map((b, i) => {
      const [mx, my] = marcador[i];
      // fim da linha: borda do marcador mais próxima da região (retângulo do balão ou círculo do ícone)
      let fim: Ponto = [mx, my];
      if (modo === "entorno") {
        if (comTemp) fim = [Math.min(Math.max(b.centro[0], mx - bw / 2), mx + bw / 2), Math.min(Math.max(b.centro[1], my - bh / 2), my + bh / 2)];
        else {
          const dx = b.centro[0] - mx;
          const dy = b.centro[1] - my;
          const n = Math.hypot(dx, dy) || 1;
          fim = [mx + (dx / n) * (tamIcone / 2 + 3), my + (dy / n) * (tamIcone / 2 + 3)];
        }
      }
      return { ...b, marcador: marcador[i], fim };
    });
  }, [geo, largura, altura, modo, tamIcone, comTemp, bw, bh, caixaW, caixaH, raioNumero, margemMapa, posicoes, ajustes]);
  const por = useMemo(() => new Map(previsoes.map((p) => [p.regiao, p])), [previsoes]);
  const distMin = tamIcone / 2 + 4;
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className={className} style={style} role="img" aria-label="Previsão do tempo por REDEC">
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
          if (modo === "icone" && Math.hypot(it.marcador[0] - it.centro[0], it.marcador[1] - it.centro[1]) <= distMin) return null;
          return (
            <g key={`l-${it.redec}`} pointerEvents="none">
              <line x1={it.centro[0]} y1={it.centro[1]} x2={modo === "entorno" ? it.fim[0] : it.marcador[0]} y2={modo === "entorno" ? it.fim[1] : it.marcador[1]} stroke="#475569" strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={it.centro[0]} cy={it.centro[1]} r={5} fill="#0f2a4a" stroke="#fff" strokeWidth={1.5} />
            </g>
          );
        })}
      {itens.map((it) => {
        const n = ORDEM_REDEC.indexOf(it.redec) + 1;
        const p = por.get(it.redec);
        const [cx, cy] = it.marcador;
        if (modo === "numeros" || !p?.icone) return <Selo key={`n-${it.redec}`} x={cx} y={cy} r={raioNumero} n={n} />;
        if (modo === "entorno" && comTemp) {
          const esq = cx - bw / 2;
          const topo = cy - bh / 2;
          const xt = esq + 12 + balao.icone + 8;
          const cy1 = detalhes ? topo + topoH / 2 : cy; // centro vertical da linha do ícone e das temperaturas
          const info = balao.info ?? 0;
          const isz = info + 2;
          const linha1 = topo + topoH;
          return (
            <g key={`n-${it.redec}`} pointerEvents={onSelecionar ? "auto" : "none"} className={onSelecionar ? "cursor-pointer" : undefined} onClick={onSelecionar ? () => onSelecionar(it.redec) : undefined}>
              <rect x={esq} y={topo} width={bw} height={bh} rx={14} fill={selecionada === it.redec ? "#eff6ff" : "#fff"} stroke={selecionada === it.redec ? "#1d4ed8" : "#94a3b8"} strokeWidth={selecionada === it.redec ? 5 : 2} />
              <image href={iconeSrc(p.icone)} x={esq + 12} y={cy1 - balao.icone / 2} width={balao.icone} height={balao.icone} preserveAspectRatio="xMidYMid meet" />
              <text x={xt} y={cy1 - balao.fonte * 0.1} fontSize={balao.fonte} fontWeight="800" fill="#dc2626">
                {r0(p.temperatura_maxima)}°
              </text>
              <text x={xt} y={cy1 + balao.fonte * 0.95} fontSize={balao.fonte} fontWeight="800" fill="#1d4ed8">
                {r0(p.temperatura_minima)}°
              </text>
              {detalhes && (
                <g fill="none">
                  <line x1={esq + 10} y1={linha1} x2={esq + bw - 10} y2={linha1} stroke="#cbd5e1" strokeWidth={1.5} />
                  <g transform={`translate(${esq + 12},${linha1 + (linhaH - isz) / 2 + 1}) scale(${isz / 24})`} stroke="#0284c7" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
                  </g>
                  <text x={esq + 12 + isz + 6} y={linha1 + linhaH * 0.76} fontSize={info} fontWeight="500" fill="#334155">
                    {`UR ${textoUmidade(p)}`}
                  </text>
                  <g transform={`translate(${esq + 12},${linha1 + linhaH + (linhaH - isz) / 2 + 1}) scale(${isz / 24})`} stroke="#f97316" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
                    <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
                    <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
                  </g>
                  <text x={esq + 12 + isz + 6} y={linha1 + linhaH * 1.76} fontSize={info} fontWeight="500" fill="#334155">
                    {ventoCurto(p)}
                  </text>
                </g>
              )}
              <Selo x={esq + 2} y={topo + 2} r={raioNumero} n={n} />
            </g>
          );
        }
        return (
          <g key={`n-${it.redec}`} pointerEvents={onSelecionar ? "auto" : "none"} className={onSelecionar ? "cursor-pointer" : undefined} onClick={onSelecionar ? () => onSelecionar(it.redec) : undefined}>
            <circle cx={cx} cy={cy} r={tamIcone / 2 + 3} fill={selecionada === it.redec ? "#eff6ff" : "#fff"} stroke={selecionada === it.redec ? "#1d4ed8" : "#94a3b8"} strokeWidth={selecionada === it.redec ? 3 : 1.5} />
            <image href={iconeSrc(p.icone)} x={cx - tamIcone / 2} y={cy - tamIcone / 2} width={tamIcone} height={tamIcone} preserveAspectRatio="xMidYMid meet" />
            <Selo x={cx - tamIcone / 2 - 2} y={cy - tamIcone / 2 - 2} r={raioNumero} n={n} />
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
export function CartaoRedec({ regiao, p, variante, ativo, onClick, comentarioPx, ocultarComentario, classico, id }: { regiao: string; p?: Previsao; variante: VarianteCartao; ativo?: boolean; onClick?: () => void; comentarioPx?: number; ocultarComentario?: boolean; classico?: boolean; id?: string }) {
  const n = ORDEM_REDEC.indexOf(regiao) + 1;
  const fixo = variante !== "tela"; // story/feed: tamanhos em px, comentário ajustado ao espaço
  const tam = TAMANHOS[variante];
  if (classico) {
    // layout clássico: ícone do tempo no canto, mín/máx em destaque, Sol à direita, umidade e vento embaixo
    return (
      <div
        id={id}
        onClick={onClick}
        className={`flex min-w-0 flex-col overflow-hidden rounded-lg border bg-white ${ativo ? "border-blue-600 bg-blue-50 ring-2 ring-blue-500" : "border-slate-300"} ${onClick ? "cursor-pointer" : ""} ${tam.pad}`}
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
              <div className={`flex gap-2 text-slate-600 ${tam.sol}`}>
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
                <Droplets size={tam.iconeInfo} className="shrink-0 text-sky-600" /> Umidade {textoUmidade(p)}
              </span>
              <span className="flex items-center gap-1">
                <Wind size={tam.iconeInfo} className="shrink-0 text-orange-500" /> Vento {textoVento(p)}
              </span>
            </div>
            {p.comentario && (
              <p className={`mt-1 min-h-0 overflow-hidden text-slate-600 ${variante === "tela" ? "text-xs leading-relaxed" : ""}`} style={comentarioPx ? { fontSize: comentarioPx, lineHeight: `${Math.round(comentarioPx * 1.2)}px` } : undefined}>
                {p.comentario}
              </p>
            )}
          </>
        )}
      </div>
    );
  }
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
        <div className="font-semibold text-sky-100" style={{ fontSize: Math.round(fonteTitulo * 0.78) }}>
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
  margemMapa: number;
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
            <MapaRedec geo={geo} previsoes={previsoes} largura={cfg.mapa.largura} altura={cfg.mapa.altura} raioNumero={cfg.raio} modo="entorno" tamIcone={cfg.tamIcone} margemMapa={cfg.margemMapa} className="h-full w-full" />
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
  tamIcone: 52,
  margemMapa: 40,
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

// ---------------------------------------------------------------- peças do Post (modelo A) e do carrossel Story (modelo D)
/** Posição de cada balão, por região, em fração do retângulo do mapa: [0,0] é o canto superior esquerdo do Estado e [1,1] o inferior direito; fora de 0–1 = fora do mapa.
 * Desenhadas pelo usuário sobre o modelo (cada balão perto da sua região, em volta do mapa). */
const SLOTS_POST: Record<string, [number, number]> = {
  CAPITAL: [0.2604, 0.9835],
  "BAIXADA FLUMINENSE": [0.4985, 0.9835],
  METROPOLITANA: [0.7692, 0.9835],
  "COSTA VERDE": [-0.1346, 0.9649],
  "SUL I": [0.2559, 0.1963],
  "SUL II": [0.034, 0.4566],
  "SERRANA I": [0.4956, 0.2831],
  "SERRANA II": [0.5488, 0.0971],
  "BAIXADA LITORÂNEA": [0.9571, 0.6798],
  NORTE: [1.1346, 0.3079],
  NOROESTE: [0.9482, 0.0351],
};
export const SLOTS_STORY: Record<string, [number, number]> = {
  CAPITAL: [0.3618, 1.0151],
  "BAIXADA FLUMINENSE": [0.662, 1.226], // à direita da Capital, para a linha não passar sob o balão dela
  METROPOLITANA: [0.749, 1.0137],
  "COSTA VERDE": [0.1029, 1.1219],
  "SUL I": [0.2441, 0.1521],
  "SUL II": [0.1265, 0.3986],
  "SERRANA I": [0.4912, 0.2753],
  "SERRANA II": [0.4912, 0.0616],
  "BAIXADA LITORÂNEA": [0.895, 0.7685],
  NORTE: [0.9029, -0.111],
  NOROESTE: [0.6441, -0.1603],
};
/** Mapa da aba Mapa → Previsão: as mesmas posições do carrossel, mas com Capital, Baixada Fluminense e Metropolitana lado a lado embaixo do mapa (aproveita melhor a tela). */
export const SLOTS_TELA: Record<string, [number, number]> = {
  ...SLOTS_STORY,
  CAPITAL: [0.3588, 1.0479],
  "BAIXADA FLUMINENSE": [0.6245, 1.0479],
  METROPOLITANA: [0.8706, 1.0479],
};
/** Slide 1: a linha da Sul I termina um pouco à direita do centro da região, para não encostar na linha da Sul II. */
export const AJUSTES_STORY: Record<string, [number, number]> = { "SUL I": [0.034, 0] };

/** Faixa de horários do Estado ("05:04–05:14", ou um só se forem iguais). */
function faixaHora(previsoes: Previsao[], campo: "nascer_sol" | "por_sol"): string {
  const v = previsoes.map((p) => (p[campo] ?? "").slice(0, 5)).filter(Boolean).sort();
  if (!v.length) return "—";
  return v[0] === v[v.length - 1] ? v[0] : `${v[0]}–${v[v.length - 1]}`;
}

function LinhaSol({ previsoes, altura, fonte, icone }: { previsoes: Previsao[]; altura: number; fonte: number; icone: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-8 rounded-lg border border-slate-300 bg-white whitespace-nowrap text-slate-700" style={{ height: altura, fontSize: fonte }}>
      <span className="flex items-center gap-2">
        <Sunrise size={icone} className="shrink-0 text-amber-500" /> Nascer do Sol {faixaHora(previsoes, "nascer_sol")}
      </span>
      <span className="flex items-center gap-2">
        <Sunset size={icone} className="shrink-0 text-amber-700" /> Pôr do Sol {faixaHora(previsoes, "por_sol")}
      </span>
    </div>
  );
}

/** Tabela do Post, uma região por bloco de duas linhas, na ordem dos números: 1ª linha com número, região, umidade (mín~máx) e vento; 2ª linha com o texto da região. */
function TabelaRegioes({ previsoes, fonte, fonteTexto, larguraTexto }: { previsoes: Previsao[]; fonte: number; fonteTexto: number; larguraTexto: number }) {
  const por = new Map(previsoes.map((p) => [p.regiao, p]));
  const cols = "335px 330px minmax(0,1fr)";
  const isz = Math.round(fonte * 0.95);
  const maior = maiorComentario(previsoes);
  const px = ajustarComentarioPx(maior, larguraTexto, Math.round(fonteTexto * 1.2) * 2, fonteTexto, 13);
  return (
    <div className="shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-800" style={{ fontSize: fonte }}>
      <div className="grid items-center bg-[#0f2a4a] px-3 font-semibold text-white" style={{ gridTemplateColumns: cols, height: Math.round(fonte * 1.5) }}>
        <span>Região</span>
        <span className="text-center">Umidade</span>
        <span className="text-right">Vento</span>
      </div>
      {ORDEM_REDEC.map((r, i) => {
        const p = por.get(r);
        return (
          <div key={r} className={`border-t border-slate-100 px-3 py-0.5 ${i % 2 ? "bg-slate-50" : ""}`}>
            <div className="grid items-center" style={{ gridTemplateColumns: cols, height: Math.round(fonte * 1.3) }}>
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex shrink-0 items-center justify-center rounded-full bg-[#0f2a4a] font-bold text-white" style={{ width: fonte * 1.1, height: fonte * 1.1, fontSize: fonte * 0.78 }}>
                  {i + 1}
                </span>
                <span className="truncate font-semibold">{nomeBonito(r)}</span>
              </span>
              {p ? (
                <>
                  <span className="whitespace-nowrap text-center">
                    {r0(p.umidade_minima)}~{r0(p.umidade_maxima)}%
                  </span>
                  <span className="flex min-w-0 items-center justify-end gap-1.5 whitespace-nowrap">
                    <Wind size={isz} className="shrink-0 text-orange-500" />
                    <span className="truncate">{textoVento(p)}</span>
                  </span>
                </>
              ) : (
                <span className="col-span-2">Sem previsão</span>
              )}
            </div>
            {p?.comentario && (
              <p className="text-slate-600" style={{ fontSize: px, lineHeight: `${Math.round(px * 1.2)}px` }}>
                {p.comentario}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Post 1080×1350 (modelo A): mapa com balões de ícone e temperaturas em volta, cada um perto da sua região; texto geral; Sol do Estado; e, por região, umidade, vento e o texto. */
export function CorpoFeed({ geo, previsoes, titulo, data, textoGeral }: PropsArte) {
  const t = (textoGeral ?? "").trim();
  const px = ajustarComentarioPx(t.length + 17, 920, 62, 26, 14);
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: FEED_W, height: FEED_H }}>
      <Cabecalho titulo={titulo} data={data} altura={120} fonteTitulo={40} logo={68} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-2 pt-2.5">
        <div className="min-h-0 flex-1 rounded-lg bg-sky-50">
          <MapaRedec geo={geo} previsoes={previsoes} largura={1056} altura={540} raioNumero={11} modo="entorno" comTemp balao={{ icone: 54, fonte: 29 }} margemMapa={28} posicoes={SLOTS_POST} className="h-full w-full" />
        </div>
        {t && (
          <div className="flex shrink-0 items-center gap-3 rounded-lg border border-blue-300 bg-blue-50 px-3" style={{ height: 82 }}>
            <FileText size={26} className="shrink-0 text-[#0f4c81]" />
            <p className="min-w-0 overflow-hidden text-slate-800" style={{ fontSize: px, lineHeight: `${Math.round(px * 1.2)}px`, maxHeight: 74 }}>
              <strong className="text-[#0f4c81]">Previsão geral · </strong>
              {t}
            </p>
          </div>
        )}
        <LinhaSol previsoes={previsoes} altura={32} fonte={19} icone={19} />
        <TabelaRegioes previsoes={previsoes} fonte={20} fonteTexto={16} larguraTexto={990} />
      </div>
      <Rodape altura={46} fonte={19} />
    </div>
  );
}

// ---------------------------------------------------------------- carrossel Story (modelo D): slide 1 mapa com balão completo; slide 2 os cartões de cada região
/** "Quinta-feira, 29/10/2026" → ["Quinta-feira", "29/10/2026"]. */
const diaEData = (longa: string): [string, string] => {
  const i = longa.indexOf(", ");
  return i < 0 ? [longa, ""] : [longa.slice(0, i), longa.slice(i + 2)];
};

/** Dia da semana e data em duas linhas, no canto superior esquerdo do mapa (o cabeçalho continua como está). */
function DiaEData({ dia, data, fonteDia, fonteData, className }: { dia: string; data: string; fonteDia: number; fonteData: number; className: string }) {
  return (
    <div className={`pointer-events-none absolute z-10 leading-tight text-[#0f4c81] ${className}`}>
      <div className="font-extrabold" style={{ fontSize: fonteDia }}>
        {dia}
      </div>
      <div className="font-bold" style={{ fontSize: fonteData }}>
        {data}
      </div>
    </div>
  );
}

type ConfigSlide = {
  cab: { altura: number; fonteTitulo: number; logo: number };
  rodape: { altura: number; fonte: number };
  indice: { largura: number; altura: number; raio: number };
};
const SLIDE: ConfigSlide = {
  cab: CFG_STORY.cab,
  rodape: CFG_STORY.rodape,
  indice: { largura: 519, altura: 258, raio: 14 },
};

/** Slide 1: balões completos em volta do mapa (ícone, máxima, mínima, umidade e vento, com o número da região), cada um perto da sua região; embaixo o texto geral e o Sol do Estado. */
function SlideMapa({ geo, previsoes, titulo, data, textoGeral }: PropsArte) {
  const t = (textoGeral ?? "").trim();
  const [dia, dataCurta] = diaEData(data);
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: STORY_W, height: STORY_H }}>
      <Cabecalho titulo={titulo} data={data} altura={SLIDE.cab.altura} fonteTitulo={SLIDE.cab.fonteTitulo} logo={SLIDE.cab.logo} />
      <div className="relative min-h-0 flex-1 bg-sky-50">
        <DiaEData dia={dia} data={dataCurta} fonteDia={56} fonteData={48} className="left-9 top-8" />
        <MapaRedec geo={geo} previsoes={previsoes} largura={1080} altura={1290} raioNumero={17} modo="entorno" comTemp balao={{ icone: 62, fonte: 30, info: 18 }} margemMapa={30} posicoes={SLOTS_STORY} ajustes={AJUSTES_STORY} className="h-full w-full" />
      </div>
      {t && (
        <div className="shrink-0 bg-sky-50 px-4 pb-3" style={{ height: 330 }}>
          <CartaoGeral texto={textoGeral} previsoes={previsoes} variante="story" area={{ largura: 1000, altura: 230, max: 44 }} />
        </div>
      )}
      <div className="shrink-0 bg-sky-50 px-4 pb-3">
        <LinhaSol previsoes={previsoes} altura={60} fonte={25} icone={26} />
      </div>
      <Rodape altura={SLIDE.rodape.altura} fonte={SLIDE.rodape.fonte} />
    </div>
  );
}

/** Slide 2: o mapa de referência só com os números no canto superior esquerdo e, depois dele, o cartão de cada região (o cartão clássico: ícone, mínima/máxima, Sol, umidade, vento e comentário), com os mesmos números do slide 1. */
function SlideDetalhes({ geo, previsoes, data }: PropsArte) {
  const itens = ordenar(previsoes);
  const [dia, dataCurta] = diaEData(data);
  const comentarioPx = ajustarComentarioPx(maiorComentario(previsoes), 484, 90, 26);
  return (
    <div className="flex flex-col overflow-hidden bg-white" style={{ width: STORY_W, height: STORY_H }}>
      <Cabecalho titulo="Previsão por região" data={data} altura={SLIDE.cab.altura} fonteTitulo={SLIDE.cab.fonteTitulo} logo={SLIDE.cab.logo} />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2.5 px-4 pb-2.5 pt-2.5" style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}>
        <div className="relative min-h-0 overflow-hidden rounded-lg border border-slate-300 bg-sky-50">
          <DiaEData dia={dia} data={dataCurta} fonteDia={30} fonteData={26} className="left-3 top-2" />
          <MapaRedec geo={geo} previsoes={previsoes} largura={SLIDE.indice.largura} altura={SLIDE.indice.altura} raioNumero={SLIDE.indice.raio} modo="numeros" className="h-full w-full" />
        </div>
        {itens.map(({ regiao, p }) => (
          <CartaoRedec key={regiao} regiao={regiao} p={p} variante="story" classico comentarioPx={comentarioPx} />
        ))}
      </div>
      <Rodape altura={SLIDE.rodape.altura} fonte={SLIDE.rodape.fonte} />
    </div>
  );
}

export const carrosselMapa = (props: PropsArte) => <SlideMapa {...props} />;
export const carrosselDetalhes = (props: PropsArte) => <SlideDetalhes {...props} />;
