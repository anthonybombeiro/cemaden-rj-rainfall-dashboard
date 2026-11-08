"use client";

import { CloudRain, Wind } from "lucide-react";
import { Fragment } from "react";

import { AvisoPublico, useAvisosPublicos } from "@/lib/avisosPublicos";
import { nomeRegiao } from "@/lib/informativo";
import { fmtDataHora } from "@/lib/nivelMonitoramento";

/** Texto do aviso: parágrafos em branco viram blocos; trechos entre ** ficam em negrito. */
export function TextoAviso({ texto, className }: { texto: string; className?: string }) {
  const blocos = texto.split(/\n{2,}/);
  return (
    <div className={className}>
      {blocos.map((b, i) => (
        <p key={i} className={i ? "mt-[0.6em]" : ""}>
          {b.split(/(\*\*[^*]+\*\*)/g).map((t, j) => (t.startsWith("**") && t.endsWith("**") && t.length > 4 ? <strong key={j}>{t.slice(2, -2)}</strong> : <Fragment key={j}>{t}</Fragment>))}
        </p>
      ))}
    </div>
  );
}

const numero = (a: Pick<AvisoPublico, "numero" | "ano">) => `${String(a.numero).padStart(2, "0")}/${a.ano}`;
const regiao = (a: AvisoPublico) => (a.regioes.length ? a.regioes.map(nomeRegiao).join(", ") : "Todo o estado do Rio de Janeiro");

/** Card de um aviso meteorológico vigente: faixa laranja com número, vigência e região (como a arte do aviso), corpo claro com o texto.
 * `tv` aumenta a tipografia para a tela da TV; na página pública fica compacto e ocupa toda a largura. */
export function CardAviso({ a, tv = false }: { a: AvisoPublico; tv?: boolean }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border-2 border-orange-500 bg-white shadow-md" aria-label={`Aviso meteorológico nº ${numero(a)}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-orange-600 px-4 py-2.5 text-white">
        <div className="flex items-center gap-2">
          {a.icones.includes("chuva") && <CloudRain size={tv ? 36 : 22} aria-hidden="true" />}
          {a.icones.includes("vento") && <Wind size={tv ? 36 : 22} aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`${tv ? "text-sm" : "text-[0.6875rem]"} font-semibold uppercase tracking-wider text-orange-100`}>Aviso meteorológico · vigente agora</p>
          <h2 className={`${tv ? "text-4xl" : "text-xl sm:text-2xl"} font-extrabold leading-tight`}>Nº {numero(a)}</h2>
        </div>
        <div className={`${tv ? "text-xl" : "text-xs sm:text-sm"} font-semibold leading-snug sm:text-right`}>
          <p>Válido de {fmtDataHora(a.vigencia_inicio)}</p>
          <p>até {fmtDataHora(a.vigencia_fim)}</p>
        </div>
      </header>
      <div className={tv ? "p-6" : "p-4"}>
        <p className={`${tv ? "mb-3 text-xl" : "mb-2 text-xs"} font-semibold text-gray-700`}>
          Região: <span className="font-bold text-gray-900">{regiao(a)}</span>
          {a.sistemas.length > 0 && <> · Sistema atuante: <span className="font-bold text-gray-900">{a.sistemas.join(" e ")}</span></>}
        </p>
        <TextoAviso texto={a.texto} className={`${tv ? "text-3xl leading-snug" : "text-[0.9375rem] leading-relaxed sm:text-base"} text-gray-900`} />
      </div>
    </article>
  );
}

/** Bloco de avisos vigentes para a página pública: aparece em primeiro, bem destacado, e some sozinho quando não há aviso vigente. */
export default function AvisosVigentes() {
  const avisos = useAvisosPublicos();
  if (!avisos || avisos.length === 0) return null;
  return (
    <section aria-label="Avisos meteorológicos vigentes" className="space-y-3">
      {avisos.map((a) => <CardAviso key={`${a.ano}-${a.numero}`} a={a} />)}
    </section>
  );
}
