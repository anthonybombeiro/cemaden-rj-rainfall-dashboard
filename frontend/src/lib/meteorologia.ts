export const ICONES_TEMPO = [
  { key: "ceuClaro", label: "Céu claro", emoji: "☀️" },
  { key: "ceuPoucasNuvens", label: "Poucas nuvens", emoji: "🌤️" },
  { key: "ceuParcialmenteNublado", label: "Parcialmente nublado", emoji: "⛅" },
  { key: "ceuParcialmenteNubladoChuva", label: "Parcialmente nublado com chuva", emoji: "🌦️" },
  { key: "ceuParcialmenteNubladoChuvaRaios", label: "Parcialmente nublado com chuva e raios", emoji: "⛈️" },
  { key: "ceuNublado", label: "Nublado", emoji: "☁️" },
  { key: "ceuNubladoChuva", label: "Nublado com chuva", emoji: "🌧️" },
  { key: "ceuNubladoChuvaRaios", label: "Nublado com chuva e raios", emoji: "⛈️" },
  { key: "ceuEncoberto", label: "Encoberto", emoji: "☁️" },
  { key: "ceuEncobertoChuva", label: "Encoberto com chuva", emoji: "🌧️" },
  { key: "ceuEncobertoChuvaRaio", label: "Encoberto com chuva e raio", emoji: "⛈️" },
] as const;

export const EMOJI_POR_ICONE: Record<string, string> = Object.fromEntries(
  ICONES_TEMPO.map((i) => [i.key, i.emoji]),
);

export const VENTOS = ["Fraco", "Fraco/Moderado", "Moderado", "Moderado/Forte", "Forte"] as const;

export function iconeSrc(key: string): string {
  return `/icones-tempo/prevTemp_${key}.webp`;
}
