/** Previsão subsazonal e sazonal do CPTEC/INPE (modelo BAM-1.2): figuras públicas em s0.cptec.inpe.br.
 * Nomes verificados em 19/10/2026 (ver docs/produtos-cptec.md seções 3 e 8). */
export type Opcao = { id: string; rotulo: string };

export const REGIOES_CLIMA: Opcao[] = [
  { id: "as", rotulo: "América do Sul" },
  { id: "tr", rotulo: "Região Tropical" },
  { id: "se", rotulo: "Hemisfério Sul" },
  { id: "am", rotulo: "Amazônia" },
  { id: "gl", rotulo: "Global" },
  { id: "pa", rotulo: "Oceano Pacífico" },
];

export type Variavel = { id: string; rotulo: string; figuras: Opcao[] };
const ANOMALIA: Opcao[] = [{ id: "anomaly", rotulo: "Anomalia" }];
const CALIBRADA: Opcao[] = [
  { id: "anomaly", rotulo: "Anomalia" },
  { id: "probability_positive", rotulo: "Probabilidade de anomalia positiva" },
  { id: "probability_tercile", rotulo: "Probabilidade do tercil mais provável" },
];
export const VARIAVEIS_CLIMA: Variavel[] = [
  { id: "prec", rotulo: "Precipitação", figuras: ANOMALIA },
  { id: "prec_ca", rotulo: "Precipitação calibrada", figuras: CALIBRADA },
  { id: "t2mt", rotulo: "Temperatura a 2 m", figuras: ANOMALIA },
  { id: "t2mt_ca", rotulo: "Temperatura a 2 m calibrada", figuras: CALIBRADA },
  { id: "psnm", rotulo: "Pressão ao nível do mar", figuras: [{ id: "anomaly", rotulo: "Anomalia" }] },
  { id: "role", rotulo: "Radiação de onda longa (OLR)", figuras: ANOMALIA },
  { id: "tp85", rotulo: "Temperatura a 850 hPa", figuras: ANOMALIA },
];

export type ProdutoSub = { id: string; rotulo: string; quadros: number };
export const PRODUTOS_SUBSAZONAL: ProdutoSub[] = [
  { id: "week", rotulo: "Semanas (7 dias)", quadros: 4 },
  { id: "fort", rotulo: "14 dias", quadros: 2 },
  { id: "3wks", rotulo: "21 dias", quadros: 1 },
  { id: "mnth", rotulo: "30 dias", quadros: 1 },
];
export const PRODUTOS_SAZONAL: ProdutoSub[] = [
  { id: "mnth", rotulo: "Mensal (4 meses)", quadros: 4 },
  { id: "seas", rotulo: "Trimestral (2 trimestres)", quadros: 2 },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** Inicializações do subsazonal: domingos e quartas (as 8 mais recentes, da mais nova para a mais antiga). */
export function datasSubsazonal(hoje = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < 28 && out.length < 8; i++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - i));
    if (d.getUTCDay() === 0 || d.getUTCDay() === 3) out.push(`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`);
  }
  return out;
}

export function urlSubsazonal(dataIni: string, variavel: string, figura: string, produto: string, n: number, regiao: string): string {
  return `https://s0.cptec.inpe.br/subsaz/figures_web/${dataIni.slice(0, 4)}/${dataIni.slice(4, 6)}/${dataIni.slice(6, 8)}/bam12_${variavel}_${figura}_${dataIni}00_${produto}${pad(n)}_${regiao}.png`;
}

/** Meses de emissão do sazonal (os 6 mais recentes), AAAAMM. */
export function mesesSazonal(hoje = new Date()): string[] {
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`;
  });
}

export function urlSazonal(mesIni: string, variavel: string, figura: string, produto: string, n: number, regiao: string): string {
  return `https://s0.cptec.inpe.br/clima/modelos/BAM-1.2_products/figures/${mesIni.slice(0, 4)}/${mesIni.slice(4, 6)}/01/bam12_${variavel}_${figura}_${mesIni}0100_${produto}${pad(n)}_${regiao}.png`;
}

const TRIMESTRES = ["JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ", "DJF"];
/** Notas técnicas trimestrais (PDF) do CPTEC: trimestre que começa no mês atual e nos 2 anteriores. */
export function notasTecnicas(hoje = new Date()): { rotulo: string; url: string }[] {
  return [0, 1, 2].map((i) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    const ano = d.getUTCFullYear();
    const cod = TRIMESTRES[d.getUTCMonth()];
    return { rotulo: `${cod}/${ano}`, url: `https://ftp.cptec.inpe.br/clima/nota_tecnica/${ano}/Nota_Tecnica_${cod}${ano}.pdf` };
  });
}
