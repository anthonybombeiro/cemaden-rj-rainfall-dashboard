import type { Previsao } from "@/lib/api";

/** Texto geral do estado (proposta a partir das previsões das REDECs) e validações ao salvar a previsão.
 * Funções puras: não acessam rede nem o relógio (a data de referência entra por parâmetro). */

/** Ordem das REDECs nos textos (a mesma do texto enviado ao grupo 00). */
export const ORDEM_TEXTO = ["COSTA VERDE", "SUL I", "SUL II", "CAPITAL", "BAIXADA FLUMINENSE", "SERRANA I", "SERRANA II", "METROPOLITANA", "BAIXADA LITORÂNEA", "NORTE", "NOROESTE"];
const ordemTexto = (r: string) => {
  const i = ORDEM_TEXTO.indexOf(r);
  return i < 0 ? 99 : i;
};
const bonito = (r: string) => r.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/ i$/i, " I").replace(/ ii$/i, " II");

export function listaPt(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** "nas regiões A, B e C", "em todo o estado" ou "em todas as regiões, exceto X" (a partir de 8 de 11). */
export function ondePt(regioes: string[], total = ORDEM_TEXTO.length): string {
  const ord = [...regioes].sort((a, b) => ordemTexto(a) - ordemTexto(b));
  if (ord.length >= total) return "em todo o estado";
  if (ord.length >= 8) {
    const fora = ORDEM_TEXTO.filter((r) => !ord.includes(r)).map(bonito);
    return `em todas as regiões, exceto ${listaPt(fora)}`;
  }
  return `${ord.length === 1 ? "na região" : "nas regiões"} ${listaPt(ord.map(bonito))}`;
}

// ---------------------------------------------------------------- vento
const VENTO_FAIXA: Record<string, [number, number]> = { Fraco: [0, 0], "Fraco/Moderado": [0, 1], Moderado: [1, 1], "Moderado/Forte": [1, 2], Forte: [2, 2] };
const VENTO_PALAVRA = ["fracos", "moderados", "fortes"];
const PONTOS: Record<string, string> = { N: "Norte", NE: "Nordeste", E: "Leste", SE: "Sudeste", S: "Sul", SW: "Sudoeste", SO: "Sudoeste", W: "Oeste", O: "Oeste", NW: "Noroeste", NO: "Noroeste" };

/** "NW-SW" / "NW/SW" → "Noroeste-Sudoeste"; devolve "" se alguma sigla não for reconhecida. */
export function direcaoPorExtenso(sigla: string): string {
  const partes = sigla.toUpperCase().split(/[-/\s]+/).filter(Boolean);
  const nomes = partes.map((p) => PONTOS[p]);
  return nomes.length && nomes.every(Boolean) ? nomes.join("-") : "";
}

/** "Ventos fracos a moderados[, predominantemente de Noroeste-Sudoeste]." — união das classes de vento das REDECs; a direção entra
 * quando a mesma direção aparece em 4 ou mais REDECs. */
export function fraseVento(previsoes: Previsao[]): string {
  const faixas = previsoes.map((p) => VENTO_FAIXA[p.vento_velocidade]).filter(Boolean);
  if (!faixas.length) return "";
  const min = Math.min(...faixas.map((f) => f[0]));
  const max = Math.max(...faixas.map((f) => f[1]));
  let frase = min === max ? `Ventos ${VENTO_PALAVRA[min]}` : `Ventos ${VENTO_PALAVRA[min]} a ${VENTO_PALAVRA[max]}`;
  const cont = new Map<string, number>();
  for (const p of previsoes) {
    const d = p.vento_direcao.trim().toUpperCase().replace(/\//g, "-");
    if (d) cont.set(d, (cont.get(d) ?? 0) + 1);
  }
  const [dir, n] = [...cont.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const extenso = n >= 4 ? direcaoPorExtenso(dir) : "";
  if (extenso) frase += `, predominantemente de ${extenso}`;
  return `${frase}.`;
}

// ---------------------------------------------------------------- céu e chuva
const COBERTURA = (icone: string): number => (icone === "ceuClaro" ? 0 : icone === "ceuPoucasNuvens" ? 1 : /^ceuParcialmenteNublado/.test(icone) ? 2 : /^ceuNublado/.test(icone) ? 3 : /^ceuEncoberto/.test(icone) ? 4 : -1);
const NOME_COBERTURA = ["claro", "com poucas nuvens", "parcialmente nublado", "nublado", "encoberto"];
const temChuva = (icone: string) => /Chuva/.test(icone);
const temRaio = (icone: string) => /Raio/.test(icone);

/** Frase do céu e da chuva montada só com as imagens do clima (quando não há comentário em comum). */
export function fraseCeuEChuva(previsoes: Previsao[]): string {
  const cob = previsoes.map((p) => COBERTURA(p.icone)).filter((n) => n >= 0);
  if (!cob.length) return "";
  const min = Math.min(...cob);
  const max = Math.max(...cob);
  let ceu: string;
  if (min === max) ceu = `Céu ${NOME_COBERTURA[min]}`;
  else if (min >= 2) ceu = `Céu ${NOME_COBERTURA[min]} a ${NOME_COBERTURA[max]}`;
  else ceu = `Céu variando de ${NOME_COBERTURA[min].replace("com ", "")} a ${NOME_COBERTURA[max]}`;
  const chuva = previsoes.filter((p) => temChuva(p.icone)).map((p) => p.regiao);
  const raios = previsoes.filter((p) => temRaio(p.icone)).map((p) => p.regiao);
  if (!chuva.length) return `${ceu}, sem previsão de chuva significativa.`;
  let f = `${ceu}, com previsão de chuva ${ondePt(chuva)}`;
  if (raios.length) f += raios.length === chuva.length ? ", acompanhada de raios" : `, com raios ${ondePt(raios)}`;
  return `${f}.`;
}

const comPonto = (t: string) => {
  const s = t.trim().replace(/\s+/g, " ");
  return s && !/[.!?]$/.test(s) ? `${s}.` : s;
};

export type PropostaTexto = { texto: string; origem: "comentario" | "imagens" | "vazio"; avisos: string[] };

/** Texto geral proposto: o comentário mais usado entre as REDECs (se pelo menos metade concorda) ou, sem isso, a frase montada com as
 * imagens do clima; mais a frase do vento. Sempre editável. */
export function proporTextoGeral(previsoes: Previsao[]): PropostaTexto {
  const avisos: string[] = [];
  if (!previsoes.length) return { texto: "", origem: "vazio", avisos: ["Lance a previsão de pelo menos uma REDEC para receber uma proposta."] };
  if (previsoes.length < ORDEM_TEXTO.length) avisos.push(`Só ${previsoes.length} de ${ORDEM_TEXTO.length} REDECs foram lançadas: a proposta é parcial.`);
  const cont = new Map<string, number>();
  for (const p of previsoes) {
    const c = comPonto(p.comentario ?? "");
    if (c) cont.set(c, (cont.get(c) ?? 0) + 1);
  }
  const [melhor, n] = [...cont.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  let base = "";
  let origem: PropostaTexto["origem"] = "imagens";
  if (melhor && n * 2 >= previsoes.length) {
    base = melhor;
    origem = "comentario";
    const diferentes = previsoes.length - n;
    if (diferentes > 0) avisos.push(`${diferentes} REDEC${diferentes > 1 ? "s têm" : " tem"} comentário diferente do usado: confira se o texto vale para o estado todo.`);
  } else {
    base = fraseCeuEChuva(previsoes);
    if (cont.size > 1) avisos.push("Os comentários das REDECs diferem entre si: a proposta usa as imagens do clima.");
  }
  const vento = /\bventos? (fracos?|moderados?|fortes?)/i.test(base) ? "" : fraseVento(previsoes);
  return { texto: [base, vento].filter(Boolean).join(" ").trim(), origem, avisos };
}

// ---------------------------------------------------------------- validações ao salvar
export type NovaPrevisao = {
  data: string;
  regiao: string;
  temperatura_maxima: number;
  temperatura_minima: number;
  umidade_maxima: number;
  umidade_minima: number;
  icone: string;
  comentario: string;
};
export type AvisoValidacao = { codigo: string; texto: string };

const mediana = (v: number[]): number => {
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const somaDiasIso = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Diferença da região para a mediana das outras REDECs no mesmo dia, descontando o "jeito" habitual da região (mediana dessa mesma
 * diferença nos dias anteriores — a Serrana, por exemplo, é sempre mais fria). Sem histórico, usa o limiar absoluto. */
function desvioPeloPadrao(
  campo: "temperatura_maxima" | "temperatura_minima" | "umidade_minima",
  nova: NovaPrevisao,
  doDia: Previsao[],
  historico: Previsao[],
  limiarComHistorico: number,
  limiarSemHistorico: number,
): { desvio: number; mediana: number; habitual: number | null; limiar: number } | null {
  const outras = doDia.filter((p) => p.regiao !== nova.regiao);
  if (outras.length < 4) return null;
  const med = mediana(outras.map((p) => Number(p[campo])));
  const dev = Number(nova[campo]) - med;
  const dias = new Map<string, Previsao[]>();
  for (const p of historico) if (p.data < nova.data) dias.set(p.data, [...(dias.get(p.data) ?? []), p]);
  const offsets: number[] = [];
  for (const lista of dias.values()) {
    const propria = lista.find((p) => p.regiao === nova.regiao);
    const demais = lista.filter((p) => p.regiao !== nova.regiao);
    if (propria && demais.length >= 4) offsets.push(Number(propria[campo]) - mediana(demais.map((p) => Number(p[campo]))));
  }
  if (offsets.length >= 4) {
    const habitual = mediana(offsets);
    return { desvio: dev - habitual, mediana: med, habitual, limiar: limiarComHistorico };
  }
  return { desvio: dev, mediana: med, habitual: null, limiar: limiarSemHistorico };
}

const RE_CHUVA = /chuva|pancada|garoa|chuvisco|temporal|aguaceiro/i;
const RE_SEM_CHUVA = /(sem|não há|nao ha|sem previsão de|sem previsao de)\s+(previs[aã]o de\s+)?chuv/i;

/** Conferências ao salvar. Não impedem de salvar: o operador vê a lista e confirma ("Salvar mesmo assim"). Erros graves (mínima maior que
 * a máxima, umidade fora de 0–100) continuam bloqueando no formulário. `hojeIso` = data de hoje (fuso de Brasília). */
export function avisosDaPrevisao(nova: NovaPrevisao, doDia: Previsao[], historico: Previsao[], hojeIso: string): AvisoValidacao[] {
  const out: AvisoValidacao[] = [];
  const nome = bonito(nova.regiao);

  const tmin = desvioPeloPadrao("temperatura_minima", nova, doDia, historico, 4, 7);
  if (tmin && Math.abs(tmin.desvio) > tmin.limiar) {
    const sentido = tmin.desvio > 0 ? "acima" : "abaixo";
    out.push({
      codigo: "tmin_fora_do_padrao",
      texto: `Mínima de ${nova.temperatura_minima} °C em ${nome} está ${fmt(Math.abs(tmin.desvio))} °C ${sentido} do padrão: as outras REDECs lançadas têm mediana de ${fmt(tmin.mediana)} °C${tmin.habitual !== null ? ` e ${nome} costuma ficar ${fmt(Math.abs(tmin.habitual))} °C ${tmin.habitual >= 0 ? "acima" : "abaixo"} dessa mediana` : ""}.`,
    });
  }
  const tmax = desvioPeloPadrao("temperatura_maxima", nova, doDia, historico, 4, 7);
  if (tmax && Math.abs(tmax.desvio) > tmax.limiar) {
    const sentido = tmax.desvio > 0 ? "acima" : "abaixo";
    out.push({
      codigo: "tmax_fora_do_padrao",
      texto: `Máxima de ${nova.temperatura_maxima} °C em ${nome} está ${fmt(Math.abs(tmax.desvio))} °C ${sentido} do padrão: as outras REDECs lançadas têm mediana de ${fmt(tmax.mediana)} °C${tmax.habitual !== null ? ` e ${nome} costuma ficar ${fmt(Math.abs(tmax.habitual))} °C ${tmax.habitual >= 0 ? "acima" : "abaixo"} dessa mediana` : ""}.`,
    });
  }
  const umin = desvioPeloPadrao("umidade_minima", nova, doDia, historico, 20, 25);
  if (umin && Math.abs(umin.desvio) > umin.limiar) {
    out.push({ codigo: "umin_fora_do_padrao", texto: `Umidade mínima de ${nova.umidade_minima}% em ${nome} está ${fmt(Math.abs(umin.desvio))} pontos ${umin.desvio > 0 ? "acima" : "abaixo"} do padrão (mediana das outras REDECs: ${fmt(umin.mediana)}%).` });
  }

  const amplitude = nova.temperatura_maxima - nova.temperatura_minima;
  if (amplitude < 3) out.push({ codigo: "amplitude_pequena", texto: `Máxima e mínima quase iguais (diferença de ${amplitude} °C). Confira os dois valores.` });
  if (amplitude > 18) out.push({ codigo: "amplitude_grande", texto: `Diferença de ${amplitude} °C entre máxima e mínima é incomum. Confira os dois valores.` });

  const ontem = historico.find((p) => p.regiao === nova.regiao && p.data === somaDiasIso(nova.data, -1));
  if (ontem) {
    const dmax = nova.temperatura_maxima - ontem.temperatura_maxima;
    const dmin = nova.temperatura_minima - ontem.temperatura_minima;
    if (Math.abs(dmax) > 8) out.push({ codigo: "salto_tmax", texto: `Máxima ${dmax > 0 ? "subiu" : "caiu"} ${Math.abs(dmax)} °C em relação a ontem (${ontem.temperatura_maxima} → ${nova.temperatura_maxima} °C).` });
    if (Math.abs(dmin) > 8) out.push({ codigo: "salto_tmin", texto: `Mínima ${dmin > 0 ? "subiu" : "caiu"} ${Math.abs(dmin)} °C em relação a ontem (${ontem.temperatura_minima} → ${nova.temperatura_minima} °C).` });
  }

  const c = nova.comentario ?? "";
  if (c) {
    const diz = RE_CHUVA.test(c) && !RE_SEM_CHUVA.test(c);
    if (diz && !temChuva(nova.icone)) out.push({ codigo: "icone_sem_chuva", texto: "O comentário fala em chuva, mas a imagem do clima escolhida não tem chuva." });
    if (RE_SEM_CHUVA.test(c) && temChuva(nova.icone)) out.push({ codigo: "icone_com_chuva", texto: "O comentário diz que não há chuva, mas a imagem do clima escolhida tem chuva." });
    if (/\braios?\b/i.test(c) && !/não|sem/i.test(c) && temChuva(nova.icone) && !temRaio(nova.icone)) out.push({ codigo: "raios_sem_icone", texto: "O comentário cita raios, mas a imagem do clima não tem raios." });
  }

  if (nova.data < hojeIso) out.push({ codigo: "data_passada", texto: "A data é anterior a hoje. Confirme se é uma correção de previsão antiga." });
  if (nova.data > somaDiasIso(hojeIso, 7)) out.push({ codigo: "data_distante", texto: "A data está a mais de 7 dias de hoje. Confirme o dia." });
  return out;
}
