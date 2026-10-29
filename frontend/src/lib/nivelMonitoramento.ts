/** Níveis de Monitoramento (NM 0 a NM 5) do PLANCON 2026/2027 — tipos, escala, assistente de decisão e chamadas à API.
 * Regras no backend: core/niveis_monitoramento.py. Documentação: docs/nivel-monitoramento-plancon.md. */
import { API_BASE_URL, getJson } from "@/lib/api";

export type NivelNM = 0 | 1 | 2 | 3 | 4 | 5;

export type EscalaNM = { sigla: string; nome: string; cor: string; alerta: string; ferramentas?: string[]; nr?: string };

/** Escala padrão (mesmas cores do Guia do Plantão). A API devolve a mesma escala; esta cópia serve a páginas sem login. */
export const ESCALA_NM: Record<number, EscalaNM> = {
  0: { sigla: "NM 0", nome: "Vigilância", cor: "#92d050", alerta: "Sem alerta à população", nr: "NR 0" },
  1: { sigla: "NM 1", nome: "Baixo", cor: "#ffff00", alerta: "Sem envio pela Idap", nr: "NR 1" },
  2: { sigla: "NM 2", nome: "Moderado", cor: "#ffc000", alerta: "Alerta Moderado", nr: "NR 1" },
  3: { sigla: "NM 3", nome: "Alto", cor: "#ff0000", alerta: "Alerta Alto", nr: "NR 2" },
  4: { sigla: "NM 4", nome: "Severo", cor: "#c000ff", alerta: "Alerta Severo", nr: "NR 2 (NR 3+ conforme impacto)" },
  5: { sigla: "NM 5", nome: "Extremo", cor: "#4b0761", alerta: "Alerta Extremo", nr: "NR 2 (NR 3+ conforme impacto)" },
};
export const NIVEIS_NM = [0, 1, 2, 3, 4, 5] as const;

/** Descrição curta do que significa cada nível (PLANCON 2026/2027, item 2.5) — usada na página pública. */
export const SIGNIFICADO_NM: Record<number, { quando: string; acao: string }> = {
  0: { quando: "Risco muito baixo. Monitoramento de rotina, sem previsão de evento adverso.", acao: "Nenhuma ação especial." },
  1: { quando: "Risco baixo. Possibilidade de evento adverso, sem risco iminente de desastre.", acao: "Acompanhar a evolução das condições." },
  2: { quando: "Risco moderado. Impactos localizados ou restritos a áreas e grupos mais vulneráveis.", acao: "Adotar medidas preventivas." },
  3: { quando: "Risco alto ou muito alto previsto com mais de 2 horas de antecedência, ou sem área delimitada.", acao: "Preparar-se: população e órgãos de proteção e defesa civil." },
  4: { quando: "Risco alto ou muito alto com impacto esperado em até 2 horas, em área delimitada com população exposta.", acao: "Autoproteção: ir para local seguro ou ponto de apoio." },
  5: { quando: "Risco muito alto iminente ou evento em curso, com ocorrências ou agravamento.", acao: "Evacuar imediatamente ou abrigar-se em local seguro." },
};

export type NivelMunicipio = {
  municipio: string;
  redec: number | null;
  regiao: string;
  autonomo_dca?: boolean;
  nivel: number;
  vigencia_ate: string | null;
  vencida: boolean;
  atualizado_em: string | null;
  /** "automatico" (gerado pelo sistema a partir dos mapas de risco), "humano" ou "" (sem registro). */
  origem?: string;
};

export type NiveisResposta = {
  gerado_em: string;
  niveis: NivelMunicipio[];
  resumo: Record<string, number>;
  escala: Record<string, EscalaNM>;
  equipes: Record<string, string>;
  antecedencias: Record<string, string>;
  ferramentas: string[];
  vigencia_max_h: number;
};

export type RegistroNivel = {
  id: number;
  municipio: string;
  regiao: string;
  nivel: number;
  nivel_anterior: number;
  equipe: string;
  antecedencia: string;
  area_delimitada: boolean;
  populacao_exposta: boolean;
  motivo: string;
  ferramentas: string;
  vigencia_ate: string | null;
  aprovado_por: string;
  comdec_avisada_em: string | null;
  redec_avisada_em: string | null;
  aviso_simultaneo: boolean;
  aviso_motivo: string;
  encerramento: boolean;
  lote: string;
  registrado_por: string;
  registrado_em: string;
  origem?: string;
  sinais?: Record<string, unknown>[];
};

export type Sugestao = {
  municipio: string;
  regiao: string;
  tipo: "risco_tecnico" | "cota_hidrologica" | "recomendacao_sirene" | "vigencia_vencida";
  atual: number;
  sugerido: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fontes: Record<string, any>[];
  orientacao: string;
};

export type EntradaRegistro = {
  municipios: string[];
  nivel: number;
  equipe?: string;
  antecedencia?: string;
  area_delimitada?: boolean;
  populacao_exposta?: boolean;
  motivo?: string;
  ferramentas?: string[];
  vigencia_horas?: number;
  aprovado_por?: string;
  comdec_avisada_em?: string | null;
  redec_avisada_em?: string | null;
  aviso_simultaneo?: boolean;
  aviso_motivo?: string;
  encerramento?: boolean;
};

export const fetchNiveis = () => getJson<NiveisResposta>("/monitoramento/niveis/");
export const fetchRegistrosNivel = (p: { municipio?: string; horas?: number; limit?: number } = {}) => {
  const q = new URLSearchParams();
  if (p.municipio) q.set("municipio", p.municipio);
  if (p.horas) q.set("horas", String(p.horas));
  q.set("limit", String(p.limit ?? 100));
  return getJson<RegistroNivel[]>(`/monitoramento/registros/?${q}`);
};
export const fetchSugestoes = () => getJson<{ gerado_em: string; sugestoes: Sugestao[] }>("/monitoramento/sugestoes/");

/** Estado da automação do NM (os níveis que o sistema gera sozinho a partir dos mapas de risco). */
export type AutomacaoNm = {
  ativo: boolean;
  nivel_maximo_auto: number;
  ultima_execucao: string | null;
  ultimo_resumo: { criados?: number; renovados?: number; rebaixados?: number; mantidos?: number; bloqueados_por_humano?: number; sem_dado?: number };
  vigentes_automaticos: Record<string, number>;
  regras: { renovar_quando_restam_h: number; histerese_baixar_h: number; bloqueio_humano_nm01_h: number };
};
export const fetchAutomacaoNm = () => getJson<AutomacaoNm>("/monitoramento/automatico/");

function csrf(): string | null {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Lança o nível (a API valida as regras do PLANCON e devolve a lista de `erros` em caso de recusa). */
export async function registrarNivel(dados: EntradaRegistro): Promise<{ registrados: number; lote: string }> {
  const token = csrf();
  const res = await fetch(`${API_BASE_URL}/monitoramento/registrar/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { "X-CSRFToken": token } : {}) },
    body: JSON.stringify(dados),
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok) {
    const erros: string[] = Array.isArray(corpo?.erros) ? corpo.erros : [corpo?.detail ?? `Falha na requisição: HTTP ${res.status}`];
    throw new ErrosRegistro(erros);
  }
  return corpo;
}
export class ErrosRegistro extends Error {
  erros: string[];
  constructor(erros: string[]) {
    super(erros.join(" "));
    this.erros = erros;
  }
}

// ---------------------------------------------------------------- página pública (sem login)
export type RiscoPublico = {
  id: number;
  tipo: "hidrologico" | "geologico" | "meteorologico" | "incendio";
  redec: string;
  municipio: string;
  risco: "muito_baixo" | "baixo" | "moderado" | "alto" | "muito_alto";
  numero_externo: string;
  responsavel: string;
  criado_em: string | null;
  atualizado_em: string | null;
  fonte: string;
};
export type PublicoResposta = {
  gerado_em: string;
  niveis: NivelMunicipio[];
  resumo: Record<string, number>;
  escala: Record<string, EscalaNM>;
  riscos: RiscoPublico[];
};
export async function fetchPublico(): Promise<PublicoResposta> {
  const res = await fetch(`${API_BASE_URL}/publico/monitoramento/`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const corTextoSobre = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#162033" : "#ffffff";
};

export const fmtDataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

// ---------------------------------------------------------------- assistente de decisão (regras do PLANCON, igual ao Guia do Plantão)
export type EntradaDecisao = {
  equipe: "met" | "hid" | "geo";
  /** 0 muito baixo … 4 muito alto */
  risco: number;
  fenomeno: "vendaval" | "chuva" | "granizo" | "raios" | "tornado" | "lento";
  situacao: "prev" | "gat" | "curso";
  antecedencia: "mais" | "ate";
  area: boolean;
  pop: boolean;
  monitorada: boolean;
};
export type ResultadoDecisao = { nivel: NivelNM; notas: string[]; avisos: string[]; impedimentos: string[] };

/** Aplica o item 2.5/2.5.1 do PLANCON: o risco define o piso; antecedência (até 2 h), gatilho atingido/fenômeno detectado e área
 * delimitada definem o teto. NM 4 e NM 5 só saem como SUGESTÃO — o lançamento passa pela aprovação e pelos avisos prévios. */
export function decidirNivel(e: EntradaDecisao): ResultadoDecisao {
  const notas: string[] = [], avisos: string[] = [], impedimentos: string[] = [];
  const r = e.risco;
  let nivel: number;
  if (e.equipe === "met") {
    if (e.fenomeno === "lento") {
      nivel = Math.min(r, 3);
      avisos.push("Fenômeno de evolução lenta: no máximo NM 3 e fora do escopo do PLANCON de chuvas intensas.");
    } else if (r <= 2) {
      nivel = r;
    } else {
      const subito = !(e.fenomeno === "chuva" && e.monitorada);
      if (e.fenomeno === "chuva" && e.monitorada) notas.push("Área com monitoramento hidro/geo: o nível do município vem da hidrologia ou da geologia; a meteorologia fica no máximo em NM 3.");
      if (e.situacao === "curso" && r === 4) nivel = 5;
      else if (subito && (e.situacao === "gat" || e.situacao === "curso") && e.antecedencia === "ate" && e.area && e.pop) nivel = 4;
      else {
        nivel = 3;
        if (subito && e.situacao === "prev") avisos.push("Fenômeno ainda não detectado no radar/estações: sem alto grau de confiabilidade, não pode ser Severo.");
        if (e.antecedencia === "mais") avisos.push("Chegada em mais de 2 h: no máximo NM 3.");
        if (!e.area) avisos.push("Sem área delimitada pela trajetória: não pode ser Severo.");
        if (!e.pop) avisos.push("Sem população exposta (área urbana densa, aglomeração ou área sem monitoramento): fica em NM 3.");
      }
      if (e.situacao === "curso" && r === 3 && nivel === 4) notas.push("Em curso com severidade alta: Severo. Extremo exige severidade muito alta em curso (tornado confirmado, rajadas > 100 km/h ou chuva > 70 mm/h com ocorrências).");
    }
  } else {
    if (r <= 1) nivel = r;
    else if (r === 2) {
      nivel = 2;
      notas.push(`Risco ${e.equipe === "hid" ? "hidrológico" : "geológico"} moderado: comunicar COMDEC e REDEC pelos canais operacionais, sem alerta à população.`);
    } else {
      if (e.situacao === "curso") nivel = r === 4 ? 5 : 4;
      else if (e.situacao === "gat" && e.antecedencia === "ate") nivel = 4;
      else nivel = 3;
      if (e.situacao === "prev") avisos.push("Risco apenas previsto, sem gatilho atingido: fica em NM 3, sem DCA.");
      if (e.situacao === "gat" && e.antecedencia === "mais") avisos.push("Gatilho atingido indica impacto em até 2 h; confira a antecedência.");
      if (nivel >= 4 && (!e.area || !e.pop)) {
        if (nivel === 4) {
          nivel = 3;
          avisos.push("Sem área delimitada com população exposta: fica em NM 3 até haver polígono.");
        } else impedimentos.push("NM 5 sem polígono: o DCA não pode ser cadastrado. Obtenha a área (KMZ da COMDEC ou setores mapeados) e use os demais canais enquanto isso.");
      }
      if (e.situacao === "curso" && r === 3) notas.push("Em curso com risco alto: Severo. Extremo exige risco muito alto iminente ou em curso.");
      if (e.equipe === "geo" && e.situacao === "gat") notas.push("Recomendação de mobilização de sirenes corresponde ao NM 4 nas áreas das estações; sirene e DCA são complementares.");
    }
  }
  return { nivel: nivel as NivelNM, notas, avisos, impedimentos };
}
