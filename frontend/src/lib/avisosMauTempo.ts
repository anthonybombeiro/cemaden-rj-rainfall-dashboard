/** "Tradução" dos avisos de mau tempo da Marinha (SMM/CHM) pra texto legível
 * por qualquer pessoa (2026-10-01, pedido do usuário) — a fonte manda tudo
 * em CAIXA ALTA, estilo náutico telegráfico, com força de vento na escala
 * Beaufort (só o número) e horários em "Zulu" (UTC, formato DDHHMMZ) sem
 * data corrida. Nada disso é óbvio pra quem não é da área.
 *
 * O backend (`ingestion/connectors/marinha_avisos.py`) já extrai os campos
 * estruturados (`tipo`, `area`, `emitido_em`, `valido_ate`) — o que falta
 * "traduzir" aqui é só o texto livre de `descricao`, que ainda mistura
 * área geográfica + condição meteorológica numa frase só. */

const DIRECOES: Record<string, string> = {
  N: "Norte",
  NE: "Nordeste",
  E: "Leste",
  SE: "Sudeste",
  S: "Sul",
  SO: "Sudoeste",
  SW: "Sudoeste",
  O: "Oeste",
  W: "Oeste",
  NO: "Noroeste",
  NW: "Noroeste",
};

/** Escala Beaufort completa — a fonte só manda o número ("FORÇA 7"), sem
 * dizer o que isso significa em km/h nem o nome usual da condição. */
const BEAUFORT: Record<number, { nome: string; kmh: string }> = {
  0: { nome: "calmaria", kmh: "< 1" },
  1: { nome: "aragem", kmh: "1–5" },
  2: { nome: "brisa leve", kmh: "6–11" },
  3: { nome: "brisa fraca", kmh: "12–19" },
  4: { nome: "brisa moderada", kmh: "20–28" },
  5: { nome: "brisa fresca", kmh: "29–38" },
  6: { nome: "brisa forte", kmh: "39–49" },
  7: { nome: "vento forte", kmh: "50–61" },
  8: { nome: "ventania", kmh: "62–74" },
  9: { nome: "ventania forte", kmh: "75–88" },
  10: { nome: "tempestade", kmh: "89–102" },
  11: { nome: "tempestade violenta", kmh: "103–117" },
  12: { nome: "furacão", kmh: "≥ 118" },
};

/** DD/MM/AA HH:MM, sempre em horário de Brasília — formato pedido pelo
 * usuário (DDMMAA), com separadores pra não virar um número confuso de 6
 * dígitos. `Intl.DateTimeFormat` com `timeZone` explícito (não
 * `toLocaleString` no fuso do navegador de quem está olhando — o painel é
 * de uso no RJ, o horário tem que ser sempre o de Brasília). */
export function formatarDataHoraLocal(d: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("day")}/${valor("month")}/${valor("year")} ${valor("hour")}:${valor("minute")}`;
}

export function formatarDataHoraLocalIso(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatarDataHoraLocal(d);
}

/** Resolve um horário "Zulu" sem data corrida (ex: "010000" = dia 01,
 * 00:00 UTC) usando `emitidoEm` como referência pra descobrir mês/ano —
 * mesma heurística do parser do backend (`_parse_valido_ate`): se o dia é
 * menor que o dia de emissão, é mês seguinte (o aviso descreve uma
 * condição futura próxima, nunca passada). */
function resolverDataZulu(ddhhmm: string, emitidoEmIso: string): Date | null {
  const dia = Number(ddhhmm.slice(0, 2));
  const hora = Number(ddhhmm.slice(2, 4));
  const minuto = Number(ddhhmm.slice(4, 6));
  const ref = new Date(emitidoEmIso);
  if (Number.isNaN(ref.getTime())) return null;
  let ano = ref.getUTCFullYear();
  let mes = ref.getUTCMonth();
  if (dia < ref.getUTCDate()) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      ano += 1;
    }
  }
  const resolvido = new Date(Date.UTC(ano, mes, dia, hora, minuto));
  return Number.isNaN(resolvido.getTime()) ? null : resolvido;
}

/** Minúsculo com maiúscula só no início da frase (a fonte vem toda em
 * CAIXA ALTA — ler um parágrafo inteiro assim cansa/parece estar gritando). */
function paraFraseCase(textoCaps: string): string {
  const minusculo = textoCaps.toLowerCase();
  return minusculo.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (_, prefixo, letra) => prefixo + letra.toUpperCase());
}

/** Versão legível de `descricao` — traduz força de vento (Beaufort → nome +
 * km/h), direção (sigla → nome completo) e "A PARTIR DE DDHHMMZ" (→
 * horário de Brasília, usando `emitidoEm` pra resolver mês/ano). O que não
 * casa com os padrões conhecidos fica como está (frase case), nunca
 * quebra — avisos de tipos diferentes (mar grosso, ressaca, etc.) podem ter
 * estrutura de texto um pouco diferente da de vento. */
export function humanizarDescricao(descricaoOriginal: string, emitidoEmIso: string | null): string {
  let texto = paraFraseCase(descricaoOriginal);

  texto = texto.replace(/a partir de (\d{2})(\d{2})(\d{2})z/gi, (match, dia, hora, min) => {
    if (!emitidoEmIso) return match;
    const resolvido = resolverDataZulu(`${dia}${hora}${min}`, emitidoEmIso);
    return resolvido ? `a partir de ${formatarDataHoraLocal(resolvido)}` : match;
  });

  texto = texto.replace(/vento ([a-zà-ÿ]{1,2}(?:\/[a-zà-ÿ]{1,2})*) força (\d{1,2})\b/gi, (match, direcoes, forca) => {
    const dirTraduzidas = String(direcoes)
      .split("/")
      .map((d: string) => DIRECOES[d.toUpperCase()] ?? d.toUpperCase())
      .join("/");
    const beaufort = BEAUFORT[Number(forca)];
    return beaufort
      ? `vento de ${dirTraduzidas} — força ${forca} (${beaufort.nome}, ${beaufort.kmh} km/h)`
      : `vento de ${dirTraduzidas} — força ${forca}`;
  });

  // Coordenada náutica (ex: "18s039w") — maiúsculo nos pontos cardeais é a
  // convenção, "18S039W" lê melhor que o resto da frase em minúsculo deixou.
  texto = texto.replace(/(\d+)([nsew])(\d+)([nsew])/gi, (_, a, dir1, b, dir2) => `${a}${dir1.toUpperCase()}${b}${dir2.toUpperCase()}`);

  return texto;
}
