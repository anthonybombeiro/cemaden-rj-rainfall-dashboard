"use client";

import { toPng } from "html-to-image";
import { useRef, useState } from "react";

import {
  copiarImagemParaAreaDeTransferencia,
  copiarParaAreaDeTransferencia,
  ehDispositivoMovel,
  gerarTextoCompartilhavel,
  ShareData,
} from "@/lib/shareExport";

/** Modal genérico de "Compartilhar" (2026-09-29, redesenhado 2026-10-01 a
 * partir do feedback do usuário sobre a tabela de Ventos):
 *
 *   - Card em formato QUADRADO (1:1), tamanho FIXO em pixels (não responsivo
 *     ao viewport) — cada tabela tem um número variável de colunas/linhas, e
 *     antes o card usava `w-full max-w-xl`: numa tela estreita a tabela
 *     ficava mais larga que o card e a imagem gerada saía cortada na
 *     lateral (o html-to-image só captura o retângulo do próprio elemento,
 *     não o que transbordou dele). Fixo em pixels = mesmo resultado sempre,
 *     e dá pra dimensionar as colunas pra caber de verdade.
 *   - Cabeçalho AZUL (cor de marca do painel, sedec-600) com as duas logos e
 *     título/data em branco — as logos (brancas/claras) ficavam invisíveis
 *     no fundo branco do card antigo.
 *   - "Copiar imagem" (Clipboard API) além de baixar/compartilhar nativo —
 *     cola direto no WhatsApp Web/Telegram Desktop com Ctrl+V.
 *   - Compartilhamento nativo (Web Share API) só aparece em
 *     celular/tablet de verdade — em desktop o navegador até pode "suportar"
 *     a API tecnicamente mas não tem pra onde mandar o arquivo.
 *
 * Cada tabela só monta o `ShareData` (colunas/linhas já curadas, e
 * opcionalmente `agruparPor`/`colunasTexto` pro texto agrupado — ver
 * shareExport.ts) — o modal em si não sabe nada de sirene/vento/chuva. */

const LARGURA_CARD = 760;
const ALTURA_CARD = 760;

export default function ShareModal({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [gerandoImagem, setGerandoImagem] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [imagemCopiada, setImagemCopiada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const texto = gerarTextoCompartilhavel(data);
  const mostrarShareNativo = ehDispositivoMovel();

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

  const copiarImagem = async () => {
    setErro(null);
    setGerandoImagem(true);
    try {
      const blob = await gerarPng();
      if (!blob) return;
      const ok = await copiarImagemParaAreaDeTransferencia(blob);
      setImagemCopiada(ok);
      if (ok) setTimeout(() => setImagemCopiada(false), 2500);
      else setErro("Copiar imagem não é suportado neste navegador — use \"Baixar imagem\".");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao copiar imagem");
    } finally {
      setGerandoImagem(false);
    }
  };

  // Web Share API com arquivo — só mostrado em celular/tablet (ver
  // ehDispositivoMovel): abre direto a folha de compartilhamento do
  // sistema com WhatsApp/Telegram já na lista.
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

        <div className="min-h-0 flex-1 overflow-auto bg-gray-100 p-4">
          {/* Card no layout final — é ESSE elemento que vira a imagem.
              Tamanho FIXO em pixels (não w-full/max-w-*) de propósito — ver
              docstring do componente. Em tela estreita o preview rola na
              horizontal (overflow-auto do container pai); a imagem
              exportada usa sempre o mesmo tamanho real, não o que coube na
              tela de quem está olhando o modal. */}
          <div
            ref={cardRef}
            className="mx-auto flex flex-col overflow-hidden bg-white shadow"
            style={{ width: LARGURA_CARD, height: ALTURA_CARD }}
          >
            {/* Cabeçalho azul — logos sempre visíveis, independente do
                fundo (pedido do usuário, 2026-10-01). */}
            <div className="flex shrink-0 items-center justify-between gap-3 bg-sedec-600 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold leading-tight text-white">{data.titulo}</h3>
                <p className="mt-0.5 text-[11px] text-sedec-100">Dados de: {data.dataHora}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <img src="/logo-defesa-civil.png" alt="" className="h-10 w-auto" />
                <img src="/logo-cemadenrj.png" alt="" className="h-10 w-auto" />
              </div>
            </div>

            {/* Corpo — ancorado no topo (cada tabela já manda tantas linhas
                quanto couberem bem no card, ver VentosTable.compartilhar).
                overflow-hidden AQUI (não só no card inteiro) é o que evita
                a legenda vazar por cima do rodapé quando o conteúdo não
                cabe direitinho (2026-10-01, achado pelo usuário): sem isso,
                a tabela/legenda transbordam a altura que o flexbox alocou
                pro corpo e pintam por cima do rodapé (que vem logo depois
                no layout), em vez de simplesmente cortar o que não coube. */}
            <div className="flex min-h-0 flex-1 flex-col justify-start overflow-hidden px-4 py-3">
              {data.corpo ? (
                data.corpo
              ) : (
              <table className="w-full table-fixed border-collapse text-[10.5px]">
                {data.colunas.some((c) => c.larguraPct) && (
                  <colgroup>
                    {data.colunas.map((c) => (
                      <col key={c.chave} style={c.larguraPct ? { width: `${c.larguraPct}%` } : undefined} />
                    ))}
                  </colgroup>
                )}
                <thead>
                  <tr>
                    {data.colunas.map((c) => (
                      <th
                        key={c.chave}
                        className="truncate border border-gray-300 bg-gray-100 px-1 py-1 font-bold uppercase tracking-tight text-gray-600"
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
                          className="truncate border border-gray-200 px-1 py-1"
                          style={{
                            backgroundColor: l.bg ?? "#ffffff",
                            color: l.text ?? "#1f2937",
                            textAlign: c.alinhamento ?? "left",
                          }}
                        >
                          {l.valores[c.chave] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              )}

              {!data.corpo && data.legenda && data.legenda.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9.5px] text-gray-600">
                  {data.legenda.map((leg) => (
                    <span key={leg.rotulo} className="flex items-center gap-1">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10"
                        style={{ backgroundColor: leg.cor }}
                      />
                      {leg.rotulo}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="shrink-0 border-t border-gray-100 px-4 py-2 text-center text-[9.5px] text-gray-400">
              {data.fonteTexto}
            </p>
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
            <button
              type="button"
              onClick={copiarImagem}
              disabled={gerandoImagem}
              className="rounded border border-sedec-300 px-3 py-1.5 text-xs font-medium text-sedec-700 hover:bg-sedec-50 disabled:opacity-50"
            >
              {imagemCopiada ? "✓ Imagem copiada!" : "📋 Copiar imagem"}
            </button>
            {mostrarShareNativo && (
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
            {mostrarShareNativo && (
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
