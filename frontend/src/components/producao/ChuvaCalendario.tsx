"use client";

import { useEffect, useMemo, useState } from "react";

import { REDECS } from "@/lib/api";
import { CalendarioChuva, DiaChuva, fetchCalendarioChuva, nomeRegiao } from "@/lib/producaoMet";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (v: number) => v.toFixed(1).replace(".", ",");
/** Cor da célula pela maior chuva do dia (mesmas faixas de severidade do Resumo: 10 / 30 / 70 mm). */
const corDia = (mm: number) => (mm >= 70 ? { bg: "#CC0000", fg: "#fff" } : mm >= 30 ? { bg: "#FFA600", fg: "#0f172a" } : { bg: "#FFFF66", fg: "#0f172a" });

type Resumo = { max_mm: number; n_estacoes: number };

/** Calendário do mês com os dias em que alguma estação do estado (ou da REDEC escolhida) somou 10 mm ou mais (dia civil local). */
export default function ChuvaCalendario({ dia }: { dia: string }) {
  const [mes, setMes] = useState(dia.slice(0, 7));
  const [regiao, setRegiao] = useState("");
  const [dados, setDados] = useState<CalendarioChuva | null>(null);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMes(dia.slice(0, 7)), [dia]);
  useEffect(() => {
    let vivo = true;
    fetchCalendarioChuva(mes)
      .then((d) => { if (vivo) { setDados(d); setErro(false); } })
      .catch(() => { if (vivo) { setDados(null); setErro(true); } });
    return () => { vivo = false; };
  }, [mes]);

  const porDia = useMemo(() => {
    const m = new Map<string, { resumo: Resumo; dia: DiaChuva }>();
    for (const d of dados?.dias ?? []) {
      const resumo: Resumo | undefined = regiao ? d.por_regiao[regiao] : { max_mm: d.max_mm, n_estacoes: d.n_estacoes };
      if (resumo) m.set(d.data, { resumo, dia: d });
    }
    return m;
  }, [dados, regiao]);

  const [ano, m] = mes.split("-").map(Number);
  const diasNoMes = new Date(ano, m, 0).getDate();
  const vazios = new Date(ano, m - 1, 1).getDay();
  const vai = (n: number) => { const d = new Date(ano, m - 1 + n, 1); setMes(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); setAberto(null); };
  const limiar = dados?.limiar ?? 10;
  const sel = aberto ? porDia.get(aberto) : null;
  const detalhe = sel ? sel.dia.estacoes.filter((e) => !regiao || e.regiao === regiao) : [];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm md:max-w-md">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Dias com chuva ≥ {limiar} mm — {MESES[m - 1]} de {ano}</h3>
        <span className="flex gap-1">
          <button type="button" onClick={() => vai(-1)} className="rounded border px-2 text-sm hover:bg-gray-50" aria-label="Mês anterior">‹</button>
          <button type="button" onClick={() => vai(1)} className="rounded border px-2 text-sm hover:bg-gray-50" aria-label="Próximo mês">›</button>
        </span>
      </div>
      <select value={regiao} onChange={(e) => { setRegiao(e.target.value); setAberto(null); }} className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs" aria-label="REDEC">
        <option value="">Todo o estado</option>
        {REDECS.map((r, i) => <option key={r} value={r}>{i + 1} · {nomeRegiao(r)}</option>)}
      </select>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500">{SEMANA.map((s, i) => <div key={i}>{s}</div>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const iso = `${mes}-${pad(i + 1)}`;
          const x = porDia.get(iso);
          const c = x ? corDia(x.resumo.max_mm) : null;
          return (
            <button
              key={iso}
              type="button"
              disabled={!x}
              onClick={() => setAberto(aberto === iso ? null : iso)}
              title={x ? `${fmt(x.resumo.max_mm)} mm (maior) · ${x.resumo.n_estacoes} estação(ões) ≥ ${limiar} mm` : "Sem estação acima do limiar"}
              className={`flex aspect-square flex-col items-center justify-center rounded text-[11px] leading-tight ${x ? "font-semibold" : "bg-gray-50 text-gray-400"} ${aberto === iso ? "ring-2 ring-gray-900" : ""}`}
              style={c ? { background: c.bg, color: c.fg } : undefined}
            >
              {i + 1}
              {x && <span className="text-[9px] font-normal">{x.resumo.max_mm.toFixed(0)}</span>}
            </button>
          );
        })}
      </div>
      {erro && <p className="mt-2 text-xs text-red-600">Não foi possível carregar o calendário de chuva.</p>}
      {!dados && !erro && <p className="mt-2 text-xs text-gray-500">Carregando…</p>}
      {dados && porDia.size === 0 && <p className="mt-2 text-xs text-gray-500">Nenhum dia do mês com estação acima de {limiar} mm{regiao ? " nesta REDEC" : ""}.</p>}
      {sel && (
        <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs">
          <b>{aberto!.slice(8)}/{aberto!.slice(5, 7)}</b> — {sel.resumo.n_estacoes} estação(ões) com {limiar} mm ou mais
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
            {detalhe.slice(0, 40).map((e) => (
              <li key={`${e.estacao}-${e.fonte}`}><b>{fmt(e.mm)} mm</b> · {e.municipio} · {e.estacao}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[10px] text-gray-500">
        Soma das leituras de chuva no dia civil (hora local) de qualquer estação do RJ; cores pela maior chuva do dia (≥ 10, ≥ 30 e ≥ 70 mm).
      </p>
    </div>
  );
}
