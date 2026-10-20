/** Lua para o painel de marés: fase, idade, iluminação e nascer/pôr (horário de Brasília, UTC-3). Fórmulas astronômicas
 * simplificadas (as de uso corrente em almanaques; erro de minutos no nascer/pôr, suficiente para uso operacional). */
const RAD = Math.PI / 180;
const DIA_MS = 86400000;
const SINODICO = 29.530588853;
const NOVA_REF = Date.UTC(2000, 0, 6, 18, 14); // lua nova de referência

export type FaseLua = { idadeDias: number; iluminacao: number; nome: string; emoji: string; sizigia: "sizígia" | "quadratura" | null };

export function faseDaLua(ms: number): FaseLua {
  const ciclo = ((((ms - NOVA_REF) / DIA_MS) % SINODICO) + SINODICO) % SINODICO;
  const iluminacao = (1 - Math.cos((2 * Math.PI * ciclo) / SINODICO)) / 2;
  const f = ciclo / SINODICO;
  const faixas: [number, string, string][] = [
    [0.03, "Lua nova", "🌑"],
    [0.22, "Crescente", "🌒"],
    [0.28, "Quarto crescente", "🌓"],
    [0.47, "Crescente gibosa", "🌔"],
    [0.53, "Lua cheia", "🌕"],
    [0.72, "Minguante gibosa", "🌖"],
    [0.78, "Quarto minguante", "🌗"],
    [0.97, "Minguante", "🌘"],
    [1.01, "Lua nova", "🌑"],
  ];
  const [, nome, emoji] = faixas.find(([lim]) => f < lim) as [number, string, string];
  // marés de sizígia (vivas) perto da lua nova e cheia; de quadratura (mortas) perto dos quartos
  const perto = (alvo: number) => Math.min(Math.abs(f - alvo), 1 - Math.abs(f - alvo)) * SINODICO;
  const sizigia = Math.min(perto(0), perto(0.5)) <= 2.2 ? "sizígia" : Math.min(perto(0.25), perto(0.75)) <= 2.2 ? "quadratura" : null;
  return { idadeDias: ciclo, iluminacao, nome, emoji, sizigia };
}

function altitudeLua(ms: number, lat: number, lon: number): number {
  const d = ms / DIA_MS - 0.5 + 2440588 - 2451545;
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  const e = RAD * 23.4397;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const H = RAD * (280.16 + 360.9856235 * d) - RAD * -lon - ra;
  const phi = RAD * lat;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
}

/** Nascer e pôr da Lua no dia local (minutos desde 00:00 de Brasília); null quando não ocorre naquele dia. */
export function luaNascerOcaso(dataIso: string, lat: number, lon: number): { nascer: number | null; ocaso: number | null } {
  const [y, m, d] = dataIso.split("-").map(Number);
  const ini = Date.UTC(y, m - 1, d, 3); // 00:00 UTC-3
  const limiar = 0.133; // paralaxe/semidiâmetro médios
  let nascer: number | null = null;
  let ocaso: number | null = null;
  let ant = altitudeLua(ini, lat, lon) - limiar;
  for (let min = 5; min <= 1440; min += 5) {
    const alt = altitudeLua(ini + min * 60000, lat, lon) - limiar;
    if (ant < 0 && alt >= 0 && nascer === null) nascer = min - 5 + (5 * -ant) / (alt - ant);
    if (ant >= 0 && alt < 0 && ocaso === null) ocaso = min - 5 + (5 * ant) / (ant - alt);
    ant = alt;
  }
  return { nascer, ocaso };
}
