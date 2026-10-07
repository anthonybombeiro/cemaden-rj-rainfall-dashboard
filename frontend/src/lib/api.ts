import { canonicoOuOriginal, normalizarParaMunicipioCanonico } from "@/lib/municipios-canonical";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000/api";

/** Painel inteiro exige login (pedido do usuário, 2026-09-23) — sessão via
 * cookie do Django, não token em localStorage (ver backend/api/auth_views.py
 * pro porquê). `credentials: "include"` é o que faz esse cookie viajar em
 * toda chamada; sem isso, toda a API responde 403 mesmo já logado. */
export type AuthUser = { username: string; role: "admin" | "operador"; first_name: string; email: string };

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** POST com o cookie `csrftoken` já lido e mandado de volta no header —
 * toda chamada autenticada que muda estado (fora login, que não tem
 * sessão ainda) precisa disso, senão o Django recusa com "CSRF Failed". */
async function postComCsrf<T>(path: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  const csrftoken = getCookie("csrftoken");
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrftoken ? { "X-CSRFToken": csrftoken } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}) as { detail?: string });
  if (!res.ok) throw new Error((data as { detail?: string }).detail || `Falha na requisição: HTTP ${res.status}`);
  return data as T;
}

export async function updateProfile(firstName: string): Promise<AuthUser> {
  return postComCsrf<AuthUser>("/auth/profile/", { first_name: firstName }, "PATCH");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await postComCsrf<{ detail: string }>("/auth/change-password/", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/** Botão "atualizar agora" (Precipitação/Dados Meteorológicos/Sirenes,
 * pedido do usuário 2026-09-23) — roda de verdade a ingestão de todas as
 * fontes no servidor (ver RefreshNowView, ~15-45s, várias chamadas HTTP
 * externas em paralelo). Devolve um resumo por fonte só pra eventual
 * depuração; o chamador normalmente só recarrega os dados depois. */
export async function refreshNow(): Promise<{ ok: boolean; resultados: Record<string, string> }> {
  return postComCsrf("/refresh/", {});
}

export async function refreshRedemet(): Promise<{ ok: boolean; resultado: string }> {
  return postComCsrf("/refresh/redemet/", {});
}

/** Reforço do cron: o painel aberto pede um sync de sirenes (o servidor pula
 * se o último tem menos de ~90 s). */
export async function refreshSirenes(): Promise<{ ok: boolean; pulado: boolean }> {
  return postComCsrf("/refresh/sirenes/", {});
}

export interface SirenesStatus {
  ultima_sincronizacao: string | null;
  idade_s: number | null;
  obsoleto: boolean;
}

export async function fetchSirenesStatus(): Promise<SirenesStatus> {
  return getJson<SirenesStatus>("/sirenes/status/");
}

/** Chamado 1x antes de mostrar a tela de login, só pra garantir que o
 * cookie `csrftoken` existe (necessário mais tarde pro logout). */
export async function ensureCsrfCookie(): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/csrf/`, { credentials: "include", cache: "no-store" });
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/me/`, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Não autenticado");
  return res.json();
}

export async function login(username: string, password: string): Promise<AuthUser> {
  await ensureCsrfCookie();
  const res = await fetch(`${API_BASE_URL}/auth/login/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { detail?: string });
    throw new Error(data.detail || "Usuário ou senha inválidos.");
  }
  return res.json();
}

export async function logout(): Promise<void> {
  const csrftoken = getCookie("csrftoken");
  await fetch(`${API_BASE_URL}/auth/logout/`, {
    method: "POST",
    credentials: "include",
    headers: csrftoken ? { "X-CSRFToken": csrftoken } : {},
  });
}

export type LatestReading = {
  reading_type: string;
  value: number;
  timestamp: string;
};

export type Station = {
  id: number;
  source: string;
  external_id: string;
  name: string;
  municipality: string;
  station_type: string;
  status: string;
  latitude: number;
  longitude: number;
  altitude_m: number | null;
  latest_readings: LatestReading[];
  /** Máx./mín. das últimas 24h (instantâneas + extremos informados pela fonte); null se sem temp./umidade. */
  extremos_24h?: { temp_max: number | null; temp_min: number | null; umid_max: number | null; umid_min: number | null } | null;
};

export type Reading = {
  id: number;
  reading_type: string;
  value: number;
  timestamp: string;
};

/** Um "evento" ativo do nosso próprio AlertRule/AlertEvent (diferente do
 * RiskAlert, que é a classificação já pronta da Defesa Civil) — hoje
 * usado só pelas sirenes de alarme (ver ingestion/connectors/
 * cemaden_rj_sirenes.py): um AlertEvent sem resolved_at = sirene tocando
 * agora naquela estação. */
export type AlertEvent = {
  id: number;
  rule_name: string;
  severity: string;
  station: number;
  station_name: string;
  value: number;
  triggered_at: string;
  resolved_at: string | null;
};

export async function fetchActiveAlertEvents(): Promise<AlertEvent[]> {
  return fetchAllPages<AlertEvent>("/alerts/?active=true&limit=300");
}

type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

async function getJson<T>(pathOuUrlAbsoluta: string): Promise<T> {
  // `next`/`previous` da paginação do DRF já vêm como URL absoluta —
  // aceitar os dois formatos evita ter que recortar API_BASE_URL de volta.
  const url = /^https?:\/\//.test(pathOuUrlAbsoluta) ? pathOuUrlAbsoluta : `${API_BASE_URL}${pathOuUrlAbsoluta}`;
  const res = await fetch(url, { cache: "no-store", credentials: "include" });
  if (!res.ok) {
    throw new Error(`Falha ao buscar ${pathOuUrlAbsoluta}: HTTP ${res.status}`);
  }
  return res.json();
}

/** Segue `next` até esgotar, em vez de pedir tudo com um `?limit=` gigante
 * numa passada só — o backend tem um teto de segurança no `limit`
 * (`api/pagination.py`, `max_limit=300`) justamente porque um payload
 * gigante numa única resposta já derrubou o processo CGI de produção (ver
 * commit que corrigiu o N+1 de `/api/stations/` em 2026-09-23). Conforme o
 * número de estações for crescendo, isso continua funcionando — só faz
 * mais uma volta de rede. */
async function fetchAllPages<T>(path: string): Promise<T[]> {
  const todos: T[] = [];
  let proximo: string | null = path;
  while (proximo) {
    const data: Paginated<T> | T[] = await getJson<Paginated<T> | T[]>(proximo);
    if (Array.isArray(data)) return data; // endpoint não-paginado — devolve direto
    todos.push(...data.results);
    proximo = data.next;
  }
  return todos;
}

export async function fetchStations(): Promise<Station[]> {
  const r = await fetchAllPages<Station>("/stations/?limit=300");
  return r.map((x) => ({ ...x, municipality: canonicoOuOriginal(x.municipality) }));
}

/** Uma estação por id (com `latest_readings`/`extremos_24h`) — usado na
 * página /estacao (histórico por estação, link a partir do nome na tabela
 * de Dados Meteorológicos). */
export async function fetchStation(stationId: number): Promise<Station> {
  const r = await getJson<Station>(`/stations/${stationId}/`);
  return { ...r, municipality: canonicoOuOriginal(r.municipality) };
}

/** `since`/`until` filtram por período (página /estacao: seletor
 * Dia/Semana/Mês/Personalizado) — sem eles, continua devolvendo só as
 * `limit` leituras mais recentes (comportamento antigo). */
export async function fetchStationReadings(
  stationId: number,
  readingType?: string,
  opts?: { since?: Date; until?: Date; limit?: number },
): Promise<Reading[]> {
  const params = new URLSearchParams();
  if (readingType) params.set("reading_type", readingType);
  if (opts?.since) params.set("since", opts.since.toISOString());
  if (opts?.until) params.set("until", opts.until.toISOString());
  if (opts?.limit) params.set("limit", String(opts.limit));
  return getJson<Reading[]>(`/stations/${stationId}/readings/?${params}`);
}

export type SerieBalde = { inicio: string; chuva_mm: number };
export type PrecipitacaoSerie = { janela: "4h" | "24h" | "7d"; inicio: string; total_mm: number; serie: SerieBalde[] };

/** Chuva em baldes de tempo pras 3 janelas fixas do card "Chuva" da
 * página /estacao (pedido do usuário: mesmo padrão do Rede Salvar do
 * CEMADEN nacional — 4h/24h/7 dias, não o seletor de período genérico). */
export async function fetchPrecipitacaoSerie(
  stationId: number,
  janela: "4h" | "24h" | "7d",
): Promise<PrecipitacaoSerie> {
  return getJson<PrecipitacaoSerie>(`/stations/${stationId}/precipitacao-serie/?janela=${janela}`);
}

export type EstacaoProxima = {
  id: number;
  name: string;
  source: string;
  station_type: string;
  municipality: string;
  latitude: number;
  longitude: number;
  distancia_km: number;
};

/** Estações mais próximas — mapinha da página /estacao. */
export async function fetchEstacoesProximas(stationId: number, raioKm = 20, limit = 12): Promise<EstacaoProxima[]> {
  const r = await getJson<EstacaoProxima[]>(`/stations/${stationId}/proximas/?raio_km=${raioKm}&limit=${limit}`);
  return r.map((x) => ({ ...x, municipality: canonicoOuOriginal(x.municipality) }));
}

export type PrecipitacaoStation = {
  id: number;
  source: string;
  station_type: string;
  external_id: string;
  name: string;
  municipality: string;
  latitude: number;
  longitude: number;
  updated_at: string | null;
  /** Última leitura "bruta". */
  chuva_agora_mm: number | null;
  /** Acumulado desde a meia-noite local. Sempre que disponível, pra qualquer fonte. */
  acumulado_hoje_mm: number | null;
  /** Acumulado nos últimos 7 dias corridos (não confundir com "1 mês" —
   * janela corrida de 30 dias — nem com "mês", que é desde o dia 1 do
   * mês corrente/calendário). */
  acumulado_168h_mm: number | null;
  /** Janela CORRIDA de 30 dias (equivalente ao "1 Mês" do portal de
   * sirenes do CEMADEN-RJ) — diferente de acumulado_mes_mm (calendário). */
  acumulado_1mes_mm: number | null;
  /** Desde o dia 1 do mês corrente (calendário, hora local) — "No Mês". */
  acumulado_mes_mm: number | null;
  /** Maior leitura individual nas últimas 24h — equivalente ao "TX-15" do
   * Alerta Rio, mas sem assumir literalmente 15min (a cadência varia por
   * fonte). */
  pico_mm: number | null;
  /** Todas as janelas abaixo (exceto "Hoje" acima) só disponíveis pra
   * fontes tipo "balde" — Wunderground/Plugfield reportam total corrido
   * do dia na origem, mas os conectores já convertem pra "balde" na
   * ingestão (ver bucket_from_running_daily no backend), então também
   * aparecem aqui como qualquer outra fonte. */
  acumulado_5min_mm: number | null;
  acumulado_10min_mm: number | null;
  acumulado_15min_mm: number | null;
  acumulado_30min_mm: number | null;
  acumulado_1h_mm: number | null;
  acumulado_2h_mm: number | null;
  acumulado_3h_mm: number | null;
  acumulado_4h_mm: number | null;
  acumulado_6h_mm: number | null;
  acumulado_12h_mm: number | null;
  acumulado_24h_mm: number | null;
  acumulado_36h_mm: number | null;
  acumulado_48h_mm: number | null;
  acumulado_72h_mm: number | null;
  acumulado_96h_mm: number | null;
};

export async function fetchPrecipitacao(): Promise<PrecipitacaoStation[]> {
  const r = await getJson<PrecipitacaoStation[]>("/stations/precipitacao/");
  return r.map((x) => ({ ...x, municipality: canonicoOuOriginal(x.municipality) }));
}

/** Linha da tabela "CEMADEN Nacional" (03/10/2026) — espelha a Rede Salvar:
 * acumulados OFICIAIS da fonte (`getJson2.php`), não os nossos. `oficial` tem
 * as janelas "1","3","6","12","24","48","72","96" (h). */
export type CemadenNacionalStation = {
  id: number;
  name: string;
  municipality: string;
  /** "A/B" pluviométrica, "H" hidrológica, "G" geotécnica. */
  tipo_cemaden: string;
  codigo: string;
  idestacao: number | null;
  /** Hora (ISO, UTC) da última leitura da estação. */
  referencia: string | null;
  ultimo_mm: number | null;
  oficial: Record<string, number | null>;
  nosso_1h_mm: number | null;
  nosso_24h_mm: number | null;
  nosso_96h_mm: number | null;
  qualidade: "valido" | "suspeito" | "invalido" | null;
  qualidade_motivo: string;
};

export async function fetchCemadenNacional(): Promise<CemadenNacionalStation[]> {
  const r = await getJson<CemadenNacionalStation[]>("/stations/cemaden/");
  return r.map((x) => ({ ...x, municipality: canonicoOuOriginal(x.municipality) }));
}

/** Redes com tabela individual (03/10/2026): fonte (slug do backend) das abas
 * Plugfield, Macaé e Wunderground em Dados. */
export type RedeSource =
  | "plugfield"
  | "macae_ufrj"
  | "wunderground"
  | "niteroi"
  | "alerta_rio"
  | "inea"
  | "ecowitt_paracambi"
  | "inmet"
  | "redemet";

/** Linha da tabela de uma rede. `oficial` depende da fonte: Macaé
 * {"1","24","96"}; Plugfield {"hoje","mes","ano"}; Wunderground {"hoje","taxa"}.
 * `nosso` são os acumulados calculados somando o que gravamos. */
export type RedeStation = {
  id: number;
  name: string;
  municipality: string;
  codigo: string;
  referencia: string | null;
  ultima_leitura: string | null;
  oficial: Record<string, number | null>;
  nosso: Record<string, number | null>;
  atual: {
    temp?: number;
    umid?: number;
    vento_ms?: number;
    rajada_ms?: number;
    pressao_nm?: number;
    pressao?: number;
    dir?: number;
    orvalho?: number;
    tmax?: number;
    tmin?: number;
    rad?: number;
    nivel?: number;
  };
  extra: Record<string, string | number | boolean | null | undefined>;
  qualidade: "suspeito" | "invalido" | null;
  qualidade_motivo: string;
  qualidade_em: string | null;
};

export async function fetchRede(source: RedeSource): Promise<RedeStation[]> {
  const r = await getJson<RedeStation[]>(`/stations/rede/?source=${source}`);
  return r.map((x) => ({ ...x, municipality: canonicoOuOriginal(x.municipality) }));
}

/** Saúde das fontes (`GET /fontes/saude/`, 06/10/2026): coleta atrasada por fonte e
 * estações que pararam de reportar (tinham leitura nas últimas 48 h e nenhuma há > 4 h). */
export type FonteSaude = {
  slug: string;
  nome: string;
  ultima_coleta: string | null;
  idade_min: number | null;
  limite_min: number;
  atrasada: boolean;
  erro: string;
  estacoes_total: number;
  estacoes_ativas: number;
  estacoes_paradas: number;
  estacoes_sem_dado_48h: number;
  sensivel: boolean;
  paradas: { id: number; nome: string; municipio: string; idade_h: number }[];
};
export type FontesSaude = {
  gerado_em: string;
  parada_apos_h: number;
  resumo: { fontes_atrasadas: number; estacoes_paradas: number; estacoes_paradas_outras: number };
  fontes: FonteSaude[];
};

export async function fetchFontesSaude(): Promise<FontesSaude> {
  return getJson<FontesSaude>("/fontes/saude/");
}

/** Detalhe da estação (`GET /stations/{id}/detalhe/`, 07/10/2026): chuva acumulada em 1 h e 24 h
 * (oficial da fonte quando informado) e cotas hidrológicas em cm. */
export type DetalheEstacao = {
  municipio: string;
  rio_monitorado: string;
  regiao_hidrografica: string;
  bacia: string;
  acumulado_1h_mm: number | null;
  acumulado_24h_mm: number | null;
  oficial: boolean;
  cota: { atencao_cm: number | null; alerta_cm: number | null; inundacao_cm: number | null; extrema_cm: number | null } | null;
};

export async function fetchDetalheEstacao(id: number): Promise<DetalheEstacao> {
  return getJson<DetalheEstacao>(`/stations/${id}/detalhe/`);
}

/** Atraso da última leitura, com as MESMAS faixas da legenda da Rede Salvar:
 * até 4 h normal; >4 h <120 h azul-escuro; >120 h <30 d oliva; >30 d roxo.
 * Hora no futuro (> 10 min à frente) = "dado futuro" (relógio vermelho). */
export function getDelayFaixaSalvar(iso: string | null): {
  faixa: "ok" | "4h" | "120h" | "30d" | "futuro" | "sem";
  color: string;
  label: string;
} {
  if (!iso) return { faixa: "sem", color: "#6b7280", label: "Sem leitura" };
  const diffMin = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diffMin < -10) return { faixa: "futuro", color: "#dc2626", label: "Data/hora no futuro (dado futuro)" };
  if (diffMin <= 240) return { faixa: "ok", color: "#111827", label: "Atualizado (até 4 h)" };
  if (diffMin <= 120 * 60) return { faixa: "4h", color: "#1e3a8a", label: "Atrasado: mais de 4 h e menos de 120 h" };
  if (diffMin <= 30 * 24 * 60) return { faixa: "120h", color: "#808000", label: "Atrasado: mais de 120 h e menos de 30 dias" };
  return { faixa: "30d", color: "#7e22ce", label: "Atrasado: mais de 30 dias" };
}

/** Estação HIDROLÓGICA (nível de rio) — pedido do usuário (2026-09-23):
 * tabela dedicada, nível primeiro, chuva depois. Tem TODAS as mesmas
 * janelas de chuva de `PrecipitacaoStation` (reaproveitadas do backend,
 * ver StationViewSet.hidrologicas) mais os 3 campos de nível abaixo — por
 * isso estende o mesmo tipo em vez de duplicar os ~20 campos de janela. */
export type CotaClasse = "normal" | "atencao" | "alerta" | "transbordo" | "extrema" | "sem_cota";
export type TendenciaNivel = "subindo" | "estavel" | "descendo";

export type HidrologicaStation = PrecipitacaoStation & {
  nivel_atual_m: number | null;
  nivel_max_24h_m: number | null;
  nivel_min_24h_m: number | null;
  nivel_atualizado_em: string | null;
  /** Direção do nível nas 3 últimas leituras (null = menos de 3 leituras). */
  tendencia: TendenciaNivel | null;
  rio_monitorado: string;
  regiao_hidrografica: string;
  bacia: string;
  ana_codigo_plu: string;
  ana_codigo_flu: string;
  /** Cotas em cm (tabela CotaHidrologica, editável no Admin); extrema = +20% do transbordo. */
  cota: { atencao_cm: number | null; alerta_cm: number | null; inundacao_cm: number | null; extrema_cm: number | null } | null;
  cota_classe: CotaClasse | null;
};

/** Cores do fundo da célula "Nível Atual" por cota do rio (pedido do usuário, 2026-09-25). */
export const COTA_ESTILOS: Record<CotaClasse, { bg: string; text: string; label: string }> = {
  normal: { bg: "#16A34A", text: "#ffffff", label: "Cota Normal" },
  atencao: { bg: "#FF9800", text: "#111827", label: "Cota de Atenção" },
  alerta: { bg: "#DC2626", text: "#ffffff", label: "Cota de Alerta" },
  transbordo: { bg: "#7E22CE", text: "#ffffff", label: "Cota de Transbordo" },
  extrema: { bg: "#F472B6", text: "#111827", label: "Cota Extrema" },
  sem_cota: { bg: "#E5E7EB", text: "#6B7280", label: "Sem cota definida" },
};

export async function fetchHidrologicas(): Promise<HidrologicaStation[]> {
  const r = await getJson<HidrologicaStation[]>("/stations/hidrologicas/");
  return r.map((x) => ({ ...x, municipality: canonicoOuOriginal(x.municipality) }));
}

/** Camada de satélite/radar da REDEMET (ver backend/api/redemet_imagery_views.py
 * e docs/fontes-de-dados.md) — `bounds` já vem pronto no formato que o
 * Leaflet `ImageOverlay` espera: [[lat_min, lon_min], [lat_max, lon_max]]. */
export type ImageryLayer = {
  tipo: string;
  area?: string;
  timestamp: string;
  image_url: string;
  bounds: [[number, number], [number, number]] | null;
};

export async function fetchSateliteImagery(tipo: "ir" | "realcada" | "vis" = "realcada"): Promise<ImageryLayer> {
  return getJson<ImageryLayer>(`/imagery/satelite/?tipo=${tipo}`);
}

export async function fetchRadarImagery(
  tipo: "maxcappi" | "10km" | "07km" | "05km" | "03km" = "maxcappi",
  area = "pc",
): Promise<ImageryLayer> {
  return getJson<ImageryLayer>(`/imagery/radar/?tipo=${tipo}&area=${area}`);
}

/** "Consulta por estações" só das sirenes (pedido do usuário, 2026-09-23:
 * mesma ideia da tela de mesmo nome do portal do CBMERJ) — ver
 * `StationViewSet.sirenes` no backend. `status_estacao` vem direto de
 * `Station.status` ("ativa"=online / "inativa"=offline /
 * "desconhecido"); `tocando`/`tocando_desde` refletem o AlertEvent ativo
 * da regra "Sirene de alarme tocando", não um campo da própria estação. */
/** Status de cada gatilho (GI-GIV): "condicionado" (amarelo, perto de bater),
 * "obrigatorio" (laranja, superado em 10%+), "acionado" (vermelho, a sirene
 * JÁ está tocando de verdade — sobrepõe qualquer cálculo), ou null (não
 * atingido, OU o município não tem gatilho definido — ver `gatilho_definido`). */
export type GatilhoStatus = "condicionado" | "obrigatorio" | "acionado" | null;
export type GatilhosSirene = { GI: GatilhoStatus; GII: GatilhoStatus; GIII: GatilhoStatus; GIV: GatilhoStatus };

export type SireneStation = {
  id: number;
  external_id: string;
  name: string;
  municipality: string;
  bairro: string;
  rua: string;
  numero: string;
  redec: string;
  grupo: string;
  descricao: string;
  tem_pluviometro: boolean;
  latitude: number;
  longitude: number;
  status_estacao: string;
  tocando: boolean;
  tocando_desde: string | null;
  /** Tipo do acionamento ativo (tabela SireneAcaoTipo, editável no Admin). */
  acao_codigo: number | null;
  acao_nome: string | null;
  acao_categoria: "normal" | "aviso" | "teste" | "mobilizacao" | "outro" | null;
  ultimo_acionamento_nome: string | null;
  ultimo_acionamento_fim: string | null;
  /** Soma da chuva na última 1h (null = sem pluviômetro/referência ou sem leitura na última hora). */
  chuva_1h_mm: number | null;
  chuva_24h_mm: number | null;
  chuva_96h_mm: number | null;
  chuva_30d_mm: number | null;
  ultima_chuva_mm: number | null;
  ultima_chuva_em: string | null;
  /** EAA / EAA+P / EAA+H / EAA+M — editável no Admin. */
  tipo_sirene: string | null;
  /** geo / hidro / geo_hidro — editável no Admin, sem preenchimento automático. */
  risco_sirene: string | null;
  /** Estação de referência usada pros gatilhos quando a sirene não tem pluviômetro próprio. */
  ref_id: number | null;
  ref_nome: string | null;
  /** false = município fora dos 13 que gerimos gatilhos — mostrar "--", não "normal". */
  gatilho_definido: boolean;
  gatilhos: GatilhosSirene;
  updated_at: string | null;
};

export async function fetchSirenes(): Promise<SireneStation[]> {
  const r = await getJson<SireneStation[]>("/stations/sirenes/");
  return r.map((x) => ({ ...x, municipality: canonicoOuOriginal(x.municipality) }));
}

export type RiskAlertTipo = "hidrologico" | "geologico" | "meteorologico" | "incendio";
export type RiskLevel = "muito_baixo" | "baixo" | "moderado" | "alto" | "muito_alto";

export type RiskAlert = {
  id: number;
  tipo: RiskAlertTipo;
  redec: string;
  municipio: string;
  risco: RiskLevel;
  numero_externo: string;
  responsavel: string;
  criado_em: string | null;
  atualizado_em: string | null;
  fonte: string;
};

/** Cores oficiais usadas pela própria Defesa Civil-RJ no painel de alertas
 * (achadas em `/integracao/envia/cemaden/`, seção "Legenda") — mantém aqui
 * pra qualquer operador que já conhece o painel legado reconhecer de cara. */
export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  muito_baixo: "#28a745",
  baixo: "#ffff19",
  moderado: "#ffc107",
  alto: "#bd2130",
  muito_alto: "#6f42c1",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  muito_baixo: "Muito baixo",
  baixo: "Baixo",
  moderado: "Moderado",
  alto: "Alto",
  muito_alto: "Muito alto",
};

export const RISK_ALERT_TIPO_LABELS: Record<RiskAlertTipo, string> = {
  hidrologico: "Risco Hidrológico",
  geologico: "Risco Geológico",
  meteorologico: "Severidade Meteorológica",
  incendio: "Risco de Incêndio Florestal",
};

/** Código curto por tipo, usado só no nome do arquivo exportado como imagem
 * (pedido do usuário, 2026-09-24: "cemaden-rj-tipo-ano-mes-dia-hora-min"). */
export const RISK_ALERT_TIPO_FILE_CODE: Record<RiskAlertTipo, string> = {
  hidrologico: "hidro",
  geologico: "geo",
  meteorologico: "meteoro",
  incendio: "fogo",
};

const RISK_LEVEL_ORDER: RiskLevel[] = ["muito_baixo", "baixo", "moderado", "alto", "muito_alto"];
export const RISK_LEGEND_ITEMS = RISK_LEVEL_ORDER.map((n) => ({
  cor: RISK_LEVEL_COLORS[n],
  rotulo: RISK_LEVEL_LABELS[n],
}));

export async function fetchRiskAlerts(
  tipo: RiskAlertTipo,
  escopo?: "redec" | "municipio",
): Promise<RiskAlert[]> {
  const params = new URLSearchParams({ tipo, limit: "200" });
  if (escopo) params.set("escopo", escopo);
  const data = await getJson<Paginated<RiskAlert> | RiskAlert[]>(`/risk-alerts/?${params}`);
  return Array.isArray(data) ? data : data.results;
}

/** Chave de comparação com o GeoJSON (maiúsculas, sem acento) já sobre o
 * nome canônico dos 92 municípios — "Capital", "RIO DE JANEIRO", "Armação
 * de Búzios" etc. caem todos na mesma chave. */
const CHAVE_GEOJSON: Record<string, string> = {
  "CACHOEIRA DE MACACU": "CACHOEIRAS DE MACACU",
  "LAJE DE MURIAE": "LAJE DO MURIAE",
};

export function normalizeMunicipioName(nome: string): string {
  const base = normalizarParaMunicipioCanonico(nome) ?? nome;
  const chave = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  return CHAVE_GEOJSON[chave] ?? chave;
}

export const READING_TYPE_LABELS: Record<string, string> = {
  chuva_mm: "Chuva acumulada (mm)",
  nivel_m: "Nível do rio (m)",
  temperatura_c: "Temperatura (°C)",
  umidade_pct: "Umidade relativa (%)",
  // Chave continua "vento_ms" (é assim que o backend guarda, em m/s — SI
  // padrão) mas exibimos em km/h a pedido do usuário; a conversão fica em
  // DataTable.tsx/MapView.tsx, só na hora de formatar pra tela.
  vento_ms: "Vento (km/h)",
  vento_rajada_ms: "Rajada de vento (km/h)",
  vento_dir_graus: "Direção do vento (°)",
  mare_m: "Maré (m)",
  temperatura_max_c: "Temperatura máxima da fonte (°C)",
  temperatura_min_c: "Temperatura mínima da fonte (°C)",
  umidade_max_pct: "Umidade máxima da fonte (%)",
  umidade_min_pct: "Umidade mínima da fonte (%)",
  pressao_hpa: "Pressão na estação (hPa)",
  pressao_nm_hpa: "Pressão ao nível do mar (hPa)",
  ponto_orvalho_c: "Ponto de orvalho (°C)",
  radiacao_wm2: "Radiação solar (W/m²)",
  uv_indice: "Índice UV",
  sensacao_termica_c: "Sensação térmica (°C)",
  // Colunas calculadas nas últimas 24h (não são tipos de leitura): ver DataTable.tsx.
  "x:temp_max": "Temp. Máx 24h (°C)",
  "x:temp_min": "Temp. Mín 24h (°C)",
  "x:umid_max": "Umid. Máx 24h (%)",
  "x:umid_min": "Umid. Mín 24h (%)",
};

/** Unidade curta de cada tipo de leitura — usado no gráfico/tabela de
 * histórico da página /estacao (o rótulo completo de READING_TYPE_LABELS já
 * inclui a unidade por extenso, longo demais pro eixo de um gráfico). */
export const READING_TYPE_UNITS: Record<string, string> = {
  chuva_mm: "mm",
  nivel_m: "m",
  temperatura_c: "°C",
  umidade_pct: "%",
  vento_ms: "km/h",
  vento_rajada_ms: "km/h",
  vento_dir_graus: "°",
  mare_m: "m",
  temperatura_max_c: "°C",
  temperatura_min_c: "°C",
  umidade_max_pct: "%",
  umidade_min_pct: "%",
  pressao_hpa: "hPa",
  pressao_nm_hpa: "hPa",
  ponto_orvalho_c: "°C",
  radiacao_wm2: "W/m²",
  uv_indice: "",
  sensacao_termica_c: "°C",
};

export const STATION_TYPE_LABELS: Record<string, string> = {
  pluviometrica: "Pluviométrica",
  hidrologica: "Hidrológica",
  meteorologica: "Meteorológica",
  mare: "Maré/Oceanográfica",
  sirene: "Sirene/Alarme",
  outro: "Outro",
};

export const SOURCE_LABELS: Record<string, string> = {
  inmet: "INMET",
  cemaden_nacional: "CEMADEN Nacional",
  alerta_rio: "Alerta Rio/GeoRio",
  wunderground: "Wunderground",
  plugfield: "Plugfield",
  rio_chuva_bairro: "Chuva por Bairro (Rio)",
  cemaden_rj: "CEMADEN-RJ (rede própria)",
  cemaden_mctic: "CEMADEN Nacional/MCTIC",
  niteroi: "Niterói (Defesa Civil)",
  cemaden_rj_sirenes: "CEMADEN-RJ — Sirenes/Alarme",
  inea: "INEA — Alerta de Cheias",
  ecowitt_paracambi: "Paracambi (Defesa Civil)",
  macae_ufrj: "Macaé (Defesa Civil/UFRJ)",
  redemet: "REDEMET (Aeronáutica)",
};

/** Uma cor fixa por fonte, pra dar pra distinguir de relance numa tabela
 * cheia de linhas (mesma ideia da coluna "Rede" colorida da Rede Salvar do
 * CEMADEN nacional — ver docs/referencia-visual-rede-salvar.md). Onde a
 * fonte é literalmente a mesma rede que existe lá (INMET, CEMADEN-RJ,
 * CEMADEN nacional), reaproveitamos a cor exata deles; pras fontes que só
 * existem no nosso painel, pegamos emprestado uma cor do resto da paleta
 * deles (SIMEPAR/INEA/PCJ/SJC/CODESAL) que sobrou sem uso aqui — mantém a
 * mesma "família visual" sem inventar do zero. */
export const SOURCE_COLORS: Record<string, string> = {
  inmet: "#817C13", // = INMET na Rede Salvar
  cemaden_rj: "#720066", // = CEMADEN-RJ na Rede Salvar
  cemaden_mctic: "#0047F6", // = CEMADEN (nacional) na Rede Salvar
  cemaden_nacional: "#6c757d", // conector antigo/morto — cinza neutro
  alerta_rio: "#A91D3A", // emprestado da cor do CODESAL (Salvador) lá
  wunderground: "#FF6500", // emprestado da cor do SJC lá
  plugfield: "#033600", // emprestado da cor da ANA lá (INEA foi liberado pra fonte real abaixo)
  rio_chuva_bairro: "#543C18", // conector morto (503) — emprestado do PCJ
  niteroi: "#F712D4", // emprestado da cor do SIMEPAR lá
  inea: "#007261", // = INEA na Rede Salvar — cor real, não emprestada (agora existe de verdade)
  // Vermelho vivo (mesmo tom do "muito alto" em getChuva24hNivel) — não
  // reaproveitado da Rede Salvar dessa vez, de propósito: aqui o vermelho
  // já é usado consistentemente no resto do painel pra "emergência/perigo".
  cemaden_rj_sirenes: "#dc2626",
  ecowitt_paracambi: "#0EA5E9", // emprestado da cor do SIMGE lá
  macae_ufrj: "#7C3AED", // emprestado da cor do CEMADEN-MG lá
  redemet: "#1E3A8A", // azul-marinho — remete à farda/identidade da Aeronáutica
};

/** Faixas de atraso (tempo desde a última leitura) e cor associada — mesma
 * ideia da coluna "Data" da Rede Salvar, mas com limiares adaptados: as
 * fontes de lá misturam redes hidrológicas de cadência bem mais lenta
 * (horas), enquanto as nossas atualizam tipicamente a cada 15min–1h. */
export function getDelayStatus(iso: string | null): { color: string; label: string; atrasado: boolean } {
  if (!iso) return { color: "#9ca3af", label: "sem leitura", atrasado: true };
  const horas = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (horas < 1) return { color: "#111827", label: "em dia", atrasado: false };
  if (horas < 6) return { color: "#b45309", label: "atenção (1h–6h sem atualizar)", atrasado: true };
  if (horas < 24) return { color: "#c2410c", label: "atrasado (6h–24h sem atualizar)", atrasado: true };
  return { color: "#991b1b", label: "muito atrasado (> 24h sem atualizar)", atrasado: true };
}

/** Faixas de chuva acumulada em 24h — os mesmos 3 cortes (10/30/70mm) usados
 * pelo próprio CEMADEN nacional na Rede Salvar (ícone amarelo/laranja/
 * vermelho), reaproveitados aqui em vez de inventar limiar próprio. */
export function getChuva24hNivel(mm: number | null): { color: string; label: string } | null {
  if (mm == null) return null;
  if (mm >= 70) return { color: "#dc2626", label: "> 70mm em 24h" };
  if (mm >= 30) return { color: "#f97316", label: "30–70mm em 24h" };
  if (mm >= 10) return { color: "#eab308", label: "10–30mm em 24h" };
  return null;
}

/** Cor de FUNDO DA LINHA pela chuva na última 1 hora — exatamente a mesma
 * legenda/cores do portal de sirenes do CEMADEN-RJ
 * (ConsultaPluviometros?cmd=dadosPluviometros&redec=Todos&municipio=Todos),
 * lida direto do HTML deles: "Atrasada"=#BEBEBE,
 * "Fraca" 0.2–5mm/h=#63B8FF, "Moderada" 5.1–25mm/h=#FFFF66,
 * "Forte" 25.1–50mm/h=#FFA600, "Muito Forte" >50mm/h=#CC0000. Sem chuva
 * significativa (< 0.2mm/h) e sem atraso: sem cor (fundo branco normal,
 * igual o comportamento deles). */
export function getChuva1hFaixa(
  mm: number | null,
  atrasado: boolean,
): { bg: string; text: string; label: string } | null {
  if (atrasado) return { bg: "#BEBEBE", text: "#1f2937", label: "Atrasada" };
  if (mm == null) return null;
  if (mm > 50) return { bg: "#CC0000", text: "#ffffff", label: "Muito Forte (acima de 50mm/h)" };
  if (mm >= 25.1) return { bg: "#FFA600", text: "#1f2937", label: "Forte (entre 25.1mm e 50mm/h)" };
  if (mm >= 5.1) return { bg: "#FFFF66", text: "#1f2937", label: "Moderada (entre 5.1mm e 25mm/h)" };
  if (mm >= 0.2) return { bg: "#63B8FF", text: "#1f2937", label: "Fraca (entre 0.2mm e 5mm/h)" };
  return null;
}

/** As 11 REDECs (Regionais de Defesa Civil) do estado do RJ — mesma lista
 * usada no backend (ingestion/connectors/cemaden_rj_alertas.py). */
export const REDECS = [
  "BAIXADA FLUMINENSE",
  "BAIXADA LITORÂNEA",
  "CAPITAL",
  "COSTA VERDE",
  "METROPOLITANA",
  "NORTE",
  "NOROESTE",
  "SERRANA I",
  "SERRANA II",
  "SUL I",
  "SUL II",
] as const;

/** Município → REDEC, montado a partir do endpoint de risco geológico por
 * município (o único que sempre traz os 92 municípios — ver AlertsPanel).
 * Usado pra agregar/filtrar as tabelas de Precipitação e Dados
 * Meteorológicos por REDEC, que hoje só existe nos alertas. */
export async function fetchMunicipioRedecMap(): Promise<Record<string, string>> {
  const data = await fetchRiskAlerts("geologico", "municipio");
  const mapa: Record<string, string> = {};
  for (const a of data) mapa[normalizeMunicipioName(a.municipio)] = a.redec;
  return mapa;
}

export type Previsao = {
  id: number;
  data: string;
  regiao: string;
  temperatura_maxima: number;
  temperatura_minima: number;
  umidade_maxima: number;
  umidade_minima: number;
  vento_velocidade: string;
  vento_direcao: string;
  nascer_sol: string;
  por_sol: string;
  comentario: string;
  icone: string;
  origem: string;
  criado_por: string;
  atualizado_por: string;
  atualizado_em: string;
};

export type PrevisaoInput = Omit<
  Previsao,
  "id" | "origem" | "criado_por" | "atualizado_por" | "atualizado_em"
>;

/** Previsões de um dia (uma por região). */
export async function fetchPrevisoes(data: string): Promise<Previsao[]> {
  const r = await fetchAllPages<Previsao>(`/previsoes/?data=${encodeURIComponent(data)}&limit=50`);
  return r;
}

/** Nascer e pôr do sol (HH:MM) por REDEC no dia, da tabela de referência 2026-2035
 * (`GET /previsoes/sol/`). Fora do período da tabela devolve {}. */
export type SolDoDia = { data: string; regioes: Record<string, { nascer: string; por: string }> };

export async function fetchSolDoDia(data: string): Promise<SolDoDia> {
  return getJson<SolDoDia>(`/previsoes/sol/?data=${encodeURIComponent(data)}`);
}

/** Data mais recente com previsão cadastrada (null se ainda não há nenhuma). */
export async function fetchDataUltimaPrevisao(): Promise<string | null> {
  const r = await getJson<Previsao[]>("/previsoes/ultima/");
  return r.length > 0 ? r[0].data : null;
}

/** Cria — ou sobrescreve, se já existir (data, região) — uma previsão. */
export async function salvarPrevisao(p: PrevisaoInput, substituir = false): Promise<Previsao> {
  return postComCsrf<Previsao>("/previsoes/", { ...p, ...(substituir ? { substituir: true } : {}) });
}

/** Erro devolvido pelo servidor (409) quando já existe previsão da região/data. */
export const PREVISAO_JA_EXISTE = "previsao_ja_existe";

/** Avisos de mau tempo da Marinha (SMM/CHM, METAREA V — áreas Charlie e
 * Delta, litoral do RJ). Ver backend/ingestion/connectors/marinha_avisos.py. */
export type AvisoMauTempo = {
  id: number;
  numero_externo: string;
  area: "CHARLIE" | "DELTA";
  tipo: string;
  /** Texto bruto da Marinha (maiúsculo, estilo náutico) — ver
   * lib/avisosMauTempo.ts pra versão traduzida/legível. */
  descricao: string;
  /** ISO, UTC. */
  emitido_em: string | null;
  /** ISO, UTC. */
  valido_ate: string | null;
  fonte: string;
};

/** Só os avisos AINDA VÁLIDOS (`valido_ate` no futuro, ou sem `valido_ate`
 * conhecido) — mesmo padrão de "situação atual" da Previsão do tempo, não
 * um histórico completo. */
export async function fetchAvisosMauTempo(): Promise<AvisoMauTempo[]> {
  return fetchAllPages<AvisoMauTempo>("/avisos-mau-tempo/?ativo=true&limit=50");
}
