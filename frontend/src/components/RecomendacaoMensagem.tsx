"use client";

import { useMemo } from "react";

import ShareModal from "@/components/ShareModal";
import { dataBr, horaCurta, mensagemRecomendacao, Recomendacao } from "@/lib/recomendacoes";
import { ShareData } from "@/lib/shareExport";

/** Envio da recomendação ao município: card (imagem) + texto no padrão já usado, pelo mesmo modal "Compartilhar" das tabelas
 * de vento (baixar/copiar imagem, copiar texto, compartilhar no celular). */
export default function RecomendacaoMensagem({ rec, onClose }: { rec: Pick<Recomendacao, "numero" | "municipio" | "data" | "hora" | "estacao" | "gatilho">; onClose: () => void }) {
  const dados: ShareData = useMemo(() => {
    const [n, ano] = rec.numero.split("_");
    const hh = horaCurta(rec.hora).replace(":", "h");
    const linha = (rotulo: string, valor: string) => (
      <div className="flex gap-2 border-b border-gray-100 py-2.5 text-[19px]">
        <span className="w-36 shrink-0 font-semibold text-gray-500">{rotulo}</span>
        <span className="font-bold text-gray-900">{valor}</span>
      </div>
    );
    return {
      titulo: `Recomendação de mobilização n° ${n}/${ano}`,
      dataHora: `${dataBr(rec.data)} ${hh}`,
      rotuloData: "Emitida em",
      colunas: [],
      linhas: [],
      fonteTexto: "Fonte: CEMADEN-RJ - SEDEC",
      nomeArquivo: `recomendacao-${n}-${ano}-${rec.municipio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-")}`,
      corpo: (
        <div className="flex h-full flex-col justify-center px-6">
          <div className="text-center text-[18px] font-semibold leading-tight text-gray-500">
            SEDEC-RJ
            <br />
            CEMADEN-RJ
          </div>
          <div className="my-5 text-center text-[44px] font-extrabold uppercase leading-tight text-sedec-700">{rec.municipio}</div>
          <div className="mb-3 rounded-lg bg-sedec-600 px-4 py-3 text-center text-[24px] font-bold text-white">
            RECOMENDAÇÃO DE MOBILIZAÇÃO
            <br />
            <span className="text-[30px]">n° {n}/{ano}</span>
          </div>
          {linha("Data", dataBr(rec.data))}
          {linha("Hora", hh)}
          {rec.estacao && linha("Pluviômetro", rec.estacao)}
          {rec.gatilho && linha("Gatilho", rec.gatilho)}
        </div>
      ),
      textoPronto: mensagemRecomendacao(rec),
    };
  }, [rec]);
  return <ShareModal data={dados} onClose={onClose} />;
}
