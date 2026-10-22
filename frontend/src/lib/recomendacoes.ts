/** Recomendações de alarme do CEMADEN-RJ (risco geológico) — substitui a planilha "Recomendação Cemaden".
 * API: /api/recomendacoes/ (ver backend RecomendacaoAlarmeViewSet). Pedido do usuário, 22/10/2026. */
import { API_BASE_URL, getJson } from "@/lib/api";

export const PROBABILIDADES = ["Baixa", "Moderada", "Alta", "Muito Alta"] as const;
export type Probabilidade = (typeof PROBABILIDADES)[number];
export const GATILHOS = ["I", "II", "III", "IV"] as const;
export const ESTAGIOS = ["ATENÇÃO", "ALERTA", "ALERTA MÁXIMO"] as const;

export type Recomendacao = {
  id: number;
  numero: string;
  municipio: string;
  data: string; // AAAA-MM-DD
  hora: string; // HH:MM:SS
  probabilidade: Probabilidade;
  estacao: string;
  indice_alcancado: string;
  chuva_1h_mm: number | null;
  chuva_24h_mm: number | null;
  chuva_96h_mm: number | null;
  chuva_30d_mm: number | null;
  gatilho: "" | "I" | "II" | "III" | "IV";
  estagio_operacional: "" | "ATENÇÃO" | "ALERTA" | "ALERTA MÁXIMO";
  acionaram: boolean;
  sirenes_acionadas: string;
  responsavel: string;
  observacao: string;
  origem: string;
  criado_por: string;
  criado_em: string;
  atualizado_por: string;
  atualizado_em: string;
};

export type RecomendacaoInput = Omit<Recomendacao, "id" | "origem" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em">;

export type FiltroRecomendacao = {
  ano?: string;
  municipio?: string;
  probabilidade?: string;
  acionaram?: "" | "true" | "false";
  gatilho?: string;
  q?: string;
};

export type ResumoRecomendacoes = {
  total: number;
  acionaram: number;
  nao_acionaram: number;
  pct_acatamento: number | null;
  por_probabilidade: Record<string, number>;
  por_municipio: { municipio: string; n: number }[];
  por_ano: { ano: number; total: number; acionaram: number }[];
};

/** Cores por probabilidade (cartão e etiqueta). */
export const COR_PROBABILIDADE: Record<string, { barra: string; fundo: string; texto: string }> = {
  Baixa: { barra: "#16a34a", fundo: "#dcfce7", texto: "#166534" },
  Moderada: { barra: "#eab308", fundo: "#fef9c3", texto: "#854d0e" },
  Alta: { barra: "#f97316", fundo: "#ffedd5", texto: "#9a3412" },
  "Muito Alta": { barra: "#dc2626", fundo: "#fee2e2", texto: "#991b1b" },
};

function consulta(f: FiltroRecomendacao): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

type Pagina = { results: Recomendacao[]; next: string | null };

export async function fetchRecomendacoes(f: FiltroRecomendacao = {}): Promise<Recomendacao[]> {
  const todos: Recomendacao[] = [];
  let proximo: string | null = `/recomendacoes/?${consulta(f)}${consulta(f) ? "&" : ""}limit=200`;
  while (proximo) {
    const pag: Pagina | Recomendacao[] = await getJson<Pagina | Recomendacao[]>(proximo);
    if (Array.isArray(pag)) return pag;
    todos.push(...pag.results);
    proximo = pag.next;
  }
  return todos;
}

export const fetchResumoRecomendacoes = (f: FiltroRecomendacao = {}) => getJson<ResumoRecomendacoes>(`/recomendacoes/resumo/?${consulta(f)}`);
export const fetchProximoNumero = async (data: string) => (await getJson<{ numero: string }>(`/recomendacoes/proximo-numero/?data=${encodeURIComponent(data)}`)).numero;

function csrf(): string | null {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Junta os erros de campo do DRF numa frase legível. */
function mensagemDeErro(corpo: unknown, status: number): string {
  if (corpo && typeof corpo === "object") {
    const o = corpo as Record<string, unknown>;
    if (typeof o.detail === "string") return o.detail;
    const partes = Object.entries(o).map(([campo, msg]) => `${campo === "non_field_errors" ? "" : `${ROTULO_CAMPO[campo] ?? campo}: `}${Array.isArray(msg) ? msg.join(" ") : String(msg)}`);
    if (partes.length) return partes.join(" · ");
  }
  return `Falha na requisição: HTTP ${status}`;
}
const ROTULO_CAMPO: Record<string, string> = {
  numero: "Número",
  municipio: "Município",
  data: "Data",
  hora: "Hora",
  probabilidade: "Probabilidade",
  estacao: "Estação",
  chuva_1h_mm: "Chuva 1h",
  chuva_24h_mm: "Chuva 24h",
  chuva_96h_mm: "Chuva 96h",
  chuva_30d_mm: "Chuva 30 dias",
  gatilho: "Gatilho",
  sirenes_acionadas: "Sirenes acionadas",
};

async function enviar(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<unknown> {
  const token = csrf();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { "X-CSRFToken": token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const corpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(mensagemDeErro(corpo, res.status));
  return corpo;
}

export const salvarRecomendacao = (dados: RecomendacaoInput, id?: number) =>
  (id ? enviar(`/recomendacoes/${id}/`, "PATCH", dados) : enviar("/recomendacoes/", "POST", dados)) as Promise<Recomendacao>;
export const apagarRecomendacao = (id: number) => enviar(`/recomendacoes/${id}/`, "DELETE") as Promise<null>;

export const dataBr = (iso: string) => iso.split("-").reverse().join("/");
export const horaCurta = (h: string) => h.slice(0, 5);
const nf = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
export const mm = (v: number | null) => (v == null ? "—" : `${nf(v)} mm`);

/** Texto do índice alcançado quando o operador não digita (ex.: "54 mm/1h · 435,8 mm/30d"). */
export function indiceAutomatico(r: Pick<RecomendacaoInput, "chuva_1h_mm" | "chuva_24h_mm" | "chuva_96h_mm" | "chuva_30d_mm">): string {
  const partes: string[] = [];
  if (r.chuva_1h_mm != null) partes.push(`${nf(r.chuva_1h_mm)} mm/1h`);
  if (r.chuva_24h_mm != null) partes.push(`${nf(r.chuva_24h_mm)} mm/24h`);
  if (r.chuva_96h_mm != null) partes.push(`${nf(r.chuva_96h_mm)} mm/96h`);
  if (r.chuva_30d_mm != null) partes.push(`${nf(r.chuva_30d_mm)} mm/30d`);
  return partes.join(" · ");
}
