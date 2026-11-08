"use client";

import { useCallback, useEffect, useState } from "react";

import { COR_PROBABILIDADE, fetchRecomendacoes, Recomendacao } from "@/lib/recomendacoes";

const JANELA_H = 24;
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const quando = (r: Recomendacao) => new Date(`${r.data}T${r.hora}-03:00`); // horário de Brasília

/** Recomendações de alarme (risco geológico) emitidas nas últimas 24 h, da mais recente para a mais antiga; atualiza a cada minuto.
 * `lista === null` = carregando; `erro` = falha ao buscar (e ainda sem dados). */
export function useRecomendacoesAtivas(): { lista: Recomendacao[] | null; erro: boolean } {
  const [lista, setLista] = useState<Recomendacao[] | null>(null);
  const [erro, setErro] = useState(false);
  const carregar = useCallback(() => {
    const desde = new Date(Date.now() - (JANELA_H + 24) * 3600_000); // margem de um dia; o corte exato é feito abaixo
    fetchRecomendacoes({ data_inicio: ymd(desde) })
      .then((r) => {
        const corte = Date.now() - JANELA_H * 3600_000;
        setLista(r.filter((x) => quando(x).getTime() >= corte).sort((a, b) => quando(b).getTime() - quando(a).getTime()));
        setErro(false);
      })
      .catch(() => setErro(true));
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(() => { if (document.visibilityState === "visible") carregar(); }, 60_000);
    return () => clearInterval(t);
  }, [carregar]);
  return { lista, erro };
}

/** Card de uma recomendação de alarme (mesmo desenho dos cards de informativo: faixa superior pela probabilidade). Só leitura. */
export function CardRecomendacao({ r }: { r: Recomendacao }) {
  const c = COR_PROBABILIDADE[r.probabilidade] ?? COR_PROBABILIDADE.Baixa;
  const dia = r.data.split("-").reverse().slice(0, 2).join("/");
  return (
    <div className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${c.barra}` }}>
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">Recomendação de alarme nº {r.numero}</h3>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.fundo, color: c.texto }}>Probabilidade {r.probabilidade.toLowerCase()}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.acionaram === null ? "bg-amber-100 text-amber-800" : r.acionaram ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>
          {r.acionaram === null ? "Aguardando validação" : r.acionaram ? "Sirenes acionadas" : "Sem acionamento"}
        </span>
      </div>
      <p className="mt-3 text-base font-bold text-gray-900">{r.municipio}</p>
      <p className="text-sm text-gray-700">
        {r.estagio_operacional ? `Estágio ${r.estagio_operacional.toLowerCase()}` : "Recomendação emitida"}
        {r.gatilho ? ` · gatilho ${r.gatilho}` : ""}
        {r.indice_alcancado ? ` · ${r.indice_alcancado}` : ""}
      </p>
      <dl className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
        <div className="flex justify-between gap-2"><dt>Emitida em</dt><dd className="font-medium text-gray-700">{dia}, {r.hora.slice(0, 5)}</dd></div>
        {r.estacao && <div className="flex justify-between gap-2"><dt>Estação</dt><dd className="min-w-0 truncate font-medium text-gray-700">{r.estacao}</dd></div>}
        {r.sirenes_qtd != null && <div className="flex justify-between gap-2"><dt>Sirenes</dt><dd className="font-medium text-gray-700">{r.sirenes_qtd}</dd></div>}
      </dl>
    </div>
  );
}
