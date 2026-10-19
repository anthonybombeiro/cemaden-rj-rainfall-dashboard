"use client";

import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchSondagemNumerica, SondagemNumerica } from "@/lib/api";
import { fetchDatasSondagem, fetchHorasSondagem, fetchSondagemImagem } from "@/lib/inmet";
import {
  ESTACOES_CPTEC,
  PONTO_MONAN_DA_ESTACAO,
  PONTOS_MONAN,
  rodadasMonan,
  slotsObservados,
  urlSkewtMonan,
  urlSkewtObservada,
  validadesMonan,
} from "@/lib/sondagemCptec";

type Slot = { data: string; hora: string };
const campo = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";
const botaoIcone = "rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40";
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** Testa se uma imagem existe (sem CORS: carrega num <img> de memória). */
function imagemExiste(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(true);
    i.onerror = () => resolve(false);
    i.src = url;
  });
}

// ------------------------------------------------------------------ observada CPTEC
function ObservadaCptec({ est, onSlot }: { est: string; onSlot: (s: Slot) => void }) {
  const slots = useMemo(() => slotsObservados(10), []);
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [i, setI] = useState<number | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all(slots.map(async (s) => [`${s.data}${s.hora}`, await imagemExiste(urlSkewtObservada(est, s.data, s.hora))] as const)).then((r) => {
      if (cancelado) return;
      const m = Object.fromEntries(r);
      setOk(m);
      setI((atual) => (atual !== null && m[`${slots[atual].data}${slots[atual].hora}`] ? atual : Math.max(slots.findIndex((s) => m[`${s.data}${s.hora}`]), 0)));
    });
    return () => {
      cancelado = true;
    };
  }, [est, slots]);

  const s = i !== null ? slots[i] : null;
  useEffect(() => {
    if (s) onSlot({ data: s.data, hora: s.hora });
  }, [s, onSlot]);

  if (i === null) return <p className="p-6 text-center text-sm text-gray-400">Procurando sondagens…</p>;
  const url = urlSkewtObservada(est, slots[i].data, slots[i].hora);
  const disponivel = ok[`${slots[i].data}${slots[i].hora}`];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button type="button" aria-label="Mais antiga" disabled={i >= slots.length - 1} onClick={() => setI(i + 1)} className={botaoIcone}>
          <ChevronLeft size={16} />
        </button>
        <select aria-label="Horário" value={i} onChange={(e) => setI(Number(e.target.value))} className={campo}>
          {slots.map((x, k) => (
            <option key={`${x.data}${x.hora}`} value={k}>
              {x.rotulo}
              {ok[`${x.data}${x.hora}`] ? "" : " (sem imagem)"}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Mais recente" disabled={i <= 0} onClick={() => setI(i - 1)} className={botaoIcone}>
          <ChevronRight size={16} />
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
          abrir em tela cheia
        </a>
      </div>
      {disponivel ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Sondagem observada CPTEC ${est}`} className="w-full rounded border border-gray-200 bg-white" />
      ) : (
        <p className="p-6 text-center text-sm text-gray-500">Sem sondagem do CPTEC para este horário/estação.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ observada INMET
function ObservadaInmet({ est, onSlot }: { est: string; onSlot: (s: Slot) => void }) {
  const [datas, setDatas] = useState<{ data: string; rotulo: string }[]>([]);
  const [iData, setIData] = useState(0);
  const [horas, setHoras] = useState<string[]>([]);
  const [hora, setHora] = useState<string | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregando(true);
      setImg(null);
      setDatas([]);
    });
    fetchDatasSondagem(est)
      .then((d) => {
        if (cancelado) return;
        setDatas(d);
        setIData(0);
        setMsg(d.length ? null : "O INMET não tem sondagem para esta estação.");
        if (!d.length) setCarregando(false);
      })
      .catch(() => {
        if (!cancelado) {
          setMsg("O INMET não tem sondagem para esta estação (ou está indisponível).");
          setCarregando(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [est]);

  const data = datas[iData]?.data;
  useEffect(() => {
    if (!data) return;
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregando(true);
      setImg(null);
    });
    fetchHorasSondagem(est, data)
      .then(async (h) => {
        if (cancelado) return;
        setHoras(h);
        const hh = h[h.length - 1];
        setHora(hh);
        if (!hh) throw new Error("sem hora");
        const b = await fetchSondagemImagem(est, data, hh);
        if (!cancelado) {
          setImg(b);
          setMsg(null);
          onSlot({ data, hora: Number(hh) <= 6 ? "00" : "12" });
        }
      })
      .catch(() => !cancelado && setMsg("Não há imagem de sondagem do INMET para este dia."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [est, data, onSlot]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button type="button" aria-label="Mais antiga" disabled={iData >= datas.length - 1} onClick={() => setIData(iData + 1)} className={botaoIcone}>
          <ChevronLeft size={16} />
        </button>
        <select aria-label="Data" value={iData} onChange={(e) => setIData(Number(e.target.value))} className={campo}>
          {datas.map((d, k) => (
            <option key={d.data} value={k}>
              {d.rotulo}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Mais recente" disabled={iData <= 0} onClick={() => setIData(iData - 1)} className={botaoIcone}>
          <ChevronRight size={16} />
        </button>
        {hora && <span className="text-xs text-gray-500">Lançamento às {hora} UTC{horas.length > 1 ? ` (+${horas.length - 1})` : ""}</span>}
      </div>
      {msg && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{msg}</p>}
      {carregando && <p className="p-6 text-center text-sm text-gray-400">Carregando…</p>}
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={`Sondagem INMET ${est}`} className="mx-auto w-full max-w-2xl rounded border border-gray-200 bg-white" />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ MONAN (previsto)
function SondagemMonan({ est }: { est: string }) {
  const ponto = PONTO_MONAN_DA_ESTACAO[est];
  const nomePonto = PONTOS_MONAN.find((p) => p.id === ponto)?.nome;
  const runs = useMemo(() => rodadasMonan(), []);
  const [run, setRun] = useState<string | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!ponto) return;
    let cancelado = false;
    (async () => {
      for (const r of runs) {
        if (await imagemExiste(urlSkewtMonan(ponto, r, validadesMonan(r)[0]))) {
          if (!cancelado) {
            setRun(r);
            setI(0);
          }
          return;
        }
      }
      if (!cancelado) setRun("");
    })();
    return () => {
      cancelado = true;
    };
  }, [ponto, runs]);

  if (!ponto) return <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">O MONAN não tem ponto de sondagem para esta estação. Escolha o Galeão, Vitória, Campo de Marte, Confins, Curitiba, Brasília ou Florianópolis.</p>;
  if (run === null) return <p className="p-6 text-center text-sm text-gray-400">Procurando a rodada…</p>;
  if (run === "") return <p className="p-6 text-center text-sm text-gray-500">Rodada do MONAN indisponível no momento.</p>;
  const vals = validadesMonan(run);
  const url = urlSkewtMonan(ponto, run, vals[i]);
  const rot = `${String(vals[i].getUTCDate()).padStart(2, "0")}/${String(vals[i].getUTCMonth() + 1).padStart(2, "0")} ${String(vals[i].getUTCHours()).padStart(2, "0")}Z (+${i * 3} h)`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <select aria-label="Rodada" value={run} onChange={(e) => { setRun(e.target.value); setI(0); }} className={campo}>
          {runs.map((r) => (
            <option key={r} value={r}>
              Rodada {dataBr(r)} 00Z
            </option>
          ))}
        </select>
        <button type="button" aria-label="Anterior" disabled={i <= 0} onClick={() => setI(i - 1)} className={botaoIcone}>
          <ChevronLeft size={16} />
        </button>
        <input type="range" min={0} max={vals.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} className="w-32 flex-1" aria-label="Validade" />
        <button type="button" aria-label="Próxima" disabled={i >= vals.length - 1} onClick={() => setI(i + 1)} className={botaoIcone}>
          <ChevronRight size={16} />
        </button>
        <span className="text-xs font-semibold text-gray-700">{rot}</span>
      </div>
      <p className="mb-1 text-xs text-gray-500">Ponto do modelo: {nomePonto}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={url} src={url} alt={`Sondagem do MONAN ${nomePonto} ${rot}`} className="w-full rounded border border-gray-200 bg-white" onError={(e) => ((e.currentTarget.style.opacity = "0.2"))} />
    </div>
  );
}

// ------------------------------------------------------------------ números (Wyoming)
type Faixa = { max: number; texto: string; cor: string };
const COR = { verde: "bg-green-100 text-green-800", amarelo: "bg-yellow-100 text-yellow-800", laranja: "bg-orange-100 text-orange-800", vermelho: "bg-red-100 text-red-800" };
function faixa(valor: number, faixas: Faixa[]): Faixa {
  return faixas.find((f) => valor < f.max) ?? faixas[faixas.length - 1];
}
// Faixas indicativas (literatura corrente; não são limiares operacionais do CEMADEN-RJ).
const FAIXAS: Record<string, Faixa[]> = {
  MUCAPE: [
    { max: 300, texto: "fraca", cor: COR.verde },
    { max: 1000, texto: "moderada", cor: COR.amarelo },
    { max: 2500, texto: "forte", cor: COR.laranja },
    { max: Infinity, texto: "muito forte", cor: COR.vermelho },
  ],
  KINX: [
    { max: 20, texto: "baixo", cor: COR.verde },
    { max: 26, texto: "baixo a moderado", cor: COR.verde },
    { max: 31, texto: "moderado", cor: COR.amarelo },
    { max: 36, texto: "alto", cor: COR.laranja },
    { max: Infinity, texto: "muito alto", cor: COR.vermelho },
  ],
  TOTL: [
    { max: 44, texto: "baixo", cor: COR.verde },
    { max: 51, texto: "moderado", cor: COR.amarelo },
    { max: 56, texto: "alto", cor: COR.laranja },
    { max: Infinity, texto: "muito alto", cor: COR.vermelho },
  ],
  SHOW: [
    { max: -5.5, texto: "muito instável", cor: COR.vermelho },
    { max: -2.5, texto: "instável", cor: COR.laranja },
    { max: 0.5, texto: "pouco instável", cor: COR.amarelo },
    { max: Infinity, texto: "estável", cor: COR.verde },
  ],
  SWET: [
    { max: 250, texto: "baixo", cor: COR.verde },
    { max: 300, texto: "moderado", cor: COR.amarelo },
    { max: 400, texto: "alto", cor: COR.laranja },
    { max: Infinity, texto: "muito alto", cor: COR.vermelho },
  ],
  DCAPE: [
    { max: 500, texto: "baixo", cor: COR.verde },
    { max: 1000, texto: "moderado", cor: COR.amarelo },
    { max: Infinity, texto: "alto (rajadas)", cor: COR.laranja },
  ],
};
const ROTULO: Record<string, string> = {
  MUCAPE: "CAPE (mais instável)",
  MUCIN: "CIN (mais instável)",
  DCAPE: "CAPE descendente",
  KINX: "Índice K",
  TOTL: "Total Totals",
  SHOW: "Showalter",
  LFVT: "Lifted virtual",
  SWET: "SWEAT",
  PWAT: "Água precipitável",
  LCLZ: "Nível de condensação (LCL)",
  CCLP: "Nível de convecção (CCL)",
};
const ORDEM = ["MUCAPE", "MUCIN", "DCAPE", "KINX", "TOTL", "SHOW", "LFVT", "SWET", "PWAT", "LCLZ", "CCLP"];
const NIVEIS = [1000, 925, 850, 700, 500, 300, 200];
const UNIDADES: Record<string, string> = {
  "joule / kilogram": "J/kg",
  delta_degree_Celsius: "°C",
  degree_Celsius: "°C",
  hectopascal: "hPa",
  millimeter: "mm",
  meter: "m",
  dimensionless: "",
};
const unidade = (u: string) => UNIDADES[u] ?? u;

function Numeros({ est, slot }: { est: string; slot: Slot | null }) {
  const [d, setD] = useState<SondagemNumerica | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!slot) return;
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregando(true);
      setErro(null);
    });
    fetchSondagemNumerica(est, slot.data, slot.hora)
      .then((r) => !cancelado && setD(r))
      .catch(() => {
        if (!cancelado) {
          setD(null);
          setErro("Números indisponíveis para este local/horário (Universidade de Wyoming).");
        }
      })
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [est, slot]);

  const csv = () => {
    if (!d) return;
    const cab = Object.keys(d.perfil[0]).join(";");
    const linhas = d.perfil.map((p) => Object.values(p).map((v) => (v === null ? "" : String(v).replace(".", ","))).join(";"));
    const blob = new Blob([[cab, ...linhas].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sondagem_${d.estacao}_${d.data}_${d.hora}Z.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-gray-700">Números da sondagem (CAPE, CIN e índices)</h3>
        {slot && <span className="text-xs text-gray-500">{dataBr(slot.data)} {slot.hora}Z · Universidade de Wyoming</span>}
        {d && (
          <button type="button" onClick={csv} className="ml-auto inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs hover:bg-gray-200">
            <Download size={13} /> Perfil em CSV
          </button>
        )}
      </div>
      {carregando && <p className="p-4 text-center text-sm text-gray-400">Carregando…</p>}
      {erro && <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{erro}</p>}
      {d && !carregando && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ORDEM.filter((k) => d.indices[k]).map((k) => {
              const ind = d.indices[k];
              const f = FAIXAS[k] ? faixa(ind.valor, FAIXAS[k]) : null;
              return (
                <div key={k} className={`rounded p-2 ${f ? f.cor : "bg-gray-50 text-gray-800"}`}>
                  <div className="text-[11px] opacity-80">{ROTULO[k] ?? ind.nome}</div>
                  <div className="text-lg font-semibold">
                    {ind.valor.toLocaleString("pt-BR")} <span className="text-[11px] font-normal">{unidade(ind.unidade)}</span>
                  </div>
                  {f && <div className="text-[11px]">{f.texto}</div>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1 pr-2">hPa</th>
                  <th className="py-1 pr-2">Altura (m)</th>
                  <th className="py-1 pr-2">T (°C)</th>
                  <th className="py-1 pr-2">Td (°C)</th>
                  <th className="py-1 pr-2">UR (%)</th>
                  <th className="py-1">Vento</th>
                </tr>
              </thead>
              <tbody>
                {NIVEIS.map((n) => {
                  const p = d.perfil.find((x) => x.pres !== null && Math.abs((x.pres as number) - n) < 0.5);
                  return (
                    <tr key={n} className="border-t border-gray-100">
                      <td className="py-1 pr-2 font-semibold text-gray-800">{n}</td>
                      <td className="py-1 pr-2">{p?.hght ?? "—"}</td>
                      <td className="py-1 pr-2">{p?.temp ?? "—"}</td>
                      <td className="py-1 pr-2">{p?.dwpt ?? "—"}</td>
                      <td className="py-1 pr-2">{p?.relh ?? "—"}</td>
                      <td className="py-1">{p?.drct != null && p?.sped != null ? `${p.drct}° / ${Math.round(p.sped * 1.944)} kt` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Os valores de CAPE/CIN de Wyoming (parcela mais instável) usam outro método de cálculo que o das imagens do CPTEC (que trazem CAPE de superfície, camada mista e mais instável) e podem diferir.
            Faixas de cor indicativas, não são limiares operacionais.
          </p>
        </>
      )}
    </section>
  );
}

/** Sub-aba "Sondagem": observada (CPTEC ou INMET), prevista (MONAN) e números (Wyoming). Padrão: Galeão (83746). */
export default function SondagemPanel() {
  const [est, setEst] = useState("83746");
  const [fonte, setFonte] = useState<"cptec" | "inmet">("cptec");
  const [slot, setSlot] = useState<Slot | null>(null);
  const nome = ESTACOES_CPTEC.find((e) => e.id === est)?.nome ?? est;

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Sondagem atmosférica</span>
        <span className="text-xs text-gray-500"> · observada (CPTEC/INMET), prevista (MONAN) e números (Wyoming)</span>
      </h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Estação"
          value={est}
          onChange={(e) => {
            setEst(e.target.value);
            setSlot(null);
          }}
          className={`${campo} max-w-[18rem]`}
        >
          {ESTACOES_CPTEC.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">{nome} · {est}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-gray-700">Observada</h3>
            <div className="flex overflow-hidden rounded border border-gray-300 text-sm" role="group" aria-label="Fonte da sondagem observada">
              {(["cptec", "inmet"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFonte(f)} className={`px-3 py-1 font-medium ${fonte === f ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
                  {f === "cptec" ? "CPTEC" : "INMET"}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-gray-400">{fonte === "cptec" ? "Skew-T + hodógrafa + CAPE, CINE, LFC, EL, SRH, K…" : "Skew-T"}</span>
          </div>
          {fonte === "cptec" ? <ObservadaCptec key={`c${est}`} est={est} onSlot={setSlot} /> : <ObservadaInmet key={`i${est}`} est={est} onSlot={setSlot} />}
        </section>
        <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-gray-700">
            Prevista — modelo MONAN <span className="text-[11px] font-normal text-gray-400">(CPTEC, 3 em 3 h, até 72 h)</span>
          </h3>
          <SondagemMonan key={`m${est}`} est={est} />
        </section>
      </div>

      <div className="mt-3">
        <Numeros est={est} slot={slot} />
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Fontes: CPTEC/INPE (Nowcasting), INMET e University of Wyoming. Mais mapas de instabilidade (K, CAPE) em Previsão numérica → Estrutura vertical.
      </p>
    </div>
  );
}
