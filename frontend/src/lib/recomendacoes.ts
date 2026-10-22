/** Recomendações de alarme do CEMADEN-RJ (risco geológico) — substitui a planilha "Recomendação Cemaden".
 * API: /api/recomendacoes/ (ver backend RecomendacaoAlarmeViewSet). Pedido do usuário, 22/10/2026. */
import { API_BASE_URL, getJson, GatilhoStatus, SireneStation } from "@/lib/api";

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
  /** Um ou mais gatilhos atingidos, separados por vírgula ("I", "I,IV"). */
  gatilho: string;
  estagio_operacional: "" | "ATENÇÃO" | "ALERTA" | "ALERTA MÁXIMO";
  /** null = aguardando validação (a recomendação é enviada primeiro; o município responde depois). */
  acionaram: boolean | null;
  sirenes_qtd: number | null;
  sirenes_acionadas: string;
  responsavel: string;
  observacao: string;
  origem: string;
  validada: boolean;
  validado_por: string;
  validado_em: string | null;
  criado_por: string;
  criado_em: string;
  atualizado_por: string;
  atualizado_em: string;
};

export type RecomendacaoInput = Omit<Recomendacao, "id" | "origem" | "validada" | "validado_por" | "validado_em" | "criado_por" | "criado_em" | "atualizado_por" | "atualizado_em">;

export type FiltroRecomendacao = {
  ano?: string;
  municipio?: string;
  probabilidade?: string;
  acionaram?: "" | "true" | "false";
  validacao?: "" | "pendente" | "validada";
  gatilho?: string;
  q?: string;
};

export type ResumoRecomendacoes = {
  total: number;
  pendentes: number;
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
  acionaram: "Acionaram?",
  sirenes_qtd: "Quantidade de sirenes",
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

// ---------------------------------------------------------------- municípios com gestão de sirenes e gatilhos
export type MunicipioGatilho = { municipio: string; gi_1h: number | null; gii_1h: number | null; gii_24h: number | null; giii_1h: number | null; giii_96h: number | null; giv_1h: number | null; giv_30d: number | null };
let cacheMunicipios: Promise<MunicipioGatilho[]> | null = null;
/** Municípios para os quais o CEMADEN-RJ recomenda (13 com sirenes gerenciadas) e seus limiares. */
export function fetchMunicipiosRecomendacao(): Promise<MunicipioGatilho[]> {
  cacheMunicipios ??= getJson<MunicipioGatilho[]>("/recomendacoes/municipios/");
  return cacheMunicipios;
}

/** "I,IV" -> ["I","IV"] */
export const gatilhosDe = (g: string | null | undefined): string[] => (g ? g.split(",").map((x) => x.trim()).filter(Boolean) : []);
/** "I,IV" -> "I + IV" (cartões e tabela). */
export const rotuloGatilhos = (g: string | null | undefined) => gatilhosDe(g).join(" + ");
/** "I e IV", "I, II e IV" (mensagem). */
const listaPortugues = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);

/** Gatilhos atingidos pelos valores informados (I: 1h; II: 1h+24h; III: 1h+96h; IV: 1h+30 dias — todos independentes). */
export function gatilhosAtingidos(m: MunicipioGatilho | undefined, c1: number | null, c24: number | null, c96: number | null, c30: number | null): string[] {
  if (!m || c1 == null) return [];
  const ok = (v: number | null, lim: number | null) => v != null && lim != null && v >= lim;
  const out: string[] = [];
  if (ok(c1, m.gi_1h)) out.push("I");
  if (ok(c1, m.gii_1h) && ok(c24, m.gii_24h)) out.push("II");
  if (ok(c1, m.giii_1h) && ok(c96, m.giii_96h)) out.push("III");
  if (ok(c1, m.giv_1h) && ok(c30, m.giv_30d)) out.push("IV");
  return out;
}

// ---------------------------------------------------------------- mensagem de envio
/** Texto da recomendação no padrão enviado ao município (WhatsApp/Telegram; *negrito*). */
export function mensagemRecomendacao(r: Pick<Recomendacao, "numero" | "municipio" | "data" | "hora" | "estacao" | "gatilho">): string {
  const [n, ano] = r.numero.split("_");
  const [hh, mi] = r.hora.slice(0, 5).split(":");
  return [
    "SEDEC-RJ",
    "CEMADEN-RJ",
    "",
    `*${r.municipio.toUpperCase()}*`,
    "",
    `RECOMENDAÇÃO DE MOBILIZAÇÃO n° ${n}/${ano}`,
    `Data: ${dataBr(r.data)}`,
    `Hora: ${hh}h${mi}`,
    ...(r.estacao ? [`Pluviômetro: ${r.estacao}`] : []),
    ...(gatilhosDe(r.gatilho).length ? [`${gatilhosDe(r.gatilho).length > 1 ? "Gatilhos" : "Gatilho"}: ${listaPortugues(gatilhosDe(r.gatilho))}`] : []),
    "",
    "Fonte: CEMADEN-RJ - SEDEC",
  ].join("\n");
}

// ---------------------------------------------------------------- acionamentos pelo município
export type AcionamentoMunicipio = {
  id: number;
  municipio: string;
  data: string;
  hora: string | null;
  probabilidade: string;
  sirene: string;
  tipo_alarme: string;
  quantidade: number | null;
  responsavel: string;
  observacao: string;
  origem: string;
  criado_por: string;
  atualizado_por: string;
};
export type AcionamentoInput = Omit<AcionamentoMunicipio, "id" | "origem" | "criado_por" | "atualizado_por">;

export async function fetchAcionamentosMunicipio(f: { ano?: string; municipio?: string; q?: string } = {}): Promise<AcionamentoMunicipio[]> {
  const todos: AcionamentoMunicipio[] = [];
  let proximo: string | null = `/acionamentos-municipio/?${consulta(f)}${consulta(f) ? "&" : ""}limit=200`;
  while (proximo) {
    const pag: { results: AcionamentoMunicipio[]; next: string | null } | AcionamentoMunicipio[] = await getJson(proximo);
    if (Array.isArray(pag)) return pag;
    todos.push(...pag.results);
    proximo = pag.next;
  }
  return todos;
}
export const salvarAcionamentoMunicipio = (d: AcionamentoInput, id?: number) =>
  (id ? enviar(`/acionamentos-municipio/${id}/`, "PATCH", d) : enviar("/acionamentos-municipio/", "POST", d)) as Promise<AcionamentoMunicipio>;
export const apagarAcionamentoMunicipio = (id: number) => enviar(`/acionamentos-municipio/${id}/`, "DELETE") as Promise<null>;

// ---------------------------------------------------------------- recomendação pré-preenchida (a partir das sirenes)
/** Dados que a tabela de sirenes entrega ao cadastro quando um gatilho é atingido. */
export type PreRecomendacao = {
  municipio: string;
  /** Pluviômetro de referência da(s) sirene(s). */
  estacao: string;
  chuva_1h_mm: number | null;
  chuva_24h_mm: number | null;
  chuva_96h_mm: number | null;
  chuva_30d_mm: number | null;
  /** Todos os gatilhos em andamento (condicionado ou acima), em ordem crescente: ["I","IV"]. */
  gatilhos: string[];
  /** Pior status entre eles (condicionado < obrigatório < acionado). */
  situacao: Exclude<GatilhoStatus, null>;
  /** Sirenes que usam esse pluviômetro (sugestão para a validação). */
  sirenes: string[];
  /** Sirene da linha de onde partiu o pedido. */
  origem: string;
};

const CHAVES = ["GI", "GII", "GIII", "GIV"] as const;
const ROMANO = { GI: "I", GII: "II", GIII: "III", GIV: "IV" } as const;
const PESO_SITUACAO = { acionado: 3, obrigatorio: 2, condicionado: 1 } as const;

/** Gatilhos em andamento da sirene — TODOS os que estão com status (do "condicionado", ≥ 95 % do limiar, ao acionado):
 * vários podem estar ativos ao mesmo tempo e a recomendação pode citar mais de um. */
export function gatilhosEmAndamento(s: SireneStation): { gatilhos: string[]; situacao: Exclude<GatilhoStatus, null> } | null {
  if (!s.gatilho_definido) return null;
  const ativos = CHAVES.filter((k) => s.gatilhos[k]);
  if (!ativos.length) return null;
  const situacao = ativos.map((k) => s.gatilhos[k] as Exclude<GatilhoStatus, null>).sort((a, b) => PESO_SITUACAO[b] - PESO_SITUACAO[a])[0];
  return { gatilhos: ativos.map((k) => ROMANO[k]), situacao };
}

/** Monta o pré-preenchimento da recomendação para uma sirene; `todas` serve para achar as irmãs do mesmo pluviômetro. */
export function preDeSirene(s: SireneStation, todas: SireneStation[]): PreRecomendacao | null {
  const g = gatilhosEmAndamento(s);
  if (!g) return null;
  const chave = (x: SireneStation) => `${x.municipality}|${x.ref_id ?? `p${x.id}`}`;
  const irmas = todas.filter((x) => chave(x) === chave(s)).map((x) => x.name);
  return {
    municipio: s.municipality,
    estacao: s.ref_nome ?? s.name,
    chuva_1h_mm: s.chuva_1h_mm,
    chuva_24h_mm: s.chuva_24h_mm,
    chuva_96h_mm: s.chuva_96h_mm,
    chuva_30d_mm: s.chuva_30d_mm,
    gatilhos: g.gatilhos,
    situacao: g.situacao,
    sirenes: Array.from(new Set(irmas)).sort(),
    origem: s.name,
  };
}

/** Pluviômetros com gatilho em andamento agora (um por município+pluviômetro, com a UNIÃO dos gatilhos das sirenes que o usam),
 * do mais grave ao menos grave. */
export function candidatasDeSirenes(todas: SireneStation[]): PreRecomendacao[] {
  const vistos = new Map<string, PreRecomendacao>();
  for (const s of todas) {
    const pre = preDeSirene(s, todas);
    if (!pre) continue;
    const k = `${pre.municipio}|${pre.estacao}`;
    const atual = vistos.get(k);
    if (!atual) {
      vistos.set(k, pre);
      continue;
    }
    atual.gatilhos = Array.from(new Set([...atual.gatilhos, ...pre.gatilhos])).sort((x, y) => ["I", "II", "III", "IV"].indexOf(x) - ["I", "II", "III", "IV"].indexOf(y));
    if (PESO_SITUACAO[pre.situacao] > PESO_SITUACAO[atual.situacao]) atual.situacao = pre.situacao;
    atual.chuva_1h_mm ??= pre.chuva_1h_mm;
    atual.chuva_24h_mm ??= pre.chuva_24h_mm;
    atual.chuva_96h_mm ??= pre.chuva_96h_mm;
    atual.chuva_30d_mm ??= pre.chuva_30d_mm;
  }
  const mais = (p: PreRecomendacao) => ["I", "II", "III", "IV"].indexOf(p.gatilhos[p.gatilhos.length - 1]);
  return [...vistos.values()].sort((a, b) => PESO_SITUACAO[b.situacao] - PESO_SITUACAO[a.situacao] || mais(b) - mais(a) || a.municipio.localeCompare(b.municipio));
}
