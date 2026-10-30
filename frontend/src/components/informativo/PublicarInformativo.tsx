"use client";

import { useMemo, useState } from "react";

import ShareModal from "@/components/ShareModal";
import { horaLocal } from "@/lib/mapaCanvas";
import { ShareData } from "@/lib/shareExport";

import { SeletorCamada, useCamada } from "./useRadar";

type Base = { numero: number; ano: number; emitido_em: string | null; vigente_ate?: string | null; texto: string };
type Formato = "radar" | "texto";

const fmtData = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "");
const fmtHora = (iso: string | null | undefined) => (iso ? horaLocal(new Date(iso)) : "");

/** Separa o texto do informativo (modelo do grupo) em cenário, previsão e rodapé. */
export function partesDoTexto(texto: string) {
  const secao = { cenario: [] as string[], previsao: [] as string[], rodape: [] as string[] };
  let atual: keyof typeof secao | null = null;
  for (const l of texto.split("\n").map((x) => x.trimEnd())) {
    if (l.startsWith("CENÁRIO ATUAL")) { atual = "cenario"; continue; }
    if (l.startsWith("PREVISÃO PARA AS PRÓXIMAS")) { atual = "previsao"; continue; }
    if (!l.trim()) { if (atual === "previsao" && secao.previsao.length) atual = "rodape"; continue; }
    if (atual) secao[atual].push(l);
  }
  return secao;
}

/** Maior letra (entre `max` e `min` px) com que os blocos de texto cabem na altura disponível (estimativa: ~0,52 da letra por caractere, linha 1,32). */
function ajustarLetra(blocos: string[][], largura: number, altura: number, max: number, min: number): number {
  for (let t = max; t > min; t -= 0.5) {
    const porLinha = Math.max(10, Math.floor((largura - 28) / (t * 0.54)));
    const linhas = blocos.flat().reduce((n, l) => n + Math.max(1, Math.ceil(l.length / porLinha)), 0);
    const total = linhas * t * 1.32 + blocos.flat().length * 5 + blocos.length * (t * 0.8 + 24);
    if (total <= altura) return t;
  }
  return min;
}

/** Arte do informativo para publicar (um formato por vez): "3:4 com radar" (radar em cima com a legenda de uma linha, depois cenário e previsão) ou
 * "1:1 só texto". Mesmo cabeçalho e rodapé das postagens; o rodapé traz a fonte e a validade. */
export default function PublicarInformativo({ i, acoes, onClose }: { i: Base; acoes?: React.ReactNode; onClose: () => void }) {
  const [formato, setFormato] = useState<Formato>("radar");
  const radar = useCamada(undefined, formato === "radar");
  const { imagem: quadro } = radar;

  const dados: ShareData = useMemo(() => {
    const { cenario, previsao, rodape } = partesDoTexto(i.texto);
    const validade = i.vigente_ate ? ` · Válido até ${fmtHora(i.vigente_ate)} de ${fmtData(i.vigente_ate)}` : "";
    const comRadar = formato === "radar";
    const letra = comRadar ? ajustarLetra([cenario, previsao], 728, 885 - 330 - 30, 23, 14) : ajustarLetra([cenario, previsao, rodape.slice(0, 1)], 728, 632, 29, 15);
    const bloco = (titulo: string, linhas: string[], cor: string) => (
      <div className="mb-2.5 shrink-0">
        <div className="rounded-t-md px-3 py-1 font-bold tracking-wide text-white" style={{ background: cor, fontSize: letra * 0.78 }}>{titulo}</div>
        <div className="space-y-1 rounded-b-md border border-t-0 border-gray-200 px-3 py-2 font-semibold leading-snug text-gray-900" style={{ fontSize: letra }}>
          {linhas.length ? linhas.map((l, k) => <p key={k}>{l}</p>) : <p className="text-gray-400">—</p>}
        </div>
      </div>
    );
    const hh = quadro ? horaLocal(quadro.quando) : "--h--";
    const legenda = quadro ? quadro.legenda(hh) : "";
    return {
      titulo: `Informativo meteorológico n°${i.numero}/${i.ano}`,
      dataHora: `${fmtData(i.emitido_em)} ${fmtHora(i.emitido_em)}`,
      rotuloData: "Emitido em",
      colunas: [],
      linhas: [],
      fonteTexto: `Fonte: CEMADEN-RJ - SEDEC${validade}`,
      nomeArquivo: `informativo-${i.numero}-${i.ano}-${comRadar ? "3x4" : "1x1"}`,
      proporcoes: [comRadar ? "3:4" : "1:1"],
      semRolagem: true,
      topo: (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-gray-700">Arte:</span>
            {([["radar", "3:4 com radar"], ["texto", "1:1 só texto"]] as const).map(([k, r]) => (
              <button key={k} type="button" onClick={() => setFormato(k)} className={`rounded-full border px-2.5 py-1 font-medium ${formato === k ? "border-sedec-600 bg-sedec-600 text-white" : "border-gray-300 text-gray-700"}`}>{r}</button>
            ))}
          </div>
          {comRadar && <SeletorCamada c={radar} somenteRadar />}
        </div>
      ),
      corpoPor: () => (
        <div className="flex h-full flex-col">
          {comRadar && (
            <>
              <div className="min-h-[260px] flex-1">
                {quadro ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={quadro.png} alt="" className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400">{radar.erro ?? "Buscando o quadro…"}</div>
                )}
              </div>
              <p className="mb-2.5 shrink-0 pt-1 text-center text-[13px] font-semibold leading-tight text-gray-700">{legenda}</p>
            </>
          )}
          {bloco("CENÁRIO ATUAL", cenario, "#1f3864")}
          {bloco("PREVISÃO PARA AS PRÓXIMAS 6 HORAS", previsao, "#c2410c")}
          {!comRadar && rodape[0] && <p className="mt-auto border-t border-gray-100 pt-1 text-center leading-tight text-gray-500" style={{ fontSize: Math.max(11, letra * 0.5) }}>{rodape[0]}</p>}
        </div>
      ),
      textoPronto: i.texto,
      acoes,
    };
  }, [i, acoes, formato, quadro, radar]);
  return <ShareModal data={dados} onClose={onClose} />;
}
