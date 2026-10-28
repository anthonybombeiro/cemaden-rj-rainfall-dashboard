"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import LancarNivel, { PreLancamento } from "@/components/monitoramento/LancarNivel";
import MapaNiveis from "@/components/monitoramento/MapaNiveis";
import { API_BASE_URL } from "@/lib/api";
import { intervaloVisivel } from "@/lib/intervaloVisivel";
import {
  corTextoSobre,
  ESCALA_NM,
  fetchNiveis,
  fetchRegistrosNivel,
  fetchSugestoes,
  fmtDataHora,
  NiveisResposta,
  NIVEIS_NM,
  RegistroNivel,
  Sugestao,
} from "@/lib/nivelMonitoramento";

type Aba = "lancar" | "pendencias" | "historico" | "guia";

const ROTULO_TIPO: Record<Sugestao["tipo"], string> = {
  risco_tecnico: "Risco técnico acima do nível",
  recomendacao_sirene: "Recomendação de sirene hoje",
  vigencia_vencida: "Vigência vencida",
};
const ROTULO_RISCO: Record<string, string> = { hidrologico: "Hidrológico", geologico: "Geológico", meteorologico: "Meteorológico", recomendacao_sirene: "Sirene", vigencia: "Vigência" };
const NOME_RISCO: Record<string, string> = { muito_baixo: "muito baixo", baixo: "baixo", moderado: "moderado", alto: "alto", muito_alto: "muito alto" };

function Etiqueta({ n }: { n: number }) {
  const e = ESCALA_NM[n];
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[11px] font-bold leading-none" style={{ background: e.cor, color: corTextoSobre(e.cor) }}>
      {e.sigla}
    </span>
  );
}

/** Aba "Nível de Monitoramento" (Alertas): mapa interativo do NM vigente por município (PLANCON 2026/2027), controle de lançamento
 * com as regras do plano, pendências (onde o risco pede inserção humana), histórico e o Guia do Plantão. */
export default function MonitoramentoPanel() {
  const [dados, setDados] = useState<NiveisResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [registros, setRegistros] = useState<RegistroNivel[] | null>(null);
  const [aba, setAba] = useState<Aba>("lancar");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [pre, setPre] = useState<PreLancamento | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [guia, setGuia] = useState<string | null>(null);
  const [filtroHist, setFiltroHist] = useState<"24h" | "7d" | "sel">("24h");

  const carregar = useCallback(async () => {
    try {
      const [n, s] = await Promise.all([fetchNiveis(), fetchSugestoes()]);
      setDados(n);
      setSugestoes(s.sugestoes);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    carregar();
    return intervaloVisivel(carregar, 60_000);
  }, [carregar]);

  const carregarHist = useCallback(async () => {
    try {
      setRegistros(await fetchRegistrosNivel({ horas: filtroHist === "7d" ? 168 : filtroHist === "24h" ? 24 : undefined, limit: 200 }));
    } catch {
      setRegistros([]);
    }
  }, [filtroHist]);
  useEffect(() => {
    if (aba === "historico") carregarHist();
  }, [aba, carregarHist]);

  useEffect(() => {
    if (aba !== "guia" || guia) return;
    fetch(`${API_BASE_URL}/monitoramento/guia/`, { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(setGuia)
      .catch(() => setGuia("<p style='font-family:sans-serif;padding:16px'>Não foi possível carregar o guia agora.</p>"));
  }, [aba, guia]);

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

  const alternar = (municipio: string) => setSelecionados((s) => (s.includes(municipio) ? s.filter((x) => x !== municipio) : [...s, municipio]));
  const adicionar = (lista: string[]) => setSelecionados((s) => [...new Set([...s, ...lista])]);
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

  const pendentes = sugestoes.length;
  const histFiltrado = (registros ?? []).filter((r) => filtroHist !== "sel" || selecionados.includes(r.municipio));

  return (
    <div className="space-y-3">
      {/* topo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-gray-800">Nível de Monitoramento — PLANCON 2026/2027</h2>
          <p className="text-xs text-gray-500">Por município · vale o nível mais alto entre meteorologia, hidrologia e geologia · atualizado {fmtDataHora(dados.gerado_em)}</p>
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

      {/* contagem por nível: clicar seleciona os municípios daquele nível */}
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
              title={`Selecionar os ${qtd} município(s) em ${e.sigla}`}
            >
              <span className="block text-[11px] font-semibold leading-tight">{e.sigla} · {e.nome}</span>
              <span className="text-xl font-extrabold leading-tight">{qtd}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* mapa */}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              list="municipios-nm"
              value={busca}
              onChange={(e) => {
                const v = e.target.value;
                setBusca(v);
                const achou = dados.niveis.find((n) => n.municipio.toLowerCase() === v.trim().toLowerCase());
                if (achou) {
                  adicionar([achou.municipio]);
                  setBusca("");
                }
              }}
              placeholder="Buscar município…"
              className="w-44 rounded border border-gray-300 px-2 py-1.5"
              aria-label="Buscar município"
            />
            <datalist id="municipios-nm">{dados.niveis.map((n) => <option key={n.municipio} value={n.municipio} />)}</datalist>
            <select className="rounded border border-gray-300 px-2 py-1.5" value="" onChange={(e) => { if (e.target.value) adicionar(regioes.find((r) => r.regiao === e.target.value)?.municipios ?? []); }} aria-label="Selecionar uma regional">
              <option value="">Selecionar regional…</option>
              {regioes.map((r) => <option key={r.regiao} value={r.regiao}>{r.regiao} ({r.municipios.length})</option>)}
            </select>
            {selecionados.length > 0 && <button type="button" onClick={() => setSelecionados([])} className="rounded border border-gray-300 px-2 py-1.5 text-gray-600 hover:bg-gray-50">Limpar seleção ({selecionados.length})</button>}
            <span className="text-gray-400">Clique nos municípios para escolher; roda do mouse = zoom.</span>
          </div>
          <MapaNiveis niveis={dados.niveis} selecionados={new Set(selecionados)} onClique={(m) => { alternar(m); setAba("lancar"); }} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
            {NIVEIS_NM.map((n) => <span key={n} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-black/20" style={{ background: ESCALA_NM[n].cor }} />{ESCALA_NM[n].sigla} {ESCALA_NM[n].nome}</span>)}
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-black/30" style={{ background: "repeating-linear-gradient(45deg,#fff 0 3px,#111827 3px 5px)" }} />vigência vencida (revisar)</span>
          </div>

          {/* por regional */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr><th className="px-2 py-1.5">Regional (REDEC)</th>{NIVEIS_NM.map((n) => <th key={n} className="px-1.5 py-1.5 text-center">{ESCALA_NM[n].sigla}</th>)}<th className="px-2 py-1.5">Maior nível</th></tr>
              </thead>
              <tbody>
                {regioes.map((r) => (
                  <tr key={r.regiao} className="cursor-pointer border-t border-gray-100 hover:bg-blue-50" onClick={() => { setSelecionados(r.municipios); setAba("lancar"); }} title="Selecionar os municípios da regional">
                    <td className="px-2 py-1 font-medium text-gray-700">{r.regiao}</td>
                    {r.contagem.map((c, i) => <td key={i} className={`px-1.5 py-1 text-center ${c ? "font-semibold text-gray-900" : "text-gray-300"}`}>{c}</td>)}
                    <td className="px-2 py-1"><Etiqueta n={r.max} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* controle */}
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap gap-1 border-b border-gray-200 p-1.5" role="tablist">
            {([["lancar", "Lançar nível"], ["pendencias", `Pendências${pendentes ? ` (${pendentes})` : ""}`], ["historico", "Histórico"], ["guia", "Guia do plantão"]] as [Aba, string][]).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${aba === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} ${k === "pendencias" && pendentes && aba !== k ? "ring-2 ring-amber-400" : ""}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="p-3">
            {aba === "lancar" && <LancarNivel dados={dados} selecionados={selecionados} pre={pre} onLimpar={() => setSelecionados([])} onRegistrado={() => { carregar(); setPre(null); }} />}

            {aba === "pendencias" && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Onde o nível vigente parece defasado em relação ao risco técnico, à recomendação de sirene de hoje ou à vigência. O painel só sugere: <b>o lançamento é sempre do plantonista</b> (NM 4 e NM 5 nunca são automáticos).</p>
                {sugestoes.length === 0 && <p className="rounded bg-green-50 p-3 text-sm text-green-800">Nenhuma pendência: os níveis vigentes acompanham o risco técnico atual.</p>}
                {sugestoes.map((s) => (
                  <div key={`${s.municipio}-${s.tipo}`} className="rounded-md border border-gray-200 p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-gray-800">{s.municipio} <span className="font-normal text-gray-400">· {s.regiao}</span></span>
                      <span className="flex items-center gap-1">{ROTULO_TIPO[s.tipo]}: <Etiqueta n={s.atual} /> {s.sugerido !== null && <>→ <Etiqueta n={s.sugerido} /></>}</span>
                    </div>
                    <p className="mt-1 text-gray-600">
                      {s.fontes.map((f, i) => (
                        <span key={i} className="mr-2">
                          {ROTULO_RISCO[f.tipo] ?? f.tipo}
                          {f.risco ? `: ${NOME_RISCO[f.risco] ?? f.risco}` : ""}
                          {f.numero ? ` ${f.numero} às ${f.hora}` : ""}
                          {f.vigencia_ate ? ` (até ${fmtDataHora(f.vigencia_ate)})` : ""}
                        </span>
                      ))}
                    </p>
                    <p className="mt-1 text-gray-500">{s.orientacao}</p>
                    <button type="button" className="mt-1.5 rounded bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700" onClick={() => { setSelecionados([s.municipio]); setPre({ nivel: s.sugerido ?? s.atual, motivo: s.tipo === "risco_tecnico" ? `Risco técnico: ${s.fontes.map((f) => `${ROTULO_RISCO[f.tipo] ?? f.tipo} ${NOME_RISCO[f.risco] ?? ""}`).join("; ")}.` : s.tipo === "recomendacao_sirene" ? `Recomendação de mobilização de sirene ${s.fontes[0]?.numero ?? ""} (${s.fontes[0]?.estacao ?? ""}).` : "" }); setAba("lancar"); }}>
                      Abrir no formulário
                    </button>
                  </div>
                ))}
              </div>
            )}

            {aba === "historico" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {([["24h", "Últimas 24 h"], ["7d", "7 dias"], ["sel", "Municípios selecionados"]] as ["24h" | "7d" | "sel", string][]).map(([k, t]) => (
                    <button key={k} type="button" onClick={() => setFiltroHist(k)} className={`rounded-full px-2.5 py-1 ${filtroHist === k ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700"}`}>{t}</button>
                  ))}
                </div>
                {registros === null ? <p className="text-sm text-gray-400">Carregando…</p> : histFiltrado.length === 0 ? <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">Nenhum lançamento neste período.</p> : (
                  <div className="max-h-[32rem] overflow-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 text-left text-gray-500"><tr><th className="px-2 py-1.5">Quando</th><th className="px-2 py-1.5">Município</th><th className="px-2 py-1.5">Nível</th><th className="px-2 py-1.5">Quem / motivo</th></tr></thead>
                      <tbody>
                        {histFiltrado.map((r) => (
                          <tr key={r.id} className="border-t border-gray-100 align-top">
                            <td className="whitespace-nowrap px-2 py-1 text-gray-600">{fmtDataHora(r.registrado_em)}</td>
                            <td className="px-2 py-1 font-medium text-gray-800">{r.municipio}</td>
                            <td className="whitespace-nowrap px-2 py-1"><Etiqueta n={r.nivel_anterior} /> → <Etiqueta n={r.nivel} />{r.encerramento && <span className="ml-1 text-gray-500">(encerrado)</span>}</td>
                            <td className="px-2 py-1 text-gray-600">
                              <b>{r.registrado_por}</b>{r.equipe ? ` · ${dados.equipes[r.equipe] ?? r.equipe}` : ""}
                              {r.motivo && <span className="block text-gray-500">{r.motivo}</span>}
                              {r.aprovado_por && <span className="block text-gray-500">Aprovado por {r.aprovado_por}{r.comdec_avisada_em ? ` · COMDEC ${fmtDataHora(r.comdec_avisada_em)}` : ""}{r.redec_avisada_em ? ` · REDEC ${fmtDataHora(r.redec_avisada_em)}` : ""}{r.aviso_simultaneo ? ` · aviso simultâneo (${r.aviso_motivo})` : ""}</span>}
                              {r.ferramentas && <span className="block text-gray-400">{r.ferramentas}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {aba === "guia" && (guia ? <iframe title="Guia do Plantão" srcDoc={guia} sandbox="allow-scripts allow-same-origin allow-popups" className="h-[70vh] w-full rounded border border-gray-200" /> : <p className="text-sm text-gray-400">Carregando guia…</p>)}
          </div>
        </div>
      </div>
      {erro && <p className="text-xs text-red-600">Última atualização falhou ({erro}); mostrando o último dado carregado.</p>}
    </div>
  );
}
