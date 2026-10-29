// Informativo meteorológico (nº/AAAA): tipos e chamadas da API interna (docs/informativo-meteorologico.md).
import { API_BASE_URL, getJson } from "@/lib/api";

export const REGIOES_ORDEM = ["COSTA VERDE", "SUL I", "SUL II", "CAPITAL", "BAIXADA FLUMINENSE", "SERRANA I", "SERRANA II", "METROPOLITANA", "BAIXADA LITORÂNEA", "NORTE", "NOROESTE"];

export const INTENSIDADES: { chave: string; rotulo: string }[] = [
  { chave: "", rotulo: "—" },
  { chave: "fraca", rotulo: "Fraca" },
  { chave: "fraca_moderada", rotulo: "Fraca a moderada" },
  { chave: "moderada", rotulo: "Moderada" },
  { chave: "moderada_ocasion_forte", rotulo: "Moderada a ocasionalmente forte" },
  { chave: "moderada_forte", rotulo: "Moderada a forte" },
  { chave: "moderada_ocasion_muito_forte", rotulo: "Moderada a ocasionalmente muito forte" },
  { chave: "moderada_muito_forte", rotulo: "Moderada a muito forte" },
  { chave: "pontual_muito_forte", rotulo: "Pontualmente muito forte" },
];
export const RAJADAS = [
  { chave: "", rotulo: "Sem rajadas" },
  { chave: "moderado", rotulo: "Rajadas moderadas" },
  { chave: "moderado_ocasion_forte", rotulo: "Moderadas a ocasionalmente fortes" },
  { chave: "forte", rotulo: "Rajadas fortes" },
];

export type ItemRegiao = {
  regiao: string;
  chuva_atual: string;
  raios_atual: boolean;
  chuva_prevista: string;
  vento_previsto: string;
  raios: boolean;
  granizo: boolean;
  isolada: boolean;
  sms_enviado?: boolean;
};
export const itemVazio = (regiao: string): ItemRegiao => ({ regiao, chuva_atual: "", raios_atual: false, chuva_prevista: "", vento_previsto: "", raios: false, granizo: false, isolada: false });

export type Resumo = {
  id: number;
  numero: number;
  ano: number;
  estado: "rascunho" | "revisado" | "enviado" | "cancelado";
  emitido_em: string | null;
  vigente_ate: string | null;
  publico: boolean;
  importado: boolean;
  regioes: string[];
  maior_gravidade: number;
  sms_regioes: string[];
  enviado_em: string | null;
  enviado_por: string;
  criado_por: string;
};
export type Detalhe = Resumo & {
  texto: string;
  texto_livre: boolean;
  editado_a_mao: boolean;
  itens: ItemRegiao[];
  aproximacao: { regioes: string[]; intensidade: string; por: string };
  radar_fonte: string;
  radar_quadro_em: string | null;
  observacao: string;
  motivo_cancelamento: string;
  revisado_por: string;
  revisado_em: string | null;
  historico: { em: string; por: string; acao: string; detalhe: string }[];
  nm_sugerido: { regiao: string; nm: number; so_a_pedido: boolean }[];
  sms: { aplicavel: boolean; regioes: string[]; sms: string; tv: string; sms_cabe: boolean; tv_cabe: boolean; aviso?: string };
  livro_ocorrencias: string;
  radar_intervalo_min: number;
};
export type Previa = { texto: string; sms: Detalhe["sms"]; maior_gravidade: number; caracteres: number; nm_sugerido: Detalhe["nm_sugerido"] };
export type Acompanhamento = {
  ano: number;
  proximo_numero: { ano: number; numero: number };
  lacunas: number[];
  rascunhos: number;
  vigente:
    | (Resumo & {
        radar_intervalo_min: number;
        radar_faixa: string;
        radar_proximo_em: string;
        radar_atrasado: boolean;
        minutos_restantes: number;
        sms_pendentes: string[];
        regioes_sem_informacao: string[];
      })
    | null;
  emitir: { renovar_em: string; motivo: string } | null;
};
export type Estatisticas = { ano: number; total: number; por_mes: { mes: number; total: number }[]; por_regiao: Record<string, { informativos: number; sms: number; forte_ou_mais: number }> };

function csrf(): string | null {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function enviar<T>(metodo: "POST" | "PATCH", caminho: string, corpo?: unknown): Promise<T> {
  const token = csrf();
  const res = await fetch(`${API_BASE_URL}${caminho}`, {
    method: metodo,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { "X-CSRFToken": token } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => null);
  if (!res.ok) throw new Error(dados?.detail ?? `Falha na requisição: HTTP ${res.status}`);
  return dados as T;
}

export const fetchInformativos = (q: Record<string, string> = {}) => getJson<{ informativos: Resumo[]; proximo_numero: { ano: number; numero: number } }>(`/informativos/?${new URLSearchParams(q)}`);
export const fetchInformativo = (id: number) => getJson<Detalhe>(`/informativos/${id}/`);
export const fetchAcompanhamento = () => getJson<Acompanhamento>("/informativos/acompanhamento/");
export const fetchEstatisticas = (ano: number) => getJson<Estatisticas>(`/informativos/estatisticas/?ano=${ano}`);
export const criarInformativo = (corpo: { itens?: ItemRegiao[]; duplicar_de?: number; emitido_em?: string } = {}) => enviar<Detalhe>("POST", "/informativos/", corpo);
export const salvarInformativo = (id: number, corpo: Record<string, unknown>) => enviar<Detalhe>("PATCH", `/informativos/${id}/`, corpo);
export const previaInformativo = (corpo: { itens: ItemRegiao[]; aproximacao?: Detalhe["aproximacao"]; emitido_em?: string; numero?: number; ano?: number }) => enviar<Previa>("POST", "/informativos/previa/", corpo);
export const acaoInformativo = (id: number, acao: "revisar" | "enviar" | "cancelar" | "sms", corpo: Record<string, unknown> = {}) => enviar<Detalhe>("POST", `/informativos/${id}/${acao}/`, corpo);
export const urlExportar = (ano: number) => `${API_BASE_URL}/informativos/exportar/?ano=${ano}`;
