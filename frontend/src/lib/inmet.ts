/** Produtos públicos do INMET (VIME/COSMO, Sondagem, Meteogramas, Avisos, Análise sinótica).
 * As APIs são abertas (sem token) e respondem com CORS para a nossa origem, então o navegador chama direto.
 * Levantamento em docs/produtos-inmet.md (18/10/2026). Pedido do usuário, 19/10/2026. */
const API_TEMPO = "https://apitempo.inmet.gov.br";
const API_PREV = "https://apiprevmet3.inmet.gov.br";
const API_COMMET = "https://apicommet.inmet.gov.br";
const API_METEOGRAMA = "https://apimeteograma.inmet.gov.br";
const API_VIME = "https://apivime.inmet.gov.br";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`INMET respondeu ${r.status}`);
  return r.json();
}

export type Opcao = { sigla: string; nome: string };

// ---------------------------------------------------------------- sondagem
export const SONDAGEM_ESTACAO_RJ = "83746"; // Galeão (RJ)
export const fetchEstacoesSondagem = () => getJson<Opcao[]>(`${API_TEMPO}/estacoesSondagem`);
export async function fetchDatasSondagem(est: string): Promise<{ data: string; rotulo: string }[]> {
  const d = await getJson<Opcao[]>(`${API_TEMPO}/datas/Sondagem/${est}`);
  return d.map((x) => ({ data: x.sigla.split("T")[0], rotulo: x.nome }));
}
export const fetchHorasSondagem = async (est: string, data: string) => (await getJson<Opcao[]>(`${API_TEMPO}/horas/Sondagem/${est}/${data}`)).map((x) => x.sigla);
export async function fetchSondagemImagem(est: string, data: string, hora: string): Promise<string> {
  const r = await getJson<{ base64: string }>(`${API_TEMPO}/Sondagem/${est}/${data}/${hora}`);
  return r.base64;
}

// ---------------------------------------------------------------- análise sinótica
export type AnaliseSinotica = { descricao: string; data: string; hora: string; responsavel: string };
export const fetchAnalises = () => getJson<AnaliseSinotica[]>(`${API_PREV}/analises`);
export async function fetchCartaAnalise(a: AnaliseSinotica): Promise<string | null> {
  const r = await getJson<{ base64: string }[]>(`${API_COMMET}/ANALISE/AS/analise/${a.data.split("T")[0]}/${a.hora}:00`);
  return r[0]?.base64 ?? null;
}

// ---------------------------------------------------------------- meteogramas COSMO 2,8 km
const MODELO_METEOGRAMA = "COSMO2P8";
export const fetchCidadesRJ = () => getJson<Opcao[]>(`${API_METEOGRAMA}/cidade/${MODELO_METEOGRAMA}/BRA/RJ`);
/** Meteograma de uma cidade do RJ na última data/rodada publicada (ou na rodada pedida).
 * Não usa as rotas /data e /rodada do INMET (levam ~20 s): consulta a imagem direto, de hoje para trás. */
export async function fetchMeteogramaCidade(cidade: string, rodadaPedida?: string): Promise<{ base64: string; data: string; rodada: string } | null> {
  const hoje = Date.now();
  for (let d = 0; d <= 2; d++) {
    const data = new Date(hoje - d * 86400000).toISOString().slice(0, 10);
    for (const rod of rodadaPedida ? [rodadaPedida] : ["12", "00"]) {
      const r = await getJson<{ base64: string }[]>(`${API_METEOGRAMA}/${MODELO_METEOGRAMA}/BRA/RJ/${cidade}/${data}/${rod}`).catch(() => []);
      if (r[0]?.base64 && !r[0].base64.includes("data:text/xml")) return { base64: r[0].base64, data, rodada: rod };
    }
  }
  return null;
}
/** Meteograma de qualquer coordenada (rota "por coordenada" do INMET). */
export async function fetchMeteogramaCoordenada(lat: number, lon: number, data: string, rodada: string): Promise<string | null> {
  const r = await getJson<{ base64: string }>(`${API_METEOGRAMA}/agricultor/${lat.toFixed(2)}/${lon.toFixed(2)}/${data}/${rodada}`);
  return r.base64 && !r.base64.includes("data:text/xml") ? r.base64 : null;
}

// ---------------------------------------------------------------- avisos
export type AvisoInmet = {
  id_aviso: string;
  descricao: string;
  severidade: string;
  aviso_cor: string;
  inicio: string;
  fim: string;
  riscos: string[];
  instrucoes: string[];
  municipios: string[];
  geocodes: string[];
  poligono: { type: string; coordinates: unknown } | null;
  previsto: boolean;
};

function listaPython(s: unknown): string[] {
  if (typeof s !== "string") return [];
  return s
    .replace(/^\[|\]$/g, "")
    .split(/',\s*'|",\s*"/)
    .map((x) => x.replace(/^['"]|['"]$/g, "").trim())
    .filter(Boolean);
}

type AvisoCru = Record<string, string>;
export async function fetchAvisosInmetRJ(): Promise<AvisoInmet[]> {
  const d = await getJson<{ hoje: AvisoCru[]; futuro: AvisoCru[] }>(`${API_PREV}/avisos/ativos`);
  const conv = (a: AvisoCru, previsto: boolean): AvisoInmet | null => {
    const geocodes = (a.geocodes ?? "").split(",").filter(Boolean);
    if (!geocodes.some((g) => g.startsWith("33"))) return null; // 33 = código IBGE do RJ
    let poligono = null;
    try {
      poligono = JSON.parse(a.poligono);
    } catch {
      poligono = null;
    }
    return {
      id_aviso: String(a.id_aviso),
      descricao: a.descricao,
      severidade: a.severidade,
      aviso_cor: a.aviso_cor || "#f59e0b",
      inicio: a.inicio,
      fim: a.fim,
      riscos: listaPython(a.riscos),
      instrucoes: listaPython(a.instrucoes),
      municipios: (a.municipios ?? "").split(",").filter((m) => m.includes(" - RJ")).map((m) => m.replace(/\s*\(\d+\)/, "").replace(" - RJ", "").trim()),
      geocodes,
      poligono,
      previsto,
    };
  };
  return [...d.hoje.map((a) => conv(a, false)), ...d.futuro.map((a) => conv(a, true))].filter((a): a is AvisoInmet => a !== null);
}

// ---------------------------------------------------------------- VIME (COSMO)
export type ModeloVime = "COSMO7" | "COSMO2P8";
export const AREAS_VIME: Opcao[] = [
  { sigla: "SE", nome: "Sudeste" },
  { sigla: "S", nome: "Sul" },
  { sigla: "CO", nome: "Centro-Oeste" },
  { sigla: "NE", nome: "Nordeste" },
  { sigla: "N", nome: "Norte" },
  { sigla: "AS", nome: "América do Sul" },
];
export const fetchParametrosVime = (m: ModeloVime, area: string) => getJson<Opcao[]>(`${API_VIME}/parametros/${m}/${area}`);
export const fetchRodadasVime = (m: ModeloVime, area: string, param: string) => getJson<Opcao[]>(`${API_VIME}/inicializacao/${m}/${area}/${param}`);
export type QuadroVime = { validade: number; validade_extenso: string; base64: string };
export const fetchQuadrosVime = (m: ModeloVime, area: string, param: string, rodada: string) =>
  getJson<QuadroVime[]>(`${API_VIME}/${m}/${area}/${param}/${rodada}`);
