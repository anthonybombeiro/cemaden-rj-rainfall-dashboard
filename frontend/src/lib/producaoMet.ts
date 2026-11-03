/** Produção da Meteorologia (03/11/2026): acumulados em 24 h, calendário de chuva, alertas de limiar, aviso meteorológico, checklist do plantão
 * e livro de ocorrências. Regras no backend (api/meteorologia_views.py, core/plantao.py). Documentação: docs/meteorologia-producao.md. */
import { API_BASE_URL, getJson } from "@/lib/api";

function csrf(): string | null {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function enviar<T>(caminho: string, metodo: "POST" | "PATCH", corpo?: unknown): Promise<T> {
  const token = csrf();
  const res = await fetch(`${API_BASE_URL}${caminho}`, {
    method: metodo,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { "X-CSRFToken": token } : {}) },
    body: JSON.stringify(corpo ?? {}),
  });
  const dados = await res.json().catch(() => null);
  if (!res.ok) throw new Error(dados?.detail ?? `Falha na requisição: HTTP ${res.status}`);
  return dados as T;
}

/** "SUL II" -> "Sul II" (algarismos romanos ficam em maiúsculas). */
export const nomeRegiao = (r: string) => r.split(" ").map((p) => (p === "I" || p === "II" ? p : p.charAt(0) + p.slice(1).toLowerCase())).join(" ");
const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
export const dataBr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
export const dataCurta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a.slice(2)}`;
};
/** Valor para <input type="datetime-local"> (hora local do navegador). */
export const paraInputLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ---------------------------------------------------------------- acumulados 24 h
export type ItemAcumulado = { posicao: number; regiao: string; regiao_nome: string; municipio: string; estacao: string; valor: number; fonte: string; fonte_rotulo: string };
export type Acumulados = {
  ref: string; inicio: string; fim: string; janela_h: number; itens: ItemAcumulado[]; municipios_com_chuva: number;
  estacoes_acima_limiar: number; limiar_mm: number; tabela_recomendada: boolean; legenda: string;
};
export const fetchAcumulados = (ref?: string, n = 10) => getJson<Acumulados>(`/meteorologia/acumulados/?n=${n}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`);

export const fmtMm = (v: number) => v.toFixed(1).replace(".", ",");
/** "03/11/2026 | 06H00" — título da arte. */
export function tituloAcumulados(a: Acumulados): string {
  const d = new Date(a.ref);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} | ${pad(d.getHours())}H${pad(d.getMinutes())}`;
}
export function textoAcumulados(a: Acumulados): string {
  const linhas = a.itens.map((i) => `${i.posicao}. ${i.municipio} (${i.regiao_nome}) — ${fmtMm(i.valor)} mm/24h — ${i.fonte_rotulo}`);
  return [`Principais acumulados em 24h — ${tituloAcumulados(a).replace(" | ", " ")}`, ...linhas, "", a.legenda].join("\n");
}

// ---------------------------------------------------------------- calendário de dias com chuva
export type DiaChuva = {
  data: string; max_mm: number; n_estacoes: number; por_regiao: Record<string, { max_mm: number; n_estacoes: number }>;
  estacoes: { estacao: string; municipio: string; regiao: string; fonte: string; mm: number }[];
};
export type CalendarioChuva = { mes: string; limiar: number; dias: DiaChuva[] };
export const fetchCalendarioChuva = (mes: string, limiar = 10) => getJson<CalendarioChuva>(`/resumo/chuva-calendario/?mes=${mes}&limiar=${limiar}`);

// ---------------------------------------------------------------- alertas de limiar
export type EstacaoLimiar = { estacao: string; municipio: string; regiao: string; fonte: string; mm?: number; pct?: number };
export type Limiares = {
  gerado_em: string;
  limiares: { chuva_1h_mm: number; estacoes_24h_mm: number; estacoes_24h_n: number; umidade_pct: number };
  chuva_1h: { ativo: boolean; n: number; estacoes: EstacaoLimiar[] };
  acumulado_24h: { ativo: boolean; n: number; estacoes: EstacaoLimiar[] };
  umidade: { ativo: boolean; n: number; regioes: string[]; estacoes: EstacaoLimiar[] };
};
export const fetchLimiares = () => getJson<Limiares>("/meteorologia/limiares/");

export type AlertaLimiar = { chave: "chuva_1h" | "acumulado_24h" | "umidade"; cor: string; titulo: string; acao: string; texto: string };
const lista = (xs: EstacaoLimiar[], f: (e: EstacaoLimiar) => string) => xs.slice(0, 6).map(f).join("; ") + (xs.length > 6 ? "…" : "");
/** Alertas ativos, com a ação do protocolo e um texto pronto para copiar. */
export function alertasDeLimiar(l: Limiares): AlertaLimiar[] {
  const out: AlertaLimiar[] = [];
  if (l.chuva_1h.ativo)
    out.push({
      chave: "chuva_1h", cor: "#dc2626", titulo: `Chuva acima de ${l.limiares.chuva_1h_mm} mm em 1 h`, acao: "Reportar no grupo 00 e avisar a meteorologista.",
      texto: `Chuva forte em 1 h (acima de ${l.limiares.chuva_1h_mm} mm): ${lista(l.chuva_1h.estacoes, (e) => `${e.estacao} (${e.municipio}) ${(e.mm ?? 0).toFixed(1).replace(".", ",")} mm`)}.`,
    });
  if (l.acumulado_24h.ativo)
    out.push({
      chave: "acumulado_24h", cor: "#ea580c", titulo: `${l.acumulado_24h.n} estações com ${l.limiares.estacoes_24h_mm} mm ou mais em 24 h`, acao: "Fazer a tabela de maiores acumulados.",
      texto: `${l.acumulado_24h.n} estações com ${l.limiares.estacoes_24h_mm} mm ou mais em 24 h: ${lista(l.acumulado_24h.estacoes, (e) => `${e.municipio} ${(e.mm ?? 0).toFixed(1).replace(".", ",")} mm`)}.`,
    });
  if (l.umidade.ativo)
    out.push({
      chave: "umidade", cor: "#ca8a04", titulo: `Umidade abaixo de ${l.limiares.umidade_pct}% em ${l.umidade.n} estação(ões)`, acao: "Avaliar o SMS de baixa umidade (procedimento 07).",
      texto: `Umidade relativa abaixo de ${l.limiares.umidade_pct}%: ${lista(l.umidade.estacoes, (e) => `${e.estacao} (${e.municipio}) ${e.pct}%`)}.`,
    });
  return out;
}

// ---------------------------------------------------------------- aviso meteorológico
export type EstadoAviso = "rascunho" | "emitido" | "cancelado";
export type AvisoMet = {
  id: number; numero: number; ano: number; estado: EstadoAviso; vigencia_inicio: string; vigencia_fim: string; regioes: string[]; sistemas: string[];
  icones: ("chuva" | "vento")[]; texto: string; sms_texto: string; tv_texto: string; idap_enviado: boolean; idap_municipios: string[]; idap_protocolo: string;
  idap_enviado_em: string | null; motivo_cancelamento: string; criado_por: string; criado_em: string; emitido_por: string; emitido_em: string | null;
  historico: { em: string; por: string; acao: string }[];
};
export type EntradaAviso = Partial<Pick<AvisoMet, "vigencia_inicio" | "vigencia_fim" | "regioes" | "sistemas" | "icones" | "texto" | "sms_texto" | "tv_texto" | "idap_enviado" | "idap_municipios" | "idap_protocolo">>;
export const fetchAvisosMet = (ano?: number) => getJson<{ avisos: AvisoMet[] }>(`/avisos-meteorologicos/${ano ? `?ano=${ano}` : ""}`).then((r) => r.avisos);
export const criarAvisoMet = (d: EntradaAviso) => enviar<AvisoMet>("/avisos-meteorologicos/", "POST", d);
export const salvarAvisoMet = (id: number, d: EntradaAviso) => enviar<AvisoMet>(`/avisos-meteorologicos/${id}/`, "PATCH", d);
export const acaoAvisoMet = (id: number, acao: "emitir" | "cancelar" | "reabrir", motivo?: string) => enviar<AvisoMet>(`/avisos-meteorologicos/${id}/${acao}/`, "POST", { motivo });

export const numeroAviso = (a: Pick<AvisoMet, "numero" | "ano">) => `${pad(a.numero)}/${a.ano}`;
export const LEGENDA_CHUVA_AVISO = [
  { faixa: "0 – 4,9 mm", nome: "Chuvisco e chuva fraca", cor: "#9bd3f5" },
  { faixa: "5 – 24,9 mm", nome: "Chuva moderada", cor: "#4fa3e0" },
  { faixa: "25 – 49,9 mm", nome: "Chuva forte", cor: "#f5a623" },
  { faixa: "≥ 50 mm", nome: "Chuva muito forte", cor: "#d0021b" },
];
/** "VÁLIDO A PARTIR DAS 09H DE 14/09/2026 ATÉ AS 09H DO DIA 15/09/2026" */
export function vigenciaAviso(a: Pick<AvisoMet, "vigencia_inicio" | "vigencia_fim">): string {
  const f = (iso: string) => {
    const d = new Date(iso);
    return { h: `${pad(d.getHours())}H${d.getMinutes() ? pad(d.getMinutes()) : ""}`, d: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` };
  };
  const i = f(a.vigencia_inicio);
  const fim = f(a.vigencia_fim);
  return `VÁLIDO A PARTIR DAS ${i.h} DE ${i.d} ATÉ AS ${fim.h} DO DIA ${fim.d}`;
}
/** Texto simples (sem os ** do negrito) para copiar. */
export function textoAviso(a: AvisoMet, nomeSistema: (id: string) => string): string {
  const regiao = a.regioes.length ? a.regioes.join(", ") : "TODO ESTADO DO RJ";
  const sist = a.sistemas.map(nomeSistema).join(", ");
  return [
    `AVISO METEOROLÓGICO Nº ${numeroAviso(a)}`, vigenciaAviso(a), `REGIÃO: ${regiao}`, ...(sist ? [`Sistema atuante: ${sist}`] : []), "", a.texto.replace(/\*\*/g, ""), "",
    "193 – Corpo de Bombeiros | 199 – Defesa Civil", "FONTE: SEDEC-RJ/CEMADEN-RJ",
  ].join("\n");
}

// ---------------------------------------------------------------- checklist do plantão
export type ItemChecklist = {
  codigo: string; hora: string | null; titulo: string; detalhe: string | null; condicional: boolean; prazo: string | null; atrasado: boolean;
  feito: { por: string; em: string; observacao: string } | null;
};
export type Checklist = {
  data: string; inicio: string; fim: string; agora: string; itens: ItemChecklist[]; proximo: string | null;
  pendencias_anteriores: { data: string; codigo: string; hora: string | null; titulo: string }[];
};
export const fetchChecklist = (data?: string) => getJson<Checklist>(`/plantao/checklist/${data ? `?data=${data}` : ""}`);
export const marcarItem = (data: string, codigo: string, feito: boolean, observacao = "") =>
  enviar<{ codigo: string; feito: ItemChecklist["feito"] }>("/plantao/checklist/", "POST", { data, codigo, feito, observacao });

// ---------------------------------------------------------------- livro de ocorrências
export type RegistroLivro = {
  plantao: string; operador: string; tecnico_encerra: string; hora_encerra: string; tecnico_inicia: string; hora_inicia: string;
  ocorrencias: { tipo: string; texto: string }[]; texto: string; atualizado_por: string; atualizado_em: string;
};
export type LivroResposta = {
  data: string; inicio: string; fim: string; registro: RegistroLivro | null; destinatarios: string[];
  automatico: {
    informativos: { numero: number; ano: number; enviado_em: string; regioes: string[] }[];
    avisos: { numero: number; ano: number; emitido_em: string; regioes: string[]; idap_municipios: string[]; idap_enviado_em: string | null }[];
    idap: { numero: number; ano: number; canal: string; regioes: string[]; enviado_em: string }[];
  };
};
export const fetchLivro = (data?: string) => getJson<LivroResposta>(`/plantao/livro/${data ? `?data=${data}` : ""}`);
export const salvarLivro = (d: Partial<RegistroLivro> & { data: string }) => enviar<{ registro: RegistroLivro; criado: boolean }>("/plantao/livro/", "POST", d);

export const TIPOS_OCORRENCIA = [
  { id: "pagina", rotulo: "Página fora do ar / com problema" },
  { id: "tabela", rotulo: "Planilha de acumulados elaborada" },
  { id: "demanda", rotulo: "Demanda solicitada" },
  { id: "pluviometro", rotulo: "Problema em pluviômetro ou radar (avisei a meteorologista)" },
  { id: "outra", rotulo: "Outra ocorrência" },
];

const listaPt = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);
/** Texto do e-mail do L.O. no formato do procedimento 03 do protocolo (cabeçalho, técnicos, informativos/avisos, Idap, demais ocorrências). */
export function textoLivro(data: string, f: Partial<RegistroLivro>, auto: LivroResposta["automatico"]): string {
  const d = dataCurta(data);
  const L: string[] = [`Data: ${d}`, `Plantão: ${f.plantao || "—"}`, `Operador: ${f.operador || "—"}`, "", "Ocorrências:"];
  if (f.tecnico_encerra) L.push(`- Técnico que encerra o plantão: ${f.tecnico_encerra}${f.hora_encerra ? ` às ${f.hora_encerra.replace(":", "h")}` : ""}.`);
  if (f.tecnico_inicia) L.push(`- Técnico que inicia o plantão: ${f.tecnico_inicia}${f.hora_inicia ? ` às ${f.hora_inicia.replace(":", "h")}` : ""}.`);
  for (const i of auto.informativos) L.push(`- Informativo meteorológico n° ${pad(i.numero)}/${i.ano} enviado às ${hhmm(i.enviado_em).replace(":", "h")} para ${i.regioes.length ? `as regiões ${listaPt(i.regioes)}` : "as regiões do informativo"}.`);
  for (const a of auto.avisos) L.push(`- Aviso meteorológico n° ${pad(a.numero)}/${a.ano} enviado às ${hhmm(a.emitido_em).replace(":", "h")} para ${a.regioes.length ? `as regiões ${listaPt(a.regioes)}` : "todas as regiões do estado"}.`);
  for (const a of auto.avisos.filter((x) => x.idap_municipios.length)) L.push(`- SMS+TV enviado via IDAP-TV para os municípios ${listaPt(a.idap_municipios)} às ${hhmm(a.idap_enviado_em).replace(":", "h")} de ${dataBr(a.idap_enviado_em)}.`);
  for (const e of auto.idap) L.push(`- Idap (${e.canal}) do informativo n° ${pad(e.numero)}/${e.ano}${e.regioes.length ? ` para ${listaPt(e.regioes)}` : ""} às ${hhmm(e.enviado_em).replace(":", "h")}.`);
  for (const o of f.ocorrencias ?? []) if (o.texto.trim()) L.push(`- ${o.texto.trim()}`);
  return L.join("\n");
}
export const assuntoLivro = (agora = new Date()) => `Ocorrências Gerais – ${pad(agora.getDate())}/${pad(agora.getMonth() + 1)}/${String(agora.getFullYear()).slice(2)} ${pad(agora.getHours())}/${pad(agora.getMinutes())}h`;
