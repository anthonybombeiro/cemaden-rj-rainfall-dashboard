/** Escalas de cor dos modos do mapa de temperatura e umidade (16/10/2026). Não havia escala prévia no painel
 * (as tabelas mostram só números), então estas são novas e únicas: o mesmo `corDaFaixa` serve ao mapa e à legenda. */

export type FaixaCor = { min: number; bg: string; text: string; rotulo: string };

/** Temperatura em °C (atual, máxima e mínima): do azul (frio) ao vinho (muito quente). Ordem decrescente de `min`. */
export const FAIXAS_TEMP: FaixaCor[] = [
  { min: 40, bg: "#7f1d1d", text: "#ffffff", rotulo: "≥ 40 °C" },
  { min: 35, bg: "#dc2626", text: "#ffffff", rotulo: "35 – 40 °C" },
  { min: 30, bg: "#fb923c", text: "#1f2937", rotulo: "30 – 35 °C" },
  { min: 25, bg: "#facc15", text: "#1f2937", rotulo: "25 – 30 °C" },
  { min: 20, bg: "#4ade80", text: "#14532d", rotulo: "20 – 25 °C" },
  { min: 15, bg: "#22d3ee", text: "#164e63", rotulo: "15 – 20 °C" },
  { min: 10, bg: "#3b82f6", text: "#ffffff", rotulo: "10 – 15 °C" },
  { min: -Infinity, bg: "#1d4ed8", text: "#ffffff", rotulo: "< 10 °C" },
];

/** Umidade relativa em % (máxima e mínima das últimas 24 h e atual): do marrom (seco) ao azul (úmido). */
export const FAIXAS_UMID: FaixaCor[] = [
  { min: 90, bg: "#1d4ed8", text: "#ffffff", rotulo: "≥ 90 %" },
  { min: 75, bg: "#38bdf8", text: "#0c4a6e", rotulo: "75 – 90 %" },
  { min: 60, bg: "#86efac", text: "#14532d", rotulo: "60 – 75 %" },
  { min: 45, bg: "#fde68a", text: "#713f12", rotulo: "45 – 60 %" },
  { min: 30, bg: "#f59e0b", text: "#1f2937", rotulo: "30 – 45 %" },
  { min: -Infinity, bg: "#92400e", text: "#ffffff", rotulo: "< 30 %" },
];

export function corDaFaixa(faixas: FaixaCor[], valor: number): FaixaCor {
  return faixas.find((f) => valor >= f.min) ?? faixas[faixas.length - 1];
}

/** Leitura de temperatura/umidade com mais de 3 h é tratada como atrasada (mesmo corte da rajada de vento). */
export const HORAS_ATRASO_CLIMA = 3;
