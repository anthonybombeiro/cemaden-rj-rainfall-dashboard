/** Verificação Previsto × Observado (04/11/2026). Rotas `/api/verificacao/`; regras em backend/core/verificacao.py e docs/verificacao.md. */
import { getJson } from "@/lib/api";

export type Indices = {
  a: number; b: number; c: number; d: number; n: number;
  acuracia: number | null; threat_score: number | null; bias: number | null; far: number | null; pod: number | null;
  razao_possibilidades: number | null; razao_acertos_erros: number | null;
};
export type CelulaDia = {
  chuva_prev: boolean | null; chuva_obs: boolean | null; cat: "a" | "b" | "c" | "d" | null;
  chuva_max_24h: number | null; chuva_max_1h: number | null; chuva_estacao: string;
  tmax_prev: number | null; tmax_obs: number | null; tmin_prev: number | null; tmin_obs: number | null;
  tmax_estacao: string; tmin_estacao: string; alertas: string[]; planilha: string[];
};
export type VerificacaoMes = {
  modo: "mes"; inicio: string; fim: string; regioes: string[];
  contingencia: Record<string, Indices>; total: Indices; criterio: { chuva_1h_mm: number; chuva_dia_mm: number };
  dias: { data: string; regioes: Record<string, CelulaDia> }[];
  temperatura_mensal: Record<string, { tmax: number | null; tmax_data: string | null; tmax_estacao: string; tmin: number | null; tmin_data: string | null; tmin_estacao: string }>;
  estacoes_mes: { estacao: string; municipio: string; regiao: string; tmax: number | null; tmax_data: string | null; tmin: number | null; tmin_data: string | null; dias: number; alertas: number }[];
  alertas: { data: string; regiao: string; texto: string }[];
  dias_sem_dado: Record<"chuva" | "temperatura", { data: string; regioes: string[] }[]>;
};
export type VerificacaoAno = {
  modo: "ano"; inicio: string; fim: string; regioes: string[]; contingencia: Record<string, Indices>; total: Indices; por_mes: ({ mes: number } & Indices)[];
};
export type Diferenca = { data: string; regiao: string; campo: string; planilha: boolean | number; painel: boolean | number };

export const fetchVerificacaoMes = (mes: string) => getJson<VerificacaoMes>(`/verificacao/?mes=${mes}`);
export const fetchVerificacaoAno = (ano: number) => getJson<VerificacaoAno>(`/verificacao/?ano=${ano}`);
export const fetchDiferencas = () => getJson<{ quantidade: number; diferencas: Diferenca[] }>("/verificacao/diferencas/");

export const CAT = {
  a: { rotulo: "Acerto (previu e choveu)", cor: "#86efac" },
  b: { rotulo: "Falso alarme (previu, não choveu)", cor: "#fcd34d" },
  c: { rotulo: "Omissão (não previu, choveu)", cor: "#fca5a5" },
  d: { rotulo: "Acerto negativo (sem chuva)", cor: "#dbeafe" },
} as const;

export const fmt = (v: number | null | undefined, nd = 3) => (v === null || v === undefined ? "—" : v.toFixed(nd).replace(".", ","));
export const fmtTemp = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toFixed(1).replace(".", ","));
export const dm = (iso: string | null) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");

/** Mesmo critério do Resumo 24 h: diferença até 2 °C confere, até 4 °C pede atenção. */
export function classeTemp(obs: number | null, prev: number | null): "ok" | "atencao" | "diverge" | null {
  if (obs === null || prev === null) return null;
  const d = Math.abs(obs - prev);
  return d <= 2 ? "ok" : d <= 4 ? "atencao" : "diverge";
}
export const COR_TEMP = { ok: "#bbf7d0", atencao: "#fde68a", diverge: "#fecaca" } as const;

export const NOMES_CAMPO: Record<string, string> = { chuva_prev: "Chuva prevista", chuva_obs: "Chuva observada", tmax_obs: "Tmax observada", tmin_obs: "Tmin observada" };
