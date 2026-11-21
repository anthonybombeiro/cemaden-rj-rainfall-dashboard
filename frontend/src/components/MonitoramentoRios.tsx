"use client";

import { RefreshCw } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { COTA_ESTILOS, CotaClasse, fetchRiosMonitoramento, REDECS, RioEstacao, RiosMonitoramento } from "@/lib/api";
import { intervaloVisivel } from "@/lib/intervaloVisivel";

// Aba Hidrologia > "Monitoramento dos rios" (21/11/2026): nível horário das estações automáticas (INEA e ANA) agrupado por REDEC e, dentro dela, por rio.
// Um rio que corta várias REDECs (ex.: Paraíba do Sul) aparece em cada uma só com as estações daquela REDEC. As cores são as das cotas do painel (COTA_ESTILOS).
// Celular: fonte menor, a coluna "Rio" vira linha de título e a barra de controles rola junto com a tabela (sobra tela para os números).
// Lançamento manual (COMDEC/DBM) fica para uma segunda etapa.

const JANELAS = [12, 24, 48] as const;
const TZ = "America/Sao_Paulo";
const fmtM = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2).replace(".", ","));
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(":00", "H");
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const rotuloRedec = (n: number | null, regiao: string) => (n == null ? "Sem REDEC" : `REDEC ${n} — ${regiao.charAt(0) + regiao.slice(1).toLowerCase()}`);
const ACIMA_DO_ALERTA = ["alerta", "transbordo", "extrema"];

function Celula({ v, c, forte = false }: { v: number | null; c: CotaClasse | null; forte?: boolean }) {
  // Só colore o que passou da cota de atenção (normal e sem cota ficam neutros, como na tabela impressa).
  const destaque = c && c !== "normal" && c !== "sem_cota";
  const e = destaque ? COTA_ESTILOS[c] : null;
  return (
    <td
      className={`min-w-9 whitespace-nowrap border border-gray-200 px-1 py-0.5 text-center tabular-nums sm:min-w-11 sm:px-1.5 sm:py-1 ${forte ? "font-bold" : ""} ${v == null ? "text-gray-300" : "text-gray-900"}`}
      style={e ? { backgroundColor: e.bg, color: e.text } : undefined}
      title={c ? COTA_ESTILOS[c].label : undefined}
    >
      {fmtM(v)}
    </td>
  );
}

export default function MonitoramentoRios() {
  const [horas, setHoras] = useState<12 | 24 | 48>(12);
  const [dados, setDados] = useState<RiosMonitoramento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [redec, setRedec] = useState<string>("todas");
  const [somenteComAlerta, setSomenteComAlerta] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetchRiosMonitoramento(horas)
      .then((d) => { setDados(d); setErro(null); })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setCarregando(false));
  }, [horas]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    carregar();
    return intervaloVisivel(carregar, 300_000);
  }, [carregar]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const grupos = useMemo(() => {
    const lista = (dados?.estacoes ?? []).filter(
      (e) =>
        (redec === "todas" || String(e.redec) === redec) &&
        (!somenteComAlerta || e.serie.some((s) => s.c && ACIMA_DO_ALERTA.includes(s.c)) || (e.atual_classe && ACIMA_DO_ALERTA.includes(e.atual_classe))),
    );
    const porRedec = new Map<string, { titulo: string; rios: Map<string, RioEstacao[]> }>();
    for (const e of lista) {
      const chave = String(e.redec ?? "x");
      if (!porRedec.has(chave)) porRedec.set(chave, { titulo: rotuloRedec(e.redec, e.regiao), rios: new Map() });
      const g = porRedec.get(chave)!;
      g.rios.set(e.rio, [...(g.rios.get(e.rio) ?? []), e]);
    }
    return [...porRedec.values()];
  }, [dados, redec, somenteComAlerta]);

  const total = grupos.reduce((n, g) => n + [...g.rios.values()].reduce((m, l) => m + l.length, 0), 0);
  const marcas = dados?.horas ?? [];
  const idade = dados ? Math.max(0, Math.round((Date.now() - Date.parse(dados.gerado_em)) / 60_000)) : null;

  const barra = (
    <div className="sticky left-0 w-full max-w-[100vw] border-b border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 text-xs sm:gap-x-3 sm:px-3 sm:py-2 sm:text-sm">
        <label className="flex items-center gap-1 text-gray-600">
          REDEC
          <select value={redec} onChange={(ev) => setRedec(ev.target.value)} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs sm:px-2 sm:py-1 sm:text-sm">
            <option value="todas">Todas</option>
            {REDECS.map((nome, i) => (
              <option key={nome} value={String(i + 1)}>{i + 1} — {nome.charAt(0) + nome.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Janela de horas">
          {JANELAS.map((h) => (
            <button key={h} type="button" onClick={() => setHoras(h)} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold sm:px-3 sm:py-1 sm:text-xs ${horas === h ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
              {h} h
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-[11px] text-gray-600 sm:text-xs">
          <input type="checkbox" checked={somenteComAlerta} onChange={(ev) => setSomenteComAlerta(ev.target.checked)} />
          só em alerta ou acima
        </label>
        <button type="button" onClick={carregar} className="flex items-center gap-1 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-700 hover:bg-gray-50 sm:px-2 sm:py-1 sm:text-xs" title="Atualizar agora">
          <RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar
        </button>
        <span className="text-[10px] text-gray-500 sm:text-xs">
          {total} estações{idade != null ? ` · há ${idade} min` : ""} · níveis em m · hora de Brasília
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-gray-100 px-2 pb-1 pt-1 text-[10px] text-gray-600 sm:px-3 sm:text-[11px]">
        {(["atencao", "alerta", "transbordo", "extrema"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COTA_ESTILOS[c].bg }} />
            {COTA_ESTILOS[c].label.replace("Cota de ", "").replace("Cota ", "")}
          </span>
        ))}
        <span>— sem leitura · cada hora = última leitura até ela (máx. 60 min antes)</span>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-auto bg-white text-[10px] sm:text-xs">
      {barra}
      {erro && <div className="m-3 rounded bg-red-50 p-2 text-xs text-red-600">Não foi possível carregar o monitoramento dos rios ({erro}).</div>}
      {!dados && !erro && <div className="p-6 text-sm text-gray-500">Carregando…</div>}
      {dados && !total && <div className="p-6 text-sm text-gray-500">Nenhuma estação para este filtro.</div>}
      {dados && total > 0 && (
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-blue-200 text-[9px] uppercase text-gray-800 sm:text-[11px]">
            <tr>
              <th className="sticky left-0 z-30 hidden min-w-24 border border-gray-300 bg-blue-200 px-2 py-1 sm:table-cell">Rio</th>
              <th className="sticky left-0 z-30 min-w-28 max-w-32 border border-gray-300 bg-blue-200 px-1.5 py-1 text-left sm:left-24 sm:min-w-44 sm:max-w-none sm:px-2">Estação</th>
              <th className="border border-gray-300 bg-yellow-100 px-1 py-1 text-red-700 sm:px-2">Transb.</th>
              {marcas.map((m, i) => (
                <th key={m} className="whitespace-nowrap border border-gray-300 px-1 py-1 sm:px-1.5" title={`${diaDe(m)} ${horaDe(m)}`}>
                  {horaDe(m)}
                  {(i === 0 || diaDe(m) !== diaDe(marcas[i - 1])) && horas > 12 ? <div className="text-[8px] font-normal normal-case text-gray-600 sm:text-[9px]">{diaDe(m)}</div> : null}
                </th>
              ))}
              <th className="border border-gray-300 px-1 py-1 sm:px-2">Atual</th>
              <th className="border border-gray-300 px-1 py-1 sm:px-2">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.titulo}>
                <tr>
                  <td colSpan={marcas.length + 5} className="border border-gray-300 bg-slate-700 p-0 text-left font-bold uppercase tracking-wide text-white">
                    <div className="sticky left-0 w-fit px-2 py-0.5 sm:py-1">{g.titulo}</div>
                  </td>
                </tr>
                {[...g.rios.entries()].map(([rio, ests]) => (
                  <Fragment key={rio}>
                    {/* Celular: o rio vira uma linha de título (a coluna "Rio" some para sobrar largura para os números) */}
                    <tr className="sm:hidden">
                      <td colSpan={marcas.length + 4} className="border border-gray-200 bg-indigo-50 p-0 text-left font-bold text-gray-800">
                        <div className="sticky left-0 w-fit px-1.5 py-0.5">{rio}</div>
                      </td>
                    </tr>
                    {ests.map((e, i) => (
                      <tr key={e.id} className="hover:bg-blue-50/40">
                        {i === 0 && (
                          <td rowSpan={ests.length} className="sticky left-0 z-10 hidden border border-gray-300 bg-indigo-50 px-2 py-1 text-center font-bold text-gray-800 sm:table-cell">
                            {rio}
                          </td>
                        )}
                        <td className="sticky left-0 z-10 max-w-32 truncate whitespace-nowrap border border-gray-200 bg-white px-1.5 py-0.5 font-semibold text-gray-900 sm:left-24 sm:max-w-none sm:px-2 sm:py-1" title={`${e.municipality} — ${e.name}`}>
                          <span className="hidden sm:inline">{e.municipality} <span className="font-normal text-gray-500">— </span></span>
                          <span className="sm:font-normal sm:text-gray-500">{e.name}</span>
                        </td>
                        <td className="border border-gray-200 bg-yellow-50 px-1 py-0.5 text-center font-bold tabular-nums text-red-700 sm:px-1.5 sm:py-1">{e.transbordo_m != null ? fmtM(e.transbordo_m) : "—"}</td>
                        {e.serie.map((s, j) => <Celula key={j} v={s.v} c={s.c} />)}
                        <Celula v={e.atual_m} c={e.atual_classe} forte />
                        <td className="border border-gray-200 px-1 py-0.5 text-center font-bold text-gray-700 sm:px-2 sm:py-1">{e.fonte}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
