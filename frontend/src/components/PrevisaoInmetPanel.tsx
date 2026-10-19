"use client";

import { Droplets, Sunrise, Sunset, Wind } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchPrevisoes, Previsao, REDECS } from "@/lib/api";
import { DiaPrevisaoInmet, fetchPrevisaoInmet, PeriodoPrevisaoInmet } from "@/lib/inmet";

type Municipio = { codarea: string; nome: string };

/** Município do INMET usado como referência de cada região (REDEC) do CEMADEN-RJ na comparação. Ajustável. */
const MUNICIPIO_DA_REGIAO: Record<(typeof REDECS)[number], string> = {
  CAPITAL: "Rio de Janeiro",
  "BAIXADA FLUMINENSE": "Nova Iguaçu",
  "BAIXADA LITORÂNEA": "Cabo Frio",
  "COSTA VERDE": "Angra dos Reis",
  METROPOLITANA: "Niterói",
  NORTE: "Campos dos Goytacazes",
  NOROESTE: "Itaperuna",
  "SERRANA I": "Petrópolis",
  "SERRANA II": "Nova Friburgo",
  "SUL I": "Volta Redonda",
  "SUL II": "Resende",
};

const dataExtenso = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
};

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Bloco({ rotulo, p }: { rotulo?: string; p: PeriodoPrevisaoInmet }) {
  return (
    <div className="rounded bg-gray-50 p-2 text-xs text-gray-700">
      <div className="flex items-center gap-2">
        {p.icone && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.icone} alt="" className="h-8 w-8 shrink-0 object-contain" />
        )}
        <div className="min-w-0">
          {rotulo && <div className="font-semibold uppercase text-gray-500">{rotulo}</div>}
          <div className="leading-snug">{p.resumo}</div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-gray-500">
        <span className="inline-flex items-center gap-1">
          <Wind size={12} /> {p.dir_vento} · {p.int_vento}
        </span>
        <span className="inline-flex items-center gap-1">
          <Droplets size={12} /> {p.umidade_min}–{p.umidade_max}%
        </span>
      </div>
    </div>
  );
}

function CartaoDia({ dia }: { dia: DiaPrevisaoInmet }) {
  const g = dia.geral;
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 border-t-4 border-t-blue-600 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold capitalize text-gray-800">{dataExtenso(dia.iso)}</h3>
        <span className="text-[11px] text-gray-400">{dia.diaSemana}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-red-50 py-1">
          <div className="text-[11px] text-gray-500">Máx</div>
          <div className="text-lg font-semibold text-red-600">{g.temp_max}°C</div>
        </div>
        <div className="rounded bg-blue-50 py-1">
          <div className="text-[11px] text-gray-500">Mín</div>
          <div className="text-lg font-semibold text-blue-600">{g.temp_min}°C</div>
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {dia.periodos ? (
          (["manha", "tarde", "noite"] as const).map((k) => dia.periodos?.[k] && <Bloco key={k} rotulo={k === "manha" ? "Manhã" : k === "tarde" ? "Tarde" : "Noite"} p={dia.periodos[k] as PeriodoPrevisaoInmet} />)
        ) : (
          <Bloco p={g} />
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1">
          <Sunrise size={12} className="text-amber-500" /> {g.nascer}
        </span>
        <span className="inline-flex items-center gap-1">
          <Sunset size={12} className="text-amber-700" /> {g.ocaso}
        </span>
      </div>
    </div>
  );
}

type LinhaComparacao = { regiao: string; municipio: string; inmet?: DiaPrevisaoInmet; cemaden?: Previsao };

/** Sub-aba "Previsão INMET": previsão oficial do INMET por município (5 dias) e comparação com a previsão do CEMADEN-RJ por região. */
export default function PrevisaoInmetPanel() {
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [cod, setCod] = useState("3304557");
  const [dias, setDias] = useState<DiaPrevisaoInmet[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [linhas, setLinhas] = useState<LinhaComparacao[] | null>(null);
  const [comparando, setComparando] = useState(false);
  const [diaComp, setDiaComp] = useState(hojeLocal());

  useEffect(() => {
    fetch("/rj_municipios.geojson")
      .then((r) => r.json())
      .then((g: { features: { properties: { codarea: string; nome: string } }[] }) =>
        setMunicipios(g.features.map((f) => ({ codarea: f.properties.codarea, nome: f.properties.nome })).sort((a, b) => a.nome.localeCompare(b.nome))),
      )
      .catch(() => setMunicipios([]));
  }, []);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(() => {
      if (!cancelado) setCarregando(true);
    });
    fetchPrevisaoInmet(cod)
      .then((d) => {
        if (!cancelado) {
          setDias(d);
          setErro(d.length ? null : "O INMET não devolveu previsão para este município.");
        }
      })
      .catch(() => !cancelado && setErro("Previsão do INMET indisponível no momento."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [cod]);

  const nomeMun = municipios.find((m) => m.codarea === cod)?.nome ?? "Rio de Janeiro";

  const comparar = useCallback(async () => {
    setComparando(true);
    try {
      const cem = await fetchPrevisoes(diaComp).catch(() => [] as Previsao[]);
      const res = await Promise.all(
        REDECS.map(async (regiao): Promise<LinhaComparacao> => {
          const nome = MUNICIPIO_DA_REGIAO[regiao];
          const m = municipios.find((x) => x.nome === nome);
          let inmet: DiaPrevisaoInmet | undefined;
          if (m) inmet = (await fetchPrevisaoInmet(m.codarea).catch(() => [])).find((d) => d.iso === diaComp);
          return { regiao, municipio: nome, inmet, cemaden: cem.find((c) => c.regiao.toUpperCase() === regiao) };
        }),
      );
      setLinhas(res);
    } finally {
      setComparando(false);
    }
  }, [diaComp, municipios]);

  const hoje = hojeLocal();
  const datasDisponiveis = useMemo(() => dias.map((d) => d.iso), [dias]);
  const campo = "rounded border border-gray-300 bg-white px-2 py-1.5";
  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-4">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Previsão INMET</span>
        <span className="text-xs text-gray-500"> · previsão oficial por município (até 5 dias)</span>
      </h2>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Município" value={cod} onChange={(e) => setCod(e.target.value)} className={campo}>
          {(municipios.length ? municipios : [{ codarea: "3304557", nome: "Rio de Janeiro" }]).map((m) => (
            <option key={m.codarea} value={m.codarea}>
              {m.nome}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">Fonte: INMET (prevmet). A previsão do CEMADEN-RJ está na aba &quot;Previsão CEMADEN-RJ&quot;.</span>
      </div>

      {erro && <div className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">{erro}</div>}
      {carregando ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label={`Previsão do INMET para ${nomeMun}`}>
          {dias.map((d) => (
            <CartaoDia key={d.iso} dia={d} />
          ))}
        </div>
      )}

      <section className="mt-5 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <h3 className="mb-1 text-sm font-bold text-gray-700">Comparação com a previsão do CEMADEN-RJ</h3>
        <p className="mb-2 text-xs text-gray-500">
          Cada região do CEMADEN-RJ é comparada com um município de referência do INMET (ajustável no código). Diferença de temperatura de 3 °C ou mais fica destacada.
        </p>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Dia da comparação" value={diaComp} onChange={(e) => { setDiaComp(e.target.value); setLinhas(null); }} className={campo}>
            {(datasDisponiveis.length ? datasDisponiveis : [hoje]).map((d) => (
              <option key={d} value={d}>
                {dataExtenso(d)}
              </option>
            ))}
          </select>
          <button type="button" onClick={comparar} disabled={comparando || municipios.length === 0} className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {comparando ? "Carregando…" : linhas ? "Atualizar comparação" : "Comparar agora"}
          </button>
          <span className="text-[11px] text-gray-400">Baixa a previsão de 11 municípios (~2,5 MB).</span>
        </div>
        {linhas && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2">Região (CEMADEN)</th>
                  <th className="py-1 pr-2">CEMADEN-RJ</th>
                  <th className="py-1 pr-2">Município INMET</th>
                  <th className="py-1">INMET</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const dMax = l.cemaden && l.inmet ? Math.abs(l.cemaden.temperatura_maxima - l.inmet.geral.temp_max) : 0;
                  const dMin = l.cemaden && l.inmet ? Math.abs(l.cemaden.temperatura_minima - l.inmet.geral.temp_min) : 0;
                  const diverge = dMax >= 3 || dMin >= 3;
                  return (
                    <tr key={l.regiao} className={`border-t border-gray-100 align-top ${diverge ? "bg-amber-50" : ""}`}>
                      <td className="py-1.5 pr-2 font-semibold text-gray-800">{l.regiao}</td>
                      <td className="py-1.5 pr-2 text-gray-700">
                        {l.cemaden ? (
                          <>
                            <b>{l.cemaden.temperatura_maxima}°</b> / {l.cemaden.temperatura_minima}°
                            {l.cemaden.comentario && <div className="max-w-xs text-[11px] text-gray-500">{l.cemaden.comentario}</div>}
                          </>
                        ) : (
                          <span className="text-gray-400">sem previsão</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-gray-600">{l.municipio}</td>
                      <td className="py-1.5 text-gray-700">
                        {l.inmet ? (
                          <>
                            <b>{l.inmet.geral.temp_max}°</b> / {l.inmet.geral.temp_min}°<div className="max-w-xs text-[11px] text-gray-500">{l.inmet.geral.resumo}</div>
                          </>
                        ) : (
                          <span className="text-gray-400">indisponível</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
