"use client";

import { Check, Circle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import FaixaLimiares from "@/components/producao/FaixaLimiares";
import { intervaloVisivel } from "@/lib/intervaloVisivel";
import { Checklist, dataCurta, fetchChecklist, hhmm, marcarItem } from "@/lib/producaoMet";

export type SubMet = "plantao" | "informativo" | "acumulados" | "aviso" | "livro" | "suporte";

/** Checklist do plantão (07 h → 07 h) do Protocolo de Meteorologia: horários, item atual em destaque, "feito" com quem e quando (compartilhado entre
 * os técnicos) e as pendências que o turno anterior deixou. Os alertas de limiar ficam no topo. */
export default function Plantao({ onAbrir }: { onAbrir?: (sub: SubMet) => void }) {
  const [dados, setDados] = useState<Checklist | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [turno, setTurno] = useState<string | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      setDados(await fetchChecklist(turno));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o checklist.");
    }
  }, [turno]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
    return intervaloVisivel(carregar, 60_000);
  }, [carregar]);

  const alternar = async (codigo: string, feito: boolean) => {
    if (!dados) return;
    setSalvando(codigo);
    try {
      await marcarItem(dados.data, codigo, feito);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao marcar.");
    } finally {
      setSalvando(null);
    }
  };
  const atalho: Record<string, SubMet> = { acumulados_criar: "acumulados", acumulados_enviar: "acumulados", passagem: "livro" };
  const feitos = dados?.itens.filter((i) => i.feito).length ?? 0;
  const diaAnterior = (iso: string) => new Date(new Date(`${iso}T12:00:00`).getTime() - 86_400_000).toLocaleDateString("sv-SE");

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <FaixaLimiares />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold">
          Plantão {dados ? `de ${dataCurta(dados.data)} (07h → 07h)` : ""}
          {dados && (
            <span className="ml-2 font-normal text-gray-500">
              {feitos} de {dados.itens.length} feitos
            </span>
          )}
        </h2>
        <span className="flex gap-1.5 text-xs">
          {dados && (
            <button type="button" onClick={() => setTurno(diaAnterior(dados.data))} className="rounded border px-2 py-1 hover:bg-gray-50">
              Turno anterior
            </button>
          )}
          {turno && (
            <button type="button" onClick={() => setTurno(undefined)} className="rounded border px-2 py-1 hover:bg-gray-50">
              Turno atual
            </button>
          )}
          <button type="button" onClick={carregar} className="rounded border p-1 hover:bg-gray-50" aria-label="Atualizar">
            <RefreshCw size={14} />
          </button>
        </span>
      </div>
      {erro && <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">{erro}</p>}
      {dados && dados.pendencias_anteriores.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>Pendências do turno anterior ({dataCurta(dados.pendencias_anteriores[0].data)}):</b> {dados.pendencias_anteriores.map((p) => `${p.hora ?? ""} ${p.titulo}`.trim()).join(" · ")}
          <div className="mt-0.5 text-[11px]">Se der, resolva; se não, avise o próximo técnico.</div>
        </div>
      )}
      <ol className="space-y-1.5">
        {dados?.itens.map((i) => {
          const atual = dados.proximo === i.codigo;
          const cor = i.feito ? "border-emerald-200 bg-emerald-50" : atual ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300" : i.atrasado ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white";
          return (
            <li key={i.codigo} className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${cor}`}>
              <button type="button" disabled={salvando === i.codigo} onClick={() => alternar(i.codigo, !i.feito)} className="mt-0.5 shrink-0" aria-label={i.feito ? `Desmarcar: ${i.titulo}` : `Marcar como feito: ${i.titulo}`}>
                {i.feito ? <Check size={18} className="rounded-full bg-emerald-600 p-0.5 text-white" /> : <Circle size={18} className={atual ? "text-blue-600" : "text-gray-400"} />}
              </button>
              <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-gray-600">{i.hora ?? "no dia"}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className={i.feito ? "text-gray-500 line-through" : "font-semibold"}>{i.titulo}</span>
                {i.condicional && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">se houver</span>}
                {i.detalhe && <span className="block text-[11px] text-gray-500">{i.detalhe}</span>}
                {i.feito && (
                  <span className="block text-[11px] text-emerald-700">
                    {i.feito.por} às {hhmm(i.feito.em)}
                  </span>
                )}
                {!i.feito && i.atrasado && <span className="block text-[11px] font-semibold text-amber-700">atrasado</span>}
              </span>
              {atalho[i.codigo] && onAbrir && (
                <button type="button" onClick={() => onAbrir(atalho[i.codigo])} className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-white">
                  Abrir
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!dados && !erro && <p className="text-xs text-gray-500">Carregando…</p>}
    </div>
  );
}
