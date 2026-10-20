/** Condições do dia para a faixa de praia (Guarda-Vidas e banhistas): ondas, temperatura da água, vento, UV e tempo.
 * Fonte: Open-Meteo (agregador gratuito de modelos oficiais: ECMWF/WAM, DWD, NOAA/GFS), consultado direto pelo navegador
 * (CORS aberto). É previsão de modelo para o ponto do porto — não substitui aviso oficial (Marinha/INMET/Defesa Civil). */
export type HoraCondicao = {
  hora: number;
  onda: number | null;
  ondaDir: number | null;
  ondaPer: number | null;
  ondulacao: number | null;
  tAgua: number | null;
  temp: number | null;
  ur: number | null;
  vento: number | null;
  rajada: number | null;
  ventoDir: number | null;
  uv: number | null;
  visib: number | null;
  pressao: number | null;
  chuvaProb: number | null;
};

type Serie = Record<string, (number | string | null)[]>;
const url = (host: string, rota: string, lat: number, lon: number, dia: string, vars: string) =>
  `https://${host}/v1/${rota}?latitude=${lat}&longitude=${lon}&hourly=${vars}&timezone=America%2FSao_Paulo&start_date=${dia}&end_date=${dia}`;

async function get(u: string): Promise<Serie> {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Open-Meteo respondeu ${r.status}`);
  const j = (await r.json()) as { hourly?: Serie };
  return j.hourly ?? {};
}

export async function fetchCondicoes(lat: number, lon: number, dia: string): Promise<HoraCondicao[]> {
  const [mar, tempo] = await Promise.allSettled([
    get(url("marine-api.open-meteo.com", "marine", lat, lon, dia, "wave_height,wave_direction,wave_period,swell_wave_height,sea_surface_temperature")),
    get(url("api.open-meteo.com", "forecast", lat, lon, dia, "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,visibility,pressure_msl,precipitation_probability")),
  ]);
  if (mar.status === "rejected" && tempo.status === "rejected") throw new Error("Condições do mar e do tempo indisponíveis.");
  const m: Serie = mar.status === "fulfilled" ? mar.value : {};
  const t: Serie = tempo.status === "fulfilled" ? tempo.value : {};
  const n = (s: Serie, k: string, i: number) => {
    const v = s[k]?.[i];
    return typeof v === "number" ? v : null;
  };
  return Array.from({ length: 24 }, (_, h) => ({
    hora: h,
    onda: n(m, "wave_height", h),
    ondaDir: n(m, "wave_direction", h),
    ondaPer: n(m, "wave_period", h),
    ondulacao: n(m, "swell_wave_height", h),
    tAgua: n(m, "sea_surface_temperature", h),
    temp: n(t, "temperature_2m", h),
    ur: n(t, "relative_humidity_2m", h),
    vento: n(t, "wind_speed_10m", h),
    rajada: n(t, "wind_gusts_10m", h),
    ventoDir: n(t, "wind_direction_10m", h),
    uv: n(t, "uv_index", h),
    visib: n(t, "visibility", h),
    pressao: n(t, "pressure_msl", h),
    chuvaProb: n(t, "precipitation_probability", h),
  }));
}

export const PONTOS_CARDEAIS = ["N", "NNE", "NE", "ENE", "L", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export const cardeal = (g: number | null | undefined) => (g == null ? "—" : PONTOS_CARDEAIS[Math.round(g / 22.5) % 16]);

/** Classe do índice UV (escala da OMS). */
export function classeUv(uv: number | null | undefined): { rotulo: string; cor: string } {
  if (uv == null) return { rotulo: "—", cor: "#9ca3af" };
  if (uv < 3) return { rotulo: "Baixo", cor: "#16a34a" };
  if (uv < 6) return { rotulo: "Moderado", cor: "#ca8a04" };
  if (uv < 8) return { rotulo: "Alto", cor: "#ea580c" };
  if (uv < 11) return { rotulo: "Muito alto", cor: "#dc2626" };
  return { rotulo: "Extremo", cor: "#7c3aed" };
}

/** Alertas indicativos para o banho de mar (limiares operacionais simples sobre a previsão de modelo). */
export function alertasPraia(horas: HoraCondicao[]): string[] {
  const max = (k: keyof HoraCondicao) => Math.max(...horas.map((h) => (typeof h[k] === "number" ? (h[k] as number) : -Infinity)));
  const out: string[] = [];
  const onda = max("onda");
  if (onda >= 2.5) out.push(`Ondas de até ${onda.toFixed(1).replace(".", ",")} m: possível ressaca — risco alto para banhistas.`);
  else if (onda >= 1.5) out.push(`Ondas de até ${onda.toFixed(1).replace(".", ",")} m: mar agitado, atenção a correntes de retorno.`);
  const raj = max("rajada");
  if (raj >= 50) out.push(`Rajadas de até ${Math.round(raj)} km/h: vento forte.`);
  const uv = max("uv");
  if (uv >= 8) out.push(`Índice UV até ${Math.round(uv)} (${classeUv(uv).rotulo.toLowerCase()}): evitar exposição entre 10h e 16h.`);
  return out;
}
