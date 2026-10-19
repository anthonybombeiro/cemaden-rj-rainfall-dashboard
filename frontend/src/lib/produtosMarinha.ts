/** Produtos de previsão do Serviço Meteorológico Marinho (CHM/Marinha do Brasil).
 * Os arquivos são servidos por `assets.marinha.mil.br` (o site `www.marinha.mil.br/chm` fica atrás de Cloudflare e
 * bloqueia o uso direto). Os nomes foram levantados em 18/10/2026 nas páginas do CHM; ver docs/produtos-marinha.md.
 * Pedido do usuário, 18/10/2026. */
export const MARINHA_FILES = "https://assets.marinha.mil.br/chm/sites/www.marinha.mil.br.chm/files";

export type Rodada = "00" | "12";
export const RODADAS: Rodada[] = ["00", "12"];

// ---------------------------------------------------------------- meteogramas
export type PontoMeteograma = { nome: string; arquivo: string; sufixos: [string, string] };
/** Pontos do litoral/estado do RJ. Cada ponto tem 2 gráficos (…1 e …2): o 1 = pressão, temperatura, umidade, vento;
 * o 2 = visibilidade, precipitação, cobertura e base de nuvens. */
export const PONTOS_METEOGRAMA: PontoMeteograma[] = [
  { nome: "Angra dos Reis", arquivo: "Angra_R", sufixos: ["1", "2"] },
  { nome: "Ilha Grande", arquivo: "IlhaGra", sufixos: ["1", "2"] },
  { nome: "Marambaia", arquivo: "Maramba", sufixos: ["1", "2"] },
  { nome: "Baía de Guanabara", arquivo: "BaiaGua", sufixos: ["1", "2"] },
  { nome: "Entrada da Baía de Guanabara", arquivo: "BaiaOut", sufixos: ["1", "2"] },
  { nome: "Charitas (Clube Naval)", arquivo: "ClubeNa", sufixos: ["1", "2"] },
  { nome: "Ilha Rasa", arquivo: "IlhaRas", sufixos: ["1", "2"] },
  { nome: "Cabo Frio", arquivo: "CaboFri", sufixos: ["1", "2"] },
  { nome: "Macaé", arquivo: "Macae_R", sufixos: ["1", "2"] },
  { nome: "Bacia de Campos", arquivo: "BaciaCa", sufixos: ["1", "2"] },
];

export function urlMeteograma(ponto: PontoMeteograma, rodada: Rodada, grafico: 0 | 1): string {
  // Cache-Control de 10 anos no servidor da Marinha + arquivo sobrescrito a cada rodada: `t` muda a cada 3 h.
  const t = Math.floor(Date.now() / (3 * 3600 * 1000));
  return `${MARINHA_FILES}/smm/${rodada}/meteogramas/${ponto.arquivo}${ponto.sufixos[grafico]}.jpg?t=${t}`;
}

// ---------------------------------------------------------------- modelos (atmosférico, ondas, oceanográfico)
export type Opcao = { id: string; rotulo: string };
export type Modelo = {
  id: "atmosferico" | "ondas" | "oceanografico";
  rotulo: string;
  areas: Opcao[];
  produtos: Opcao[];
  /** Horas de previsão de cada quadro. */
  horas: number[];
  /** Monta a URL do quadro. */
  url: (rodada: Rodada, area: string, produto: string, hora: number) => string;
};

const pad = (n: number, t: number) => String(n).padStart(t, "0");
const faixa = (fim: number, passo: number) => Array.from({ length: fim / passo + 1 }, (_, i) => i * passo);

export const MODELO_ATMOSFERICO: Modelo = {
  id: "atmosferico",
  rotulo: "Atmosférico",
  areas: [
    { id: "met", rotulo: "METAREA V" },
    { id: "nne", rotulo: "Nordeste" },
    { id: "cto", rotulo: "Centro-Oeste" },
    { id: "sse", rotulo: "Sul-Sudeste" },
  ],
  produtos: [
    { id: "vent10m", rotulo: "Vento 10 m (nós)" },
    { id: "ventmax", rotulo: "Vento máximo 10 m (nós)" },
    { id: "precpress", rotulo: "Pressão / precipitação acum. (3 h)" },
    { id: "temp2m", rotulo: "Temperatura do ar a 2 m (°C)" },
    { id: "hum2m", rotulo: "Umidade relativa a 2 m (%)" },
    { id: "visibilidade", rotulo: "Visibilidade horizontal (m)" },
    { id: "nebulos_total", rotulo: "Nebulosidade (%)" },
    { id: "espvor", rotulo: "Pressão / espessura / vorticidade 1000 hPa" },
    { id: "vorgeo500", rotulo: "Vorticidade / geopotencial 500 hPa" },
    { id: "vertical", rotulo: "Pressão / geopotencial 500 hPa / jato" },
    { id: "jato250", rotulo: "Corrente de jato a 250 hPa" },
  ],
  horas: faixa(96, 3),
  url: (r, area, prod, h) => `${MARINHA_FILES}/smm/${r}/atmosferico/${area}/${prod}_${pad(h, 3)}.gif`,
};

export const MODELO_ONDAS: Modelo = {
  id: "ondas",
  rotulo: "Ondas",
  areas: [
    { id: "met", rotulo: "METAREA V" },
    { id: "nne", rotulo: "Nordeste" },
    { id: "sse", rotulo: "Sul-Sudeste" },
    { id: "ant", rotulo: "Antártica" },
    { id: "pen", rotulo: "Península Antártica" },
  ],
  produtos: [
    { id: "ondas", rotulo: "Altura e direção" },
    { id: "periopeak", rotulo: "Período de pico" },
  ],
  horas: faixa(96, 3),
  url: (r, area, prod, h) => `${MARINHA_FILES}/smm/${r}/ondas/${area}/${prod}_${pad(h, 3)}.png`,
};

/** Modelo oceanográfico (HYCOM). Pastas e nomes diferem por área: METAREA e 4km usam nomes por extenso; as áreas
 * regionais (Norte=1, Leste=2, Sudeste=3, Sul=4) usam ssh/temp_N/corrente_N_area_K. */
const OCEANO_PRODUTOS: Opcao[] = [
  { id: "ssh", rotulo: "Altura da superfície do mar" },
  { id: "t0", rotulo: "Temperatura à superfície" },
  { id: "t50", rotulo: "Temperatura a 50 m" },
  { id: "t250", rotulo: "Temperatura a 250 m" },
  { id: "c0", rotulo: "Corrente à superfície" },
  { id: "c50", rotulo: "Corrente a 50 m" },
  { id: "c250", rotulo: "Corrente a 250 m" },
];
const NOMES_LONGOS: Record<string, string> = {
  ssh: "SSH_",
  t0: "temperaturaNaSuperficie_",
  t50: "temperatura50metros_",
  t250: "temperatura250metros_",
  c0: "correnteNaSuperficie_",
  c50: "corrente50metros_",
  c250: "corrente250metros_",
};
const NOMES_AREA: Record<string, string> = { ssh: "ssh", t0: "temp_0", t50: "temp_50", t250: "temp_250", c0: "corrente_0", c50: "corrente_50", c250: "corrente_250" };
const AREA_NUM: Record<string, number> = { NORTE: 1, LESTE: 2, SUDESTE: 3, SUL: 4 };

export const MODELO_OCEANOGRAFICO: Modelo = {
  id: "oceanografico",
  rotulo: "Oceano",
  areas: [
    { id: "METAREA", rotulo: "METAREA V" },
    { id: "NORTE", rotulo: "Norte" },
    { id: "LESTE", rotulo: "Leste" },
    { id: "SUDESTE", rotulo: "Sudeste" },
    { id: "SUL", rotulo: "Sul" },
    { id: "4km", rotulo: "Sul/Sudeste (4 km)" },
  ],
  produtos: OCEANO_PRODUTOS,
  horas: faixa(90, 6),
  url: (r, area, prod, h) => {
    const hh = pad(h, 2);
    const base = `${MARINHA_FILES}/smm/${r}/hycom/${area}`;
    if (area === "METAREA" || area === "4km") return `${base}/${NOMES_LONGOS[prod]}${hh}.png`;
    return `${base}/${NOMES_AREA[prod]}_area_${AREA_NUM[area]}_${hh}.png`;
  },
};

export const MODELOS: Modelo[] = [MODELO_ATMOSFERICO, MODELO_ONDAS, MODELO_OCEANOGRAFICO];

// ---------------------------------------------------------------- marés
export type MareHora = [string, number]; // ["HH:MM", altura em m]
export type PortoMare = {
  codigo: number;
  nome: string;
  latitude: string;
  longitude: string;
  nivel_medio: number | null;
  /** AAAA-MM-DD → preamares/baixa-mares do dia (horário local, UTC-3). */
  dias: Record<string, MareHora[]>;
};
export type MaresAno = { ano: number; fonte: string; portos: PortoMare[] };

export async function fetchMares(ano: number): Promise<MaresAno> {
  const r = await fetch(`/mares-${ano}.json`);
  if (!r.ok) throw new Error(`Tábuas de maré de ${ano} indisponíveis (${r.status}).`);
  return r.json();
}
