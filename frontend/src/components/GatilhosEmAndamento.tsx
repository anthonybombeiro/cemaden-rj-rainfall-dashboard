"use client";

import { useEffect, useState } from "react";

import { fetchSirenes } from "@/lib/api";
import { candidatasDeSirenes, fetchRecomendacoes, gatilhosDe, horaCurta, mm, PreRecomendacao, Recomendacao } from "@/lib/recomendacoes";

const COR = { condicionado: "#eab308", obrigatorio: "#f97316", acionado: "#dc2626" } as const;
const ROTULO = { condicionado: "Condicionado", obrigatorio: "Obrigatório", acionado: "Sirene acionada" } as const;
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Pluviômetros com gatilho em andamento agora (da tabela de sirenes), prontos para virar recomendação pré-preenchida.
 * Vários gatilhos podem estar ativos ao mesmo tempo (vão juntos na mesma recomendação) e o mesmo pluviômetro pode ser
 * recomendado de novo no dia quando surge um gatilho diferente: a lista mostra o que JÁ foi recomendado hoje, por gatilho,
 * e pré-preenche só os gatilhos ainda não recomendados. */
export default function GatilhosEmAndamento({ onUsar, recarregar }: { onUsar: (p: PreRecomendacao) => void; recarregar: number }) {
  const [lista, setLista] = useState<PreRecomendacao[] | null>(null);
  const [hoje, setHoje] = useState<Recomendacao[]>([]);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const carregar = () => {
      Promise.all([fetchSirenes(), fetchRecomendacoes({ ano: hojeIso().slice(0, 4) })])
        .then(([sirenes, recs]) => {
          if (cancelado) return;
          setLista(candidatasDeSirenes(sirenes));
          setHoje(recs.filter((r) => r.data === hojeIso()));
          setErro(false);
        })
        .catch(() => !cancelado && setErro(true));
    };
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
  }, [recarregar]);

  /** Recomendações de hoje deste município e pluviômetro. */
  const doPluviometro = (p: PreRecomendacao) => hoje.filter((r) => r.municipio === p.municipio && r.estacao.trim().toLowerCase() === p.estacao.trim().toLowerCase());

  return (
    <section className="mx-auto mb-3 w-full max-w-3xl rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="mb-1 text-sm font-bold text-gray-800">Gatilhos em andamento agora</h3>
      <p className="mb-2 text-xs text-gray-500">Vem da tabela de Sirenes (gatilhos I–IV com os limiares de cada município; vale a partir do &quot;condicionado&quot;). Toque em um para abrir o cadastro já preenchido; confira e envie.</p>
      {erro && <p className="text-sm text-red-600">Não foi possível ler as sirenes agora.</p>}
      {!lista && !erro && <p className="text-sm text-gray-400">Carregando…</p>}
      {lista && lista.length === 0 && <p className="rounded bg-gray-50 p-2 text-sm text-gray-500">Nenhum gatilho em andamento neste momento.</p>}
      <ul className="max-h-80 space-y-1.5 overflow-auto">
        {lista?.map((p) => {
          const feitas = doPluviometro(p);
          const jaRecomendados = new Set(feitas.flatMap((r) => gatilhosDe(r.gatilho)));
          const novos = p.gatilhos.filter((g) => !jaRecomendados.has(g));
          const todosFeitos = novos.length === 0;
          // pré-preenche só o que ainda não foi recomendado hoje (ou tudo, se tudo já foi)
          const alvo: PreRecomendacao = todosFeitos ? p : { ...p, gatilhos: novos };
          return (
            <li key={`${p.municipio}|${p.estacao}`} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 p-2 text-sm">
              <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: COR[p.situacao] }} title={ROTULO[p.situacao]} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-900">
                  {p.municipio} · {p.estacao} · <span className="text-red-700">Gatilho{p.gatilhos.length > 1 ? "s" : ""} {p.gatilhos.join(" + ")}</span> <span className="text-xs font-normal text-gray-500">({ROTULO[p.situacao]})</span>
                </div>
                <div className="text-xs text-gray-600">
                  1 h {mm(p.chuva_1h_mm)} · 24 h {mm(p.chuva_24h_mm)} · 96 h {mm(p.chuva_96h_mm)} · 30 d {mm(p.chuva_30d_mm)} · {p.sirenes.length} sirene{p.sirenes.length === 1 ? "" : "s"}
                </div>
                {feitas.length > 0 && (
                  <div className="text-xs font-medium text-amber-700">
                    Hoje: {feitas.map((r) => `nº ${r.numero} (gatilho ${gatilhosDe(r.gatilho).join(" + ") || "—"}, ${horaCurta(r.hora)})`).join("; ")}
                    {!todosFeitos && <span className="text-emerald-700"> — novo(s): {novos.join(" + ")}</span>}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => onUsar(alvo)} className={`rounded px-3 py-1.5 text-xs font-semibold text-white ${todosFeitos && feitas.length ? "bg-gray-500 hover:bg-gray-600" : "bg-emerald-600 hover:bg-emerald-700"}`}>
                {todosFeitos && feitas.length ? "Recomendar de novo" : `Pré-preencher (${alvo.gatilhos.join(" + ")})`}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
