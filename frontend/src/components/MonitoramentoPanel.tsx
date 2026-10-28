"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import Etiqueta from "@/components/monitoramento/Etiqueta";
import MapaNiveis from "@/components/monitoramento/MapaNiveis";
import { intervaloVisivel } from "@/lib/intervaloVisivel";
import { corTextoSobre, ESCALA_NM, fetchNiveis, fmtDataHora, NiveisResposta, NIVEIS_NM } from "@/lib/nivelMonitoramento";

/** Aba "Nível de Monitoramento" (Alertas): só a visualização do NM vigente por município (PLANCON 2026/2027) — contagens, mapa
 * interativo, regionais e municípios em NM 2 ou acima. O lançamento, as pendências, o histórico e o guia ficam na aba Produção;
 * `onLancar` leva os municípios escolhidos para lá. */
export default function MonitoramentoPanel({ onLancar }: { onLancar?: (municipios: string[]) => void }) {
  const [dados, setDados] = useState<NiveisResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [atualizando, setAtualizando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setDados(await fetchNiveis());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);
  useEffect(() => {
    carregar();
    return intervaloVisivel(carregar, 60_000);
  }, [carregar]);

  const regioes = useMemo(() => {
    const m = new Map<string, { regiao: string; municipios: string[]; max: number; contagem: number[] }>();
    for (const n of dados?.niveis ?? []) {
      const r = m.get(n.regiao) ?? { regiao: n.regiao, municipios: [], max: 0, contagem: [0, 0, 0, 0, 0, 0] };
      r.municipios.push(n.municipio);
      r.max = Math.max(r.max, n.nivel);
      r.contagem[n.nivel] += 1;
      m.set(n.regiao, r);
    }
    return [...m.values()].sort((a, b) => b.max - a.max || a.regiao.localeCompare(b.regiao));
  }, [dados]);
  const ativos = useMemo(() => (dados?.niveis ?? []).filter((n) => n.nivel >= 2).sort((a, b) => b.nivel - a.nivel || a.regiao.localeCompare(b.regiao) || a.municipio.localeCompare(b.municipio)), [dados]);

  const alternar = (municipio: string) => setSelecionados((s) => (s.includes(municipio) ? s.filter((x) => x !== municipio) : [...s, municipio]));
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/publico`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sem clipboard: o link aparece ao lado */
    }
  };

  if (!dados) return <div className="p-6 text-center text-sm text-gray-500">{erro ? `Não foi possível carregar o Nível de Monitoramento (${erro}).` : "Carregando Nível de Monitoramento…"}</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-800">Nível de Monitoramento — PLANCON 2026/2027</h2>
          <p className="text-xs text-gray-500">Por município · vale o nível mais alto entre meteorologia, hidrologia e geologia · atualizado {fmtDataHora(dados.gerado_em)}. O lançamento do nível fica na aba <b>Produção</b>.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <a href="/publico" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
            <ExternalLink size={13} aria-hidden /> Página pública (sem login)
          </a>
          <button type="button" onClick={copiar} className="rounded border border-gray-300 bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-gray-50">{copiado ? "Link copiado" : "Copiar link público"}</button>
          <button type="button" onClick={() => { setAtualizando(true); carregar().finally(() => setAtualizando(false)); }} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw size={13} className={atualizando ? "animate-spin" : ""} aria-hidden /> Atualizar
          </button>
        </div>
      </div>

      {/* contagem por nível: clicar destaca os municípios daquele nível no mapa */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {NIVEIS_NM.map((n) => {
          const e = ESCALA_NM[n];
          const qtd = dados.resumo[String(n)] ?? 0;
          return (
            <button
              key={n}
              type="button"
              disabled={qtd === 0}
              onClick={() => setSelecionados(dados.niveis.filter((m) => m.nivel === n).map((m) => m.municipio))}
              className="rounded-md px-2 py-1.5 text-left shadow-sm disabled:opacity-60"
              style={{ background: e.cor, color: corTextoSobre(e.cor) }}
              title={`Destacar os ${qtd} município(s) em ${e.sigla}`}
            >
              <span className="block text-[11px] font-semibold leading-tight">{e.sigla} · {e.nome}</span>
              <span className="text-xl font-extrabold leading-tight">{qtd}</span>
            </button>
          );
        })}
      </div>

      {selecionados.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="min-w-0 flex-1"><b>{selecionados.length}</b> município(s) em destaque: {selecionados.slice(0, 8).join(", ")}{selecionados.length > 8 ? "…" : ""}</span>
          {onLancar && <button type="button" onClick={() => onLancar(selecionados)} className="rounded bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700">Lançar nível para estes →</button>}
          <button type="button" onClick={() => setSelecionados([])} className="rounded border border-blue-300 bg-white px-2.5 py-1 text-blue-800 hover:bg-blue-100">Limpar</button>
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <MapaNiveis niveis={dados.niveis} selecionados={new Set(selecionados)} onClique={(m) => alternar(m)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
            {NIVEIS_NM.map((n) => <span key={n} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-black/20" style={{ background: ESCALA_NM[n].cor }} />{ESCALA_NM[n].sigla} {ESCALA_NM[n].nome}</span>)}
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-black/30" style={{ background: "repeating-linear-gradient(45deg,#fff 0 3px,#111827 3px 5px)" }} />vigência vencida (revisar)</span>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr><th className="px-2 py-1.5">Regional (REDEC)</th>{NIVEIS_NM.map((n) => <th key={n} className="px-1.5 py-1.5 text-center">{ESCALA_NM[n].sigla}</th>)}<th className="px-2 py-1.5">Maior nível</th></tr>
              </thead>
              <tbody>
                {regioes.map((r) => (
                  <tr key={r.regiao} className="cursor-pointer border-t border-gray-100 hover:bg-blue-50" onClick={() => setSelecionados(r.municipios)} title="Destacar os municípios da regional">
                    <td className="px-2 py-1 font-medium text-gray-700">{r.regiao}</td>
                    {r.contagem.map((c, i) => <td key={i} className={`px-1.5 py-1 text-center ${c ? "font-semibold text-gray-900" : "text-gray-300"}`}>{c}</td>)}
                    <td className="px-2 py-1"><Etiqueta n={r.max} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-bold text-gray-800">Municípios em NM 2 ou acima</h3>
            {ativos.length === 0 ? (
              <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">Nenhum município acima do NM 1 neste momento.</p>
            ) : (
              <div className="max-h-72 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left text-gray-500"><tr><th className="px-2 py-1.5">Município</th><th className="px-2 py-1.5">Regional</th><th className="px-2 py-1.5">Nível</th><th className="px-2 py-1.5">Vigência</th></tr></thead>
                  <tbody>
                    {ativos.map((n) => (
                      <tr key={n.municipio} className="cursor-pointer border-t border-gray-100 hover:bg-blue-50" onClick={() => alternar(n.municipio)}>
                        <td className="px-2 py-1 font-medium text-gray-800">{n.municipio}</td>
                        <td className="px-2 py-1 text-gray-600">{n.regiao}</td>
                        <td className="px-2 py-1"><Etiqueta n={n.nivel} /></td>
                        <td className={`px-2 py-1 ${n.vencida ? "font-semibold text-red-600" : "text-gray-600"}`}>{n.vencida ? "Vencida — revisar" : n.vigencia_ate ? `até ${fmtDataHora(n.vigencia_ate)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {erro && <p className="text-xs text-red-600">Última atualização falhou ({erro}); mostrando o último dado carregado.</p>}
    </div>
  );
}
