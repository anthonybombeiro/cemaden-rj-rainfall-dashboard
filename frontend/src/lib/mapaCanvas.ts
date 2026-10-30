// Desenho em canvas do estado do RJ (recorte do radar e mapa do informativo): carrega os GeoJSON públicos e projeta lon/lat → pixels.
import { BBox, computeBBox, GeoJsonFeature, GeoJsonFeatureCollection } from "@/lib/geo";

export type GeoRj = { municipios: GeoJsonFeatureCollection; redecs: GeoJsonFeatureCollection; bbox: BBox };

let cache: Promise<GeoRj> | null = null;
export function carregarGeoRj(): Promise<GeoRj> {
  cache ??= Promise.all([fetch("/rj_municipios.geojson").then((r) => r.json()), fetch("/redecs.geojson").then((r) => r.json())]).then(([municipios, redecs]) => ({ municipios, redecs, bbox: computeBBox(municipios) }));
  cache.catch(() => { cache = null; });
  return cache;
}

/** Projeção equirretangular com a correção de cos(latitude) (o estado cabe em poucos graus). Devolve também o tamanho do mapa em pixels. */
export function projecao(bbox: BBox, larguraPx: number, margem = 0) {
  const latMedia = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const dx = (bbox.maxLon - bbox.minLon) * Math.cos(latMedia);
  const dy = bbox.maxLat - bbox.minLat;
  const k = (larguraPx - 2 * margem) / dx;
  return {
    largura: larguraPx,
    altura: Math.round(dy * k + 2 * margem),
    k,
    xy: (lon: number, lat: number): [number, number] => [margem + (lon - bbox.minLon) * Math.cos(latMedia) * k, margem + (bbox.maxLat - lat) * k],
  };
}

type Proj = ReturnType<typeof projecao>;

/** Monta o caminho (Path2D) de uma feição (Polygon ou MultiPolygon). */
export function caminho(f: GeoJsonFeature, p: Proj): Path2D {
  const path = new Path2D();
  const aneis = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
  for (const poligono of aneis) {
    for (const anel of poligono) {
      anel.forEach(([lon, lat], i) => { const [x, y] = p.xy(lon, lat); if (i === 0) path.moveTo(x, y); else path.lineTo(x, y); });
      path.closePath();
    }
  }
  return path;
}

/** Centro aproximado (média dos vértices do maior anel) em lon/lat. */
export function centroide(f: GeoJsonFeature): [number, number] {
  const poligonos = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
  const maior = poligonos.map((p) => p[0]).sort((a, b) => b.length - a.length)[0];
  const n = maior.length;
  return [maior.reduce((s, c) => s + c[0], 0) / n, maior.reduce((s, c) => s + c[1], 0) / n];
}

/** Mercator (usada para localizar a latitude dentro do PNG do radar, que o Leaflet estica sobre os limites no plano projetado). */
export const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** "21h20" a partir de um instante, no fuso de Brasília. */
export function horaLocal(d: Date): string {
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return `${p.find((x) => x.type === "hour")?.value}h${p.find((x) => x.type === "minute")?.value}`;
}
