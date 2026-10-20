/** Catálogo NATIVO de produtos e áreas de cada fonte (para a "Previsão numérica"): cada quadro escolhe fonte, produto e área
 * exatamente como o serviço de origem os oferece. CPTEC: lido do catálogo do site previsaonumerica.cptec.inpe.br (19/10/2026);
 * Marinha: páginas do CHM; INMET: API do VIME (produtos carregados ao escolher a área). */
export type Opcao = { id: string; rotulo: string };
export type ProdutoCat = { id: string; rotulo: string; areas: string[] };

export const AREAS_CPTEC: Opcao[] = [
  { id: "sud", rotulo: "Sudeste" },
  { id: "sul", rotulo: "Sul" },
  { id: "coe", rotulo: "Centro-Oeste" },
  { id: "nde", rotulo: "Nordeste" },
  { id: "nte", rotulo: "Norte" },
  { id: "bra", rotulo: "Brasil" },
  { id: "ams", rotulo: "América do Sul" },
  { id: "glo", rotulo: "Global" },
];
export const AREAS_WWATCH: Opcao[] = [
  { id: "sud", rotulo: "Sudeste" },
  { id: "sul", rotulo: "Sul" },
  { id: "nde", rotulo: "Nordeste" },
  { id: "nte", rotulo: "Norte" },
  { id: "bra", rotulo: "Brasil" },
  { id: "atl", rotulo: "Atlântico" },
  { id: "pac", rotulo: "Pacífico" },
  { id: "ind", rotulo: "Índico" },
  { id: "glo", rotulo: "Global" },
];

/** Produtos atmosféricos do CPTEC (MONAN; WRF, BRAMS e BAM não têm "vento em 500 hPa"). */
export const PRODUTOS_CPTEC_MONAN: ProdutoCat[] = [
  { id: "aprec", rotulo: "Água Precipitável", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "ageop_250", rotulo: "Altura Geopotencial — Nível de 250hPa", areas: ["glo","ams","bra"] },
  { id: "ageop_500", rotulo: "Altura Geopotencial — Nível de 500hPa", areas: ["glo","ams","bra"] },
  { id: "ageop_700", rotulo: "Altura Geopotencial — Nível de 700hPa", areas: ["glo","ams","bra"] },
  { id: "ageop_850", rotulo: "Altura Geopotencial — Nível de 850hPa", areas: ["glo","ams","bra"] },
  { id: "ageop_925", rotulo: "Altura Geopotencial — Nível de 925hPa", areas: ["glo","ams","bra"] },
  { id: "cis_vento_1000", rotulo: "Cisalhamento do Vento — 1000 metros", areas: ["glo","ams","bra"] },
  { id: "cis_vento_2000", rotulo: "Cisalhamento do Vento — 2000 metros", areas: ["glo","ams","bra"] },
  { id: "cis_vento_3000", rotulo: "Cisalhamento do Vento — 3000 metros", areas: ["glo","ams","bra"] },
  { id: "lapserate", rotulo: "Lapserate", areas: ["glo","ams","bra"] },
  { id: "prec_acum", rotulo: "Precipitação — Precipitação acumulada", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "prec_3h", rotulo: "Precipitação — Precipitação acumulada em 3h", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "prec", rotulo: "Precipitação — Precipitação acumulada em 24h", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "prec_pnmm", rotulo: "Precipitação, pressão e espessura", areas: ["glo","ams","bra"] },
  { id: "pnmm_vento", rotulo: "Pressão", areas: ["glo","ams"] },
  { id: "tmin_2m", rotulo: "Temperatura — Temperatura mínima em 2m", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "tmax_2m", rotulo: "Temperatura — Temperatura máxima em 2m", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "t_2m", rotulo: "Temperatura — Temperatura em 2m", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "urmin_2m", rotulo: "Umidade Relativa mínima em 2m", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "vento_10m", rotulo: "Vento em níveis — Vento em 10m", areas: ["glo","ams","bra","sul","sud","coe","nde","nte"] },
  { id: "vento_250", rotulo: "Vento em níveis — Nível de 250hPa", areas: ["glo","ams","bra"] },
  { id: "vento_500", rotulo: "Vento em níveis — Nível de 500hPa", areas: ["glo","ams","bra"] },
  { id: "vento_700", rotulo: "Vento em níveis — Nível de 700hPa", areas: ["glo","ams","bra"] },
  { id: "vento_850", rotulo: "Vento em níveis — Nível de 850hPa", areas: ["glo","ams","bra"] },
  { id: "vento_925", rotulo: "Vento em níveis — Nível de 925hPa", areas: ["glo","ams","bra"] },
  { id: "vort_250", rotulo: "Vorticidade — Nível de 250hPa", areas: ["glo","ams","bra"] },
  { id: "vort_500", rotulo: "Vorticidade — Nível de 500hPa", areas: ["glo","ams","bra"] },
  { id: "vort_700", rotulo: "Vorticidade — Nível de 700hPa", areas: ["glo","ams","bra"] },
  { id: "vort_850", rotulo: "Vorticidade — Nível de 850hPa", areas: ["glo","ams","bra"] },
  { id: "vort_925", rotulo: "Vorticidade — Nível de 925hPa", areas: ["glo","ams","bra"] },
];
export const PRODUTOS_CPTEC_OUTROS: ProdutoCat[] = PRODUTOS_CPTEC_MONAN.filter((p) => p.id !== "vento_500");
export const PRODUTOS_WWATCH: ProdutoCat[] = [
  { id: "alt_onda", rotulo: "Altura e direção das ondas", areas: ["bra","sul","sud","nde","nte","glo","atl","pac","ind"] },
  { id: "per_medio", rotulo: "Período e direção média das ondas", areas: ["bra","sul","sud","nde","nte","glo","atl","pac","ind"] },
  { id: "per_pico", rotulo: "Período e direção de pico das ondas", areas: ["bra","sul","sud","nde","nte","glo","atl","pac","ind"] },
  { id: "vento", rotulo: "Direção e intensidade do vento", areas: ["bra","sul","sud","nde","nte","glo","atl","pac","ind"] },
  { id: "windsea", rotulo: "Direção e intensidade de Windsea", areas: ["bra","sul","sud","nde","nte","glo","atl","pac","ind"] },
];

/** Marinha — ICON-LAM (atmosférico). */
export const AREAS_MARINHA_ATM: Opcao[] = [
  { id: "sse", rotulo: "Sul-Sudeste" },
  { id: "met", rotulo: "METAREA V" },
  { id: "nne", rotulo: "Nordeste" },
  { id: "cto", rotulo: "Centro-Oeste" },
];
export const PRODUTOS_MARINHA_ATM: ProdutoCat[] = [
  { id: "vent10m", rotulo: "Vento 10 m (nós)", areas: [] },
  { id: "ventmax", rotulo: "Vento máximo 10 m (nós)", areas: [] },
  { id: "precpress", rotulo: "Pressão / precipitação acumulada (3 h)", areas: [] },
  { id: "temp2m", rotulo: "Temperatura do ar a 2 m (°C)", areas: [] },
  { id: "hum2m", rotulo: "Umidade relativa a 2 m (%)", areas: [] },
  { id: "visibilidade", rotulo: "Visibilidade horizontal (m)", areas: [] },
  { id: "nebulos_total", rotulo: "Nebulosidade (%)", areas: [] },
  { id: "espvor", rotulo: "Pressão / espessura / vorticidade 1000 hPa", areas: [] },
  { id: "vorgeo500", rotulo: "Vorticidade / geopotencial 500 hPa", areas: [] },
  { id: "vertical", rotulo: "Pressão / geopotencial 500 hPa / jato", areas: [] },
  { id: "jato250", rotulo: "Corrente de jato a 250 hPa", areas: [] },
];
/** Marinha — ondas. */
export const AREAS_MARINHA_ONDAS: Opcao[] = [
  { id: "sse", rotulo: "Sul-Sudeste" },
  { id: "met", rotulo: "METAREA V" },
  { id: "nne", rotulo: "Nordeste" },
  { id: "ant", rotulo: "Antártica" },
  { id: "pen", rotulo: "Península Antártica" },
];
export const PRODUTOS_MARINHA_ONDAS: ProdutoCat[] = [
  { id: "ondas", rotulo: "Altura e direção", areas: [] },
  { id: "periopeak", rotulo: "Período de pico", areas: [] },
];
/** Marinha — oceano (HYCOM). */
export const AREAS_MARINHA_OCEANO: Opcao[] = [
  { id: "SUDESTE", rotulo: "Sudeste" },
  { id: "SUL", rotulo: "Sul" },
  { id: "LESTE", rotulo: "Leste" },
  { id: "NORTE", rotulo: "Norte" },
  { id: "METAREA", rotulo: "METAREA V" },
  { id: "4km", rotulo: "Sul/Sudeste (4 km)" },
];
export const PRODUTOS_MARINHA_OCEANO: ProdutoCat[] = [
  { id: "ssh", rotulo: "Altura da superfície do mar", areas: [] },
  { id: "t0", rotulo: "Temperatura à superfície", areas: [] },
  { id: "t50", rotulo: "Temperatura a 50 m", areas: [] },
  { id: "t250", rotulo: "Temperatura a 250 m", areas: [] },
  { id: "c0", rotulo: "Corrente à superfície", areas: [] },
  { id: "c50", rotulo: "Corrente a 50 m", areas: [] },
  { id: "c250", rotulo: "Corrente a 250 m", areas: [] },
];
