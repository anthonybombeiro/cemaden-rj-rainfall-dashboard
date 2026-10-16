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

export type ObservadoFH = {
  nivel_cm: number;
  em: string;
  variacao_6h_cm: number | null;
  tendencia: "RISE" | "FALL" | "NO_CHANGE" | null;
  classe_cota: string | null;
  cotas_cm: { atencao: number | null; alerta: number | null; inundacao: number | null; extrema: number | null } | null;
  serie: [string, number][];
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
  /** Nível que NÓS lemos na estação casada (72 h), para postos que o Google não prevê (ANA) e como contraste. */
  observado: ObservadoFH | null;
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
  distancia_km: number;
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
  // Cores originais do Google Flood Hub (amostradas da legenda do site em 16/10/2026): Extremo, Perigo, Aviso, Normal, Sem dados
  EXTREME: { bg: "#9f0203", text: "#ffffff", rotulo: "Extremo" },
  SEVERE: { bg: "#fe320e", text: "#ffffff", rotulo: "Severo" },
  ABOVE_NORMAL: { bg: "#fb9a32", text: "#1f2937", rotulo: "Acima do normal" },
  NO_FLOODING: { bg: "#45a46b", text: "#ffffff", rotulo: "Sem cheia" },
  UNKNOWN: { bg: "#bebebe", text: "#1f2937", rotulo: "Desconhecido" },
};

export const ROTULO_TENDENCIA: Record<string, string> = { RISE: "↗ subindo", FALL: "↘ descendo", NO_CHANGE: "→ estável" };

export const ORDEM_SEVERIDADE: Record<string, number> = { UNKNOWN: 0, NO_FLOODING: 1, ABOVE_NORMAL: 2, SEVERE: 3, EXTREME: 4 };

export function severidadeEfetiva(p: PostoFH): SeveridadeFH | null {
  const a = p.severidade ?? "UNKNOWN";
  const b = p.previsao?.severidade_prevista ?? "UNKNOWN";
  return (ORDEM_SEVERIDADE[a] >= ORDEM_SEVERIDADE[b] ? a : b) as SeveridadeFH;
}

export const ATRIBUICAO_FH = "Dados: Google Flood Hub (Flood Forecasting API), licença CC BY 4.0.";

export type EventoFH = {
  id: number;
  tipo: "significativo" | "flash";
  inicio: string | null;
  fim: string | null;
  emitido_em: string | null;
  periodo_horas: number | null;
  area_km2: number | null;
  populacao: number | null;
  postos: number;
  feicoes: { nivel: "significativo" | "provavel" | "muito_provavel"; geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon }[];
};

export type EventosFHResposta = { consultado_em: string | null; total_brasil: number; no_rj: EventoFH[]; atribuicao: string };

/** Eventos ativos do Flood Hub que tocam o RJ: inundação significativa e chuva repentina (flash flood). */
export async function fetchFloodHubEventos(): Promise<EventosFHResposta> {
  return getJson<EventosFHResposta>("/floodhub/eventos/");
}

export const ESTILO_EVENTO: Record<string, { cor: string; opacidade: number; rotulo: string }> = {
  significativo: { cor: "#7c3aed", opacidade: 0.25, rotulo: "Inundação significativa" },
  provavel: { cor: "#f97316", opacidade: 0.3, rotulo: "Chuva repentina — provável" },
  muito_provavel: { cor: "#dc2626", opacidade: 0.4, rotulo: "Chuva repentina — muito provável" },
};

export function textoEventos(e: EventosFHResposta | null): string {
  if (!e) return "";
  if (e.no_rj.length === 0) return `Eventos do Flood Hub: nenhum no RJ agora (${e.total_brasil} no Brasil)`;
  return `${e.no_rj.length} evento(s) do Flood Hub no RJ agora`;
}
