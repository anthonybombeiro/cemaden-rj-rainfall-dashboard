"use client";

import { lazy, Suspense, useState } from "react";

import InformativoPanel from "@/components/informativo/InformativoPanel";
import Acumulados from "@/components/producao/Acumulados";
import Aviso from "@/components/producao/Aviso";
import Livro from "@/components/producao/Livro";
import Plantao, { SubMet } from "@/components/producao/Plantao";
import SistemasRelatorio from "@/components/producao/SistemasRelatorio";
import Verificacao from "@/components/producao/Verificacao";

/** Produção → Meteorologia: balcão do plantão da meteorologia. O Suporte (IDAP, Cell Broadcast, severidade) só aparece com
 * `NEXT_PUBLIC_MET_EXPERIMENTAL=1` (feito localmente, ainda não publicado). */
const EXPERIMENTAL = process.env.NEXT_PUBLIC_MET_EXPERIMENTAL === "1";
// Import condicional: sem a flag o bundle de produção nem inclui o código do Suporte.
const SuporteMeteorologia = EXPERIMENTAL ? lazy(() => import("@/components/producao/SuporteMeteorologia")) : null;
const SUBS: { key: SubMet; rotulo: string }[] = [
  { key: "plantao", rotulo: "Plantão" },
  { key: "informativo", rotulo: "Informativo" },
  { key: "acumulados", rotulo: "Acumulados" },
  { key: "aviso", rotulo: "Aviso" },
  { key: "livro", rotulo: "Livro de ocorrências" },
  { key: "verificacao", rotulo: "Verificação" },
  { key: "sistemas", rotulo: "Sistemas atuantes" },
  ...(EXPERIMENTAL ? [{ key: "suporte" as SubMet, rotulo: "Suporte" }] : []),
];

export default function MetProducao() {
  const [sub, setSub] = useState<SubMet>("plantao");
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pt-2 text-xs">
        {SUBS.map((s) => (
          <button key={s.key} type="button" onClick={() => setSub(s.key)} className={`rounded-full px-3 py-1 font-semibold ${sub === s.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            {s.rotulo}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {sub === "plantao" && <Plantao onAbrir={setSub} />}
        {sub === "informativo" && <InformativoPanel />}
        {sub === "acumulados" && <Acumulados />}
        {sub === "aviso" && <Aviso />}
        {sub === "livro" && <Livro />}
        {sub === "verificacao" && <Verificacao />}
        {sub === "sistemas" && <SistemasRelatorio />}
        {sub === "suporte" && SuporteMeteorologia && (
          <Suspense fallback={<p className="text-xs text-gray-500">Carregando…</p>}>
            <SuporteMeteorologia />
          </Suspense>
        )}
      </div>
    </div>
  );
}
