"use client";

import { useState } from "react";

import MetProducao from "@/components/producao/MetProducao";
import ProducaoPanel from "@/components/ProducaoPanel";

type Equipe = "nm" | "met";

/** Aba Produção: seletor de equipe. "Nível de Monitoramento" é o painel já existente; "Meteorologia" reúne o plantão, o informativo, os acumulados, o aviso e o livro de ocorrências. */
export default function ProducaoHub({ selecaoInicial = [] }: { selecaoInicial?: string[] }) {
  const [equipe, setEquipe] = useState<Equipe>("nm");
  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex shrink-0 gap-1.5 px-4 pt-3 text-xs">
        {([["nm", "Nível de Monitoramento"], ["met", "Meteorologia"]] as [Equipe, string][]).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setEquipe(k)} className={`rounded-md border px-3 py-1.5 font-semibold ${equipe === k ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>{t}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{equipe === "nm" ? <ProducaoPanel selecaoInicial={selecaoInicial} /> : <MetProducao />}</div>
    </div>
  );
}
