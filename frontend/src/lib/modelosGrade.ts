/** Modelos numéricos em grade (GFS/NOAA e IFS/ECMWF): leitura dos JSON gerados pelo GitHub Actions (scripts/modelos/gerar_grades.py,
 * publicados no branch `dados-modelos`), produtos derivados (chuva em janelas, vento, setas), paletas e amostragem em ponto.
 * Documentação: docs/modelos-numericos.md. */

export const BASE_DADOS =
  process.env.NEXT_PUBLIC_DADOS_MODELOS ?? "https://raw.githubusercontent.com/anthonybombeiro/cemaden-rj-rainfall-dashboard/dados-modelos";

export type ModeloGrade = "gfs" | "ifs" | "ifs01" | "aifs" | "icon" | "ifsens" | "gefs";
export const MODELOS_CONJUNTO: ModeloGrade[] = ["ifsens", "gefs"];
export const ehConjunto = (m: string) => (MODELOS_CONJUNTO as string[]).includes(m);
export const MODELOS_GRADE: { id: ModeloGrade; rotulo: string; detalhe: string; grupo: "NOAA" | "ECMWF" | "DWD"; cor: string; atribuicao: string; conjunto?: boolean }[] = [
  { id: "ifs", rotulo: "IFS 0,25°", detalhe: "ECMWF, ~25 km, 4 rodadas/dia", grupo: "ECMWF", cor: "#2a78d6", atribuicao: "ECMWF Open Data (CC-BY-4.0)" },
  { id: "ifs01", rotulo: "IFS 0,1° (RJ)", detalhe: "ECMWF, ~9 km, só o RJ e superfície", grupo: "ECMWF", cor: "#0b3d91", atribuicao: "ECMWF Open Data (CC-BY-4.0)" },
  { id: "aifs", rotulo: "AIFS 0,25° (IA)", detalhe: "ECMWF, modelo de IA, passo de 6 h até 15 dias", grupo: "ECMWF", cor: "#1baf7a", atribuicao: "ECMWF Open Data (CC-BY-4.0)" },
  { id: "gfs", rotulo: "GFS 0,25°", detalhe: "NOAA/NCEP, ~25 km, 4 rodadas/dia", grupo: "NOAA", cor: "#eb6834", atribuicao: "NOAA/NCEP (domínio público)" },
  { id: "icon", rotulo: "ICON global 13 km (DWD)", detalhe: "DWD (Alemanha), 13 km, grade regridada para 0,125°, até 7 dias", grupo: "DWD", cor: "#d4537e", atribuicao: "Deutscher Wetterdienst (DWD), dados abertos" },
  { id: "ifsens", rotulo: "IFS ENS — probabilidades (50 membros)", detalhe: "ECMWF, conjunto de 50 membros, passo de 6 h até 10 dias", grupo: "ECMWF", cor: "#6250d6", atribuicao: "ECMWF Open Data (CC-BY-4.0)", conjunto: true },
  { id: "gefs", rotulo: "GEFS — probabilidades (31 membros)", detalhe: "NOAA, conjunto de 31 membros, passo de 6 h até 10 dias", grupo: "NOAA", cor: "#c9302f", atribuicao: "NOAA/NCEP (domínio público)", conjunto: true },
];
export const ehModeloGrade = (f: string): f is ModeloGrade => MODELOS_GRADE.some((m) => m.id === f);
export const rotuloModelo = (m: ModeloGrade) => MODELOS_GRADE.find((x) => x.id === m)?.rotulo ?? m;

const HORA = 3600000;

// ---------------------------------------------------------------- tipos
export type VarMeta = { id: string; rotulo: string; un: string; grupo: string; paleta: string; acumulada: boolean; passos: number[]; faixa?: [number, number] };
export type MetaModelo = {
  modelo: ModeloGrade;
  run: string; // AAAAMMDDHH (UTC)
  gerado_em: string;
  dominio: { lat_n: number; lat_s: number; lon_w: number; lon_e: number };
  passos: number[];
  variaveis: VarMeta[];
};
export type Geo = { nx: number; ny: number; lat0: number; lon0: number; dlat: number; dlon: number };
export type Grade = Geo & { run: string; passos: number[]; dados: Float32Array[] };

export const runParaMs = (run: string) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));
export const rotuloRun = (run: string) => `${run.slice(6, 8)}/${run.slice(4, 6)} ${run.slice(8, 10)}Z`;

// ---------------------------------------------------------------- download (com cache em memória)
const cacheMeta = new Map<string, { em: number; p: Promise<MetaModelo> }>();
const cacheGrade = new Map<string, Promise<Grade>>();

export function fetchMeta(modelo: ModeloGrade): Promise<MetaModelo> {
  const c = cacheMeta.get(modelo);
  if (c && Date.now() - c.em < 5 * 60000) return c.p;
  const p = fetch(`${BASE_DADOS}/${modelo}/meta.json`).then((r) => {
    if (!r.ok) throw new Error(`meta ${modelo}: HTTP ${r.status}`);
    return r.json() as Promise<MetaModelo>;
  });
  p.catch(() => cacheMeta.delete(modelo));
  cacheMeta.set(modelo, { em: Date.now(), p });
  return p;
}

export function fetchGrade(modelo: ModeloGrade, id: string, run: string): Promise<Grade> {
  const chave = `${modelo}/${run}/${id}`;
  const c = cacheGrade.get(chave);
  if (c) return c;
  const p = fetch(`${BASE_DADOS}/${modelo}/${id}.json`).then(async (r) => {
    if (!r.ok) throw new Error(`${chave}: HTTP ${r.status}`);
    const d = await r.json();
    if (d.run !== run) throw new Error(`${chave}: rodada mudou (${d.run})`);
    const dados = (d.dados as number[][]).map((linha) => {
      const a = new Float32Array(linha.length);
      for (let i = 0; i < linha.length; i++) a[i] = linha[i] === d.nulo ? NaN : linha[i] / d.fator;
      return a;
    });
    return { nx: d.nx, ny: d.ny, lat0: d.lat0, lon0: d.lon0, dlat: d.dlat, dlon: d.dlon, run: d.run, passos: d.passos as number[], dados } satisfies Grade;
  });
  p.catch(() => cacheGrade.delete(chave));
  cacheGrade.set(chave, p);
  return p;
}

// ---------------------------------------------------------------- amostragem
export const dentro = (g: Geo, lat: number, lon: number) =>
  lat <= g.lat0 && lat >= g.lat0 - (g.ny - 1) * g.dlat && lon >= g.lon0 && lon <= g.lon0 + (g.nx - 1) * g.dlon;

/** Interpolação bilinear; NaN fora do domínio ou sem dado. */
export function amostrar(v: Float32Array, g: Geo, lat: number, lon: number): number {
  const fy = (g.lat0 - lat) / g.dlat;
  const fx = (lon - g.lon0) / g.dlon;
  if (fy < 0 || fx < 0 || fy > g.ny - 1 || fx > g.nx - 1) return NaN;
  const y0 = Math.min(Math.floor(fy), g.ny - 2);
  const x0 = Math.min(Math.floor(fx), g.nx - 2);
  const ty = fy - y0;
  const tx = fx - x0;
  const a = v[y0 * g.nx + x0], b = v[y0 * g.nx + x0 + 1], c = v[(y0 + 1) * g.nx + x0], d = v[(y0 + 1) * g.nx + x0 + 1];
  const w = (1 - tx) * (1 - ty) * (a === a ? 1 : 0) + tx * (1 - ty) * (b === b ? 1 : 0) + (1 - tx) * ty * (c === c ? 1 : 0) + tx * ty * (d === d ? 1 : 0);
  if (w < 0.5) return NaN;
  return ((a === a ? a : 0) * (1 - tx) * (1 - ty) + (b === b ? b : 0) * tx * (1 - ty) + (c === c ? c : 0) * (1 - tx) * ty + (d === d ? d : 0) * tx * ty) / w;
}

// ---------------------------------------------------------------- paletas
type Cor = [number, number, number, number]; // r g b a(0-255)
const hex = (h: string): Cor => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255];
};
export type Rampa = { cores: string[]; degraus?: number[] };

export const RAMPAS: Record<string, Rampa> = {
  temp: { cores: ["#2c1e8f", "#3b6fd8", "#5ec2e8", "#bfe9c9", "#fff3a8", "#fdb55a", "#ee6a3a", "#c32d2b", "#7a0f1c"] },
  umid: { cores: ["#8c510a", "#d8b365", "#f6e8c3", "#c7eae5", "#5ab4ac", "#01665e", "#08306b"] },
  vento: { cores: ["#ffffff", "#bfe3f5", "#6bb6e8", "#3b8fd0", "#46b27c", "#e9d24a", "#f08a35", "#d6322b", "#8a1a6e"] },
  pressao: { cores: ["#4b1d91", "#3d5bd0", "#8fc3e8", "#f3f3f3", "#f7c78b", "#e9803b", "#b8222b"] },
  cape: { cores: ["#f4f4f4", "#c8e6c9", "#fff59d", "#ffcc80", "#ff8a65", "#e53935", "#8e24aa"] },
  cin: { cores: ["#ffffff00", "#fee0d2", "#fc9272", "#de2d26", "#67000d"] },
  nuvem: { cores: ["#ffffff00", "#cfd8dc99", "#90a4aebb", "#546e7ad8", "#263238f0"] },
  refl: { cores: ["#00000000", "#6ec6ff", "#2a9df4", "#00c853", "#76ff03", "#ffee58", "#ffa726", "#ef5350", "#b71c1c", "#ab47bc"] },
  altura: { cores: ["#440154", "#3b528b", "#21908d", "#5dc863", "#fde725"] },
  omega: { cores: ["#2166ac", "#67a9cf", "#d1e5f0", "#f7f7f7", "#fddbc7", "#ef8a62", "#b2182b"] },
  solo: { cores: ["#d8b365", "#f6e8c3", "#c7eae5", "#5ab4ac", "#01665e"] },
  agua: { cores: ["#ffffff", "#c7e9c0", "#74c476", "#238b45", "#41b6c4", "#225ea8", "#081d58"] },
  vis: { cores: ["#7f0000", "#d7301f", "#fc8d59", "#fdd49e", "#ffffff00"] },
  onda: { cores: ["#e0f2fe", "#7dd3fc", "#38bdf8", "#0ea5e9", "#2563eb", "#7c3aed", "#be185d"] },
  periodo: { cores: ["#f0fdf4", "#bbf7d0", "#4ade80", "#16a34a", "#0e7490", "#4338ca", "#701a75"] },
  li: { cores: ["#7f0000", "#d7301f", "#fdae61", "#ffffbf", "#f7f7f700"] },
  prob: { cores: ["#ffffff00", "#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#7c3aed", "#4c1d95"] },
  // chuva (mm): faixas discretas
  chuva: {
    degraus: [0.2, 1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200],
    cores: ["#d9edf7", "#a6d6f2", "#6bb6e8", "#3b8fd0", "#2166ac", "#2ca25f", "#99d594", "#e9e45a", "#fdb54a", "#f4793a", "#dc3a2c", "#a50f15", "#7a0a8c", "#4a0a5e", "#2a0a3a"],
  },
};

export type Escala = { rampa: string; min: number; max: number; un: string };

/** Função valor → RGBA. */
export function criarCor(e: Escala): (v: number) => Cor {
  const r = RAMPAS[e.rampa] ?? RAMPAS.temp;
  const cores = r.cores.map(hex);
  if (r.degraus) {
    const dg = r.degraus;
    return (v) => {
      if (!(v === v) || v < dg[0]) return [0, 0, 0, 0];
      let i = 0;
      while (i + 1 < dg.length && v >= dg[i + 1]) i++;
      const c = cores[Math.min(i, cores.length - 1)];
      return [c[0], c[1], c[2], Math.round(c[3] * 0.92)];
    };
  }
  const span = e.max - e.min || 1;
  return (v) => {
    if (!(v === v)) return [0, 0, 0, 0];
    const t = Math.min(1, Math.max(0, (v - e.min) / span)) * (cores.length - 1);
    const i = Math.min(Math.floor(t), cores.length - 2);
    const f = t - i;
    const a = cores[i], b = cores[i + 1];
    return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), Math.round(a[3] + (b[3] - a[3]) * f)];
  };
}

/** Itens da legenda: (valor, css) — degraus para chuva, ~6 pontos para as contínuas. */
export function itensLegenda(e: Escala): { valor: number; css: string }[] {
  const r = RAMPAS[e.rampa] ?? RAMPAS.temp;
  const cor = criarCor(e);
  const css = (v: number) => {
    const c = cor(v);
    return `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(2)})`;
  };
  if (r.degraus) return r.degraus.map((v) => ({ valor: v, css: css(v) }));
  const n = 6;
  return Array.from({ length: n + 1 }, (_, i) => {
    const v = e.min + ((e.max - e.min) * i) / n;
    return { valor: v, css: css(v) };
  });
}

// ---------------------------------------------------------------- produtos derivados
export type ResultadoProduto = { valores: Float32Array; setas?: { u: Float32Array; v: Float32Array }; nota?: string };
export type Produto = {
  id: string;
  rotulo: string;
  grupo: string;
  un: string;
  escala: Escala;
  vars: string[];
  horas: number[]; // passos (h) em que o produto existe
  calcula: (g: Record<string, Grade>, hora: number) => ResultadoProduto | null;
};

const idxHora = (g: Grade, h: number) => g.passos.indexOf(h);
const KMH = 3.6;
const JANELAS_CHUVA = [3, 6, 12, 24, 48, 72, 96];
const RT = 6371000;

const velocidade = (u: Float32Array, v: Float32Array, f: number) => {
  const o = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) o[i] = Math.hypot(u[i], v[i]) * f;
  return o;
};

const FAIXAS: Record<string, [number, number, string]> = {
  t2m: [5, 38, "temp"], td2m: [0, 26, "umid"], t850: [4, 28, "temp"], t700: [-6, 16, "temp"], t500: [-20, -2, "temp"],
  rh2m: [0, 100, "umid"], r850: [0, 100, "umid"], r700: [0, 100, "umid"], r500: [0, 100, "umid"],
  msl: [1004, 1024, "pressao"], cape: [0, 4000, "cape"], cin: [0, 250, "cin"], tcwv: [10, 70, "agua"],
  tcc: [0, 100, "nuvem"], lcc: [0, 100, "nuvem"], mcc: [0, 100, "nuvem"], hcc: [0, 100, "nuvem"],
  refc: [0, 60, "refl"], vis: [0, 20, "vis"], hpbl: [0, 3000, "agua"], soilw: [10, 60, "solo"],
  swh: [0, 6, "onda"], mwp: [4, 18, "periodo"], pp1d: [4, 18, "periodo"], hzerocl: [3000, 5200, "altura"], gh850: [1350, 1600, "altura"], gh500: [5650, 5950, "altura"], gh250: [10300, 10900, "altura"],
  w700: [-1.5, 1.5, "omega"], w500: [-1.5, 1.5, "omega"],
  tprate: [0, 40, "vento"], sp: [900, 1020, "pressao"], ro: [0, 20, "agua"], aptmp: [5, 45, "temp"], lftx: [-10, 6, "li"], hlcy: [0, 400, "cape"], cape_ml: [0, 3000, "cape"],
  q925: [2, 20, "agua"], q850: [2, 18, "agua"], q700: [1, 12, "agua"], t925: [8, 30, "temp"], r925: [0, 100, "umid"], gh700: [2900, 3200, "altura"],
};
const NIVEIS_VENTO: { n: number; max: number }[] = [
  { n: 925, max: 90 }, { n: 850, max: 90 }, { n: 700, max: 110 }, { n: 500, max: 150 }, { n: 250, max: 250 },
];

/** Catálogo de produtos mostrados ao usuário, montado a partir do `meta.json` do modelo. */
export function produtosDoModelo(meta: MetaModelo): Produto[] {
  const tem = (id: string) => meta.variaveis.find((v) => v.id === id);
  const out: Produto[] = [];

  const tp = tem("tp");
  const janelasAcum = (vid: "tp" | "cp", prefixo: string, nome: string, janelas: number[]) => {
    const vm = tem(vid);
    if (!vm) return;
    for (const w of janelas) {
      out.push({
        id: `${prefixo}${w}`, rotulo: `${nome} nas últimas ${w} h`, grupo: "Chuva", un: "mm", vars: [vid],
        escala: { rampa: "chuva", min: 0, max: 200, un: "mm" }, horas: vm.passos.filter((h) => h > 0),
        calcula: (g, h) => {
          const t = g[vid];
          const i = idxHora(t, h);
          if (i < 0) return null;
          const j = h - w > 0 ? idxHora(t, h - w) : -1;
          const fim = t.dados[i];
          if (h - w > 0 && j < 0) return null;
          const o = new Float32Array(fim.length);
          for (let k = 0; k < o.length; k++) o[k] = j >= 0 ? Math.max(0, fim[k] - t.dados[j][k]) : fim[k];
          return { valores: o, nota: h - w <= 0 ? `desde o início da rodada (${h} h)` : undefined };
        },
      });
    }
  };
  janelasAcum("tp", "chuva", "Chuva", JANELAS_CHUVA);
  janelasAcum("cp", "chuvaconv", "Chuva convectiva", [6, 24, 72]);
  if (tp) {
    out.push({
      id: "chuvaTotal", rotulo: "Chuva total desde o início da rodada", grupo: "Chuva", un: "mm", vars: ["tp"],
      escala: { rampa: "chuva", min: 0, max: 200, un: "mm" }, horas: tp.passos.filter((h) => h > 0),
      calcula: (g, h) => {
        const i = idxHora(g.tp, h);
        return i < 0 ? null : { valores: g.tp.dados[i] };
      },
    });
  }

  const vento = (id: string, rotulo: string, grupo: string, u: string, v: string, max: number) => {
    const vu = tem(u), vv = tem(v);
    if (!vu || !vv) return;
    out.push({
      id, rotulo, grupo, un: "km/h", vars: [u, v], escala: { rampa: "vento", min: 0, max, un: "km/h" },
      horas: vu.passos.filter((h) => vv.passos.includes(h)),
      calcula: (g, h) => {
        const i = idxHora(g[u], h), j = idxHora(g[v], h);
        if (i < 0 || j < 0) return null;
        return { valores: velocidade(g[u].dados[i], g[v].dados[j], KMH), setas: { u: g[u].dados[i], v: g[v].dados[j] } };
      },
    });
  };
  vento("vento10", "Vento a 10 m (com setas)", "Vento", "u10", "v10", 72);
  vento("vento100", "Vento a 100 m (GFS: 80 m) (com setas)", "Vento", "u100", "v100", 90);
  const gust = tem("gust");
  if (gust) {
    out.push({
      id: "gust", rotulo: "Rajada de vento", grupo: "Vento", un: "km/h", vars: ["gust"], escala: { rampa: "vento", min: 0, max: 90, un: "km/h" }, horas: gust.passos,
      calcula: (g, h) => {
        const i = idxHora(g.gust, h);
        if (i < 0) return null;
        const o = new Float32Array(g.gust.dados[i].length);
        for (let k = 0; k < o.length; k++) o[k] = g.gust.dados[i][k] * KMH;
        return { valores: o };
      },
    });
  }
  const sw = tem("swh"), md = tem("mwd");
  if (sw && md) {
    out.push({
      id: "ondas", rotulo: "Ondas: altura significativa e direção (setas)", grupo: "Ondas", un: "m", vars: ["swh", "mwd"], horas: sw.passos.filter((h) => md.passos.includes(h)),
      escala: { rampa: "onda", min: 0, max: 6, un: "m" },
      calcula: (g, h) => {
        const i = idxHora(g.swh, h), j = idxHora(g.mwd, h);
        if (i < 0 || j < 0) return null;
        const hs = g.swh.dados[i], dir = g.mwd.dados[j];
        const u = new Float32Array(hs.length), v = new Float32Array(hs.length);
        for (let k = 0; k < hs.length; k++) {
          const ate = ((dir[k] + 180) * Math.PI) / 180; // a direção informada é de ONDE as ondas vêm
          u[k] = hs[k] * Math.sin(ate);
          v[k] = hs[k] * Math.cos(ate);
        }
        return { valores: hs, setas: { u, v } };
      },
    });
  }
  for (const { n, max } of NIVEIS_VENTO) vento(`vento${n}`, `Vento ${n} hPa (com setas)`, "Altitude", `u${n}`, `v${n}`, max);

  for (const v of meta.variaveis) {
    if (v.id === "tp" || v.id === "cp" || v.id === "gust" || v.id === "mwd" || /^[uv](10|100|\d{3})$/.test(v.id)) continue;
    const f = FAIXAS[v.id];
    out.push({
      id: v.id, rotulo: v.rotulo, grupo: v.grupo, un: v.un, vars: [v.id],
      escala: { rampa: f?.[2] ?? v.paleta, min: v.faixa?.[0] ?? f?.[0] ?? 0, max: v.faixa?.[1] ?? f?.[1] ?? 100, un: v.un }, horas: v.passos,
      calcula: (g, h) => {
        const i = idxHora(g[v.id], h);
        return i < 0 ? null : { valores: g[v.id].dados[i] };
      },
    });
  }
  out.push(...produtosDerivados(meta));
  const ordem = ["Probabilidades", "Chuva (conjunto)", "Chuva", "Vento (conjunto)", "Vento", "Ondas (conjunto)", "Ondas", "Temperatura (conjunto)", "Superfície", "Instabilidade", "Nuvens", "Altitude", "Derivados"];
  return out.sort((a, b) => ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo));
}

/** Derivadas espaciais do vento (s⁻¹ × 1e5) por diferenças centrais; bordas ficam NaN. */
function derivadasVento(g: Geo, u: Float32Array, v: Float32Array): { div: Float32Array; vort: Float32Array } {
  const div = new Float32Array(u.length).fill(NaN), vort = new Float32Array(u.length).fill(NaN);
  const dy = (g.dlat * Math.PI * RT) / 180;
  for (let j = 1; j < g.ny - 1; j++) {
    const lat = g.lat0 - j * g.dlat;
    const dx = (g.dlon * Math.PI * RT * Math.cos((lat * Math.PI) / 180)) / 180;
    for (let i = 1; i < g.nx - 1; i++) {
      const k = j * g.nx + i;
      const dudx = (u[k + 1] - u[k - 1]) / (2 * dx), dvdx = (v[k + 1] - v[k - 1]) / (2 * dx);
      const dudy = (u[k - g.nx] - u[k + g.nx]) / (2 * dy), dvdy = (v[k - g.nx] - v[k + g.nx]) / (2 * dy); // linhas vão de norte a sul
      div[k] = (dudx + dvdy) * 1e5;
      vort[k] = (dvdx - dudy) * 1e5;
    }
  }
  return { div, vort };
}

/** Índice de calor (NWS/Rothfusz) em °C a partir de T (°C) e UR (%); abaixo de ~27 °C devolve a própria T. */
function indiceCalor(tC: number, rh: number): number {
  const t = tC * 1.8 + 32;
  if (!(t === t) || !(rh === rh) || t < 80) return tC;
  const hi = -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t - 0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
  return (hi - 32) / 1.8;
}

function produtosDerivados(meta: MetaModelo): Produto[] {
  const tem = (id: string) => meta.variaveis.find((v) => v.id === id);
  const out: Produto[] = [];
  const interseccao = (...ids: string[]) => {
    const vs = ids.map(tem);
    if (vs.some((x) => !x)) return null;
    return (vs as VarMeta[])[0].passos.filter((h) => (vs as VarMeta[]).every((x) => x.passos.includes(h)));
  };
  const parUV = (nivel: number, rotulo: string, tipo: "div" | "vort", faixa: number) => {
    const horas = interseccao(`u${nivel}`, `v${nivel}`);
    if (!horas?.length) return;
    out.push({
      id: `${tipo}${nivel}`, rotulo, grupo: "Derivados", un: "×10⁻⁵ s⁻¹", vars: [`u${nivel}`, `v${nivel}`], horas,
      escala: { rampa: "omega", min: -faixa, max: faixa, un: "×10⁻⁵ s⁻¹" },
      calcula: (g, h) => {
        const gu = g[`u${nivel}`], gv = g[`v${nivel}`];
        const i = gu.passos.indexOf(h), j = gv.passos.indexOf(h);
        if (i < 0 || j < 0) return null;
        const d = derivadasVento(gu, gu.dados[i], gv.dados[j]);
        return { valores: tipo === "div" ? d.div : d.vort, setas: { u: gu.dados[i], v: gv.dados[j] } };
      },
    });
  };
  parUV(850, "Divergência do vento a 850 hPa (azul = convergência)", "div", 8);
  parUV(250, "Divergência do vento a 250 hPa (vermelho = divergência em altitude)", "div", 8);
  parUV(850, "Vorticidade relativa a 850 hPa (azul = ciclônica no HS)", "vort", 10);

  const hCis = interseccao("u925", "v925", "u500", "v500");
  if (hCis?.length) {
    out.push({
      id: "cisalhamento", rotulo: "Cisalhamento do vento 925–500 hPa", grupo: "Derivados", un: "km/h", vars: ["u925", "v925", "u500", "v500"], horas: hCis,
      escala: { rampa: "vento", min: 0, max: 100, un: "km/h" },
      calcula: (g, h) => {
        const i = g.u925.passos.indexOf(h), j = g.u500.passos.indexOf(h);
        if (i < 0 || j < 0) return null;
        const o = new Float32Array(g.u925.dados[i].length);
        for (let k = 0; k < o.length; k++) o[k] = Math.hypot(g.u500.dados[j][k] - g.u925.dados[i][k], g.v500.dados[j][k] - g.v925.dados[i][k]) * KMH;
        return { valores: o };
      },
    });
  }
  const hFl = interseccao("q850", "u850", "v850");
  if (hFl?.length) {
    out.push({
      id: "fluxoUmidade850", rotulo: "Fluxo de umidade a 850 hPa (q·vento, com setas)", grupo: "Derivados", un: "g/kg·m/s", vars: ["q850", "u850", "v850"], horas: hFl,
      escala: { rampa: "agua", min: 0, max: 250, un: "g/kg·m/s" },
      calcula: (g, h) => {
        const i = g.q850.passos.indexOf(h), j = g.u850.passos.indexOf(h), k2 = g.v850.passos.indexOf(h);
        if (i < 0 || j < 0 || k2 < 0) return null;
        const q = g.q850.dados[i], u = g.u850.dados[j], v = g.v850.dados[k2];
        const o = new Float32Array(q.length), fu = new Float32Array(q.length), fv = new Float32Array(q.length);
        for (let k = 0; k < o.length; k++) {
          fu[k] = q[k] * u[k];
          fv[k] = q[k] * v[k];
          o[k] = Math.hypot(fu[k], fv[k]);
        }
        return { valores: o, setas: { u: fu, v: fv } };
      },
    });
  }
  const hCalor = interseccao("t2m", "rh2m");
  if (hCalor?.length) {
    out.push({
      id: "calor", rotulo: "Índice de calor (T e UR a 2 m)", grupo: "Derivados", un: "°C", vars: ["t2m", "rh2m"], horas: hCalor,
      escala: { rampa: "temp", min: 24, max: 50, un: "°C" },
      calcula: (g, h) => {
        const i = g.t2m.passos.indexOf(h), j = g.rh2m.passos.indexOf(h);
        if (i < 0 || j < 0) return null;
        const o = new Float32Array(g.t2m.dados[i].length);
        for (let k = 0; k < o.length; k++) o[k] = indiceCalor(g.t2m.dados[i][k], g.rh2m.dados[j][k]);
        return { valores: o };
      },
    });
  }
  const t2 = tem("t2m");
  if (t2) {
    for (const modo of ["max", "min"] as const) {
      out.push({
        id: `t${modo}24`, rotulo: `Temperatura ${modo === "max" ? "máxima" : "mínima"} nas últimas 24 h (passos do modelo)`, grupo: "Derivados", un: "°C", vars: ["t2m"], horas: t2.passos.filter((h) => h > 0),
        escala: { rampa: "temp", min: 5, max: 38, un: "°C" },
        calcula: (g, h) => {
          const gt = g.t2m;
          const idx = gt.passos.map((p, i) => [p, i] as const).filter(([p]) => p <= h && p > h - 24);
          if (!idx.length) return null;
          const o = new Float32Array(gt.dados[0].length).fill(modo === "max" ? -Infinity : Infinity);
          for (const [, i] of idx) for (let k = 0; k < o.length; k++) o[k] = modo === "max" ? Math.max(o[k], gt.dados[i][k]) : Math.min(o[k], gt.dados[i][k]);
          return { valores: o, nota: h < 24 ? `desde o início da rodada (${h} h)` : undefined };
        },
      });
    }
  }
  return out;
}

export const produtoPadraoGrade = (ps: Produto[]) => (ps.find((p) => p.id === "chuva24") ?? ps.find((p) => p.id === "pchuva24_25") ?? ps[0])?.id ?? "";

/** Hora (h do início da rodada) mais próxima do instante `alvoMs` dentre as do produto. */
export function horaMaisProxima(horas: number[], runMs: number, alvoMs: number): number {
  if (!horas.length) return 0;
  return horas.reduce((m, h) => (Math.abs(runMs + h * HORA - alvoMs) < Math.abs(runMs + m * HORA - alvoMs) ? h : m), horas[0]);
}

// ---------------------------------------------------------------- série em um ponto (meteograma)
export type SeriePonto = { modelo: ModeloGrade; horas: number[]; chuva3h: number[]; chuvaAcum: number[]; temp: number[]; vento: number[]; rajada: number[]; run: string };

/** Meteograma de um ponto: chuva a cada 3 h (mm), temperatura a 2 m (°C), vento a 10 m e rajada (km/h). */
export async function serieNoPonto(modelo: ModeloGrade, lat: number, lon: number): Promise<SeriePonto | null> {
  const meta = await fetchMeta(modelo);
  const pega = (id: string) => (meta.variaveis.some((v) => v.id === id) ? fetchGrade(modelo, id, meta.run).catch(() => null) : Promise.resolve(null));
  const [tp, t2m, u10, v10, gust] = await Promise.all([pega("tp"), pega("t2m"), pega("u10"), pega("v10"), pega("gust")]);
  const ref = tp ?? t2m ?? u10;
  if (!ref || !dentro(ref, lat, lon)) return null;
  const horas = ref.passos;
  const val = (g: Grade | null, h: number) => {
    if (!g) return NaN;
    const i = idxHora(g, h);
    return i < 0 ? NaN : amostrar(g.dados[i], g, lat, lon);
  };
  const chuva3h = horas.map((h, k) => {
    if (!tp || k === 0) return 0;
    const ant = horas[k - 1];
    const a = val(tp, h), b = val(tp, ant);
    // o passo muda de 3 h para 6 h depois de 120/144 h: devolve mm por hora para comparar na mesma escala
    return a === a && b === b ? (Math.max(0, a - b) * 3) / (h - ant) : NaN;
  });
  const temp = horas.map((h) => val(t2m, h));
  const vento = horas.map((h) => {
    const u = val(u10, h), v = val(v10, h);
    return u === u && v === v ? Math.hypot(u, v) * KMH : NaN;
  });
  const rajada = horas.map((h) => val(gust, h) * KMH);
  const chuvaAcum = horas.map((h) => val(tp, h));
  return { modelo, run: meta.run, horas, chuva3h, chuvaAcum, temp, vento, rajada };
}

// ---------------------------------------------------------------- faixa de incerteza (conjuntos) num ponto
export type BandaPonto = {
  modelo: ModeloGrade;
  run: string;
  horas: number[];
  chuvaP50: number[]; // acumulada desde o início (mm)
  chuvaP90: number[];
  chuvaMedia: number[];
  tempP10: number[];
  tempP50: number[];
  tempP90: number[];
};

export async function bandaNoPonto(modelo: ModeloGrade, lat: number, lon: number): Promise<BandaPonto | null> {
  const meta = await fetchMeta(modelo);
  const ids = ["tp_p50", "tp_p90", "tp_media", "t2m_p10", "t2m_p50", "t2m_p90"];
  const gr = await Promise.all(ids.map((id) => (meta.variaveis.some((v) => v.id === id) ? fetchGrade(modelo, id, meta.run).catch(() => null) : Promise.resolve(null))));
  const ref = gr.find((g) => g);
  if (!ref || !dentro(ref, lat, lon)) return null;
  const horas = meta.passos;
  const serie = (g: Grade | null) => horas.map((h) => (g && g.passos.includes(h) ? amostrar(g.dados[g.passos.indexOf(h)], g, lat, lon) : NaN));
  return { modelo, run: meta.run, horas, chuvaP50: serie(gr[0]), chuvaP90: serie(gr[1]), chuvaMedia: serie(gr[2]), tempP10: serie(gr[3]), tempP50: serie(gr[4]), tempP90: serie(gr[5]) };
}
