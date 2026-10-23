"use client";

import { Pause, Play, StepBack, StepForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { carregarMunicipios, LinhaRanking, Municipio, rankingMunicipios } from "@/lib/modelosExtras";
import { BandaPonto, bandaNoPonto, Escala, Geo, itensLegenda, MODELOS_CONJUNTO, MODELOS_GRADE, ModeloGrade, Produto, rotuloRun, SeriePonto, serieNoPonto } from "@/lib/modelosGrade";

const campo = "min-w-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs";
const FUSO = "America/Sao_Paulo";

export const fmtValidade = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(ms)).replace(",", "");

const fmtNum = (v: number, un: string) => (un === "mm" || un === "km" || un === "Pa/s" || un === "%" ? v.toFixed(v < 10 ? 1 : 0) : Math.round(v).toString()).replace(".", ",");

// ---------------------------------------------------------------- seletores
export function SeletoresModelo({
  modelo, onModelo, produtos, produtoId, onProduto, opacidade, onOpacidade, contornos, contornoId, onContorno,
}: {
  modelo: ModeloGrade; onModelo: (m: ModeloGrade) => void; produtos: Produto[]; produtoId: string; onProduto: (p: string) => void;
  opacidade?: number; onOpacidade?: (o: number) => void;
  contornos?: { id: string; rotulo: string }[]; contornoId?: string; onContorno?: (id: string) => void;
}) {
  const grupos = useMemo(() => Array.from(new Set(produtos.map((p) => p.grupo))), [produtos]);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <select aria-label="Modelo" value={modelo} onChange={(e) => onModelo(e.target.value as ModeloGrade)} className={`${campo} font-semibold`}>
        <optgroup label="Determinísticos">
          {MODELOS_GRADE.filter((m) => !m.conjunto).map((m) => (
            <option key={m.id} value={m.id}>{m.rotulo}</option>
          ))}
        </optgroup>
        <optgroup label="Conjuntos (probabilidades)">
          {MODELOS_GRADE.filter((m) => m.conjunto).map((m) => (
            <option key={m.id} value={m.id}>{m.rotulo}</option>
          ))}
        </optgroup>
      </select>
      <select aria-label="Produto" value={produtoId} onChange={(e) => onProduto(e.target.value)} className={campo} disabled={!produtos.length}>
        {grupos.map((g) => (
          <optgroup key={g} label={g}>
            {produtos.filter((p) => p.grupo === g).map((p) => (
              <option key={p.id} value={p.id}>{p.rotulo}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {onContorno && (
        <select aria-label="Contornos" value={contornoId ?? ""} onChange={(e) => onContorno(e.target.value)} className={`${campo} col-span-2`}>
          <option value="">Contornos: nenhum</option>
          {(contornos ?? []).map((c) => (
            <option key={c.id} value={c.id}>Contornos: {c.rotulo}</option>
          ))}
        </select>
      )}
      {onOpacidade && (
        <label className="col-span-2 flex items-center gap-2 text-[11px] text-gray-600">
          Transparência
          <input type="range" min={0.2} max={1} step={0.05} value={opacidade ?? 0.75} onChange={(e) => onOpacidade(Number(e.target.value))} className="min-w-0 flex-1" aria-label="Opacidade da camada" />
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- legenda
export function LegendaModelo({ escala, rotulo, nota, valor }: { escala: Escala; rotulo: string; nota?: string; valor?: number | null }) {
  const itens = itensLegenda(escala);
  const degraus = itens.length > 8;
  return (
    <div className="text-[11px] text-gray-700">
      <p className="mb-1 font-semibold leading-tight">{rotulo} <span className="font-normal text-gray-500">({escala.un})</span></p>
      {degraus ? (
        <div className="flex">
          {itens.map((i) => (
            <div key={i.valor} className="flex-1 text-center">
              <div className="h-2.5" style={{ background: i.css }} />
              <span className="text-[9px] text-gray-500">{i.valor}</span>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div className="h-2.5 w-full rounded-sm" style={{ background: `linear-gradient(to right, ${itens.map((i) => i.css).join(",")})` }} />
          <div className="flex justify-between text-[9px] text-gray-500">
            {itens.map((i) => (
              <span key={i.valor}>{Math.round(i.valor * 10) / 10}</span>
            ))}
          </div>
        </div>
      )}
      {nota && <p className="mt-0.5 text-[10px] text-amber-700">{nota}</p>}
      <p className="mt-0.5 h-4 text-[11px] font-semibold text-gray-800">{valor != null ? `${fmtNum(valor, escala.un)} ${escala.un} sob o cursor` : "Passe o mouse ou toque no mapa"}</p>
    </div>
  );
}

// ---------------------------------------------------------------- barra de tempo
export function BarraTempoModelo({
  horas, runMs, hora, onHora, tocando, onTocar,
}: { horas: number[]; runMs: number; hora: number; onHora: (h: number) => void; tocando: boolean; onTocar: (t: boolean) => void }) {
  const i = Math.max(horas.indexOf(hora), 0);
  const ir = (k: number) => onHora(horas[Math.min(Math.max(k, 0), horas.length - 1)]);
  useEffect(() => {
    if (!tocando || horas.length < 2) return;
    const t = setInterval(() => onHora(horas[(horas.indexOf(hora) + 1) % horas.length]), 900);
    return () => clearInterval(t);
  }, [tocando, horas, hora, onHora]);
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <button type="button" aria-label="Hora anterior" onClick={() => { onTocar(false); ir(i - 1); }} disabled={i <= 0} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40"><StepBack size={14} /></button>
      <button type="button" aria-label={tocando ? "Parar" : "Animar"} onClick={() => onTocar(!tocando)} disabled={horas.length < 2} className={`rounded p-1.5 text-white disabled:opacity-40 ${tocando ? "bg-red-600" : "bg-blue-600"}`}>{tocando ? <Pause size={14} /> : <Play size={14} />}</button>
      <button type="button" aria-label="Próxima hora" onClick={() => { onTocar(false); ir(i + 1); }} disabled={i >= horas.length - 1} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40"><StepForward size={14} /></button>
      <input type="range" min={0} max={Math.max(horas.length - 1, 0)} value={i} onChange={(e) => { onTocar(false); ir(Number(e.target.value)); }} className="min-w-0 flex-1" aria-label="Hora de validade" disabled={horas.length < 2} />
      <span className="w-28 shrink-0 text-right font-semibold text-gray-800">{fmtValidade(runMs + hora * 3600000)}</span>
    </div>
  );
}

// ---------------------------------------------------------------- meteograma do ponto
type Serie = { cor: string; rotulo: string; pts: { t: number; v: number }[]; barra?: boolean; tracejado?: boolean; faixa?: { t: number; lo: number; hi: number }[] };

function PainelSerie({ titulo, un, series, largura, agoraMs }: { titulo: string; un: string; series: Serie[]; largura: number; agoraMs: number }) {
  const H = 78, ml = 28, mr = 6, mt = 4, mb = 14;
  const todos = series.flatMap((s) => [...s.pts.filter((p) => p.v === p.v), ...(s.faixa ?? []).flatMap((f) => [{ t: f.t, v: f.lo }, { t: f.t, v: f.hi }].filter((q) => q.v === q.v))]);
  if (!todos.length) return null;
  const tMin = Math.min(...todos.map((p) => p.t)), tMax = Math.max(...todos.map((p) => p.t));
  const barras = series.some((s) => s.barra);
  const vMin = barras ? 0 : Math.floor(Math.min(...todos.map((p) => p.v)));
  let vMax = Math.max(...todos.map((p) => p.v));
  if (vMax <= vMin) vMax = vMin + 1;
  const x = (t: number) => ml + ((t - tMin) / (tMax - tMin || 1)) * (largura - ml - mr);
  const y = (v: number) => mt + (1 - (v - vMin) / (vMax - vMin)) * (H - mt - mb);
  const dias: number[] = [];
  for (let t = Math.ceil(tMin / 86400000) * 86400000; t <= tMax; t += 86400000) dias.push(t);
  const larguraBarra = Math.max(2, ((largura - ml - mr) / Math.max(...series.map((s) => s.pts.length), 1)) * 0.7 / Math.max(series.filter((s) => s.barra).length, 1));
  return (
    <svg viewBox={`0 0 ${largura} ${H}`} width="100%" role="img" aria-label={titulo}>
      <text x={ml} y={9} fontSize={9.5} fontWeight={600} fill="currentColor">{titulo} ({un})</text>
      {[vMin, (vMin + vMax) / 2, vMax].map((v) => (
        <g key={v}>
          <line x1={ml} x2={largura - mr} y1={y(v)} y2={y(v)} stroke="#e1e0d9" strokeWidth={0.7} />
          <text x={ml - 3} y={y(v) + 3} fontSize={8.5} textAnchor="end" fill="#898781">{fmtNum(v, un)}</text>
        </g>
      ))}
      {dias.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={mt} y2={H - mb} stroke="#c3c2b7" strokeWidth={0.7} strokeDasharray="2 2" />
          <text x={x(t) + 2} y={H - 3} fontSize={8.5} fill="#898781">{new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(new Date(t + 3 * 3600000))}</text>
        </g>
      ))}
      {agoraMs >= tMin && agoraMs <= tMax && <line x1={x(agoraMs)} x2={x(agoraMs)} y1={mt} y2={H - mb} stroke="#d03b3b" strokeWidth={1} />}
      {series.map((s) => {
        if (s.faixa) {
          const f = s.faixa.filter((p) => p.lo === p.lo && p.hi === p.hi);
          if (f.length < 2) return null;
          const d = `M${f.map((p) => `${x(p.t)},${y(p.hi)}`).join(" L")} L${[...f].reverse().map((p) => `${x(p.t)},${y(p.lo)}`).join(" L")} Z`;
          return <path key={s.rotulo} d={d} fill={s.cor} opacity={0.18} />;
        }
        const k = series.indexOf(s);
        const v = s.pts.filter((p) => p.v === p.v);
        if (s.barra) {
          const off = (k - (series.filter((q) => q.barra).length - 1) / 2) * larguraBarra;
          return v.map((p) => <rect key={p.t} x={x(p.t) + off - larguraBarra / 2} y={y(p.v)} width={larguraBarra} height={Math.max(0, y(0) - y(p.v))} fill={s.cor} opacity={0.85} />);
        }
        return <polyline key={s.rotulo} points={v.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} fill="none" stroke={s.cor} strokeWidth={1.6} strokeDasharray={s.tracejado ? "4 3" : undefined} strokeLinejoin="round" />;
      })}
    </svg>
  );
}

const runMsDe = (run: string) => Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10));

/** Meteograma do ponto clicado: modelos determinísticos (chuva, temperatura, vento) e a faixa de incerteza dos conjuntos
 * (IFS ENS e GEFS: chuva acumulada mediana/percentil 90 e temperatura p10–p90). */
export function PontoMeteograma({ lat, lon, modelos }: { lat: number; lon: number; modelos: ModeloGrade[] }) {
  const [res, setRes] = useState<{ chave: string; series: (SeriePonto | null)[]; bandas: (BandaPonto | null)[] } | null>(null);
  const chave = `${lat.toFixed(3)},${lon.toFixed(3)},${modelos.join("+")}`;
  useEffect(() => {
    let cancelado = false;
    Promise.all([
      Promise.all(modelos.map((m) => serieNoPonto(m, lat, lon).catch(() => null))),
      Promise.all(MODELOS_CONJUNTO.map((m) => bandaNoPonto(m, lat, lon).catch(() => null))),
    ]).then(([series, bandas]) => !cancelado && setRes({ chave, series, bandas }));
    return () => {
      cancelado = true;
    };
  }, [chave, lat, lon, modelos]);
  const pronto = res && res.chave === chave ? res.series.filter((s): s is SeriePonto => !!s) : null;
  const bandas = res && res.chave === chave ? res.bandas.filter((b): b is BandaPonto => !!b) : [];
  const [agoraMs] = useState(() => Date.now());
  const cor = (m: ModeloGrade) => MODELOS_GRADE.find((x) => x.id === m)?.cor ?? "#2a78d6";
  const L = 330;
  const mk = (pega: (s: SeriePonto) => number[], extra?: Partial<Serie>): Serie[] =>
    (pronto ?? []).map((s) => ({ cor: cor(s.modelo), rotulo: `${s.modelo}${extra?.tracejado ? "-r" : ""}${extra?.barra ? "-b" : ""}`, ...extra, pts: s.horas.map((h, i) => ({ t: runMsDe(s.run) + h * 3600000, v: pega(s)[i] })) }));
  const pts = (b: BandaPonto, v: number[]) => b.horas.map((h, i) => ({ t: runMsDe(b.run) + h * 3600000, v: v[i] }));
  const faixasTemp: Serie[] = bandas.map((b) => ({ cor: cor(b.modelo), rotulo: `${b.modelo}-faixa`, pts: [], faixa: b.horas.map((h, i) => ({ t: runMsDe(b.run) + h * 3600000, lo: b.tempP10[i], hi: b.tempP90[i] })) }));
  return (
    <div style={{ width: L }} className="text-gray-800">
      <p className="mb-1 text-xs font-semibold">Ponto {lat.toFixed(2).replace(".", ",")}°, {lon.toFixed(2).replace(".", ",")}°</p>
      {!pronto ? (
        <p className="py-6 text-center text-xs text-gray-500">Carregando séries…</p>
      ) : !pronto.length && !bandas.length ? (
        <p className="py-6 text-center text-xs text-gray-500">Ponto fora da área dos modelos (Sudeste).</p>
      ) : (
        <>
          <div className="mb-1 flex flex-wrap gap-x-3 text-[10px] text-gray-600">
            {[...pronto.map((s) => ({ m: s.modelo, run: s.run })), ...bandas.map((b) => ({ m: b.modelo, run: b.run }))].map((s) => (
              <span key={s.m} className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: cor(s.m) }} />{s.m.toUpperCase()} {rotuloRun(s.run)}</span>
            ))}
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-0.5 bg-red-600" />agora</span>
          </div>
          <PainelSerie titulo="Chuva (mm por 3 h)" un="mm" series={mk((s) => s.chuva3h, { barra: true })} largura={L} agoraMs={agoraMs} />
          <PainelSerie
            titulo="Chuva acumulada (linha cheia: modelo; tracejado: p90 do conjunto)"
            un="mm"
            series={[...mk((s) => s.chuvaAcum), ...bandas.flatMap((b) => [
              { cor: cor(b.modelo), rotulo: `${b.modelo}-p50`, pts: pts(b, b.chuvaP50), tracejado: false },
              { cor: cor(b.modelo), rotulo: `${b.modelo}-p90`, pts: pts(b, b.chuvaP90), tracejado: true },
            ])]}
            largura={L}
            agoraMs={agoraMs}
          />
          <PainelSerie titulo="Temperatura a 2 m (faixa: p10–p90 do conjunto)" un="°C" series={[...faixasTemp, ...mk((s) => s.temp)]} largura={L} agoraMs={agoraMs} />
          <PainelSerie titulo="Vento a 10 m (traço: rajada)" un="km/h" series={[...mk((s) => s.vento), ...mk((s) => s.rajada, { tracejado: true })]} largura={L} agoraMs={agoraMs} />
          <p className="mt-1 text-[9px] text-gray-400">Interpolado da grade de 0,25° (~25 km): não substitui a previsão local nem as estações. Faixa do conjunto = incerteza.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- ranking por município
const fmtRank = (v: number, un: string) => (un === "%" || un === "mm" || un === "km/h" || un === "m/s" ? v.toFixed(v < 10 ? 1 : 0) : Math.round(v).toString()).replace(".", ",");

/** Ranking dos municípios do RJ pelo maior valor do produto mostrado (e média), calculado a partir da grade. */
export function RankingMunicipios({ valores, geo, un, rotulo, onFoco }: { valores: Float32Array | null; geo: Geo | null; un: string; rotulo: string; onFoco?: (b: [[number, number], [number, number]]) => void }) {
  const [aberto, setAberto] = useState(false);
  const [todos, setTodos] = useState(false);
  const [munis, setMunis] = useState<Municipio[] | null>(null);
  useEffect(() => {
    if (!aberto || munis) return;
    let cancelado = false;
    carregarMunicipios().then((m) => !cancelado && setMunis(m)).catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [aberto, munis]);
  const linhas: LinhaRanking[] | null = useMemo(() => (aberto && munis && valores && geo ? rankingMunicipios(munis, valores, geo) : null), [aberto, munis, valores, geo]);
  return (
    <div className="text-[11px]">
      <button type="button" onClick={() => setAberto((a) => !a)} className="w-full rounded bg-gray-100 px-2 py-1 text-left font-medium text-gray-700 hover:bg-gray-200" aria-expanded={aberto}>
        {aberto ? "▾" : "▸"} Ranking por município
      </button>
      {aberto && (
        <div className="mt-1">
          <p className="mb-1 text-[10px] text-gray-500">{rotulo}: máximo e média dentro de cada município ({un}). Clique para ir ao município.</p>
          {!linhas ? (
            <p className="py-2 text-center text-gray-500">Calculando…</p>
          ) : (
            <>
              <div className="max-h-52 overflow-y-auto overscroll-contain rounded border border-gray-200">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50 text-left text-[10px] text-gray-500">
                    <tr><th className="px-1.5 py-0.5">#</th><th className="px-1.5 py-0.5">Município</th><th className="px-1.5 py-0.5 text-right">Máx.</th><th className="px-1.5 py-0.5 text-right">Média</th></tr>
                  </thead>
                  <tbody>
                    {(todos ? linhas : linhas.slice(0, 15)).map((l, i) => (
                      <tr key={l.nome} onClick={() => onFoco?.(l.bounds)} className="cursor-pointer border-t border-gray-100 hover:bg-blue-50">
                        <td className="px-1.5 py-0.5 text-gray-400">{i + 1}</td>
                        <td className="px-1.5 py-0.5">{l.nome}</td>
                        <td className="px-1.5 py-0.5 text-right font-semibold">{fmtRank(l.max, un)}</td>
                        <td className="px-1.5 py-0.5 text-right text-gray-600">{fmtRank(l.media, un)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {linhas.length > 15 && (
                <button type="button" onClick={() => setTodos((t) => !t)} className="mt-1 text-blue-600 hover:underline">{todos ? "Mostrar só os 15 primeiros" : `Mostrar todos (${linhas.length})`}</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
