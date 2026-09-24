/** Exportar um dos mapas de risco como imagem PNG (baixar ou copiar pra
 * área de transferência) — pedido do usuário (2026-09-24), com layout de
 * referência anexado (logo grande no topo à esquerda, título centralizado,
 * mapa, rodapé com "Atualizado"/"Fonte" nas pontas, legenda embaixo de
 * tudo). A imagem final é sempre quadrada (1:1) — pedido explícito do
 * usuário — então o conteúdo (que normalmente é mais alto que largo, por
 * causa do cabeçalho/rodapé/legenda em volta de um mapa ~640x560) fica
 * centralizado dentro do quadrado, sobrando fundo branco nas laterais.
 *
 * Estratégia: reaproveita o `<svg>` já renderizado (mapa colorido de
 * verdade, com zoom/seleção já aplicados) em vez de redesenhar os
 * municípios do zero — clona ele (com width/height explícitos, senão um
 * <svg> aninhado sem isso herda 100% do container e o mapa vaza/corta) pra
 * dentro de um SVG maior com cabeçalho/legenda/rodapé/logo ao redor,
 * serializa esse SVG combinado e rasteriza num <canvas> (via uma <img>
 * temporária) pra virar PNG. Tudo client-side, sem lib externa — precisa
 * funcionar só com HTML/CSS/JS estático no HostGator. */

export async function loadImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function escapeXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildRiskMapExportSvg({
  svgEl,
  titulo,
  legendaItens,
  atualizadoTexto,
  logoDataUrl,
}: {
  svgEl: SVGSVGElement;
  titulo: string;
  legendaItens: { cor: string; rotulo: string }[];
  atualizadoTexto: string;
  logoDataUrl: string;
}): string {
  const viewBox = svgEl.getAttribute("viewBox") || "0 0 640 560";
  const [, , mapWStr, mapHStr] = viewBox.split(/\s+/);
  const mapW = Number(mapWStr) || 640;
  const mapH = Number(mapHStr) || 560;

  // width/height EXPLÍCITOS no clone: um <svg> aninhado sem esses
  // atributos herda 100% do viewport do <svg> pai (aqui, o quadrado
  // inteiro) — foi isso que cortava o mapa no canto direito antes.
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(mapW));
  clone.setAttribute("height", String(mapH));
  clone.removeAttribute("class");
  const mapMarkup = new XMLSerializer().serializeToString(clone);

  const PAD = 20;
  const TOP_PAD = 18;
  const LOGO_SIZE = 72;
  const HEADER_H = 84;
  const MAP_TOP_GAP = 10;
  const FOOTER_GAP = 16;
  const FOOTER_TEXT_H = 20;
  const LEGEND_GAP = 12;
  const LEGEND_H = 20;
  const BOTTOM_PAD = 18;

  const contentW = mapW + PAD * 2;

  const headerTop = TOP_PAD;
  const mapTop = headerTop + HEADER_H + MAP_TOP_GAP;
  const footerTextTop = mapTop + mapH + FOOTER_GAP;
  const footerBaselineY = footerTextTop + 14;
  const legendTop = footerTextTop + FOOTER_TEXT_H + LEGEND_GAP;
  const contentH = legendTop + LEGEND_H + BOTTOM_PAD;

  // Imagem final sempre 1:1 — pedido do usuário. O conteúdo real (mapW x
  // contentH) quase sempre é mais alto e estreito que quadrado, então o
  // lado do quadrado é o maior dos dois e o conteúdo fica centralizado.
  const S = Math.max(contentW, contentH);
  const offsetX = (S - contentW) / 2;
  const offsetY = (S - contentH) / 2;

  const logoY = headerTop + (HEADER_H - LOGO_SIZE) / 2;
  const titleBaselineY = headerTop + HEADER_H / 2 + 9;

  // Larguras de legenda estimadas (sem medir texto de verdade — é só uma
  // string SVG, não dá pra usar canvas.measureText aqui) pra poder
  // centralizar a fileira toda horizontalmente.
  const LEGEND_ITEM_GAP = 22;
  const legendWidths = legendaItens.map((it) => 14 + 6 + it.rotulo.length * 7);
  const legendTotalWidth =
    legendWidths.reduce((a, b) => a + b, 0) + LEGEND_ITEM_GAP * Math.max(0, legendaItens.length - 1);
  let legendX = (contentW - legendTotalWidth) / 2;
  const legendSvg = legendaItens
    .map((it, i) => {
      const x = legendX;
      const w = legendWidths[i];
      const svg =
        `<rect x="${x}" y="${legendTop}" width="14" height="14" rx="2" fill="${it.cor}" stroke="#00000022"/>` +
        `<text x="${x + 20}" y="${legendTop + 11}" font-size="13" fill="#374151" font-family="Arial, Helvetica, sans-serif">${escapeXml(it.rotulo)}</text>`;
      legendX += w + LEGEND_ITEM_GAP;
      return svg;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" font-family="Arial, Helvetica, sans-serif">
    <rect width="${S}" height="${S}" fill="#ffffff"/>
    <g transform="translate(${offsetX}, ${offsetY})">
      <image href="${logoDataUrl}" x="${PAD}" y="${logoY}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"/>
      <text x="${contentW / 2}" y="${titleBaselineY}" font-size="24" font-weight="bold" fill="#111827" text-anchor="middle">${escapeXml(titulo)}</text>
      <g transform="translate(${PAD}, ${mapTop})">${mapMarkup}</g>
      <text x="${PAD}" y="${footerBaselineY}" font-size="13" fill="#4b5563" text-anchor="start">${escapeXml(atualizadoTexto)}</text>
      <text x="${contentW - PAD}" y="${footerBaselineY}" font-size="13" fill="#4b5563" text-anchor="end">Fonte: CEMADEN-RJ</text>
      ${legendSvg}
    </g>
  </svg>`;
}

export async function svgStringToPngBlob(svgString: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar o SVG combinado"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D não suportado");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob falhou"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
