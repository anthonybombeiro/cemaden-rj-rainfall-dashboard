/** Sondagem do CPTEC/INPE (Nowcasting): radiossondagem observada (Skew-T com índices) e sondagem do modelo MONAN.
 * Imagens públicas em s3.cptec.inpe.br. A API do Nowcasting não libera CORS, por isso as listas de estações são fixas
 * (lidas do catálogo em 19/10/2026) e a disponibilidade de cada horário é testada pela própria imagem. */
export type EstacaoSondagem = { id: string; nome: string };

export const ESTACOES_CPTEC: EstacaoSondagem[] = [
  { id: "83746", nome: "Galeao (SBGL)" },
  { id: "83649", nome: "Vitoria" },
  { id: "83779", nome: "Marte Civ/Mil (SBMT)" },
  { id: "83566", nome: "Confis Intnl Arpt" },
  { id: "83840", nome: "Curitiba (Aeroporto) (SBCT)" },
  { id: "83378", nome: "Brasilia (Aeroporto) (SBBR)" },
  { id: "83899", nome: "Florianopolis (SBFL)" },
  { id: "83525", nome: "Uberlandia (SBUL)" },
  { id: "82965", nome: "Alta Floresta (Aero) (SBAT)" },
  { id: "85442", nome: "Antofagasta (SCFA)" },
  { id: "86218", nome: "Asuncion/Aeropuerto (SGAS)" },
  { id: "82193", nome: "Belem (Aeroporto) (SBBE)" },
  { id: "82022", nome: "Boa Vista (SBBV)" },
  { id: "83612", nome: "Campo Grande (Aero) (SBCG)" },
  { id: "87860", nome: "Comodoro Rivadavia Aero (SAVC)" },
  { id: "87344", nome: "Cordoba Aero (SACO)" },
  { id: "78807", nome: "Corozal (MPCZ)" },
  { id: "82705", nome: "Cruzerio Do Sul" },
  { id: "82400", nome: "Fernando De Noronha (SBFN)" },
  { id: "83827", nome: "Foz Do Iguacu (Aero) (SBFI)" },
  { id: "78954", nome: "Grantley Adams (TBPB)" },
  { id: "80398", nome: "Leticia/Vasquez Cobo (SKLT)" },
  { id: "83768", nome: "Londrina (SBLO)" },
  { id: "82332", nome: "Manaus (Aeroporto) (SBMN)" },
  { id: "82532", nome: "Manicore" },
  { id: "87418", nome: "Mendoza Aero (SAME)" },
  { id: "82599", nome: "Natal Aeroporto (SBNT)" },
  { id: "87715", nome: "Neuquen Aero (SAZN)" },
  { id: "78970", nome: "Piarco Int. Airport (TTPP)" },
  { id: "83971", nome: "Porto Alegre (Aero) (SBPA)" },
  { id: "82824", nome: "Porto Velho (Aeroporto) (SBPV)" },
  { id: "85799", nome: "Puerto Montt (SCTE)" },
  { id: "85934", nome: "Punta Arenas (SCCI)" },
  { id: "87155", nome: "Resistencia Aero (SARE)" },
  { id: "82917", nome: "Rio Branco" },
  { id: "83937", nome: "Santa Maria (SBSM)" },
  { id: "87623", nome: "Santa Rosa Aero (SAZR)" },
  { id: "82244", nome: "Santarem" },
  { id: "85586", nome: "Santo Domingo (SCSN)" },
  { id: "82411", nome: "Tabatinga" },
  { id: "82026", nome: "Tirios" },
  { id: "83928", nome: "Uruguaniana (SBUG)" },
  { id: "83208", nome: "Vilhena (Aeroporto) (SBVH)" },
]; 

/** Pontos de sondagem do modelo MONAN (3 em 3 h, até 72 h). */
export const PONTOS_MONAN: EstacaoSondagem[] = [
  { id: "RJR", nome: "Rio de Janeiro RJ" },
  { id: "VTR", nome: "Vitoria ES" },
  { id: "SPA", nome: "Sao Paulo SP" },
  { id: "BHO", nome: "Belo Horizonte MG" },
  { id: "CTB", nome: "Curitiba Aeroporto PR" },
  { id: "BSB", nome: "Brasilia Aeroporto BR" },
  { id: "FLN", nome: "Florianopolis SC" },
  { id: "AFT", nome: "Alta Floresta Aero MT" },
  { id: "ANF", nome: "Antofagasta CHL" },
  { id: "ARU", nome: "Aracaju SE" },
  { id: "ASU", nome: "Asuncion Aeropuerto PRY" },
  { id: "BEL", nome: "Belem Aeroporto PA" },
  { id: "BVT", nome: "Boa Vista RR" },
  { id: "BOG", nome: "Bogota COL" },
  { id: "BUE", nome: "Buenos Aires ARG" },
  { id: "CGR", nome: "Campo Grande Aero MS" },
  { id: "CAR", nome: "Caracas VEN" },
  { id: "CAY", nome: "Cayenne GUF" },
  { id: "RIV", nome: "Comodoro Rivadavia Aero ARG" },
  { id: "CRD", nome: "Cordoba Aero ARG" },
  { id: "PAN", nome: "Corozal PAN" },
  { id: "CRZ", nome: "Cruzeiro Do Sul AC" },
  { id: "CUI", nome: "Cuiaba MT" },
  { id: "FND", nome: "Fernando De Noronha PE" },
  { id: "FOR", nome: "Fortaleza CE" },
  { id: "FGI", nome: "Foz Do Iguacu Aero PR" },
  { id: "GEO", nome: "Georgetown GUY" },
  { id: "GOI", nome: "Goiania GO" },
  { id: "GRA", nome: "Grantley Adams BRB" },
  { id: "JPA", nome: "Joao Pessoa PB" },
  { id: "LPZ", nome: "La Paz BOL" },
  { id: "LET", nome: "Leticia Vasquez Cobo COL" },
  { id: "LIM", nome: "Lima PER" },
  { id: "LDR", nome: "Londrina SBLO" },
  { id: "MCP", nome: "Macapa AP" },
  { id: "MCE", nome: "Maceio AL" },
  { id: "MAS", nome: "Manaus Aeroporto AM" },
  { id: "MZA", nome: "Mendoza Aero ARG" },
  { id: "MON", nome: "Monteviedeo URY" },
  { id: "NTL", nome: "Natal Aeroporto NT" },
  { id: "NEU", nome: "Neuquen Aero ARG" },
  { id: "PAL", nome: "Palmas TO" },
  { id: "PAR", nome: "Paramaribo SUR" },
  { id: "PIA", nome: "Piarco Int. Airport TTO" },
  { id: "POA", nome: "Porto Alegre Aero RS" },
  { id: "PVH", nome: "Porto Velho Aeroporto RO" },
  { id: "PMT", nome: "Puerto Montt CHL" },
  { id: "PTA", nome: "Punta Arenas CHL" },
  { id: "QUI", nome: "Quito ECU" },
  { id: "REC", nome: "Recife PE" },
  { id: "RES", nome: "Resistencia Aero ARG" },
  { id: "RBR", nome: "Rio Branco AC" },
  { id: "SAL", nome: "Salvador BA" },
  { id: "SMR", nome: "Santa Maria RS" },
  { id: "SRA", nome: "Santa Rosa Aero ARG" },
  { id: "STR", nome: "Santarem PA" },
  { id: "SGO", nome: "Santiago CHL" },
  { id: "STD", nome: "Santo Domingo CHL" },
  { id: "SLS", nome: "Sao Luis MA" },
  { id: "SUC", nome: "Sucre BOL" },
  { id: "TAB", nome: "Tabatinga AM" },
  { id: "TER", nome: "Teresina PI" },
  { id: "TIR", nome: "Tirios PA" },
  { id: "UDL", nome: "Uberlandia MG" },
  { id: "URG", nome: "Uruguaniana RS" },
  { id: "VLH", nome: "Vilhena Aeroporto RO" },
];

/** Estação observada → ponto do MONAN mais próximo (mesmo local). */
export const PONTO_MONAN_DA_ESTACAO: Record<string, string> = {
  "83746": "RJR",
  "83649": "VTR",
  "83779": "SPA",
  "83566": "BHO",
  "83840": "CTB",
  "83378": "BSB",
  "83899": "FLN",
  "83971": "POA",
  "83525": "UDL",
  "83612": "CGR",
  "82900": "REC",
};

const pad = (n: number) => String(n).padStart(2, "0");

export type SlotSondagem = { data: string; hora: "00" | "12"; rotulo: string };

/** Últimos horários (00Z e 12Z) em ordem decrescente. */
export function slotsObservados(n = 10, agora = new Date()): SlotSondagem[] {
  const out: SlotSondagem[] = [];
  const base = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(), agora.getUTCHours() >= 12 ? 12 : 0));
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getTime() - i * 12 * 3600000);
    const data = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const hora = pad(d.getUTCHours()) as "00" | "12";
    out.push({ data, hora, rotulo: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${hora}Z` });
  }
  return out;
}

export function urlSkewtObservada(estacao: string, data: string, hora: string): string {
  const [a, m, d] = data.split("-");
  return `https://s3.cptec.inpe.br/nowcasting/NC/PC/RAOB/SKEWT/${a}/${m}/SKEW_${estacao}_${a}${m}${d}${hora}00.png`;
}

/** Sondagem do MONAN: pasta da rodada (00Z do dia `run`) e validade `valida` (ISO UTC com hora, ex. 2026-10-19T12). */
export function urlSkewtMonan(ponto: string, run: string, validade: Date): string {
  const [a, m, d] = run.split("-");
  const v = `${validade.getUTCFullYear()}${pad(validade.getUTCMonth() + 1)}${pad(validade.getUTCDate())}${pad(validade.getUTCHours())}00`;
  return `https://s3.cptec.inpe.br/nowcasting/NC/MODEL/SOUNDING/${a}/${m}/${d}/00/SKEW_${ponto}_${v}.png`;
}

/** Validades (de 3 em 3 h, 0 a 72 h) de uma rodada 00Z. */
export function validadesMonan(run: string): Date[] {
  const [a, m, d] = run.split("-").map(Number);
  const t0 = Date.UTC(a, m - 1, d, 0);
  return Array.from({ length: 25 }, (_, i) => new Date(t0 + i * 3 * 3600000));
}

/** Rodadas 00Z candidatas (hoje e os 2 dias anteriores). */
export function rodadasMonan(agora = new Date()): string[] {
  return [0, 1, 2].map((i) => {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - i));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  });
}
