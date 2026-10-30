"use client";

import { useMemo, useState } from "react";

import ShareModal from "@/components/ShareModal";
import { Detalhe, fmtErro, registrarEnvio } from "@/lib/informativo";
import { horaLocal } from "@/lib/mapaCanvas";
import { legendaRadar } from "@/lib/radarImagem";
import { ShareData } from "@/lib/shareExport";

import { SeletorRadar, useRadar } from "./useRadar";

/** Imagem do radar para enviar (1:1, cabeçalho do painel e rodapé padrão): o técnico escolhe o radar no topo, vê a prévia inteira (sem rolagem) e usa os
 * botões de sempre. Texto: "*Painel Integrado de Monitoramento CEMADEN-RJ*" e "Radar X - atualização de HHhMM (hora local)". O envio pode ser registrado
 * no informativo — quantas vezes precisar. */
export default function RadarCompartilhar({ det, onAtualiza, onClose }: { det: Detalhe; onAtualiza: (d: Detalhe) => void; onClose: () => void }) {
  const radar = useRadar();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const { quadro } = radar;

  const dados: ShareData = useMemo(() => {
    const hh = quadro ? horaLocal(quadro.quando) : "--h--";
    const legenda = quadro ? legendaRadar(quadro, hh) : "Buscando o quadro de radar…";
    const registrar = async () => {
      if (!quadro) return;
      try {
        const r = await registrarEnvio(det.id, { tipo: "radar", detalhe: `Radar ${quadro.fonte.nome}`, quadro_em: quadro.quando.toISOString() });
        onAtualiza(r.informativo);
        setMsg({ tipo: "ok", texto: "Envio do radar registrado." });
      } catch (e) {
        setMsg({ tipo: "erro", texto: fmtErro(e) });
      }
    };
    return {
      titulo: "Painel Integrado de Monitoramento",
      cabecalho: ["Painel Integrado de Monitoramento", "CEMADEN-RJ / SEDEC"],
      dataHora: "",
      colunas: [],
      linhas: [],
      fonteTexto: "Fonte: CEMADEN-RJ - SEDEC",
      nomeArquivo: `radar-${quadro?.fonte.id ?? "radar"}-${hh.replace("h", "")}`,
      proporcoes: ["1:1"],
      semRolagem: true,
      topo: (
        <div className="space-y-1">
          <SeletorRadar {...radar} />
          {msg && <p className={msg.tipo === "ok" ? "text-emerald-700" : "text-red-700"}>{msg.texto}</p>}
        </div>
      ),
      corpoPor: () => (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            {quadro ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={quadro.png} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">{radar.erro ?? "Buscando o quadro…"}</div>
            )}
          </div>
          <p className="shrink-0 pt-2 text-center text-[19px] font-semibold leading-snug text-gray-900">{legenda}</p>
        </div>
      ),
      textoPronto: quadro ? `*Painel Integrado de Monitoramento CEMADEN-RJ*\n${legenda}` : "",
      acoes: quadro ? <button type="button" onClick={registrar} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600">✔ Registrar envio do radar</button> : null,
    };
  }, [quadro, radar, msg, det.id, onAtualiza]);
  return <ShareModal data={dados} onClose={onClose} />;
}
