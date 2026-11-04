/** Exportações de relatórios (04/11/2026): arquivo de texto/MD, planilha XLSX e imagem PNG de um elemento da tela. Tudo no navegador. */

export function baixarArquivo(nome: string, conteudo: Blob | string, tipo = "text/plain;charset=utf-8") {
  const blob = typeof conteudo === "string" ? new Blob([conteudo], { type: tipo }) : conteudo;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type AbaXlsx = { nome: string; linhas: (string | number | null)[][]; larguras?: number[] };

/** Gera um .xlsx com uma aba por item (o pacote da planilha só é carregado quando o botão é usado). */
export async function exportarXlsx(arquivo: string, abas: AbaXlsx[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const aba of abas) {
    const ws = XLSX.utils.aoa_to_sheet(aba.linhas);
    if (aba.larguras) ws["!cols"] = aba.larguras.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, aba.nome.slice(0, 31));
  }
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  baixarArquivo(arquivo, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

/** Imagem PNG (2×) do elemento, com fundo branco. */
export async function exportarPng(el: HTMLElement, arquivo: string) {
  const { toPng } = await import("html-to-image");
  const url = await toPng(el, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
}
