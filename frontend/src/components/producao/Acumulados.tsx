"use client";

import { Check, Clipboard, RefreshCw } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { Acumulados as Dados, fetchAcumulados, fmtMm, paraInputLocal, textoAcumulados, tituloAcumulados } from "@/lib/producaoMet";

/** Arte e tabela dos 10 maiores acumulados em 24 h, um por município, com a janela terminando às 06 h (padrão: a última 06 h). A geração da arte
 * (PNG) só aparece quando `NEXT_PUBLIC_MET_EXPERIMENTAL=1`: o modelo visual ainda precisa de aprovação. */
const ARTE_LIBERADA = process.env.NEXT_PUBLIC_MET_EXPERIMENTAL === "1";
const AcumuladosArte = ARTE_LIBERADA ? lazy(() => import("@/components/producao/AcumuladosArte")) : null;

export default function Acumulados() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ref, setRef] = useState<string>("");
  const [copiado, setCopiado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async (r?: string) => {
    setCarregando(true);
    try {
      const d = await fetchAcumulados(r || undefined);
      setDados(d);
      setRef((atual) => (r ? atual : paraInputLocal(d.ref)));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar os acumulados.");
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const copiar = async () => {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(textoAcumulados(dados));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão para a área de transferência */
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <h2 className="text-sm font-bold">Principais acumulados em 24 h</h2>
          <p className="text-[11px] text-gray-500">Um município por linha (a estação de maior valor). A janela termina na hora escolhida (padrão: 06 h).</p>
        </div>
        <label className="ml-auto text-xs">
          Janela termina em
          <input type="datetime-local" value={ref} onChange={(e) => setRef(e.target.value)} className="ml-1 rounded border border-gray-300 px-2 py-1" />
        </label>
        <button type="button" onClick={() => carregar(ref)} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold hover:bg-gray-50" disabled={carregando}>
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} /> Calcular
        </button>
        <button type="button" onClick={copiar} disabled={!dados} className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold hover:bg-gray-50">
          {copiado ? <Check size={13} /> : <Clipboard size={13} />} {copiado ? "Copiado" : "Copiar texto"}
        </button>
      </div>
      {erro && <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">{erro}</p>}
      {dados?.tabela_recomendada && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          ⚠ {dados.estacoes_acima_limiar} estações passaram de {dados.limiar_mm} mm nesta janela: a tabela de acumulados é recomendada.
        </p>
      )}
      {dados && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[320px] flex-1 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b bg-gray-50 px-3 py-1.5 text-xs font-semibold">{tituloAcumulados(dados)} — {dados.municipios_com_chuva} município(s) com chuva</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-gray-500">
                  <th className="px-3 py-1">#</th>
                  <th className="px-3 py-1">Região</th>
                  <th className="px-3 py-1">Município</th>
                  <th className="px-3 py-1 text-right">mm/24h</th>
                  <th className="px-3 py-1">Fonte</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((i) => (
                  <tr key={i.municipio} className="border-t border-gray-100">
                    <td className="px-3 py-1 text-gray-500">{i.posicao}</td>
                    <td className="px-3 py-1">{i.regiao_nome}</td>
                    <td className="px-3 py-1" title={i.estacao}>{i.municipio}</td>
                    <td className="px-3 py-1 text-right font-semibold tabular-nums">{fmtMm(i.valor)}</td>
                    <td className="px-3 py-1">{i.fonte_rotulo}</td>
                  </tr>
                ))}
                {!dados.itens.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-xs text-gray-500">Nenhuma chuva registrada na janela.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="border-t px-3 py-1.5 text-[10px] text-gray-500">
              Soma das leituras de cada estação (valor oficial da fonte não entra em janelas passadas). Weather Underground não entra na arte (uso interno). Municípios de fora do RJ ficam de fora.
            </p>
          </div>
          {AcumuladosArte && (
            <Suspense fallback={null}>
              <AcumuladosArte dados={dados} />
            </Suspense>
          )}
        </div>
      )}
      {!dados && !erro && <p className="text-xs text-gray-500">Carregando…</p>}
    </div>
  );
}
