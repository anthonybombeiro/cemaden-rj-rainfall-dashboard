"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RISK_ALERT_TIPO_FILE_CODE, RiskAlertTipo } from "@/lib/api";
import { buildRiskMapExportSvg, loadImageAsDataUrl, svgStringToPngBlob } from "@/lib/exportMapImage";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Botão "Exportar" com dropdown (Baixar PNG / Copiar imagem) — pedido do
 * usuário (2026-09-24), reusado em todas as abas que têm um mapa de risco
 * (não só a "Visão Geral"): com uma REDEC/município selecionado, exporta o
 * mapa já com o zoom/seleção aplicados. Gera a imagem só na hora do clique
 * (não fica recalculando à toa a cada render). */
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
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const logoCacheRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent | TouchEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [open]);

  const gerarPng = async (): Promise<Blob> => {
    const svgEl = getSvgElement();
    if (!svgEl) throw new Error("Mapa ainda não carregou");
    if (!logoCacheRef.current) {
      logoCacheRef.current = await loadImageAsDataUrl("/logo-defesa-civil.png");
    }
    const svgString = buildRiskMapExportSvg({
      svgEl,
      titulo: `Monitoramento do ${titulo}`,
      legendaItens,
      atualizadoTexto,
      logoDataUrl: logoCacheRef.current,
    });
    return svgStringToPngBlob(svgString);
  };

  // Formato pedido pelo usuário: cemaden-rj-tipo-ano-mes-dia-hora-min
  // (tipo = hidro/geo/meteoro/fogo, não o rótulo completo).
  const nomeArquivo = () => {
    const agora = new Date();
    const data = [
      agora.getFullYear(),
      pad2(agora.getMonth() + 1),
      pad2(agora.getDate()),
      pad2(agora.getHours()),
      pad2(agora.getMinutes()),
    ].join("-");
    return `cemaden-rj-${RISK_ALERT_TIPO_FILE_CODE[tipo]}-${data}.png`;
  };

  const baixar = async () => {
    setBusy(true);
    setErro(null);
    try {
      const blob = await gerarPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo();
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao gerar imagem");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const copiar = async () => {
    setBusy(true);
    setErro(null);
    try {
      const blob = await gerarPng();
      if (!("clipboard" in navigator) || !("write" in navigator.clipboard)) {
        throw new Error("Este navegador não suporta copiar imagem");
      }
      // eslint-disable-next-line no-undef
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao copiar imagem");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="Exportar este mapa como imagem"
        className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        <Camera size={12} />
        {busy ? "…" : "Exportar"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-36 rounded border border-gray-200 bg-white text-xs shadow-lg">
          <button type="button" onClick={baixar} className="block w-full px-2 py-1.5 text-left hover:bg-gray-50">
            ⬇ Baixar PNG
          </button>
          <button type="button" onClick={copiar} className="block w-full px-2 py-1.5 text-left hover:bg-gray-50">
            📋 Copiar imagem
          </button>
        </div>
      )}
      {erro && <div className="absolute right-0 z-30 mt-1 w-44 rounded bg-red-50 p-1.5 text-[10px] text-red-600 shadow">{erro}</div>}
    </div>
  );
}
