/** Google Flood Hub (Flood Forecasting API) — tipos, chamadas e estilos (16/10/2026).
 * Dados via nosso backend (`/api/floodhub/`); a chave do Google fica só no servidor. CC BY 4.0: citar o Google. */

import { getJson } from "@/lib/api";

export type SeveridadeFH = "EXTREME" | "SEVERE" | "ABOVE_NORMAL" | "NO_FLOODING" | "UNKNOWN";

export type PrevisaoFH = {
  emitida_em: string;
  faixas: { inicio: string; fim: string; valor: number | null }[];
  pico: number | null;
  pico_em: string | null;
  severidade_prevista: SeveridadeFH | null;
};

export type PostoFH = {
  gauge_id: string;
  fonte: string;
  nome: string;
  rio: string;
  municipio: string;
  latitude: number;
  longitude: number;
  tem_modelo: boolean;
  verificado: boolean;
  unidade: string;
  limiares: { atencao: number | null; perigo: number | null; extremo: number | null };
  severidade: SeveridadeFH | null;
  severidade_rotulo: string | null;
  tendencia: "RISE" | "FALL" | "NO_CHANGE" | null;
  emitido_em: string | null;
  previsao_inicio: string | null;
  previsao_fim: string | null;
  estacao: { id: number; nome: string; distancia_km: number } | null;
  previsao: PrevisaoFH | null;
};

export type FloodHubResposta = {
  atualizado_em: string | null;
  total: number;
  total_nao_verificados: number;
  alertas: PostoFH[];
  postos: PostoFH[];
  atribuicao: string;
};

export type ValidacaoLinha = {
  dia: string;
  gauge_id: string;
  posto: string;
  estacao_id: number;
  estacao: string;
  municipio: string;
  verificado: boolean;
  floodhub: SeveridadeFH | null;
  floodhub_rotulo: string | null;
  nivel_max_cm: number | null;
  classe_cota: string | null;
  resultado: string | null;
};

export async function fetchFloodHub(opcoes: { todos?: boolean; estacao?: number } = {}): Promise<FloodHubResposta> {
  const q = new URLSearchParams();
  if (opcoes.todos) q.set("todos", "1");
  if (opcoes.estacao) q.set("estacao", String(opcoes.estacao));
  const s = q.toString();
  return getJson<FloodHubResposta>(`/floodhub/${s ? `?${s}` : ""}`);
}

export async function fetchFloodHubValidacao(dias = 14): Promise<{ dias: number; estacoes_casadas: number; linhas: ValidacaoLinha[] }> {
  return getJson(`/floodhub/validacao/?dias=${dias}`);
}

export const ESTILO_SEVERIDADE: Record<string, { bg: string; text: string; rotulo: string }> = {
  EXTREME: { bg: "#dc2626", text: "#ffffff", rotulo: "Extremo" },
  SEVERE: { bg: "#f97316", text: "#ffffff", rotulo: "Severo" },
  ABOVE_NORMAL: { bg: "#eab308", text: "#1f2937", rotulo: "Acima do normal" },
  NO_FLOODING: { bg: "#bbf7d0", text: "#166534", rotulo: "Sem cheia" },
  UNKNOWN: { bg: "#e5e7eb", text: "#374151", rotulo: "Desconhecido" },
};

export const ROTULO_TENDENCIA: Record<string, string> = { RISE: "↗ subindo", FALL: "↘ descendo", NO_CHANGE: "→ estável" };

export const ORDEM_SEVERIDADE: Record<string, number> = { UNKNOWN: 0, NO_FLOODING: 1, ABOVE_NORMAL: 2, SEVERE: 3, EXTREME: 4 };

export function severidadeEfetiva(p: PostoFH): SeveridadeFH | null {
  const a = p.severidade ?? "UNKNOWN";
  const b = p.previsao?.severidade_prevista ?? "UNKNOWN";
  return (ORDEM_SEVERIDADE[a] >= ORDEM_SEVERIDADE[b] ? a : b) as SeveridadeFH;
}

export const ATRIBUICAO_FH = "Dados: Google Flood Hub (Flood Forecasting API), licença CC BY 4.0.";
