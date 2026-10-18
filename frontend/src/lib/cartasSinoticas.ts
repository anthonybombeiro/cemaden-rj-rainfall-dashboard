/** Cartas sinóticas da Marinha (SMM/CHM) via IDEM-DHN — GeoServer WMS público, com CORS liberado.
 * O site do CHM (Cloudflare) bloqueia as imagens; este serviço guarda as cartas dos últimos ~7 dias como camadas
 * `carta_sinotica:CAAMMDDHH_geo` (HH = 00 ou 12 UTC). Pedido do usuário, 18/10/2026. */
export const CARTAS_WMS_URL = "https://idem.marinha.mil.br/geoserver/ows";
const CARTAS_CAPS_URL = "https://idem.marinha.mil.br/geoserver/carta_sinotica/ows?service=WMS&version=1.1.1&request=GetCapabilities";

export type Carta = {
  /** Nome da camada, ex.: carta_sinotica:C26101800_geo */
  camada: string;
  /** ISO UTC da validade da carta. */
  validade: string;
  /** Texto para o seletor, ex.: "18/10/2026 00Z". */
  rotulo: string;
};

function cartaDeCodigo(codigo: string): Carta | null {
  const m = /^C(\d{2})(\d{2})(\d{2})(\d{2})_geo$/.exec(codigo);
  if (!m) return null;
  const [, aa, mm, dd, hh] = m;
  return {
    camada: `carta_sinotica:${codigo}`,
    validade: `20${aa}-${mm}-${dd}T${hh}:00:00Z`,
    rotulo: `${dd}/${mm}/20${aa} ${hh}Z`,
  };
}

/** Lista as cartas disponíveis (mais recente primeiro). */
export async function fetchCartas(): Promise<Carta[]> {
  const r = await fetch(CARTAS_CAPS_URL);
  if (!r.ok) throw new Error(`IDEM-DHN respondeu ${r.status}`);
  const texto = await r.text();
  const codigos = Array.from(new Set(texto.match(/C\d{8}_geo/g) ?? []));
  const cartas = codigos.map(cartaDeCodigo).filter((c): c is Carta => c !== null);
  cartas.sort((a, b) => b.validade.localeCompare(a.validade));
  return cartas;
}
