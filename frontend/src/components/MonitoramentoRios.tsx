"use client";

import { RefreshCw } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { COTA_ESTILOS, CotaClasse, fetchRiosMonitoramento, REDECS, RioEstacao, RiosMonitoramento } from "@/lib/api";
import { intervaloVisivel } from "@/lib/intervaloVisivel";

// Aba Hidrologia > "Monitoramento dos rios" (21/11/2026): nível horário das estações automáticas (INEA e ANA) agrupado por REDEC e, dentro dela, por rio.
// Um rio que corta várias REDECs (ex.: Paraíba do Sul) aparece em cada uma só com as estações daquela REDEC. As cores são as das cotas do painel (COTA_ESTILOS).
// Lançamento manual (COMDEC/DBM) fica para uma segunda etapa.

const JANELAS = [12, 24, 48] as const;
const TZ = "America/Sao_Paulo";
const fmtM = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(2).replace(".", ","));
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(":00", "H");
const diaDe = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
const rotuloRedec = (n: number | null, regiao: string) => (n == null ? "Sem REDEC" : `REDEC ${n} — ${regiao.charAt(0) + regiao.slice(1).toLowerCase()}`);

function Celula({ v, c, forte = false }: { v: number | null; c: CotaClasse | null; forte?: boolean }) {
  // Só colore o que passou da cota de atenção (normal e sem cota ficam neutros, como na tabela impressa).
  const destaque = c && c !== "normal" && c !== "sem_cota";
  const e = destaque ? COTA_ESTILOS[c] : null;
  return (
    <td
      className={`whitespace-nowrap border border-gray-200 px-1.5 py-1 text-center tabular-nums ${forte ? "font-bold" : ""} ${v == null ? "text-gray-300" : "text-gray-900"}`}
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
    const lista = (dados?.estacoes ?? []).filter((e) => (redec === "todas" || String(e.redec) === redec) && (!somenteComAlerta || e.serie.some((s) => s.c && ["alerta", "transbordo", "extrema"].includes(s.c)) || (e.atual_classe && ["alerta", "transbordo", "extrema"].includes(e.atual_classe))));
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-gray-200 px-3 py-2 text-sm">
        <label className="flex items-center gap-1.5 text-gray-600">
          REDEC
          <select value={redec} onChange={(ev) => setRedec(ev.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1 text-sm">
            <option value="todas">Todas</option>
            {REDECS.map((nome, i) => (
              <option key={nome} value={String(i + 1)}>{i + 1} — {nome.charAt(0) + nome.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Janela de horas">
          {JANELAS.map((h) => (
            <button key={h} type="button" onClick={() => setHoras(h)} className={`rounded-full px-3 py-1 text-xs font-semibold ${horas === h ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
              {h} h
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={somenteComAlerta} onChange={(ev) => setSomenteComAlerta(ev.target.checked)} />
          só estações em alerta ou acima
        </label>
        <button type="button" onClick={carregar} className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50" title="Atualizar agora">
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} /> Atualizar
        </button>
        <span className="text-xs text-gray-500">
          {total} estações{idade != null ? ` · atualizado há ${idade} min` : ""} · níveis em metros, hora de Brasília
        </span>
      </div>
      {erro && <div className="m-3 rounded bg-red-50 p-2 text-xs text-red-600">Não foi possível carregar o monitoramento dos rios ({erro}).</div>}
      <div className="min-h-0 flex-1 overflow-auto">
        {!dados && !erro && <div className="p-6 text-sm text-gray-500">Carregando…</div>}
        {dados && !total && <div className="p-6 text-sm text-gray-500">Nenhuma estação para este filtro.</div>}
        {dados && total > 0 && (
          <table className="min-w-full border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20 bg-blue-200 text-[11px] uppercase text-gray-800">
              <tr>
                <th className="sticky left-0 z-30 min-w-24 border border-gray-300 bg-blue-200 px-2 py-1.5">Rio</th>
                <th className="sticky left-24 z-30 min-w-44 border border-gray-300 bg-blue-200 px-2 py-1.5 text-left">Município / estação</th>
                <th className="border border-gray-300 bg-yellow-100 px-2 py-1.5 text-red-700">Transb.</th>
                {marcas.map((m, i) => (
                  <th key={m} className="whitespace-nowrap border border-gray-300 px-1.5 py-1.5" title={`${diaDe(m)} ${horaDe(m)}`}>
                    {horaDe(m)}
                    {(i === 0 || diaDe(m) !== diaDe(marcas[i - 1])) && horas > 12 ? <div className="text-[9px] font-normal normal-case text-gray-600">{diaDe(m)}</div> : null}
                  </th>
                ))}
                <th className="border border-gray-300 px-2 py-1.5">Atual</th>
                <th className="border border-gray-300 px-2 py-1.5">Fonte</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.titulo}>
                  <tr>
                    <td colSpan={marcas.length + 5} className="sticky left-0 border border-gray-300 bg-slate-700 px-2 py-1 text-left text-xs font-bold uppercase tracking-wide text-white">
                      {g.titulo}
                    </td>
                  </tr>
                  {[...g.rios.entries()].map(([rio, ests]) =>
                    ests.map((e, i) => (
                      <tr key={e.id} className="hover:bg-blue-50/40">
                        {i === 0 && (
                          <td rowSpan={ests.length} className="sticky left-0 z-10 border border-gray-300 bg-indigo-50 px-2 py-1 text-center font-bold text-gray-800">
                            {rio}
                          </td>
                        )}
                        <td className={`sticky left-24 z-10 whitespace-nowrap border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-900`}>
                          {e.municipality} <span className="font-normal text-gray-500">— {e.name}</span>
                        </td>
                        <td className="border border-gray-200 bg-yellow-50 px-1.5 py-1 text-center font-bold tabular-nums text-red-700">{e.transbordo_m != null ? fmtM(e.transbordo_m) : "—"}</td>
                        {e.serie.map((s, j) => <Celula key={j} v={s.v} c={s.c} />)}
                        <Celula v={e.atual_m} c={e.atual_classe} forte />
                        <td className="border border-gray-200 px-2 py-1 text-center font-bold text-gray-700">{e.fonte}</td>
                      </tr>
                    )),
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-200 px-3 py-1.5 text-[11px] text-gray-600">
        {(["atencao", "alerta", "transbordo", "extrema"] as const).map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: COTA_ESTILOS[c].bg }} />
            {COTA_ESTILOS[c].label}
          </span>
        ))}
        <span>— sem leitura nessa hora · cada hora usa a última leitura até ela (no máx. 60 min antes)</span>
      </div>
    </div>
  );
}
