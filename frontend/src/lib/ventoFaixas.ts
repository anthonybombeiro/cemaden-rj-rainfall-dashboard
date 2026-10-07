/** Faixas de RAJADA de vento (km/h) e regra de atraso — fonte única, usada pela tabela Ventos
 * (VentosTable.tsx) e pelo mapa (modo "Vento"), extraídas de lá em 08/10/2026 para as duas
 * telas mostrarem exatamente as mesmas cores. */

export type FaixaRajada = { label: string; bg: string; text: string; emoji: string };

export const FAIXAS_RAJADA: { min: number; faixa: FaixaRajada }[] = [
  { min: 76, faixa: { label: "Muito forte", bg: "#c084fc", text: "#3b0764", emoji: "🟣" } },
  { min: 52, faixa: { label: "Forte", bg: "#f87171", text: "#7f1d1d", emoji: "🔴" } },
  { min: 18.6, faixa: { label: "Moderada", bg: "#f0a868", text: "#7c2d12", emoji: "🟠" } },
  { min: 0, faixa: { label: "Fraca", bg: "#dcfce7", text: "#166534", emoji: "🟢" } },
];

// Leitura de vento de horas atrás não pode aparecer colorida como se fosse do momento: o corte é
// 3 h (cobre "2 leituras sem dados" nas fontes de 15 min a 1 h). Mesmo cinza/"Atrasada" das demais tabelas.
export const HORAS_ATRASO_VENTO = 3;
export const FAIXA_ATRASADA: FaixaRajada = { label: "Atrasada", bg: "#BEBEBE", text: "#1f2937", emoji: "⚪" };

export function estaAtrasadoVento(updated: string | null): boolean {
  if (!updated) return true;
  const horas = (Date.now() - new Date(updated).getTime()) / 3_600_000;
  return horas > HORAS_ATRASO_VENTO;
}

export function faixaDaRajada(rajadaKmh: number | null, atrasado: boolean): FaixaRajada | null {
  if (atrasado) return FAIXA_ATRASADA;
  if (rajadaKmh === null) return null;
  return FAIXAS_RAJADA.find((f) => rajadaKmh >= f.min)?.faixa ?? null;
}
