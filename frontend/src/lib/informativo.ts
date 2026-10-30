// Informativo meteorológico (nº/AAAA): tipos e chamadas da API interna (docs/informativo-meteorologico.md).
import { API_BASE_URL, getJson } from "@/lib/api";

export const REGIOES_ORDEM = ["COSTA VERDE", "SUL I", "SUL II", "CAPITAL", "BAIXADA FLUMINENSE", "SERRANA I", "SERRANA II", "METROPOLITANA", "BAIXADA LITORÂNEA", "NORTE", "NOROESTE"];

export const INTENSIDADES: { chave: string; rotulo: string; grav: number }[] = [
  { chave: "", rotulo: "—", grav: 0 },
  { chave: "fraca", rotulo: "Fraca", grav: 1 },
  { chave: "fraca_moderada", rotulo: "Fraca a moderada", grav: 2 },
  { chave: "moderada", rotulo: "Moderada", grav: 3 },
  { chave: "moderada_ocasion_forte", rotulo: "Moderada a ocasionalmente forte", grav: 4 },
  { chave: "pontual_forte", rotulo: "Pontualmente forte", grav: 4.5 },
  { chave: "moderada_forte", rotulo: "Moderada a forte", grav: 5 },
  { chave: "forte", rotulo: "Forte", grav: 5.5 },
  { chave: "moderada_ocasion_muito_forte", rotulo: "Moderada a ocasionalmente muito forte", grav: 6 },
  { chave: "forte_ocasion_muito_forte", rotulo: "Forte a ocasionalmente muito forte", grav: 6.5 },
  { chave: "moderada_muito_forte", rotulo: "Moderada a muito forte", grav: 7 },
  { chave: "forte_muito_forte", rotulo: "Forte a muito forte", grav: 7.5 },
  { chave: "pontual_muito_forte", rotulo: "Pontualmente muito forte", grav: 8 },
  { chave: "muito_forte", rotulo: "Muito forte", grav: 9 },
];
/** Gravidade da intensidade (a mesma escala do backend, `core/informativos.py`). */
export const gravidade = (chave: string) => INTENSIDADES.find((o) => o.chave === chave)?.grav ?? 0;
/** Cor da REDEC pela intensidade (por faixa de gravidade). */
export const COR_GRAVIDADE = ["#cbd5e1", "#86efac", "#4ade80", "#facc15", "#fb923c", "#ef4444", "#b91c1c", "#7f1d1d", "#581c87"];
export const corGravidade = (chave: string) => COR_GRAVIDADE[Math.min(Math.ceil(gravidade(chave)), COR_GRAVIDADE.length - 1)];
export const RAJADAS = [
  { chave: "", rotulo: "Sem rajadas" },
  { chave: "moderado", rotulo: "Rajadas moderadas" },
  { chave: "moderado_ocasion_forte", rotulo: "Moderadas a ocasionalmente fortes" },
  { chave: "forte", rotulo: "Rajadas fortes" },
];

export const nomeRegiao = (r: string) => r.split(" ").map((p) => (/^I{1,2}$/.test(p) ? p : p.charAt(0) + p.slice(1).toLowerCase())).join(" ");

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
export type Envio = {
  id: number;
  tipo: "radar" | "idap";
  canal: string;
  detalhe: string;
  quadro_em: string | null;
  regioes: string[];
  protocolo: string;
  autorizado_por: string;
  observacao: string;
  enviado_em: string;
  enviado_por: string;
  validado_em: string | null;
  validado_por: string;
};
// as mesmas ferramentas do lançamento do NM
export const CANAIS_IDAP = ["Google Alertas", "Telegram", "WhatsApp", "SMS", "TV por assinatura", "DCA"];
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
  envios: Envio[];
};
export type Previa = { texto: string; sms: Detalhe["sms"]; maior_gravidade: number; caracteres: number; nm_sugerido: Detalhe["nm_sugerido"] };
export type Acompanhamento = {
  ano: number;
  proximo_numero: { ano: number; numero: number };
  lacunas: number[];
  rascunhos: number;
  vigente:
    | (Detalhe & {
        radar_intervalo_min: number;
        radar_faixa: string;
        radar_proximo_em: string;
        radar_atrasado: boolean;
        minutos_restantes: number;
        sms_pendentes: string[];
        regioes_sem_informacao: string[];
      })
    | null;
  emitir: { emitir: boolean; urgencia: "" | "media" | "alta"; regioes: string[]; motivo: string; renovar_em: string | null } | null;
  chuva_atual: Record<string, ChuvaRegiao>;
  hoje: Resumo[];
  episodio: Detalhe[];
};
export type ChuvaRegiao = { max_1h_mm: number; rotulo: string; classe: "fraca" | "moderada" | "forte" | "muito_forte"; estacao: string; municipio: string };
export type SugestaoRegiao = { regiao: string; chuva_atual: string; raios_atual: boolean; chuva_prevista: string; raios: boolean; motivos: string[] };
export type Apoio = {
  gerado_em: string;
  chuva_atual: Record<string, ChuvaRegiao>;
  sugestao: SugestaoRegiao[];
  descobertas: { regiao: string; rotulo: string; max_1h_mm: number; estacao: string; municipio: string }[];
  ultimo: { numero: number; ano: number; emitido_em: string | null; itens: ItemRegiao[] } | null;
  aviso: string;
};
type Indices = { acertos: number; falsos_alarmes: number; perdas: number; acertos_negativos: number; pod: number | null; far: number | null; csi: number | null; vies: number | null; acuracia: number | null };
export type Verificacao = {
  dias: number;
  janela_h: number;
  criterio: string;
  observacao: string;
  total: Indices;
  informativos: (Indices & { numero: number; ano: number; emitido_em: string; regioes: { regiao: string; previu: boolean; ocorreu: boolean; max_1h_mm: number | null; estacao: string | null; resultado: string }[] })[];
};
export type Pendente = { ano: number; numero: number; linhas: { regiao: string; chuva_prevista: string; vento_previsto: string; sms_enviado: boolean }[]; datas_texto: string[]; horas: string[] };
export type Estatisticas = { ano: number; total: number; por_mes: { mes: number; total: number }[]; por_regiao: Record<string, { informativos: number; sms: number; forte_ou_mais: number }> };

function csrf(): string | null {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Erro de API que pode trazer `avisos` (resposta 409 do registro de envio: confirmar e repetir com `confirmar_avisos`). */
export class ErroApi extends Error {
  avisos: string[];
  constructor(mensagem: string, avisos: string[] = []) {
    super(mensagem);
    this.avisos = avisos;
  }
}

async function enviar<T>(metodo: "POST" | "PATCH" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  const token = csrf();
  const res = await fetch(`${API_BASE_URL}${caminho}`, {
    method: metodo,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(token ? { "X-CSRFToken": token } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => null);
  if (!res.ok) throw new ErroApi(dados?.detail ?? `Falha na requisição: HTTP ${res.status}`, dados?.avisos ?? []);
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
export const fetchApoio = () => getJson<Apoio>("/informativos/apoio/");
export const fetchVerificacao = (dias: number) => getJson<Verificacao>(`/informativos/verificacao/?dias=${dias}`);
export const fetchPendentes = () => getJson<{ pendentes: Pendente[] }>("/informativos/importacao-revisao/");
export const resolverPendente = (corpo: { ano: number; numero: number; data: string; hora: string }) => enviar<Resumo>("POST", "/informativos/importacao-revisao/", corpo);
export const urlImagemRadar = (url: string) => `${API_BASE_URL}/informativos/radar/imagem/?url=${encodeURIComponent(url)}`;

export const registrarEnvio = (id: number, corpo: { tipo: "radar" | "idap"; canais?: string[]; detalhe?: string; quadro_em?: string; regioes?: string[]; autorizado_por?: string; protocolo?: string; observacao?: string; validado?: boolean; confirmar_avisos?: boolean }) =>
  enviar<{ informativo: Detalhe }>("POST", `/informativos/${id}/envios/`, corpo);
export const validarEnvio = (eid: number, validado = true) => enviar<{ envio: Envio; informativo: Detalhe }>("POST", `/informativos/envios/${eid}/validar/`, { validado });
export const apagarEnvio = (eid: number) => enviar<Detalhe>("DELETE", `/informativos/envios/${eid}/`);

export const fmtErro = (e: unknown) => (e instanceof Error ? e.message : "Falha na operação.");
