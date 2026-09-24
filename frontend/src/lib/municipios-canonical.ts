/**
 * Lista canônica de 92 municípios do Estado do Rio de Janeiro (IBGE).
 * Fonte: MUNICIPIOS_CONTATOS em contatosData.ts (verificado contra GeoJSON).
 *
 * Esta é a "fonte da verdade" para nomes de municípios em todo o painel.
 * Todos os componentes devem normalizar entradas para este conjunto.
 */

export const MUNICIPIOS_CANONICOS = [
  "Angra dos Reis",
  "Aperibé",
  "Araruama",
  "Areal",
  "Armação dos Búzios",
  "Arraial do Cabo",
  "Barra Mansa",
  "Barra do Piraí",
  "Belford Roxo",
  "Bom Jardim",
  "Bom Jesus do Itabapoana",
  "Cabo Frio",
  "Cachoeira de Macacu",
  "Cambuci",
  "Campos dos Goytacazes",
  "Cantagalo",
  "Carapebus",
  "Cardoso Moreira",
  "Carmo",
  "Casimiro de Abreu",
  "Comendador Levy Gasparian",
  "Conceição de Macabu",
  "Cordeiro",
  "Duas Barras",
  "Duque de Caxias",
  "Engenheiro Paulo de Frontin",
  "Guapimirim",
  "Iguaba Grande",
  "Itaboraí",
  "Itaguaí",
  "Italva",
  "Itaocara",
  "Itaperuna",
  "Itatiaia",
  "Japeri",
  "Laje de Muriaé",
  "Macaé",
  "Macuco",
  "Magé",
  "Mangaratiba",
  "Maricá",
  "Mendes",
  "Mesquita",
  "Miguel Pereira",
  "Miracema",
  "Natividade",
  "Nilópolis",
  "Niterói",
  "Nova Friburgo",
  "Nova Iguaçu",
  "Paracambi",
  "Paraty",
  "Paraíba do Sul",
  "Paty do Alferes",
  "Petrópolis",
  "Pinheiral",
  "Piraí",
  "Porciúncula",
  "Porto Real",
  "Quatis",
  "Queimados",
  "Quissamã",
  "Resende",
  "Rio Bonito",
  "Rio Claro",
  "Rio das Flores",
  "Rio das Ostras",
  "Rio de Janeiro",
  "Santa Maria Madalena",
  "Santo Antônio de Pádua",
  "Sapucaia",
  "Saquarema",
  "Seropédica",
  "Silva Jardim",
  "Sumidouro",
  "São Fidélis",
  "São Francisco de Itabapoana",
  "São Gonçalo",
  "São José de Ubá",
  "São José do Vale do Rio Preto",
  "São João da Barra",
  "São João de Meriti",
  "São Pedro da Aldeia",
  "São Sebastião do Alto",
  "Tanguá",
  "Teresópolis",
  "Trajano de Moraes",
  "Três Rios",
  "Valença",
  "Varre-Saí",
  "Vassouras",
  "Volta Redonda",
] as const;

export type MunicipioCanonico = typeof MUNICIPIOS_CANONICOS[number];

const MUNICIPIOS_SET = new Set<string>(MUNICIPIOS_CANONICOS);

const chave = (nome: string): string =>
  nome
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// "Capital" (região da REDEC 1) é sempre o município do Rio de Janeiro.
const ALIASES: Record<string, MunicipioCanonico> = {
  capital: "Rio de Janeiro",
  rio: "Rio de Janeiro",
  "armacao de buzios": "Armação dos Búzios",
  buzios: "Armação dos Búzios",
  parati: "Paraty",
  "trajano de morais": "Trajano de Moraes",
  "cachoeiras de macacu": "Cachoeira de Macacu",
  "laje do muriae": "Laje de Muriaé",
  "bom jesus de itabapoana": "Bom Jesus do Itabapoana",
  "sao joao do meriti": "São João de Meriti",
  campos: "Campos dos Goytacazes",
  "pico do couto": "Petrópolis",
};

const POR_CHAVE = new Map<string, MunicipioCanonico>();
for (const m of MUNICIPIOS_CANONICOS) POR_CHAVE.set(chave(m), m);
for (const [k, v] of Object.entries(ALIASES)) POR_CHAVE.set(k, v);

/** Qualquer grafia (caixa, acento, hífen, "Capital") -> um dos 92, ou null. */
export function normalizarParaMunicipioCanonico(nome: string | null | undefined): MunicipioCanonico | null {
  if (!nome || typeof nome !== "string") return null;
  const direto = POR_CHAVE.get(chave(nome));
  if (direto) return direto;
  for (const sep of [" - ", "-", " / ", " – ", ","]) {
    if (nome.includes(sep)) {
      const parte = POR_CHAVE.get(chave(nome.split(sep)[0]));
      if (parte) return parte;
    }
  }
  return null;
}

/** Canônico se mapear; senão o texto original (sem espaços sobrando). */
export function canonicoOuOriginal(nome: string | null | undefined): string {
  if (!nome) return "";
  return normalizarParaMunicipioCanonico(nome) ?? nome.trim();
}

export function isMunicipioValido(nome: string | null | undefined): nome is MunicipioCanonico {
  return !!nome && MUNICIPIOS_SET.has(nome);
}
