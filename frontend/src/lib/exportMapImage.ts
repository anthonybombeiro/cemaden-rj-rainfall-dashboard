/** Exportar um dos 4 mapas de risco como imagem PNG (baixar ou copiar pra
 * área de transferência) — pedido do usuário (2026-09-24), com layout de
 * referência anexado (título "Monitoramento do Risco X", legenda, "Fonte:
 * CEMADEN-RJ" + horário, logo da Defesa Civil no canto).
 *
 * Estratégia: reaproveita o `<svg>` já renderizado (mapa colorido de
 * verdade, com zoom/seleção já aplicados) em vez de redesenhar os
 * municípios do zero — clona ele pra dentro de um SVG maior com
 * cabeçalho/legenda/rodapé/logo ao redor, serializa esse SVG combinado e
 * rasteriza num <canvas> (via uma <img> temporária) pra virar PNG. Tudo
 * client-side, sem lib externa — precisa funcionar só com HTML/CSS/JS
 * estático no HostGator. */

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
  const mapMarkup = new XMLSerializer().serializeToString(svgEl);

  const PAD = 24;
  const HEADER_H = 60;
  const LEGEND_H = 44;
  const FOOTER_H = 60;
  const W = mapW + PAD * 2;
  const H = HEADER_H + mapH + LEGEND_H + FOOTER_H;

  const legendaSvg = legendaItens
    .map((it, i) => {
      const x = PAD + i * 130;
      const y = HEADER_H + mapH + 14;
      return `<rect x="${x}" y="${y}" width="14" height="14" rx="2" fill="${it.cor}" stroke="#00000022"/>` +
        `<text x="${x + 20}" y="${y + 11}" font-size="13" fill="#374151" font-family="Arial, Helvetica, sans-serif">${escapeXml(it.rotulo)}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <text x="${PAD}" y="38" font-size="22" font-weight="bold" fill="#111827">${escapeXml(titulo)}</text>
    <line x1="0" y1="${HEADER_H - 8}" x2="${W}" y2="${HEADER_H - 8}" stroke="#e5e7eb" stroke-width="1"/>
    <g transform="translate(${PAD}, ${HEADER_H})">${mapMarkup}</g>
    ${legendaSvg}
    <line x1="0" y1="${HEADER_H + mapH + LEGEND_H}" x2="${W}" y2="${HEADER_H + mapH + LEGEND_H}" stroke="#e5e7eb" stroke-width="1"/>
    <text x="${PAD}" y="${HEADER_H + mapH + LEGEND_H + 26}" font-size="12" fill="#6b7280">${escapeXml(atualizadoTexto)} — Fonte: CEMADEN-RJ</text>
    <image href="${logoDataUrl}" x="${W - PAD - 46}" y="${HEADER_H + mapH + LEGEND_H + 6}" width="46" height="46"/>
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
