"use client";

import { toPng } from "html-to-image";
import { useRef, useState } from "react";

import { copiarParaAreaDeTransferencia, gerarTextoCompartilhavel, ShareData } from "@/lib/shareExport";

/** Modal genérico de "Compartilhar" (pedido do usuário, 2026-09-29):
 * mostra o card já no layout final (logo+título+data, tabela curada,
 * legenda, rodapé — mesmo espírito do print "Monitoramento de vento" que
 * o usuário mandou de referência) e oferece as 2 saídas pedidas:
 * "modelo print" (imagem PNG via html-to-image, ou share nativo com
 * arquivo quando o navegador suporta — Android/iOS abrem direto o
 * WhatsApp/Telegram na lista de apps) e "modelo texto" (bloco
 * monoespaçado pronto pra colar, com botão de copiar e share nativo de
 * texto). Cada tabela só monta o `ShareData` (colunas/linhas já
 * curadas) — o modal em si não sabe nada de sirene/vento/chuva. */
export default function ShareModal({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const texto = gerarTextoCompartilhavel(data);

  const gerarPng = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    const dataUrl = await toPng(cardRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
    const res = await fetch(dataUrl);
    return res.blob();
  };

  const baixarImagem = async () => {
    setErro(null);
    setGerandoImagem(true);
    try {
      const blob = await gerarPng();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.nomeArquivo}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar imagem");
    } finally {
      setGerandoImagem(false);
    }
  };

  // Web Share API com arquivo — onde suportado (Chrome Android, Safari iOS),
  // abre direto a folha de compartilhamento do sistema com WhatsApp/Telegram
  // já na lista, sem precisar baixar e anexar manualmente.
  const compartilharImagemNativo = async () => {
    setErro(null);
    setGerandoImagem(true);
    try {
      const blob = await gerarPng();
      if (!blob) return;
      const arquivo = new File([blob], `${data.nomeArquivo}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: data.titulo });
      } else {
        setErro("Compartilhamento direto não suportado neste navegador — use \"Baixar imagem\".");
      }
    } catch (e) {
      // Usuário cancelando o share nativo também cai aqui (AbortError) — não é erro de verdade.
      if (e instanceof Error && e.name !== "AbortError") setErro(e.message);
    } finally {
      setGerandoImagem(false);
    }
  };

  const copiarTexto = async () => {
    const ok = await copiarParaAreaDeTransferencia(texto);
    setCopiado(ok);
    if (ok) setTimeout(() => setCopiado(false), 2000);
    else setErro("Não foi possível copiar — copie manualmente o texto abaixo.");
  };

  const compartilharTextoNativo = async () => {
    setErro(null);
    try {
      if (navigator.share) await navigator.share({ text: texto, title: data.titulo });
      else setErro("Compartilhamento direto não suportado neste navegador — use \"Copiar texto\".");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setErro(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-800">Compartilhar</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {/* Card no layout final — é ESSE elemento que vira a imagem. */}
          <div ref={cardRef} className="mx-auto w-full max-w-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900">{data.titulo}</h3>
                <p className="text-xs text-gray-500">Data - Hora: {data.dataHora}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <img src="/logo-defesa-civil.png" alt="" className="h-9 w-auto" />
                <img src="/logo-cemadenrj.png" alt="" className="h-9 w-auto" />
              </div>
            </div>

            <table className="mt-3 w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {data.colunas.map((c) => (
                    <th
                      key={c.chave}
                      className="border border-gray-300 bg-gray-100 px-1.5 py-1 text-left font-bold uppercase tracking-wide text-gray-600"
                      style={{ textAlign: c.alinhamento ?? "left" }}
                    >
                      {c.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((l, i) => (
                  <tr key={i}>
                    {data.colunas.map((c) => (
                      <td
                        key={c.chave}
                        className="border border-gray-200 px-1.5 py-1"
                        style={{ backgroundColor: l.bg ?? "#ffffff", color: l.text ?? "#1f2937", textAlign: c.alinhamento ?? "left" }}
                      >
                        {l.valores[c.chave] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {data.legenda && data.legenda.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-600">
                {data.legenda.map((leg) => (
                  <span key={leg.rotulo} className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10" style={{ backgroundColor: leg.cor }} />
                    {leg.rotulo}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-2 text-[10px] text-gray-400">{data.fonteTexto}</p>
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t border-gray-200 p-3">
          {erro && <div className="rounded bg-red-50 p-2 text-xs text-red-600">{erro}</div>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={baixarImagem}
              disabled={gerandoImagem}
              className="rounded bg-sedec-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sedec-700 disabled:opacity-50"
            >
              🖼️ Baixar imagem
            </button>
            {typeof navigator !== "undefined" && !!navigator.share && (
              <button
                type="button"
                onClick={compartilharImagemNativo}
                disabled={gerandoImagem}
                className="rounded border border-sedec-300 px-3 py-1.5 text-xs font-medium text-sedec-700 hover:bg-sedec-50 disabled:opacity-50"
              >
                📤 Compartilhar imagem (WhatsApp/Telegram…)
              </button>
            )}
            <button
              type="button"
              onClick={copiarTexto}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {copiado ? "✓ Copiado!" : "📋 Copiar texto"}
            </button>
            {typeof navigator !== "undefined" && !!navigator.share && (
              <button
                type="button"
                onClick={compartilharTextoNativo}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                📤 Compartilhar texto
              </button>
            )}
          </div>
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer select-none">Ver texto gerado</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] text-gray-700">{texto}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
