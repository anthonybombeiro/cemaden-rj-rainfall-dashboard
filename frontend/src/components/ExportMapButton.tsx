"use client";

import { Camera } from "lucide-react";
import { useState } from "react";

import ShareModal from "@/components/ShareModal";
import { RISK_ALERT_TIPO_FILE_CODE, RiskAlertTipo } from "@/lib/api";
import { ShareData } from "@/lib/shareExport";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Botão "Exportar" dos mapas de risco: abre o mesmo modal "Compartilhar" das demais artes (informativo, recomendação, tabelas),
 * com cabeçalho azul e logos, mapa no corpo, legenda e rodapé padrão; dali baixa/copia a imagem, copia o texto ou compartilha.
 * O mapa é copiado na hora do clique, já com o zoom/seleção de REDEC ou município aplicados. */
export default function ExportMapButton({
  getSvgElement,
  titulo,
  tipo,
  legendaItens,
  atualizadoTexto,
}: {
  getSvgElement: () => SVGSVGElement | null;
  titulo: string;
  /** Usado só pro nome do arquivo baixado (código curto: hidro/geo/meteoro/fogo). */
  tipo: RiskAlertTipo;
  legendaItens: { cor: string; rotulo: string }[];
  atualizadoTexto: string;
}) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = () => {
    const svgEl = getSvgElement();
    if (!svgEl) { setErro("Mapa ainda não carregou"); return; }
    const copia = svgEl.cloneNode(true) as SVGSVGElement;
    copia.removeAttribute("class");
    copia.setAttribute("width", "100%");
    copia.setAttribute("height", "100%");
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.setAttribute("style", "display:block;background:#fff");
    setErro(null);
    setSvgHtml(copia.outerHTML);
  };

  const dados: ShareData | null = svgHtml === null ? null : (() => {
    const agora = new Date();
    const stamp = [agora.getFullYear(), pad2(agora.getMonth() + 1), pad2(agora.getDate()), pad2(agora.getHours()), pad2(agora.getMinutes())].join("-");
    const nomeTitulo = `Monitoramento do ${titulo}`;
    const dataHora = atualizadoTexto.replace(/^Atualizado em\s*/i, "");
    return {
      titulo: nomeTitulo,
      dataHora,
      rotuloData: "Atualizado em",
      colunas: [],
      linhas: [],
      fonteTexto: "Fonte: CEMADEN-RJ - SEDEC",
      nomeArquivo: `cemaden-rj-${RISK_ALERT_TIPO_FILE_CODE[tipo]}-${stamp}`,
      proporcoes: ["1:1", "4:3"],
      semRolagem: true,
      corpoPor: () => (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1" dangerouslySetInnerHTML={{ __html: svgHtml }} />
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-1 pt-2 text-[15px] text-gray-700">
            {legendaItens.map((l) => (
              <span key={l.rotulo} className="flex items-center gap-1.5">
                <span className="inline-block h-4 w-4 rounded-sm border border-black/10" style={{ background: l.cor }} />
                {l.rotulo}
              </span>
            ))}
          </div>
        </div>
      ),
      textoPronto: `*${nomeTitulo}*
${atualizadoTexto}`,
    };
  })();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={abrir}
        title="Gerar imagem deste mapa para compartilhar"
        className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
      >
        <Camera size={12} />
        Exportar
      </button>
      {erro && <div className="absolute right-0 z-30 mt-1 w-44 rounded bg-red-50 p-1.5 text-[10px] text-red-600 shadow">{erro}</div>}
      {dados && <ShareModal data={dados} onClose={() => setSvgHtml(null)} />}
    </div>
  );
}
