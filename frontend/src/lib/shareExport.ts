/** Tipos e utilitários pro recurso "Compartilhar" (2026-09-29, pedido do
 * usuário: "gerar tabelas exportáveis para Telegram e WhatsApp, no modelo
 * print ou no modelo texto"). Cada tabela monta seu próprio `ShareData`
 * (colunas + linhas JÁ curadas — poucas colunas, top N pela ordenação
 * atual) e entrega pro <ShareModal> genérico, que sabe gerar a imagem
 * (html-to-image sobre o card renderizado) e o texto (monoespaçado,
 * pronto pra colar). Ver ShareModal.tsx. */

export type ShareColuna = { chave: string; rotulo: string; alinhamento?: "left" | "right" | "center" };
export type ShareLinha = {
  valores: Record<string, string>;
  /** Cor de fundo da linha (mesma lógica das tabelas, ex: faixa de chuva/vento/gatilho). */
  bg?: string;
  text?: string;
};
export type ShareData = {
  titulo: string;
  /** Ex: "22/09/2026 17:23:15" — já formatado, fuso America/Sao_Paulo. */
  dataHora: string;
  colunas: ShareColuna[];
  linhas: ShareLinha[];
  legenda?: { cor: string; rotulo: string }[];
  /** Texto de rodapé, ex: "Fonte: INMET, REDEMET, Wunderground". */
  fonteTexto: string;
  /** Nome de arquivo sugerido (sem extensão) pra imagem/texto baixados. */
  nomeArquivo: string;
};

/** Bloco de texto monoespaçado com colunas alinhadas por padding — Telegram
 * e WhatsApp renderizam texto entre ``` (Telegram) ou ``` (WhatsApp usa
 * ``` também pra monoespaçado) como fonte de largura fixa, então colunas
 * alinhadas por espaço ficam legíveis nos dois. */
export function gerarTextoCompartilhavel(data: ShareData): string {
  const larguras = data.colunas.map((c) =>
    Math.max(c.rotulo.length, ...data.linhas.map((l) => (l.valores[c.chave] ?? "").length)),
  );
  const pad = (texto: string, largura: number, alinhamento: ShareColuna["alinhamento"] = "left") => {
    const falta = Math.max(0, largura - texto.length);
    if (alinhamento === "right") return " ".repeat(falta) + texto;
    if (alinhamento === "center") {
      const esq = Math.floor(falta / 2);
      return " ".repeat(esq) + texto + " ".repeat(falta - esq);
    }
    return texto + " ".repeat(falta);
  };

  const linhaCabecalho = data.colunas.map((c, i) => pad(c.rotulo, larguras[i], c.alinhamento)).join(" | ");
  const separador = larguras.map((l) => "-".repeat(l)).join("-+-");
  const linhasTexto = data.linhas.map((l) =>
    data.colunas.map((c, i) => pad(l.valores[c.chave] ?? "", larguras[i], c.alinhamento)).join(" | "),
  );

  return [
    `*${data.titulo}*`,
    data.dataHora,
    "```",
    linhaCabecalho,
    separador,
    ...linhasTexto,
    "```",
    data.fonteTexto,
  ].join("\n");
}

export async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
