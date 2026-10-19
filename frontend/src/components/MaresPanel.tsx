"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchMares, MaresAno, PortoMare } from "@/lib/produtosMarinha";

const TZ = "America/Sao_Paulo";

function hojeLocal(): { data: string; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => partes.find((p) => p.type === t)?.value ?? "00";
  return { data: `${g("year")}-${g("month")}-${g("day")}`, minutos: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
}

function somaDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const minutosDe = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const nf = (v: number) => v.toFixed(2).replace(".", ",");

type Ponto = { t: number; h: number }; // t = minutos desde 00:00 do dia exibido (pode ser <0 ou >1440)

function pontosDoDia(porto: PortoMare, dia: string): Ponto[] {
  const mk = (iso: string, deslocamento: number): Ponto[] => (porto.dias[iso] ?? []).map(([hh, h]) => ({ t: minutosDe(hh) + deslocamento, h }));
  return [...mk(somaDias(dia, -1), -1440), ...mk(dia, 0), ...mk(somaDias(dia, 1), 1440)];
}

/** Altura estimada por interpolação cossenoidal entre extremos consecutivos (aproximação usual entre preamar e baixa-mar). */
function alturaEm(pontos: Ponto[], t: number): number | null {
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    if (t >= a.t && t <= b.t) return (a.h + b.h) / 2 + ((a.h - b.h) / 2) * Math.cos((Math.PI * (t - a.t)) / (b.t - a.t));
  }
  return null;
}

function GraficoMare({ pontos, nivelMedio, agora }: { pontos: Ponto[]; nivelMedio: number | null; agora: number | null }) {
  const W = 720;
  const H = 240;
  const m = { l: 36, r: 10, t: 12, b: 26 };
  const hs = pontos.filter((p) => p.t >= -180 && p.t <= 1620).map((p) => p.h);
  if (hs.length === 0) return null;
  const min = Math.floor((Math.min(...hs) - 0.1) * 10) / 10;
  const max = Math.ceil((Math.max(...hs) + 0.1) * 10) / 10;
  const x = (t: number) => m.l + (t / 1440) * (W - m.l - m.r);
  const y = (h: number) => m.t + (1 - (h - min) / (max - min)) * (H - m.t - m.b);
  const curva: string[] = [];
  for (let t = 0; t <= 1440; t += 10) {
    const h = alturaEm(pontos, t);
    if (h != null) curva.push(`${curva.length ? "L" : "M"}${x(t).toFixed(1)},${y(h).toFixed(1)}`);
  }
  const marcas = pontos.filter((p) => p.t >= 0 && p.t <= 1440);
  const passoY = max - min > 1.2 ? 0.5 : 0.25;
  const linhasY: number[] = [];
  for (let v = Math.ceil(min / passoY) * passoY; v <= max; v += passoY) linhasY.push(Math.round(v * 100) / 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="max-h-80 w-full" role="img" aria-label="Curva da maré no dia">
      {linhasY.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="#e5e7eb" />
          <text x={m.l - 4} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#6b7280">
            {nf(v)}
          </text>
        </g>
      ))}
      {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hh) => (
        <g key={hh}>
          <line x1={x(hh * 60)} x2={x(hh * 60)} y1={m.t} y2={H - m.b} stroke="#f3f4f6" />
          <text x={x(hh * 60)} y={H - 8} textAnchor="middle" fontSize="10" fill="#6b7280">
            {String(hh).padStart(2, "0")}h
          </text>
        </g>
      ))}
      {nivelMedio != null && nivelMedio >= min && nivelMedio <= max && (
        <g>
          <line x1={m.l} x2={W - m.r} y1={y(nivelMedio)} y2={y(nivelMedio)} stroke="#9ca3af" strokeDasharray="4 3" />
          <text x={W - m.r - 2} y={y(nivelMedio) - 3} textAnchor="end" fontSize="9" fill="#6b7280">
            nível médio {nf(nivelMedio)} m
          </text>
        </g>
      )}
      <path d={curva.join(" ")} fill="none" stroke="#2563eb" strokeWidth="2" />
      {marcas.map((p) => (
        <circle key={p.t} cx={x(p.t)} cy={y(p.h)} r="3.5" fill="#1d4ed8" />
      ))}
      {agora != null && (
        <g>
          <line x1={x(agora)} x2={x(agora)} y1={m.t} y2={H - m.b} stroke="#dc2626" strokeWidth="1.5" />
          <text x={x(agora) + 3} y={m.t + 9} fontSize="10" fill="#dc2626">
            agora
          </text>
        </g>
      )}
    </svg>
  );
}

/** Sub-aba "Marés" (Meteorologia): tábuas de maré da Marinha (CHM/DHN) para os portos do RJ. Dados extraídos dos PDFs
 * anuais por backend/scripts/gerar_mares_marinha.py (public/mares-AAAA.json). */
export default function MaresPanel() {
  const [hoje, setHoje] = useState(hojeLocal);
  const [dados, setDados] = useState<MaresAno | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [porto, setPorto] = useState(0);
  const [dia, setDia] = useState(() => hojeLocal().data);

  useEffect(() => {
    const t = setInterval(() => setHoje(hojeLocal()), 60_000);
    return () => clearInterval(t);
  }, []);

  const ano = Number(dia.slice(0, 4));
  useEffect(() => {
    let cancelado = false;
    fetchMares(ano)
      .then((d) => {
        if (!cancelado) {
          setDados(d);
          setErro(null);
        }
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro ao carregar as tábuas de maré.");
      });
    return () => {
      cancelado = true;
    };
  }, [ano]);

  const p = dados?.portos[porto];
  const pontos = useMemo(() => (p ? pontosDoDia(p, dia) : []), [p, dia]);
  const doDia = useMemo(() => p?.dias[dia] ?? [], [p, dia]);
  const ehHoje = dia === hoje.data;

  // Classifica cada extremo (preamar/baixa-mar) comparando com os vizinhos (inclui dias adjacentes).
  const classif = useMemo(() => {
    return doDia.map(([hh, h]) => {
      const t = minutosDe(hh);
      const i = pontos.findIndex((x) => x.t === t && x.h === h);
      const ant = pontos[i - 1];
      const prox = pontos[i + 1];
      const alta = (ant ? h > ant.h : true) && (prox ? h > prox.h : true);
      return alta ? "Preamar" : "Baixa-mar";
    });
  }, [doDia, pontos]);

  const proxima = ehHoje ? doDia.map(([hh, h], i) => ({ hh, h, tipo: classif[i], t: minutosDe(hh) })).find((x) => x.t > hoje.minutos) : undefined;
  const mes = dia.slice(0, 7);
  const diasDoMes = p ? Object.keys(p.dias).filter((k) => k.startsWith(mes)).sort() : [];

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Tábuas de maré do RJ</span>
        <span className="text-xs text-gray-500"> · MB/CHM/DHN {ano} (horário local, alturas em metros)</span>
      </h2>
      {erro && <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
      {!dados && !erro && <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>}
      {dados && p && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm">
            <select aria-label="Porto" value={porto} onChange={(e) => setPorto(Number(e.target.value))} className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 sm:w-auto">
              {dados.portos.map((x, i) => (
                <option key={x.codigo} value={i}>
                  {x.nome}
                </option>
              ))}
            </select>
            <button type="button" aria-label="Dia anterior" onClick={() => setDia(somaDias(dia, -1))} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200">
              <ChevronLeft size={16} />
            </button>
            <input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1" />
            <button type="button" aria-label="Próximo dia" onClick={() => setDia(somaDias(dia, 1))} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200">
              <ChevronRight size={16} />
            </button>
            {!ehHoje && (
              <button type="button" onClick={() => setDia(hoje.data)} className="rounded bg-blue-600 px-2.5 py-1.5 font-medium text-white hover:bg-blue-700">
                Hoje
              </button>
            )}
          </div>

          {doDia.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Sem tábua para {dataBR(dia)} neste arquivo.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm lg:col-span-2">
                <div className="mb-1 text-xs text-gray-500">
                  {p.nome} · Lat {p.latitude} · Lon {p.longitude}
                </div>
                <GraficoMare pontos={pontos} nivelMedio={p.nivel_medio} agora={ehHoje ? hoje.minutos : null} />
                <p className="mt-1 text-[11px] text-gray-400">Curva estimada por interpolação entre as preamares e baixa-mares da tábua (aproximação); os pontos azuis são os valores oficiais.</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                <h3 className="mb-1 text-sm font-bold text-gray-700">{dataBR(dia)}</h3>
                {proxima && (
                  <p className="mb-2 rounded bg-blue-50 p-2 text-sm text-blue-900">
                    Próxima {proxima.tipo.toLowerCase()}: <b>{proxima.hh}</b> ({nf(proxima.h)} m)
                  </p>
                )}
                <table className="w-full text-sm">
                  <tbody>
                    {doDia.map(([hh, h], i) => (
                      <tr key={hh} className="border-t border-gray-100">
                        <td className="py-1 font-semibold text-gray-800">{hh}</td>
                        <td className="py-1 text-gray-600">{classif[i]}</td>
                        <td className={`py-1 text-right font-medium ${classif[i] === "Preamar" ? "text-blue-700" : "text-amber-700"}`}>{nf(h)} m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {p.nivel_medio != null && <p className="mt-2 text-xs text-gray-500">Nível médio: {nf(p.nivel_medio)} m</p>}
              </div>
            </div>
          )}

          <details className="mt-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-gray-700">Tábua do mês ({mes.split("-").reverse().join("/")})</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 pr-2">Dia</th>
                    <th className="py-1">Horários e alturas (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {diasDoMes.map((d) => (
                    <tr key={d} className={`border-t border-gray-100 ${d === dia ? "bg-blue-50" : ""} cursor-pointer`} onClick={() => setDia(d)}>
                      <td className="py-1 pr-2 font-semibold text-gray-800">{d.slice(8)}</td>
                      <td className="py-1 text-gray-700">{p.dias[d].map(([hh, h]) => `${hh} ${nf(h)}`).join("  ·  ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="mt-2 text-[11px] text-gray-400">
            Fonte: Marinha do Brasil — Centro de Hidrografia da Marinha (tábuas de maré {ano}, www.marinha.mil.br/chm). Alturas acima do nível de redução da carta náutica.
            Previsão astronômica: não inclui o efeito de vento e pressão (maré meteorológica).
          </p>
        </>
      )}
    </div>
  );
}
