"use client";

import { useMemo } from "react";

import ShareModal from "@/components/ShareModal";
import { Selecao, SELECAO_PADRAO } from "@/lib/camadaImagem";
import { horaLocal } from "@/lib/mapaCanvas";
import { ShareData } from "@/lib/shareExport";

import { SeletorCamada, useCamada } from "./useRadar";

/** Caixa de compartilhar da imagem de radar ou satélite (1:1, cabeçalho do painel, rodapé padrão): fonte escolhida no topo, prévia inteira sem rolagem e os
 * botões de sempre. Texto: "*Painel Integrado de Monitoramento CEMADEN-RJ*" e "Radar X - atualização de HHhMM (hora local)". `acao` recebe os dados da imagem
 * para botões extras (ex.: registrar o envio no informativo). Usada no card do informativo (só radar) e no menu da camada do Mapa (radar ou satélite). */
export default function GerarImagemCamada({ inicial = SELECAO_PADRAO, somenteRadar = false, acao, topoExtra, onClose }: { inicial?: Selecao; somenteRadar?: boolean; acao?: (g: { legenda: string; quando: Date; nome: string }) => React.ReactNode; topoExtra?: React.ReactNode; onClose: () => void }) {
  const c = useCamada(inicial);
  const { imagem } = c;

  const dados: ShareData = useMemo(() => {
    const hh = imagem ? horaLocal(imagem.quando) : "--h--";
    const legenda = imagem ? imagem.legenda(hh) : "Buscando a imagem…";
    return {
      titulo: "Painel Integrado de Monitoramento",
      cabecalho: ["Painel Integrado de Monitoramento", "CEMADEN-RJ / SEDEC"],
      dataHora: "",
      colunas: [],
      linhas: [],
      fonteTexto: "Fonte: CEMADEN-RJ - SEDEC",
      nomeArquivo: `${c.sel.tipo}-${imagem?.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") ?? "imagem"}-${hh.replace("h", "")}`,
      proporcoes: ["1:1"],
      semRolagem: true,
      topo: <div className="space-y-1"><SeletorCamada c={c} somenteRadar={somenteRadar} />{topoExtra}</div>,
      corpoPor: () => (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {imagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagem.png} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">{c.erro ?? "Buscando a imagem…"}</div>
            )}
          </div>
          <p className="shrink-0 pt-2 text-center text-[19px] font-semibold leading-snug text-gray-900">{legenda}</p>
        </div>
      ),
      textoPronto: imagem ? `*Painel Integrado de Monitoramento CEMADEN-RJ*\n${legenda}` : "",
      acoes: imagem && acao ? acao({ legenda, quando: imagem.quando, nome: imagem.nome }) : null,
    };
  }, [c, imagem, somenteRadar, acao, topoExtra]);
  return <ShareModal data={dados} onClose={onClose} />;
}
