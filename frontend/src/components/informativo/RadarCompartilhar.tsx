"use client";

import { useCallback, useState } from "react";

import { Detalhe, fmtErro, registrarEnvio } from "@/lib/informativo";

import GerarImagemCamada from "./GerarImagemCamada";

/** Imagem do radar a partir do card do informativo: escolhe qualquer radar do Mapa (e o produto) e permite registrar o envio no informativo, quantas vezes precisar. */
export default function RadarCompartilhar({ det, onAtualiza, onClose }: { det: Detalhe; onAtualiza: (d: Detalhe) => void; onClose: () => void }) {
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const acao = useCallback((g: { legenda: string; quando: Date; nome: string }) => {
    const registrar = async () => {
      try {
        onAtualiza((await registrarEnvio(det.id, { tipo: "radar", detalhe: g.legenda.replace(/ - atualização.*$/, ""), quadro_em: g.quando.toISOString() })).informativo);
        setMsg({ tipo: "ok", texto: "Envio do radar registrado." });
      } catch (e) {
        setMsg({ tipo: "erro", texto: fmtErro(e) });
      }
    };
    return <button type="button" onClick={registrar} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600">✔ Registrar envio do radar</button>;
  }, [det.id, onAtualiza]);
  return <GerarImagemCamada somenteRadar acao={acao} onClose={onClose} topoExtra={msg && <p className={msg.tipo === "ok" ? "text-emerald-700" : "text-red-700"}>{msg.texto}</p>} />;
}
