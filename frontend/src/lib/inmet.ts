/** Produtos públicos do INMET (VIME/COSMO, Sondagem, Meteogramas, Avisos, Análise sinótica).
 * As APIs são abertas (sem token) e respondem com CORS para a nossa origem, então o navegador chama direto.
 * Levantamento em docs/produtos-inmet.md (18/10/2026). Pedido do usuário, 19/10/2026. */
const API_TEMPO = "https://apitempo.inmet.gov.br";
const API_PREV = "https://apiprevmet3.inmet.gov.br";
const API_COMMET = "https://apicommet.inmet.gov.br";
const API_METEOGRAMA = "https://apimeteograma.inmet.gov.br";
const API_VIME = "https://apivime.inmet.gov.br";
const API_PREC = "https://apiprec.inmet.gov.br";

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
/** Mais recente primeiro (no mesmo dia, 12Z antes de 00Z). */
export const fetchAnalises = async () =>
  (await getJson<AnaliseSinotica[]>(`${API_PREV}/analises`)).sort((a, b) => `${b.data.split("T")[0]}${b.hora}`.localeCompare(`${a.data.split("T")[0]}${a.hora}`));
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
  if (Array.isArray(s)) return s.map((x) => String(x).trim()).filter(Boolean); // a API devolve arrays JSON
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
export type AreaVime = Opcao & { grupo: string };
/** Áreas oficiais do VIME por modelo (lidas do próprio site do INMET): o COSMO 2,8 km tem S, SE, NE e o zoom por estado
 * (código `SE-RJ` etc.); o COSMO 7 km tem as áreas continentais. */
export const AREAS_VIME: Record<ModeloVime, AreaVime[]> = {
  COSMO2P8: [
    { sigla: "SE", nome: "Sudeste", grupo: "Regiões" },
    { sigla: "S", nome: "Sul", grupo: "Regiões" },
    { sigla: "NE", nome: "Nordeste", grupo: "Regiões" },
    { sigla: "SE-RJ", nome: "Rio de Janeiro", grupo: "Estados do Sudeste" },
    { sigla: "SE-ES", nome: "Espírito Santo", grupo: "Estados do Sudeste" },
    { sigla: "SE-MG", nome: "Minas Gerais", grupo: "Estados do Sudeste" },
    { sigla: "SE-SP", nome: "São Paulo", grupo: "Estados do Sudeste" },
  ],
  COSMO7: [
    { sigla: "SE", nome: "Sudeste", grupo: "Regiões" },
    { sigla: "S", nome: "Sul", grupo: "Regiões" },
    { sigla: "CO", nome: "Centro-Oeste", grupo: "Regiões" },
    { sigla: "NE", nome: "Nordeste", grupo: "Regiões" },
    { sigla: "N", nome: "Norte", grupo: "Regiões" },
    { sigla: "BRA", nome: "Brasil", grupo: "Outras" },
    { sigla: "AS", nome: "América do Sul", grupo: "Outras" },
  ],
};
export const AREA_PADRAO_VIME: Record<ModeloVime, string> = { COSMO2P8: "SE-RJ", COSMO7: "SE" };
export const fetchParametrosVime = (m: ModeloVime, area: string) => getJson<Opcao[]>(`${API_VIME}/parametros/${m}/${area}`);
export const fetchRodadasVime = (m: ModeloVime, area: string, param: string) => getJson<Opcao[]>(`${API_VIME}/inicializacao/${m}/${area}/${param}`);
export type QuadroVime = { validade: number; validade_extenso: string; base64: string };
export const fetchQuadrosVime = (m: ModeloVime, area: string, param: string, rodada: string) =>
  getJson<QuadroVime[]>(`${API_VIME}/${m}/${area}/${param}/${rodada}`);

// ---------------------------------------------------------------- previsão oficial por município
export type PeriodoPrevisaoInmet = {
  resumo: string;
  temp_max: number;
  temp_min: number;
  dir_vento: string;
  int_vento: string;
  umidade_max: number;
  umidade_min: number;
  icone: string | null;
  nascer: string;
  ocaso: string;
};
export type DiaPrevisaoInmet = {
  /** AAAA-MM-DD */
  iso: string;
  diaSemana: string;
  geral: PeriodoPrevisaoInmet;
  /** Só nos primeiros dias: manhã, tarde e noite. */
  periodos: Partial<Record<"manha" | "tarde" | "noite", PeriodoPrevisaoInmet>> | null;
};
type PeriodoCru = Record<string, string | number | null>;

function periodo(p: PeriodoCru): PeriodoPrevisaoInmet {
  const n = (v: unknown) => Number(v);
  return {
    resumo: String(p.resumo ?? ""),
    temp_max: n(p.temp_max),
    temp_min: n(p.temp_min),
    dir_vento: String(p.dir_vento ?? ""),
    int_vento: String(p.int_vento ?? ""),
    umidade_max: n(p.umidade_max),
    umidade_min: n(p.umidade_min),
    icone: typeof p.icone === "string" ? p.icone : null,
    nascer: String(p.nascer ?? ""),
    ocaso: String(p.ocaso ?? ""),
  };
}

/** Previsão do INMET (até 5 dias) para um município pelo código IBGE de 7 dígitos. */
export async function fetchPrevisaoInmet(geocode: string): Promise<DiaPrevisaoInmet[]> {
  const d = await getJson<Record<string, Record<string, PeriodoCru | Record<string, PeriodoCru>>>>(`${API_PREV}/previsao/${geocode}`);
  const dias = d[geocode] ?? {};
  return Object.entries(dias).map(([dataBr, v]) => {
    const iso = dataBr.split("/").reverse().join("-");
    const tem = "manha" in v;
    const per = tem ? (v as Record<string, PeriodoCru>) : null;
    const base = (per ? per.manha : (v as PeriodoCru)) as PeriodoCru;
    return {
      iso,
      diaSemana: String(base.dia_semana ?? ""),
      geral: periodo(base),
      periodos: per ? { manha: periodo(per.manha), tarde: periodo(per.tarde ?? per.manha), noite: periodo(per.noite ?? per.manha) } : null,
    };
  });
}

// ---------------------------------------------------------------- anomalias e precipitação acumulada (mapas do Brasil)
export type MapaInmet = { parametro: string; base64: string };
/** Datas (AAAA-MM-DD) com mapas de anomalia diária, da mais recente para a mais antiga. */
export async function fetchDatasAnomalia(): Promise<string[]> {
  const l = await getJson<{ data: string }[]>(`${API_TEMPO}/anomalias/datas/disponiveis`);
  return l.map((x) => x.data.split("T")[0]);
}
/** Mapas de anomalia de temperatura mínima e máxima do dia. */
export const fetchAnomalias = (data: string) => getJson<MapaInmet[]>(`${API_TEMPO}/anomalias/${data}`);
export type MapaPrecipitacao = { parametro: string; parametro_extenso: string; base64: string };
/** Mapas de chuva acumulada (1, 3, 5, 10, 15, 30 e 90 dias) com fim na data (~1,7 MB). */
export const fetchPrecipitacaoAcumulada = (data: string) => getJson<MapaPrecipitacao[]>(`${API_PREC}/${data}`);

