"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import Etiqueta from "@/components/monitoramento/Etiqueta";
import GuiaPlantao from "@/components/monitoramento/GuiaPlantao";
import LancarNivel, { PreLancamento } from "@/components/monitoramento/LancarNivel";
import MapaNiveis from "@/components/monitoramento/MapaNiveis";
import { API_BASE_URL } from "@/lib/api";
import { intervaloVisivel } from "@/lib/intervaloVisivel";
import { AutomacaoNm, ESCALA_NM, fetchAutomacaoNm, fetchNiveis, fetchRegistrosNivel, fetchSugestoes, fmtDataHora, NiveisResposta, NIVEIS_NM, RegistroNivel, Sugestao } from "@/lib/nivelMonitoramento";

type Sub = "lancar" | "pendencias" | "historico" | "suporte";

const ROTULO_TIPO: Record<Sugestao["tipo"], string> = {
  risco_tecnico: "Risco técnico acima do nível",
  cota_hidrologica: "Cota do rio acima do nível",
  recomendacao_sirene: "Recomendação de sirene hoje",
  vigencia_vencida: "Vigência vencida",
};
const ROTULO_RISCO: Record<string, string> = { hidrologico: "Hidrológico", geologico: "Geológico", meteorologico: "Meteorológico", recomendacao_sirene: "Sirene", vigencia: "Vigência", cota: "Cota do rio" };
const NOME_RISCO: Record<string, string> = { muito_baixo: "muito baixo", baixo: "baixo", moderado: "moderado", alto: "alto", muito_alto: "muito alto" };

/** Aba "Produção": onde o plantonista lança o Nível de Monitoramento (PLANCON 2026/2027) com as regras do plano, vê as pendências
 * (onde o risco pede inserção humana), o histórico de lançamentos e o Suporte (Guia do Plantão). A visualização do NM vigente
 * (mapa, contagens, regionais) fica em Alertas → Nível de Monitoramento. */
export default function ProducaoPanel({ selecaoInicial = [] }: { selecaoInicial?: string[] }) {
  const [dados, setDados] = useState<NiveisResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [auto, setAuto] = useState<AutomacaoNm | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [registros, setRegistros] = useState<RegistroNivel[] | null>(null);
  const [sub, setSub] = useState<Sub>("lancar");
  const [selecionados, setSelecionados] = useState<string[]>(selecaoInicial);
  const [pre, setPre] = useState<PreLancamento | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroHist, setFiltroHist] = useState<"24h" | "7d" | "sel">("24h");

  const carregar = useCallback(async () => {
    try {
      const [n, s, a] = await Promise.all([fetchNiveis(), fetchSugestoes(), fetchAutomacaoNm().catch(() => null)]);
      setDados(n);
      setSugestoes(s.sugestoes);
      setAuto(a);
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
    if (sub === "historico") carregarHist();
  }, [sub, carregarHist]);

  const regioes = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of dados?.niveis ?? []) m.set(n.regiao, [...(m.get(n.regiao) ?? []), n.municipio]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dados]);

  // mesma fonte e mesmo nível numa regional (ex.: severidade meteorológica por REDEC) viram um cartão só, com todos os municípios
  const grupos = useMemo(() => {
    const m = new Map<string, { base: Sugestao; municipios: string[] }>();
    for (const s of sugestoes) {
      const chave = [s.tipo, s.regiao, s.atual, s.sugerido, s.fontes.map((f) => `${f.tipo}${f.risco ?? ""}${f.numero ?? ""}`).join(",")].join("|");
      const g = m.get(chave) ?? { base: s, municipios: [] };
      g.municipios.push(s.municipio);
      m.set(chave, g);
    }
    return [...m.values()];
  }, [sugestoes]);

  const alternar = (municipio: string) => setSelecionados((s) => (s.includes(municipio) ? s.filter((x) => x !== municipio) : [...s, municipio]));
  const adicionar = (lista: string[]) => setSelecionados((s) => [...new Set([...s, ...lista])]);

  if (!dados) return <div className="p-6 text-center text-sm text-gray-500">{erro ? `Não foi possível carregar a Produção (${erro}).` : "Carregando…"}</div>;

  const pendentes = sugestoes.length;
  const histFiltrado = (registros ?? []).filter((r) => filtroHist !== "sel" || selecionados.includes(r.municipio));
  const SUBS: [Sub, string][] = [["lancar", "Lançar nível"], ["pendencias", `Pendências${pendentes ? ` (${pendentes})` : ""}`], ["historico", "Histórico"], ["suporte", "Suporte"]];

  return (
    <div className="h-full w-full overflow-auto bg-white p-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-gray-800">Produção — Nível de Monitoramento</h2>
            <p className="text-xs text-gray-500">Lançamento do NM por município (PLANCON 2026/2027) · o painel só registra o nível; o envio pela Idap continua manual · atualizado {fmtDataHora(dados.gerado_em)}</p>
          </div>
          <button type="button" onClick={() => { setAtualizando(true); carregar().finally(() => setAtualizando(false)); }} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <RefreshCw size={13} className={atualizando ? "animate-spin" : ""} aria-hidden /> Atualizar
          </button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2" role="tablist">
          {SUBS.map(([k, t]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={sub === k}
              onClick={() => setSub(k)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${sub === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} ${k === "pendencias" && pendentes && sub !== k ? "ring-2 ring-amber-400" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>

        {sub === "lancar" && (
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
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
                <select className="rounded border border-gray-300 px-2 py-1.5" value="" onChange={(e) => { if (e.target.value) adicionar(regioes.find(([r]) => r === e.target.value)?.[1] ?? []); }} aria-label="Selecionar uma regional">
                  <option value="">Selecionar regional…</option>
                  {regioes.map(([r, ms]) => <option key={r} value={r}>{r} ({ms.length})</option>)}
                </select>
                <select className="rounded border border-gray-300 px-2 py-1.5" value="" onChange={(e) => { if (e.target.value) setSelecionados(dados.niveis.filter((n) => n.nivel === Number(e.target.value)).map((n) => n.municipio)); }} aria-label="Selecionar municípios por nível vigente">
                  <option value="">Selecionar por nível vigente…</option>
                  {NIVEIS_NM.filter((n) => (dados.resumo[String(n)] ?? 0) > 0).map((n) => <option key={n} value={n}>{ESCALA_NM[n].sigla} {ESCALA_NM[n].nome} ({dados.resumo[String(n)]})</option>)}
                </select>
                {selecionados.length > 0 && <button type="button" onClick={() => setSelecionados([])} className="rounded border border-gray-300 px-2 py-1.5 text-gray-600 hover:bg-gray-50">Limpar seleção ({selecionados.length})</button>}
                <span className="text-gray-400">Clique nos municípios para escolher; roda do mouse = zoom.</span>
              </div>
              <MapaNiveis niveis={dados.niveis} selecionados={new Set(selecionados)} onClique={(m) => alternar(m)} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
                {NIVEIS_NM.map((n) => <span key={n} className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-black/20" style={{ background: ESCALA_NM[n].cor }} />{ESCALA_NM[n].sigla} {ESCALA_NM[n].nome}</span>)}
                <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm border border-black/30" style={{ background: "repeating-linear-gradient(45deg,#fff 0 3px,#111827 3px 5px)" }} />vigência vencida (revisar)</span>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
              <LancarNivel dados={dados} selecionados={selecionados} pre={pre} onLimpar={() => setSelecionados([])} onRegistrado={() => { carregar(); setPre(null); }} />
            </div>
          </div>
        )}

        {sub === "pendencias" && (
          <div className="max-w-4xl space-y-2">
            {auto && (
              <div className={`rounded-md border p-2.5 text-xs ${auto.ativo ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    NM automático {auto.ativo ? `ligado — o sistema gera sozinho até ${ESCALA_NM[auto.nivel_maximo_auto].sigla}` : "desligado (interruptor no Admin)"}
                  </span>
                  <button
                    type="button"
                    disabled={aplicando || !auto.ativo}
                    onClick={async () => {
                      setAplicando(true);
                      try {
                        const t = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
                        await fetch(`${API_BASE_URL}/monitoramento/automatico/`, { method: "POST", credentials: "include", headers: t ? { "X-CSRFToken": decodeURIComponent(t[1]) } : {} });
                      } finally {
                        await carregar();
                        setAplicando(false);
                      }
                    }}
                    className="rounded border border-emerald-300 bg-white px-2 py-1 font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {aplicando ? "Aplicando…" : "Aplicar agora"}
                  </button>
                </div>
                <p className="mt-1">
                  A partir dos mapas de risco (hidrológico, geológico e severidade meteorológica): baixo → NM 1, moderado → NM 2. Níveis lançados por você não são mexidos enquanto estiverem ativos; o sistema só desce depois de {auto.regras.histerese_baixar_h} h e renova o NM 2 a cada 24 h
                  enquanto o risco continua. Agora: {auto.vigentes_automaticos["1"] ?? 0} município(s) em NM 1, {auto.vigentes_automaticos["2"] ?? 0} em NM 2{(auto.vigentes_automaticos["3"] ?? 0) > 0 ? `, ${auto.vigentes_automaticos["3"]} em NM 3` : ""}, gerados automaticamente. Última execução: {auto.ultima_execucao ? fmtDataHora(auto.ultima_execucao) : "ainda não rodou"}.
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500">Onde o nível vigente parece defasado em relação ao risco técnico, à cota dos rios, à recomendação de sirene de hoje ou à vigência. O que passa do teto automático fica aqui como <b>sugestão</b>: o lançamento é do plantonista (NM 4 e NM 5 nunca são automáticos).</p>
            {sugestoes.length === 0 && <p className="rounded bg-green-50 p-3 text-sm text-green-800">Nenhuma pendência: os níveis vigentes acompanham o risco técnico atual.</p>}
            {grupos.map(({ base: s, municipios }) => (
              <div key={`${s.regiao}-${s.tipo}-${s.sugerido}-${municipios[0]}`} className="rounded-md border border-gray-200 p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold text-gray-800">{municipios.length > 1 ? `${s.regiao} · ${municipios.length} municípios` : s.municipio} {municipios.length === 1 && <span className="font-normal text-gray-400">· {s.regiao}</span>}</span>
                  <span className="flex items-center gap-1">{ROTULO_TIPO[s.tipo]}: <Etiqueta n={s.atual} /> {s.sugerido !== null && <>→ <Etiqueta n={s.sugerido} /></>}</span>
                </div>
                <p className="mt-1 text-gray-600">
                  {s.fontes.map((f, i) => (
                    <span key={i} className="mr-2">
                      {ROTULO_RISCO[f.tipo] ?? f.tipo}
                      {f.risco ? `: ${NOME_RISCO[f.risco] ?? f.risco}` : ""}
                      {f.numero ? ` ${f.numero} às ${f.hora}` : ""}
                      {f.fonte === "cota" ? `: ${f.estacao} em ${f.classe} (${f.nivel_cm} cm)` : ""}
                      {f.vigencia_ate ? ` (até ${fmtDataHora(f.vigencia_ate)})` : ""}
                    </span>
                  ))}
                </p>
                {municipios.length > 1 && <p className="mt-1 text-gray-500">{municipios.join(", ")}</p>}
                <p className="mt-1 text-gray-500">{s.orientacao}</p>
                <button
                  type="button"
                  className="mt-1.5 rounded bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700"
                  onClick={() => {
                    setSelecionados(municipios);
                    setPre({ nivel: s.sugerido ?? s.atual, motivo: s.tipo === "risco_tecnico" ? `Risco técnico: ${s.fontes.map((f) => `${ROTULO_RISCO[f.tipo] ?? f.tipo} ${NOME_RISCO[f.risco] ?? ""}`).join("; ")}.` : s.tipo === "cota_hidrologica" ? `Cota do rio: ${s.fontes.map((f) => `${f.estacao} (${f.rio || "rio"}) em ${f.classe}, ${f.nivel_cm} cm`).join("; ")}.` : s.tipo === "recomendacao_sirene" ? `Recomendação de mobilização de sirene ${s.fontes[0]?.numero ?? ""} (${s.fontes[0]?.estacao ?? ""}).` : "" });
                    setSub("lancar");
                  }}
                >
                  Abrir no formulário
                </button>
              </div>
            ))}
          </div>
        )}

        {sub === "historico" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {([["24h", "Últimas 24 h"], ["7d", "7 dias"], ["sel", "Municípios selecionados"]] as ["24h" | "7d" | "sel", string][]).map(([k, t]) => (
                <button key={k} type="button" onClick={() => setFiltroHist(k)} className={`rounded-full px-2.5 py-1 ${filtroHist === k ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700"}`}>{t}</button>
              ))}
            </div>
            {registros === null ? <p className="text-sm text-gray-400">Carregando…</p> : histFiltrado.length === 0 ? <p className="rounded bg-gray-50 p-3 text-sm text-gray-500">Nenhum lançamento neste período.</p> : (
              <div className="max-h-[36rem] overflow-auto rounded border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-left text-gray-500"><tr><th className="px-2 py-1.5">Quando</th><th className="px-2 py-1.5">Município</th><th className="px-2 py-1.5">Nível</th><th className="px-2 py-1.5">Quem / motivo</th></tr></thead>
                  <tbody>
                    {histFiltrado.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 align-top">
                        <td className="whitespace-nowrap px-2 py-1 text-gray-600">{fmtDataHora(r.registrado_em)}</td>
                        <td className="px-2 py-1 font-medium text-gray-800">{r.municipio}</td>
                        <td className="whitespace-nowrap px-2 py-1"><Etiqueta n={r.nivel_anterior} /> → <Etiqueta n={r.nivel} />{r.encerramento && <span className="ml-1 text-gray-500">(encerrado)</span>}</td>
                        <td className="px-2 py-1 text-gray-600">
                          {r.origem === "automatico" && <span className="mr-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">automático</span>}<b>{r.registrado_por}</b>{r.equipe ? ` · ${dados.equipes[r.equipe] ?? r.equipe}` : ""}
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

        {sub === "suporte" && <GuiaPlantao onAssistente={() => setSub("lancar")} />}

        {erro && <p className="text-xs text-red-600">Última atualização falhou ({erro}); mostrando o último dado carregado.</p>}
      </div>
    </div>
  );
}
