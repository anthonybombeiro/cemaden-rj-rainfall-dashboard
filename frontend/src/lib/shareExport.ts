/** Tipos e utilitários pro recurso "Compartilhar" (2026-09-29, pedido do
 * usuário: "gerar tabelas exportáveis para Telegram e WhatsApp, no modelo
 * print ou no modelo texto"). Cada tabela monta seu próprio `ShareData`
 * (colunas + linhas JÁ curadas — poucas colunas, top N pela ordenação
 * atual) e entrega pro <ShareModal> genérico, que sabe gerar a imagem
 * (html-to-image sobre o card renderizado) e o texto (monoespaçado,
 * pronto pra colar). Ver ShareModal.tsx. */

export type ShareColuna = {
  chave: string;
  rotulo: string;
  alinhamento?: "left" | "right" | "center";
  /** Largura da coluna na IMAGEM, em % da tabela (2026-10-01, pedido do
   * usuário: município/estação legíveis, o resto mais compacto). Sem
   * isso, o ShareModal divide a largura igualmente entre as colunas. */
  larguraPct?: number;
};
export type ShareLinha = {
  valores: Record<string, string>;
  /** Cor de fundo da linha (mesma lógica das tabelas, ex: faixa de chuva/vento/gatilho). */
  bg?: string;
  text?: string;
};
/** Um grupo pro texto WhatsApp/Telegram agrupado (ex: faixas de rajada —
 * Muito forte/Forte/Moderada/Fraca/Atrasada). `chave` tem que bater com o
 * valor de `linhas[i].valores[agruparPor.chave]`. */
export type ShareGrupo = { chave: string; rotulo: string; emoji: string };
export type ShareData = {
  titulo: string;
  /** Ex: "22/09/2026 17:23:15" — já formatado, fuso America/Sao_Paulo. Pro
   * texto/imagem — usar o horário real do DADO (última leitura), não o
   * horário em que o usuário clicou em "Compartilhar" (2026-10-01, pedido
   * do usuário: a legenda não pode mostrar "hora do envio"). */
  dataHora: string;
  colunas: ShareColuna[];
  linhas: ShareLinha[];
  legenda?: { cor: string; rotulo: string }[];
  /** Texto de rodapé, ex: "Fonte: INMET, REDEMET, Wunderground". */
  fonteTexto: string;
  /** Nome de arquivo sugerido (sem extensão) pra imagem/texto baixados. */
  nomeArquivo: string;
  /** Formato de texto WhatsApp-nativo (2026-10-01, pedido do usuário: o
   * bloco monoespaçado "fica horrível" no celular — quebra linha e perde o
   * alinhamento). Quando definido, `gerarTextoCompartilhavel` agrupa as
   * linhas por `valores[chave]`, com um cabeçalho emoji por grupo, e cada
   * linha vira uma entrada compacta (sem tabela) usando só as colunas de
   * `colunasTexto` (se não vier, usa as mesmas de `colunas`). Sem isso, cai
   * no formato antigo (tabela monoespaçada entre ```), ainda usado pelas
   * tabelas que não migraram pro formato novo. */
  agruparPor?: { chave: string; grupos: ShareGrupo[] };
  colunasTexto?: ShareColuna[];
  /** Limita quantas das `linhas` (já ordenadas) entram no texto agrupado
   * (2026-10-01, pedido do usuário: a IMAGEM pode ter quantas linhas
   * couberem bem no card — mais do que cabe de forma legível num texto de
   * WhatsApp/Telegram). Sem isso, usa todas as `linhas`. Não afeta a
   * imagem/tabela, só o texto. */
  limiteTexto?: number;
  /** Compartilhar um GRÁFICO (07/10/2026): quando vem, o card mostra este conteúdo no lugar da
   * tabela e `textoPronto` é o texto para copiar/enviar (`gerarTextoCompartilhavel` é ignorado). */
  corpo?: import("react").ReactNode;
  textoPronto?: string;
};

/** Texto WhatsApp-nativo: negrito (*texto*), emojis de círculo por grupo
 * (mesma cor da legenda, sem precisar de imagem) e uma linha compacta por
 * estação — pensado pra ser lido direto no celular, sem monoespaçado. */
function gerarTextoAgrupado(data: ShareData): string {
  const { chave, grupos } = data.agruparPor!;
  const colunas = data.colunasTexto ?? data.colunas;
  const linhas = [`*${data.titulo}*`, `🕐 Dados de: ${data.dataHora}`, ""];
  const linhasFonte = data.limiteTexto ? data.linhas.slice(0, data.limiteTexto) : data.linhas;

  for (const grupo of grupos) {
    const doGrupo = linhasFonte.filter((l) => l.valores[chave] === grupo.chave);
    if (doGrupo.length === 0) continue;
    linhas.push(`${grupo.emoji} *${grupo.rotulo}*`);
    for (const l of doGrupo) {
      const partes = colunas.map((c) => l.valores[c.chave] ?? "").filter(Boolean);
      // Primeira coluna = destaque (ex: município), resto em itálico — só
      // a ÚLTIMA (ex: rajada) fica em negrito, pra chamar atenção no scan
      // rápido do grupo (todo mundo já sabe a faixa pelo cabeçalho acima).
      if (partes.length === 0) continue;
      const [primeira, ...resto] = partes;
      const destaque = resto.pop();
      const meio = resto.length > 0 ? ` (${resto.join(", ")})` : "";
      linhas.push(`▪️ *${primeira}*${meio}${destaque ? ` — ${destaque}` : ""}`);
    }
    linhas.push("");
  }

  linhas.push(`📡 ${data.fonteTexto}`);
  return linhas.join("\n");
}

/** Bloco de texto monoespaçado com colunas alinhadas por padding — formato
 * antigo, mantido pras tabelas que ainda não migraram pro agrupado (ver
 * `agruparPor` acima). */
function gerarTextoTabela(data: ShareData): string {
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

export function gerarTextoCompartilhavel(data: ShareData): string {
  if (data.textoPronto) return data.textoPronto;
  return data.agruparPor ? gerarTextoAgrupado(data) : gerarTextoTabela(data);
}

export async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Copia a IMAGEM (PNG) pra área de transferência (pedido do usuário,
 * 2026-10-01: colar direto no WhatsApp Web/Telegram Desktop com Ctrl+V,
 * sem precisar baixar e anexar o arquivo manualmente). Suporte: Chrome/Edge
 * desktop e Android de boa; Firefox e Safari antigo não implementam
 * `ClipboardItem` com imagem — `false` aí, UI cai pro "Baixar imagem". */
export async function copiarImagemParaAreaDeTransferencia(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined") return false;
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Mobile de verdade (toque, não só viewport estreito) — a Web Share API
 * com arquivo EXISTE em alguns navegadores desktop (Edge/Chrome), mas não
 * tem pra onde mandar (não abre o WhatsApp Desktop/Telegram Desktop como
 * "app" de destino), então o botão só confunde lá (pedido do usuário,
 * 2026-10-01: "não funciona corretamente no desktop"). */
export function ehDispositivoMovel(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
