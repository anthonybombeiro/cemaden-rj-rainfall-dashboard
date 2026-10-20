"use client";

import { useEffect, useMemo, useState } from "react";

import { hhmm } from "@/components/MareGrafico";
import { faseDaLua, luaNascerOcaso } from "@/lib/astroLua";
import { alertasPraia, cardeal, classeUv, fetchCondicoes, HoraCondicao } from "@/lib/condicoesPraia";

const nf = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d).replace(".", ","));
const duracao = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")} min`;

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="mb-1.5 text-sm font-bold text-gray-700">{titulo}</h3>
      {children}
    </section>
  );
}
function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-gray-100 py-1 text-sm first:border-0">
      <span className="text-gray-500">{rotulo}</span>
      <span className="text-right font-medium text-gray-900">{children}</span>
    </div>
  );
}

/** Condições do dia no ponto do porto: Sol e Lua, amplitude da maré, mar (ondas e temperatura da água) e tempo (vento, UV…).
 * Astronomia calculada no navegador; ondas, água, vento e UV de modelos numéricos (Open-Meteo) — indicativo, não oficial. */
export default function CondicoesDia({
  lat,
  lon,
  dia,
  minutosAgora,
  sol,
  amplitude,
  amplitudeMaxMes,
}: {
  lat: number;
  lon: number;
  dia: string;
  /** Minutos desde 00:00 de hoje (null se o dia exibido não é hoje). */
  minutosAgora: number | null;
  sol: { nascer: number; ocaso: number } | null;
  amplitude: number | null;
  amplitudeMaxMes: number | null;
}) {
  const [horas, setHoras] = useState<HoraCondicao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [hora, setHora] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setHoras(null);
      setErro(null);
    });
    fetchCondicoes(lat, lon, dia)
      .then((h) => !cancelado && setHoras(h))
      .catch(() => !cancelado && setErro("Condições do mar e do tempo indisponíveis para este dia (a previsão cobre de hoje até ~7 dias)."));
    return () => {
      cancelado = true;
    };
  }, [lat, lon, dia]);

  const lua = useMemo(() => faseDaLua(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)), 15)), [dia]);
  const luaHoras = useMemo(() => luaNascerOcaso(dia, lat, lon), [dia, lat, lon]);
  const h = hora ?? (minutosAgora !== null ? Math.min(23, Math.floor(minutosAgora / 60)) : 12);
  const c = horas?.[h];
  const alertas = horas ? alertasPraia(horas) : [];
  const uv = classeUv(c?.uv);
  const relativa = amplitude != null && amplitudeMaxMes ? Math.round((amplitude / amplitudeMaxMes) * 100) : null;

  return (
    <div className="mt-3">
      {alertas.length > 0 && (
        <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>Atenção (indicativo de modelo):</b>
          <ul className="ml-4 list-disc">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Cartao titulo="Sol e Lua">
          <Linha rotulo="☀ Nascer / pôr do Sol">{sol ? `${hhmm(sol.nascer)} / ${hhmm(sol.ocaso)}` : "—"}</Linha>
          <Linha rotulo="Duração do dia">{sol ? duracao(sol.ocaso - sol.nascer) : "—"}</Linha>
          <Linha rotulo={`${lua.emoji} Fase`}>
            {lua.nome} · {Math.round(lua.iluminacao * 100)}%
          </Linha>
          <Linha rotulo="Idade da Lua">{nf(lua.idadeDias)} dias</Linha>
          <Linha rotulo="☾ Nascer / pôr da Lua">
            {luaHoras.nascer != null ? hhmm(luaHoras.nascer) : "—"} / {luaHoras.ocaso != null ? hhmm(luaHoras.ocaso) : "—"}
          </Linha>
        </Cartao>

        <Cartao titulo="Maré">
          <Linha rotulo="Amplitude do dia">{amplitude != null ? `${nf(amplitude, 2)} m` : "—"}</Linha>
          <Linha rotulo="Amplitude no mês">{relativa != null ? `${relativa}% da maior do mês` : "—"}</Linha>
          <Linha rotulo="Tipo (pela Lua)">{lua.sizigia === "sizígia" ? "Sizígia (marés vivas)" : lua.sizigia === "quadratura" ? "Quadratura (marés mortas)" : "Intermediária"}</Linha>
          <p className="mt-1 text-[11px] text-gray-400">Marés vivas: amplitudes maiores, mais correnteza no canal. Fonte: tábuas da Marinha + fase da Lua.</p>
        </Cartao>

        <Cartao titulo={`Mar às ${String(h).padStart(2, "0")}h`}>
          {erro ? (
            <p className="text-sm text-gray-500">{erro}</p>
          ) : !horas ? (
            <p className="text-sm text-gray-400">Carregando…</p>
          ) : (
            <>
              <Linha rotulo="🌊 Altura das ondas">{c?.onda != null ? `${nf(c.onda, 2)} m` : "—"}</Linha>
              <Linha rotulo="Período / direção">
                {c?.ondaPer != null ? `${nf(c.ondaPer, 0)} s` : "—"} · {cardeal(c?.ondaDir)}
              </Linha>
              <Linha rotulo="Ondulação (swell)">{c?.ondulacao != null ? `${nf(c.ondulacao, 2)} m` : "—"}</Linha>
              <Linha rotulo="🌡 Temperatura da água">{c?.tAgua != null ? `${nf(c.tAgua)} °C` : "—"}</Linha>
            </>
          )}
        </Cartao>

        <Cartao titulo={`Tempo às ${String(h).padStart(2, "0")}h`}>
          {erro ? (
            <p className="text-sm text-gray-500">—</p>
          ) : !horas ? (
            <p className="text-sm text-gray-400">Carregando…</p>
          ) : (
            <>
              <Linha rotulo="Temperatura / umidade">
                {nf(c?.temp)} °C · {c?.ur != null ? `${Math.round(c.ur)}%` : "—"}
              </Linha>
              <Linha rotulo="💨 Vento / rajada">
                {c?.vento != null ? Math.round(c.vento) : "—"} / {c?.rajada != null ? Math.round(c.rajada) : "—"} km/h · {cardeal(c?.ventoDir)}
              </Linha>
              <Linha rotulo="☀ Índice UV">
                <span className="rounded px-1.5 py-0.5 text-white" style={{ background: uv.cor }}>
                  {nf(c?.uv, 0)} {uv.rotulo}
                </span>
              </Linha>
              <Linha rotulo="Visibilidade / pressão">
                {c?.visib != null ? `${nf(c.visib / 1000, 0)} km` : "—"} · {c?.pressao != null ? `${Math.round(c.pressao)} hPa` : "—"}
              </Linha>
              <Linha rotulo="Chance de chuva">{c?.chuvaProb != null ? `${Math.round(c.chuvaProb)}%` : "—"}</Linha>
            </>
          )}
        </Cartao>
      </div>

      {horas && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-700">Hora a hora (toque numa linha para ver acima)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2">Hora</th>
                  <th>Onda (m)</th>
                  <th>Per. (s)</th>
                  <th>Água °C</th>
                  <th>Vento/raj. km/h</th>
                  <th>UV</th>
                  <th>Temp. °C</th>
                  <th>Chuva %</th>
                </tr>
              </thead>
              <tbody>
                {horas
                  .filter((x) => x.hora % 3 === 0)
                  .map((x) => (
                    <tr key={x.hora} onClick={() => setHora(x.hora)} className={`cursor-pointer border-t border-gray-100 ${x.hora === h || x.hora === Math.floor(h / 3) * 3 ? "bg-blue-50" : ""}`}>
                      <td className="py-1 pr-2 font-semibold text-gray-800">{String(x.hora).padStart(2, "0")}h</td>
                      <td>{nf(x.onda, 2)}</td>
                      <td>{nf(x.ondaPer, 0)}</td>
                      <td>{nf(x.tAgua)}</td>
                      <td>
                        {x.vento != null ? Math.round(x.vento) : "—"}/{x.rajada != null ? Math.round(x.rajada) : "—"}
                      </td>
                      <td>
                        <span style={{ color: classeUv(x.uv).cor }} className="font-semibold">
                          {nf(x.uv, 0)}
                        </span>
                      </td>
                      <td>{nf(x.temp)}</td>
                      <td>{x.chuvaProb != null ? Math.round(x.chuvaProb) : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-gray-400">
        Sol e Lua: cálculo astronômico no navegador. Ondas, temperatura da água, vento, UV e tempo: previsão de modelos numéricos (ECMWF/WAM, DWD, NOAA) via Open-Meteo para o ponto do porto — indicativo, sem validação local. Para
        avisos oficiais de ressaca e mau tempo use a aba Avisos de mau tempo (Marinha, INMET, Defesa Civil).
      </p>
    </div>
  );
}
