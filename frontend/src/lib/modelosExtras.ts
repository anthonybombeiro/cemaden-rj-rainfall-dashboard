/** Extras dos modelos em grade: contornos (isolinhas por marching squares) e estatísticas por município (ranking). */
import { amostrar, Geo } from "@/lib/modelosGrade";

// ---------------------------------------------------------------- contornos
export type Segmento = [number, number, number, number]; // lon1, lat1, lon2, lat2
export type NivelContorno = { nivel: number; segs: Segmento[] };

export const CONTORNOS_DEF: { id: string; rotulo: string; intervalo: number; un: string }[] = [
  { id: "msl", rotulo: "Pressão ao nível do mar (a cada 2 hPa)", intervalo: 2, un: "hPa" },
  { id: "gh850", rotulo: "Altura geopotencial 850 hPa (a cada 20 m)", intervalo: 20, un: "m" },
  { id: "gh700", rotulo: "Altura geopotencial 700 hPa (a cada 20 m)", intervalo: 20, un: "m" },
  { id: "gh500", rotulo: "Altura geopotencial 500 hPa (a cada 40 m)", intervalo: 40, un: "m" },
  { id: "gh250", rotulo: "Altura geopotencial 250 hPa (a cada 60 m)", intervalo: 60, un: "m" },
  { id: "t850", rotulo: "Temperatura 850 hPa (a cada 2 °C)", intervalo: 2, un: "°C" },
  { id: "hzerocl", rotulo: "Altura da isoterma de 0 °C (a cada 250 m)", intervalo: 250, un: "m" },
];

// arestas: 0 topo (TL–TR), 1 direita (TR–BR), 2 base (BL–BR), 3 esquerda (TL–BL); índice = TL*8 + TR*4 + BR*2 + BL
const CASOS: number[][][] = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 1], [3, 2]], [[0, 2]], [[0, 3]], [[0, 3]], [[0, 2]], [[0, 3], [1, 2]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];

export function contornos(v: Float32Array, g: Geo, intervalo: number): NivelContorno[] {
  let mn = Infinity, mx = -Infinity;
  for (let k = 0; k < v.length; k++) {
    const x = v[k];
    if (x === x) {
      if (x < mn) mn = x;
      if (x > mx) mx = x;
    }
  }
  if (!(mn < mx)) return [];
  const out: NivelContorno[] = [];
  for (let nivel = Math.ceil(mn / intervalo) * intervalo; nivel <= mx; nivel += intervalo) {
    const segs: Segmento[] = [];
    for (let j = 0; j < g.ny - 1; j++) {
      for (let i = 0; i < g.nx - 1; i++) {
        const tl = v[j * g.nx + i], tr = v[j * g.nx + i + 1], br = v[(j + 1) * g.nx + i + 1], bl = v[(j + 1) * g.nx + i];
        if (!(tl === tl && tr === tr && br === br && bl === bl)) continue;
        const idx = (tl >= nivel ? 8 : 0) | (tr >= nivel ? 4 : 0) | (br >= nivel ? 2 : 0) | (bl >= nivel ? 1 : 0);
        for (const [a, b] of CASOS[idx]) {
          const p = (e: number): [number, number] => {
            const t = (va: number, vb: number) => (nivel - va) / (vb - va);
            if (e === 0) return [i + t(tl, tr), j];
            if (e === 1) return [i + 1, j + t(tr, br)];
            if (e === 2) return [i + t(bl, br), j + 1];
            return [i, j + t(tl, bl)];
          };
          const [x1, y1] = p(a), [x2, y2] = p(b);
          segs.push([g.lon0 + x1 * g.dlon, g.lat0 - y1 * g.dlat, g.lon0 + x2 * g.dlon, g.lat0 - y2 * g.dlat]);
        }
      }
    }
    if (segs.length) out.push({ nivel: Math.round(nivel * 1000) / 1000, segs });
  }
  return out;
}

// ---------------------------------------------------------------- municípios
export type Municipio = { nome: string; pts: [number, number][]; bounds: [[number, number], [number, number]] };
type Anel = [number, number][];
type Feicao = { properties: { nome: string }; geometry: { type: string; coordinates: number[][][] | number[][][][] } };

function dentroDoPoligono(lon: number, lat: number, aneis: Anel[]): boolean {
  let dentro = false; // par-ímpar entre todos os anéis (trata buracos)
  for (const a of aneis) {
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i], [xj, yj] = a[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

/** Pontos de amostragem (a cada `passo` graus) dentro de cada município, para estatísticas do campo. */
export function amostrasMunicipios(fc: { features: Feicao[] }, passo = 0.04): Municipio[] {
  return fc.features.map((f) => {
    const poligonos = (f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][])) as unknown as Anel[][];
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const p of poligonos) for (const a of p) for (const [x, y] of a) {
      if (x < minLon) minLon = x;
      if (x > maxLon) maxLon = x;
      if (y < minLat) minLat = y;
      if (y > maxLat) maxLat = y;
    }
    const pts: [number, number][] = [];
    for (let lat = minLat + passo / 2; lat <= maxLat; lat += passo) {
      for (let lon = minLon + passo / 2; lon <= maxLon; lon += passo) {
        if (poligonos.some((p) => dentroDoPoligono(lon, lat, p))) pts.push([lat, lon]);
      }
    }
    if (!pts.length) pts.push([(minLat + maxLat) / 2, (minLon + maxLon) / 2]);
    return { nome: f.properties.nome, pts, bounds: [[minLat, minLon], [maxLat, maxLon]] };
  });
}

export type LinhaRanking = { nome: string; max: number; media: number; bounds: [[number, number], [number, number]] };

export function rankingMunicipios(munis: Municipio[], valores: Float32Array, g: Geo): LinhaRanking[] {
  const out: LinhaRanking[] = [];
  for (const m of munis) {
    let mx = -Infinity, soma = 0, n = 0;
    for (const [lat, lon] of m.pts) {
      const x = amostrar(valores, g, lat, lon);
      if (x === x) {
        if (x > mx) mx = x;
        soma += x;
        n++;
      }
    }
    if (n) out.push({ nome: m.nome, max: mx, media: soma / n, bounds: m.bounds });
  }
  return out.sort((a, b) => b.max - a.max);
}

let cacheMunicipios: Promise<Municipio[]> | null = null;
export function carregarMunicipios(): Promise<Municipio[]> {
  if (!cacheMunicipios) {
    cacheMunicipios = fetch("/rj_municipios.geojson")
      .then((r) => r.json())
      .then((d) => amostrasMunicipios(d))
      .catch((e) => {
        cacheMunicipios = null;
        throw e;
      });
  }
  return cacheMunicipios;
}
