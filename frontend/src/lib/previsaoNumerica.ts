/** "Previsão numérica" unificada: modelos da Marinha, do INMET (COSMO) e do CPTEC organizados por tema e alinhados pelo
 * horário de validade. Levantamentos em docs/produtos-marinha.md, produtos-inmet.md e produtos-cptec.md.
 * Pedido do usuário, 19/10/2026. */
import {
  AREAS_CPTEC,
  AREAS_MARINHA_ATM,
  AREAS_MARINHA_OCEANO,
  AREAS_MARINHA_ONDAS,
  AREAS_WWATCH,
  Opcao,
  PRODUTOS_CPTEC_MONAN,
  PRODUTOS_CPTEC_OUTROS,
  PRODUTOS_MARINHA_ATM,
  PRODUTOS_MARINHA_OCEANO,
  PRODUTOS_MARINHA_ONDAS,
  PRODUTOS_WWATCH,
  ProdutoCat,
} from "@/lib/catalogoModelos";
import { MARINHA_FILES } from "@/lib/produtosMarinha";

export type FonteId = "ifs" | "ifs01" | "aifs" | "ifsens" | "gefs" | "gfs" | "monan" | "wrf" | "brams" | "bam" | "wwatch" | "marinha" | "marinha-ondas" | "marinha-oceano" | "cosmo2p8" | "cosmo7";
export type Fonte = { id: FonteId; rotulo: string; grupo: "CPTEC" | "Marinha" | "INMET" | "ECMWF" | "NOAA" };

/** Ordem = prioridade ao escolher as fontes padrão dos quadros. */
export const FONTES: Fonte[] = [
  // modelos globais em grade (mapa interativo; dados do GitHub Actions — scripts/modelos/gerar_grades.py)
  { id: "ifs", rotulo: "IFS 0,25° (interativo)", grupo: "ECMWF" },
  { id: "ifs01", rotulo: "IFS 0,1° RJ (interativo)", grupo: "ECMWF" },
  { id: "aifs", rotulo: "AIFS 0,25° IA (interativo)", grupo: "ECMWF" },
  { id: "ifsens", rotulo: "IFS ENS probabilidades (interativo)", grupo: "ECMWF" },
  { id: "gfs", rotulo: "GFS 0,25° (interativo)", grupo: "NOAA" },
  { id: "gefs", rotulo: "GEFS probabilidades (interativo)", grupo: "NOAA" },
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

// ---------------------------------------------------------------- catálogo nativo por fonte
/** Produtos de cada fonte (o INMET lista os seus pela API, ao escolher a área) e áreas de cada produto, exatamente como o
 * serviço de origem os oferece. */
export function produtosDaFonte(f: FonteId): ProdutoCat[] | null {
  switch (f) {
    case "monan":
      return PRODUTOS_CPTEC_MONAN;
    case "wrf":
    case "brams":
    case "bam":
      return PRODUTOS_CPTEC_OUTROS;
    case "wwatch":
      return PRODUTOS_WWATCH;
    case "marinha":
      return PRODUTOS_MARINHA_ATM;
    case "marinha-ondas":
      return PRODUTOS_MARINHA_ONDAS;
    case "marinha-oceano":
      return PRODUTOS_MARINHA_OCEANO;
    default:
      return null;
  }
}
export function areasDaFonte(f: FonteId, produto: ProdutoCat | undefined): Opcao[] {
  switch (f) {
    case "monan":
    case "wrf":
    case "brams":
    case "bam": {
      const ids = produto?.areas.length ? produto.areas : AREAS_CPTEC.map((a) => a.id);
      return AREAS_CPTEC.filter((a) => ids.includes(a.id));
    }
    case "wwatch": {
      const ids = produto?.areas.length ? produto.areas : AREAS_WWATCH.map((a) => a.id);
      return AREAS_WWATCH.filter((a) => ids.includes(a.id));
    }
    case "marinha":
      return AREAS_MARINHA_ATM;
    case "marinha-ondas":
      return AREAS_MARINHA_ONDAS;
    case "marinha-oceano":
      return AREAS_MARINHA_OCEANO;
    default:
      return [];
  }
}
const AREA_PREFERIDA: Record<string, string> = { sud: "sud", marinha: "sse", "marinha-ondas": "sse", "marinha-oceano": "SUDESTE" };
export function areaPadrao(f: FonteId, areas: Opcao[]): string {
  const pref = f === "marinha" || f === "marinha-ondas" || f === "marinha-oceano" ? AREA_PREFERIDA[f] : AREA_PREFERIDA.sud;
  return areas.find((a) => a.id === pref)?.id ?? areas[0]?.id ?? "";
}
const PRODUTO_PREFERIDO = ["vento_10m", "vent10m", "alt_onda", "ondas", "ssh"];
export function produtoPadrao(lista: ProdutoCat[]): string {
  return PRODUTO_PREFERIDO.map((p) => lista.find((x) => x.id === p)).find(Boolean)?.id ?? lista[0]?.id ?? "";
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
