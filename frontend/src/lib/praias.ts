/** Praias nomeadas do Estado do RJ (OpenStreetMap, © colaboradores do OpenStreetMap, ODbL) — arquivo gerado por
 * backend/scripts/gerar_praias_rj.py. Cada praia usa a maré do porto da tábua da Marinha mais próximo e o clima/mar do
 * próprio ponto. */
import { PortoMare } from "@/lib/produtosMarinha";

export type Praia = { n: string; m: string; lat: number; lon: number };

let cache: Promise<Praia[]> | null = null;
export function fetchPraias(): Promise<Praia[]> {
  cache ??= fetch("/praias-rj.json").then((r) => {
    if (!r.ok) throw new Error(`praias-rj.json ${r.status}`);
    return r.json() as Promise<Praia[]>;
  });
  return cache;
}

export function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Porto da tábua mais próximo da praia (com a distância em km). */
export function portoMaisProximo(praia: Praia, portos: PortoMare[]): { porto: PortoMare; km: number } | null {
  let melhor: { porto: PortoMare; km: number } | null = null;
  for (const p of portos) {
    if (p.latitude == null || p.longitude == null) continue;
    const km = distKm(praia.lat, praia.lon, p.latitude, p.longitude);
    if (!melhor || km < melhor.km) melhor = { porto: p, km };
  }
  return melhor;
}

export const normaliza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
