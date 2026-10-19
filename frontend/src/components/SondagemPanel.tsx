"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchDatasSondagem, fetchEstacoesSondagem, fetchHorasSondagem, fetchSondagemImagem, Opcao, SONDAGEM_ESTACAO_RJ } from "@/lib/inmet";

// Estações próximas ao RJ aparecem primeiro na lista.
const PRIORIDADE = [SONDAGEM_ESTACAO_RJ, "83779", "83649", "83566", "83840"];

/** Sub-aba "Sondagem" (Meteorologia): radiossondagem do INMET (diagrama Skew-T) — padrão: Galeão (RJ). */
export default function SondagemPanel() {
  const [estacoes, setEstacoes] = useState<Opcao[]>([]);
  const [est, setEst] = useState(SONDAGEM_ESTACAO_RJ);
  const [datas, setDatas] = useState<{ data: string; rotulo: string }[]>([]);
  const [iData, setIData] = useState(0);
  const [horas, setHoras] = useState<string[]>([]);
  const [hora, setHora] = useState<string | null>(null);
  const [imagem, setImagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetchEstacoesSondagem()
      .then((l) => setEstacoes([...l].sort((a, b) => (PRIORIDADE.indexOf(a.sigla) + 1 || 99) - (PRIORIDADE.indexOf(b.sigla) + 1 || 99) || a.nome.localeCompare(b.nome))))
      .catch(() => setErro("Não foi possível carregar a lista de estações do INMET."));
  }, []);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregando(true);
      setDatas([]);
      setImagem(null);
    });
    fetchDatasSondagem(est)
      .then((d) => {
        if (cancelado) return;
        setDatas(d);
        setIData(0);
        setErro(d.length ? null : "Sem sondagens recentes para esta estação.");
        if (!d.length) setCarregando(false);
      })
      .catch(() => {
        if (!cancelado) {
          setErro("Sondagem indisponível no INMET no momento.");
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
      setImagem(null);
    });
    fetchHorasSondagem(est, data)
      .then(async (h) => {
        if (cancelado) return;
        setHoras(h);
        const hh = h.includes(hora ?? "") ? (hora as string) : h[h.length - 1];
        setHora(hh);
        if (!hh) throw new Error("sem hora");
        const img = await fetchSondagemImagem(est, data, hh);
        if (!cancelado) {
          setImagem(img);
          setErro(null);
        }
      })
      .catch(() => {
        if (!cancelado) setErro("Não há imagem de sondagem para este dia.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [est, data]);

  const nomeEst = estacoes.find((e) => e.sigla === est)?.nome ?? "Galeão (RJ)";
  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Sondagem atmosférica</span>
        <span className="text-xs text-gray-500"> · INMET (radiossonda, diagrama Skew-T)</span>
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm">
        <select aria-label="Estação" value={est} onChange={(e) => setEst(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1.5">
          {(estacoes.length ? estacoes : [{ sigla: SONDAGEM_ESTACAO_RJ, nome: "Galeão (RJ)" }]).map((e) => (
            <option key={e.sigla} value={e.sigla}>
              {e.nome}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Sondagem mais antiga" disabled={iData >= datas.length - 1} onClick={() => setIData(iData + 1)} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40">
          <ChevronLeft size={16} />
        </button>
        <select aria-label="Data" value={iData} onChange={(e) => setIData(Number(e.target.value))} className="rounded border border-gray-300 bg-white px-2 py-1.5">
          {datas.map((d, i) => (
            <option key={d.data} value={i}>
              {d.rotulo}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Sondagem mais recente" disabled={iData <= 0} onClick={() => setIData(iData - 1)} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40">
          <ChevronRight size={16} />
        </button>
        {horas.length > 1 && (
          <select aria-label="Hora" value={hora ?? ""} onChange={(e) => setHora(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1.5">
            {horas.map((h) => (
              <option key={h} value={h}>
                {h} UTC
              </option>
            ))}
          </select>
        )}
        {hora && <span className="text-xs text-gray-500">Lançamento às {hora} UTC</span>}
      </div>
      {erro && <div className="mb-2 rounded bg-amber-50 p-2 text-sm text-amber-800">{erro}</div>}
      {carregando && <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>}
      {imagem && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,40rem)_1fr]">
          <figure className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagem} alt={`Sondagem ${nomeEst}`} className="mx-auto w-full max-w-2xl" />
          </figure>
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-sm">
            <h3 className="mb-1 font-bold text-gray-800">Como ler</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              <li>
                <b className="text-red-600">Linha vermelha:</b> temperatura do ar. <b className="text-blue-600">Linha azul:</b> temperatura do ponto de orvalho.
              </li>
              <li>Quanto mais as duas linhas se aproximam, mais úmida (e mais perto de nuvem/chuva) está aquela camada.</li>
              <li>Barbelas à direita: vento (direção e velocidade) em cada nível. Escalas: hPa em azul (esquerda) e altura em pés.</li>
              <li>Linha cinza: curva de ascensão de uma parcela de ar (estabilidade/instabilidade).</li>
              <li>Linhas tracejadas horizontais: tropopausa.</li>
            </ul>
            <p className="mt-3 text-[11px] text-gray-400">
              Fonte: INMET — Sondagem atmosférica ({nomeEst}). A imagem é produzida pelo INMET; o painel não calcula índices (CAPE, CIN): para mapas de instabilidade veja Modelos → COSMO (índices K, CAPE, Showalter).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
