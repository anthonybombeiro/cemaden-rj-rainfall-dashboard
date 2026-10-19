/** "Previsão numérica" unificada: modelos da Marinha, do INMET (COSMO) e do CPTEC organizados por tema e alinhados pelo
 * horário de validade. Levantamentos em docs/produtos-marinha.md, produtos-inmet.md e produtos-cptec.md.
 * Pedido do usuário, 19/10/2026. */
import { MARINHA_FILES } from "@/lib/produtosMarinha";

export type FonteId = "monan" | "wrf" | "brams" | "bam" | "wwatch" | "marinha" | "marinha-ondas" | "marinha-oceano" | "cosmo2p8" | "cosmo7";
export type Fonte = { id: FonteId; rotulo: string; grupo: "CPTEC" | "Marinha" | "INMET" };

/** Ordem = prioridade ao escolher as fontes padrão dos quadros. */
export const FONTES: Fonte[] = [
  { id: "monan", rotulo: "MONAN 10 km", grupo: "CPTEC" },
  { id: "marinha", rotulo: "ICON-LAM 6,5 km", grupo: "Marinha" },
  { id: "cosmo2p8", rotulo: "COSMO 2,8 km", grupo: "INMET" },
  { id: "cosmo7", rotulo: "COSMO 7 km", grupo: "INMET" },
  { id: "wrf", rotulo: "WRF 7 km", grupo: "CPTEC" },
  { id: "brams", rotulo: "BRAMS 8 km", grupo: "CPTEC" },
  { id: "bam", rotulo: "BAM global", grupo: "CPTEC" },
  { id: "wwatch", rotulo: "Wwatch (ondas)", grupo: "CPTEC" },
  { id: "marinha-ondas", rotulo: "Ondas (Marinha)", grupo: "Marinha" },
  { id: "marinha-oceano", rotulo: "Oceano HYCOM", grupo: "Marinha" },
];
export const fonteDe = (id: FonteId) => FONTES.find((f) => f.id === id) ?? FONTES[0];
export const ehInmet = (id: FonteId) => id === "cosmo2p8" || id === "cosmo7";

export type Variante = { id: string; rotulo: string; produtos: Partial<Record<FonteId, string>> };
export type Tema = { id: string; rotulo: string; variantes: Variante[] };

const CPTEC4 = (p: string): Partial<Record<FonteId, string>> => ({ monan: p, wrf: p, brams: p, bam: p });

export const TEMAS: Tema[] = [
  {
    id: "vento",
    rotulo: "Vento",
    variantes: [
      { id: "v10", rotulo: "Vento a 10 m", produtos: { ...CPTEC4("vento_10m"), marinha: "vent10m", cosmo7: "Vento10m", cosmo2p8: "Vento10m" } },
      { id: "vmax", rotulo: "Rajada / vento máximo a 10 m", produtos: { marinha: "ventmax", cosmo7: "Rajada10m", cosmo2p8: "Rajada10m" } },
    ],
  },
  {
    id: "temperatura",
    rotulo: "Temperatura",
    variantes: [
      { id: "t2", rotulo: "Temperatura a 2 m", produtos: { ...CPTEC4("t_2m"), marinha: "temp2m", cosmo7: "T2mPress", cosmo2p8: "T2m" } },
      { id: "tmax", rotulo: "Temperatura máxima", produtos: { ...CPTEC4("tmax_2m"), cosmo7: "TempMaximaV10m", cosmo2p8: "TempMaxima" } },
      { id: "tmin", rotulo: "Temperatura mínima", produtos: { ...CPTEC4("tmin_2m"), cosmo7: "TempMinimaV10m", cosmo2p8: "TempMinima" } },
    ],
  },
  {
    id: "chuva",
    rotulo: "Chuva",
    variantes: [
      { id: "p3", rotulo: "Precipitação em 3 h", produtos: { monan: "prec_3h", wrf: "prec_3h", brams: "prec_3h", bam: "prec_3h", marinha: "precpress", cosmo7: "Prec3hPressV10m" } },
      { id: "p24", rotulo: "Precipitação em 24 h", produtos: { ...CPTEC4("prec"), cosmo7: "prec24h", cosmo2p8: "prec24h" } },
      { id: "pacum", rotulo: "Precipitação acumulada", produtos: { ...CPTEC4("prec_acum"), cosmo2p8: "prec2dias", cosmo7: "prec7dias" } },
      { id: "p1", rotulo: "Chuva em 1 h (COSMO 2,8 km)", produtos: { cosmo2p8: "prec1h" } },
    ],
  },
  {
    id: "pressao",
    rotulo: "Pressão",
    variantes: [
      { id: "pnmm", rotulo: "Pressão ao nível do mar", produtos: { monan: "pnmm_vento", wrf: "pnmm_vento", brams: "pnmm_vento", bam: "pnmm_vento", cosmo7: "pressaoAnalise", cosmo2p8: "pressaoAnalise" } },
      { id: "ppe", rotulo: "Pressão, precipitação e espessura", produtos: { ...CPTEC4("prec_pnmm"), cosmo7: "Espessura", marinha: "espvor" } },
    ],
  },
  {
    id: "umidade",
    rotulo: "Umidade",
    variantes: [{ id: "ur2", rotulo: "Umidade relativa a 2 m", produtos: { ...CPTEC4("urmin_2m"), marinha: "hum2m", cosmo7: "UR2mV10m", cosmo2p8: "UR2m" } }],
  },
  {
    id: "niveis",
    rotulo: "Altos níveis e jato",
    variantes: [
      { id: "jato", rotulo: "Jato em 250 hPa", produtos: { monan: "vento_250", wrf: "vento_250", brams: "vento_250", bam: "vento_250", marinha: "jato250", cosmo7: "V200j" } },
      { id: "v850", rotulo: "Vento em 850 hPa", produtos: { monan: "vento_850", wrf: "vento_850", brams: "vento_850", bam: "vento_850", cosmo7: "VTUR850", cosmo2p8: "VTUR850" } },
      { id: "z500", rotulo: "Geopotencial em 500 hPa", produtos: { monan: "ageop_500", wrf: "ageop_500", brams: "ageop_500", bam: "ageop_500", cosmo7: "O850Geo500", marinha: "vertical" } },
      { id: "vort500", rotulo: "Vorticidade em 500 hPa", produtos: { monan: "vort_500", wrf: "vort_500", brams: "vort_500", bam: "vort_500", cosmo7: "VortGeo500", marinha: "vorgeo500" } },
      { id: "vort850", rotulo: "Vorticidade em 850 hPa", produtos: { monan: "vort_850", wrf: "vort_850", brams: "vort_850", bam: "vort_850", cosmo7: "VortGeo850" } },
    ],
  },
  {
    id: "vertical",
    rotulo: "Estrutura vertical",
    variantes: [
      { id: "lapse", rotulo: "Lapse rate", produtos: CPTEC4("lapserate") },
      { id: "cis1", rotulo: "Cisalhamento do vento (1000 m)", produtos: CPTEC4("cis_vento_1000") },
      { id: "cis2", rotulo: "Cisalhamento do vento (2000 m)", produtos: CPTEC4("cis_vento_2000") },
      { id: "cis3", rotulo: "Cisalhamento do vento (3000 m)", produtos: CPTEC4("cis_vento_3000") },
      { id: "kcape", rotulo: "Índices K e CAPE", produtos: { cosmo7: "Kcape", cosmo2p8: "Kcape" } },
      { id: "kshow", rotulo: "Índices K e Showalter", produtos: { cosmo7: "Kshow", cosmo2p8: "Kshow" } },
      { id: "totals", rotulo: "Índices Totals e Lifted", produtos: { cosmo7: "TotalsLifted", cosmo2p8: "TotalsLifted" } },
      { id: "aprec", rotulo: "Água precipitável", produtos: { ...CPTEC4("aprec"), cosmo7: "aguaprecT850V850", cosmo2p8: "aguaprecT850V850" } },
    ],
  },
  {
    id: "nuvens",
    rotulo: "Nuvens e visibilidade",
    variantes: [
      { id: "nuvtot", rotulo: "Nebulosidade total", produtos: { marinha: "nebulos_total", cosmo7: "NuvemTotalOmegaGeo700" } },
      { id: "visib", rotulo: "Visibilidade horizontal", produtos: { marinha: "visibilidade" } },
      { id: "nuvbaixa", rotulo: "Nuvem baixa (850 hPa)", produtos: { cosmo7: "NuvemBaixaGeoTemp850" } },
    ],
  },
  {
    id: "ondas",
    rotulo: "Ondas",
    variantes: [
      { id: "hs", rotulo: "Altura e direção das ondas", produtos: { wwatch: "alt_onda", "marinha-ondas": "ondas" } },
      { id: "tp", rotulo: "Período de pico", produtos: { wwatch: "per_pico", "marinha-ondas": "periopeak" } },
      { id: "tm", rotulo: "Período médio", produtos: { wwatch: "per_medio" } },
      { id: "wv", rotulo: "Vento (Wwatch)", produtos: { wwatch: "vento" } },
      { id: "ws", rotulo: "Windsea", produtos: { wwatch: "windsea" } },
    ],
  },
  {
    id: "oceano",
    rotulo: "Oceano",
    variantes: [
      { id: "ssh", rotulo: "Altura da superfície do mar", produtos: { "marinha-oceano": "ssh" } },
      { id: "t0", rotulo: "Temperatura à superfície", produtos: { "marinha-oceano": "t0" } },
      { id: "t50", rotulo: "Temperatura a 50 m", produtos: { "marinha-oceano": "t50" } },
      { id: "t250", rotulo: "Temperatura a 250 m", produtos: { "marinha-oceano": "t250" } },
      { id: "c0", rotulo: "Corrente à superfície", produtos: { "marinha-oceano": "c0" } },
      { id: "c50", rotulo: "Corrente a 50 m", produtos: { "marinha-oceano": "c50" } },
      { id: "c250", rotulo: "Corrente a 250 m", produtos: { "marinha-oceano": "c250" } },
    ],
  },
];

// ---------------------------------------------------------------- regiões
export type RegiaoId = "sud" | "rj" | "sul" | "coe" | "nde" | "nte" | "bra" | "ams";
export const REGIOES: { id: RegiaoId; rotulo: string }[] = [
  { id: "sud", rotulo: "Sudeste" },
  { id: "rj", rotulo: "Rio de Janeiro (zoom COSMO 2,8 km)" },
  { id: "sul", rotulo: "Sul" },
  { id: "coe", rotulo: "Centro-Oeste" },
  { id: "nde", rotulo: "Nordeste" },
  { id: "nte", rotulo: "Norte" },
  { id: "bra", rotulo: "Brasil" },
  { id: "ams", rotulo: "América do Sul" },
];

const TODAS_CPTEC = ["glo", "ams", "bra", "sul", "sud", "coe", "nde", "nte"];
const SO_GLO_AMS_BRA = ["glo", "ams", "bra"];
/** Regiões em que cada produto do CPTEC existe (lido do catálogo do site). */
function regioesProdutoCptec(fonte: FonteId, produto: string): string[] {
  if (fonte === "wwatch") return ["bra", "sul", "sud", "nde", "nte", "glo", "atl", "pac", "ind"];
  if (produto === "pnmm_vento") return ["glo", "ams"];
  const todas = ["aprec", "prec_acum", "prec_3h", "prec", "tmin_2m", "tmax_2m", "t_2m", "urmin_2m", "vento_10m"];
  return todas.includes(produto) ? TODAS_CPTEC : SO_GLO_AMS_BRA;
}

export type AreaEscolhida = { area: string; rotulo: string; aviso?: string };

/** Traduz a região escolhida para a "área" de cada fonte (pode cair numa região maior quando o produto não tem recorte). */
export function areaDaFonte(fonte: FonteId, produto: string, regiao: RegiaoId): AreaEscolhida {
  if (fonte === "monan" || fonte === "wrf" || fonte === "brams" || fonte === "bam" || fonte === "wwatch") {
    const pedido = regiao === "rj" ? "sud" : regiao;
    const disp = regioesProdutoCptec(fonte, produto);
    if (disp.includes(pedido)) return { area: pedido, rotulo: REGIOES.find((r) => r.id === pedido)?.rotulo ?? pedido };
    const alt = ["bra", "ams", "glo"].find((r) => disp.includes(r)) ?? disp[0];
    return { area: alt, rotulo: REGIOES.find((r) => r.id === alt)?.rotulo ?? alt, aviso: "Sem recorte regional neste produto" };
  }
  if (fonte === "marinha" || fonte === "marinha-ondas") {
    const m: Record<RegiaoId, string> = { sud: "sse", rj: "sse", sul: "sse", nde: "nne", nte: "nne", coe: "cto", bra: "met", ams: "met" };
    const nome: Record<string, string> = { sse: "Sul-Sudeste", nne: "Nordeste", cto: "Centro-Oeste", met: "METAREA V" };
    const area = fonte === "marinha-ondas" && m[regiao] === "cto" ? "met" : m[regiao];
    return { area, rotulo: nome[area] };
  }
  if (fonte === "marinha-oceano") {
    const m: Record<RegiaoId, string> = { sud: "SUDESTE", rj: "SUDESTE", sul: "SUL", nde: "LESTE", nte: "NORTE", coe: "METAREA", bra: "METAREA", ams: "METAREA" };
    return { area: m[regiao], rotulo: m[regiao] === "METAREA" ? "METAREA V" : m[regiao][0] + m[regiao].slice(1).toLowerCase() };
  }
  if (fonte === "cosmo2p8") {
    if (regiao === "rj") return { area: "SE-RJ", rotulo: "Rio de Janeiro" };
    const m: Partial<Record<RegiaoId, string>> = { sud: "SE", sul: "S", nde: "NE" };
    const a = m[regiao] ?? "SE";
    return { area: a, rotulo: a === "SE" ? "Sudeste" : a === "S" ? "Sul" : "Nordeste", aviso: m[regiao] ? undefined : "COSMO 2,8 km só cobre S, SE e NE" };
  }
  const m: Record<RegiaoId, string> = { sud: "SE", rj: "SE", sul: "S", coe: "CO", nde: "NE", nte: "N", bra: "BRA", ams: "AS" };
  const nome: Record<string, string> = { SE: "Sudeste", S: "Sul", CO: "Centro-Oeste", NE: "Nordeste", N: "Norte", BRA: "Brasil", AS: "América do Sul" };
  return { area: m[regiao], rotulo: nome[m[regiao]], aviso: regiao === "rj" ? "Sem zoom do RJ no COSMO 7 km" : undefined };
}

// ---------------------------------------------------------------- rodadas
export type Rodada = { id: string; rotulo: string; runMs: number };
const HORA = 3600000;
const pad2 = (n: number) => String(n).padStart(2, "0");
const rotuloRun = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)} ${pad2(d.getUTCHours())}Z`;
};

/** Marinha: as pastas `00` e `12` guardam sempre a última rodada publicada, sem data no nome do arquivo.
 * Medido em 18-19/10/2026: a pasta 00 é atualizada ~19,5 h depois da rodada 00Z e a pasta 12 ~8 h depois da 12Z.
 * A data da rodada é inferida por esse atraso; o usuário pode escolher a rodada anterior no seletor. */
export function rodadasMarinha(agoraMs: number): Rodada[] {
  const lag: Record<string, number> = { "00": 19.5 * HORA, "12": 8 * HORA };
  const out: Rodada[] = [];
  for (const turno of ["00", "12"]) {
    const dia0 = Date.UTC(new Date(agoraMs).getUTCFullYear(), new Date(agoraMs).getUTCMonth(), new Date(agoraMs).getUTCDate());
    let run = dia0 + Number(turno) * HORA;
    while (run + lag[turno] > agoraMs) run -= 24 * HORA;
    out.push({ id: turno, rotulo: `${turno}Z · ${rotuloRun(run)}`, runMs: run });
  }
  return out.sort((a, b) => b.runMs - a.runMs);
}

const MOD_CPTEC: Partial<Record<FonteId, { json: string; modelo: string }>> = {
  monan: { json: "mod_monan.json", modelo: "MONAN" },
  wrf: { json: "mod_wrf.json", modelo: "WRF07" },
  brams: { json: "mod_brams.json", modelo: "BRAMS08" },
  bam: { json: "mod_bam.json", modelo: "Global_BAM" },
  wwatch: { json: "mod_wwatch.json", modelo: "Wwatch" },
};

/** Rodadas do CPTEC (lista pública com CORS), da mais recente para a mais antiga. */
export async function rodadasCptec(fonte: FonteId): Promise<Rodada[]> {
  const cfg = MOD_CPTEC[fonte];
  if (!cfg) return [];
  const r = await fetch(`https://s1.cptec.inpe.br/grafico/Modelos/portal_previsao_numerica/${cfg.json}`);
  if (!r.ok) throw new Error(`CPTEC respondeu ${r.status}`);
  const j = (await r.json()) as { datesRun: string[] };
  return j.datesRun.slice(0, 6).map((s) => {
    const [data, tz] = s.split(" ");
    const turno = tz.replace("z", "");
    const [a, m, d] = data.split("-").map(Number);
    const runMs = Date.UTC(a, m - 1, d, Number(turno));
    return { id: `${data}-${turno}`, rotulo: rotuloRun(runMs), runMs };
  });
}

/** Faixa de validades (ms) e passo (h) de uma fonte de imagens para uma rodada. */
export function faixaFonte(fonte: FonteId, rodada: Rodada): { iniMs: number; fimMs: number; passoH: number } {
  const t = rodada.runMs;
  const turno = new Date(t).getUTCHours();
  switch (fonte) {
    case "monan": // o número do arquivo conta horas desde 00Z do dia da rodada (12Z: 12 a 120)
      return turno === 12 ? { iniMs: t, fimMs: t + 108 * HORA, passoH: 3 } : { iniMs: t, fimMs: t + 168 * HORA, passoH: 3 };
    case "wrf":
    case "brams":
      return { iniMs: t, fimMs: t + 168 * HORA, passoH: 3 };
    case "bam":
      return { iniMs: t, fimMs: t + 240 * HORA, passoH: 6 };
    case "wwatch":
      return { iniMs: t, fimMs: t + 120 * HORA, passoH: 3 };
    case "marinha":
    case "marinha-ondas":
      return { iniMs: t, fimMs: t + 96 * HORA, passoH: 3 };
    case "marinha-oceano":
      return { iniMs: t, fimMs: t + 90 * HORA, passoH: 6 };
    default:
      return { iniMs: t, fimMs: t + 72 * HORA, passoH: 3 };
  }
}

const OCEANO_LONGO: Record<string, string> = { ssh: "SSH_", t0: "temperaturaNaSuperficie_", t50: "temperatura50metros_", t250: "temperatura250metros_", c0: "correnteNaSuperficie_", c50: "corrente50metros_", c250: "corrente250metros_" };
const OCEANO_AREA: Record<string, string> = { ssh: "ssh", t0: "temp_0", t50: "temp_50", t250: "temp_250", c0: "corrente_0", c50: "corrente_50", c250: "corrente_250" };
const OCEANO_NUM: Record<string, number> = { NORTE: 1, LESTE: 2, SUDESTE: 3, SUL: 4 };

/** Endereço da imagem de uma fonte de imagens para a validade `vtMs`; null se a validade não existe nessa rodada. */
export function urlQuadro(fonte: FonteId, produto: string, area: string, rodada: Rodada, vtMs: number): string | null {
  const { iniMs, fimMs, passoH } = faixaFonte(fonte, rodada);
  if (vtMs < iniMs || vtMs > fimMs) return null;
  const h = (vtMs - rodada.runMs) / HORA;
  if (h % passoH !== 0) return null;
  const run = new Date(rodada.runMs);
  const turno = pad2(run.getUTCHours());
  const [a, m, d] = [String(run.getUTCFullYear()), pad2(run.getUTCMonth() + 1), pad2(run.getUTCDate())];
  const cfg = MOD_CPTEC[fonte];
  if (cfg) {
    // CPTEC: sufixo = horas desde 00Z do dia da rodada
    const suf = String(h + Number(turno)).padStart(3, "0");
    return `https://s1.cptec.inpe.br/grafico/Modelos/${cfg.modelo}/pn/${produto}/${a}/${m}/${d}/${turno}/${cfg.modelo}_${produto}_${area}_${a}${m}${d}${turno}z_${suf}z.png`;
  }
  const hhh = String(h).padStart(3, "0");
  // Os arquivos da Marinha vêm com cache de 10 anos (Cache-Control) e a pasta é sobrescrita a cada rodada: o parâmetro `r`
  // (instante da rodada) evita mostrar imagem velha do cache do navegador.
  const v = `?r=${rodada.runMs}`;
  if (fonte === "marinha") return `${MARINHA_FILES}/smm/${turno}/atmosferico/${area}/${produto}_${hhh}.gif${v}`;
  if (fonte === "marinha-ondas") return `${MARINHA_FILES}/smm/${turno}/ondas/${area}/${produto}_${hhh}.png${v}`;
  if (fonte === "marinha-oceano") {
    const hh = String(h).padStart(2, "0");
    const base = `${MARINHA_FILES}/smm/${turno}/hycom/${area}`;
    return area === "METAREA" || area === "4km" ? `${base}/${OCEANO_LONGO[produto]}${hh}.png${v}` : `${base}/${OCEANO_AREA[produto]}_area_${OCEANO_NUM[area]}_${hh}.png${v}`;
  }
  return null;
}

export const PASSO_LINHA_DO_TEMPO_H = 3;
export const rotuloValidade = (ms: number) => {
  const d = new Date(ms);
  const dia = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getUTCDay()];
  return `${dia} ${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)} ${pad2(d.getUTCHours())}Z`;
};
