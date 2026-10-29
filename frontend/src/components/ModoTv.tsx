"use client";

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import MapaNiveis from "@/components/monitoramento/MapaNiveis";
import PrevisaoMapa from "@/components/PrevisaoMapa";
import RiskChoroplethMap from "@/components/RiskChoroplethMap";
import { API_BASE_URL, normalizeMunicipioName, RISK_ALERT_TIPO_LABELS, RISK_LEVEL_COLORS, RISK_LEVEL_LABELS, RiskAlert, RiskAlertTipo, RiskLevel } from "@/lib/api";
import { corTextoSobre, ESCALA_NM, fetchPublico, fmtDataHora, NIVEIS_NM, PublicoResposta, SIGNIFICADO_NM } from "@/lib/nivelMonitoramento";

type TelaId = "nm" | "previsao" | "riscos" | "informativo" | "sirenes";
const TITULOS: Record<TelaId, string> = {
  nm: "Nível de Monitoramento",
  previsao: "Previsão do tempo por regional",
  riscos: "Mapas de risco",
  informativo: "Informativo meteorológico vigente",
  sirenes: "Sirenes",
};
const ORDEM: TelaId[] = ["nm", "previsao", "riscos", "informativo", "sirenes"];
const TIPOS: RiskAlertTipo[] = ["hidrologico", "geologico", "meteorologico", "incendio"];
const NIVEIS_RISCO: RiskLevel[] = ["muito_baixo", "baixo", "moderado", "alto", "muito_alto"];
const SEG_PADRAO = 12;
const RECARREGAR_A_CADA_MIN = 30;

type InformativoVigente = { numero: number; ano: number; texto: string; enviado_em: string; vigente_ate: string };
type Sirenes = { gerado_em: string; total: number; online: number; offline: number; tocando_total: number; tocando: { nome: string; municipio: string; bairro: string; acao: string; desde: string }[] };

function usePolling<T>(buscar: () => Promise<T>, ms: number): { dado: T | null; erro: boolean } {
  const [dado, setDado] = useState<T | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    const rodar = () => buscar().then((r) => { if (vivo) { setDado(r); setErro(false); } }).catch(() => { if (vivo) setErro(true); });
    rodar();
    const t = setInterval(rodar, ms);
    return () => { vivo = false; clearInterval(t); };
  }, [buscar, ms]);
  return { dado, erro };
}

const getJson = (caminho: string) => fetch(`${API_BASE_URL}${caminho}`, { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });

/** Conteúdo mais alto que a tela rola devagar de cima para baixo durante a exibição (sem tocar em nada). `progresso` vai de 0 a 1. */
function RolagemAutomatica({ progresso, children }: { progresso: number; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const miolo = useRef<HTMLDivElement>(null);
  const [excesso, setExcesso] = useState(0);
  useEffect(() => {
    const medir = () => setExcesso(Math.max(0, (miolo.current?.scrollHeight ?? 0) - (caixa.current?.clientHeight ?? 0)));
    medir();
    const o = new ResizeObserver(medir);
    if (miolo.current) o.observe(miolo.current);
    if (caixa.current) o.observe(caixa.current);
    return () => o.disconnect();
  }, []);
  const p = Math.min(1, Math.max(0, (progresso - 0.15) / 0.7)); // parada no início e no fim
  return (
    <div ref={caixa} className="h-full overflow-hidden">
      <div ref={miolo} style={{ transform: `translateY(-${excesso * p}px)`, transition: "transform 0.3s linear" }}>{children}</div>
    </div>
  );
}

export default function ModoTv() {
  const [seg, setSeg] = useState(SEG_PADRAO);
  const [pedidas, setPedidas] = useState<TelaId[] | null>(null);
  const [pausado, setPausado] = useState(false);
  const [indice, setIndice] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const [agora, setAgora] = useState(() => new Date());
  const [mostrarComandos, setMostrarComandos] = useState(false);
  const ultimoMovimento = useRef(0);

  // parâmetros do endereço: ?seg=15&telas=nm,previsao,sirenes
  // lido no navegador (a página é exportada estática, sem acesso ao endereço no servidor)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = Number(q.get("seg"));
    if (s >= 4 && s <= 120) setSeg(s);
    const t = (q.get("telas") ?? "").split(",").map((x) => x.trim()).filter((x): x is TelaId => (ORDEM as string[]).includes(x));
    if (t.length) setPedidas(t);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const buscarNm = useCallback(() => fetchPublico(), []);
  const buscarInformativo = useCallback(() => getJson("/publico/informativo/").then((d) => (d?.informativo ?? null) as InformativoVigente | null), []);
  const buscarSirenes = useCallback(() => getJson("/publico/sirenes/") as Promise<Sirenes>, []);
  const nm = usePolling<PublicoResposta>(buscarNm, 60_000);
  const inf = usePolling<InformativoVigente | null>(buscarInformativo, 60_000);
  const sir = usePolling<Sirenes>(buscarSirenes, 30_000);

  const telas = useMemo(() => (pedidas ?? ORDEM).filter((t) => t !== "informativo" || inf.dado), [pedidas, inf.dado]);
  const atual: TelaId = telas[indice % Math.max(1, telas.length)] ?? "nm";

  const avancar = useCallback((d: number) => { setIndice((i) => (i + d + telas.length) % Math.max(1, telas.length)); setProgresso(0); }, [telas.length]);

  // relógio de passagem das telas
  useEffect(() => {
    if (pausado) return;
    const passo = 250;
    const t = setInterval(() => {
      setProgresso((p) => {
        const n = p + passo / (seg * 1000);
        if (n >= 1) { setIndice((i) => (i + 1) % Math.max(1, telas.length)); return 0; }
        return n;
      });
    }, passo);
    return () => clearInterval(t);
  }, [pausado, seg, telas.length]);

  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 15_000); return () => clearInterval(t); }, []);

  // TV que fica dias ligada: recarrega de tempos em tempos (pega versão nova do painel) e impede a tela de apagar
  useEffect(() => { const t = setTimeout(() => window.location.reload(), RECARREGAR_A_CADA_MIN * 60_000); return () => clearTimeout(t); }, []);
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null;
    const pedir = () => (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof trava> } }).wakeLock?.request("screen").then((l) => { trava = l; }).catch(() => undefined);
    pedir();
    const volta = () => { if (document.visibilityState === "visible") pedir(); };
    document.addEventListener("visibilitychange", volta);
    return () => { document.removeEventListener("visibilitychange", volta); trava?.release().catch(() => undefined); };
  }, []);

  // teclado: espaço pausa, setas trocam de tela, F tela cheia
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); setPausado((p) => !p); }
      else if (e.key === "ArrowRight") avancar(1);
      else if (e.key === "ArrowLeft") avancar(-1);
      else if (e.key.toLowerCase() === "f") { if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined); else document.documentElement.requestFullscreen().catch(() => undefined); }
      ultimoMovimento.current = Date.now(); setMostrarComandos(true);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [avancar]);
  useEffect(() => {
    const t = setInterval(() => { if (Date.now() - ultimoMovimento.current > 4000) setMostrarComandos(false); }, 1000);
    return () => clearInterval(t);
  }, []);

  const d = nm.dado;
  const regiaoPorMunicipio = useMemo(() => Object.fromEntries((d?.niveis ?? []).map((n) => [normalizeMunicipioName(n.municipio), n.regiao])), [d]);
  const maior = d ? Math.max(...d.niveis.map((n) => n.nivel)) : 0;
  const ativos = useMemo(() => (d?.niveis ?? []).filter((n) => n.nivel >= 2).sort((a, b) => b.nivel - a.nivel || a.municipio.localeCompare(b.municipio)), [d]);
  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const dia = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" });
  const semConexao = nm.erro && !d;

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden bg-[#0f1b33] text-gray-900 ${mostrarComandos ? "" : "cursor-none"}`}
      onMouseMove={() => { ultimoMovimento.current = Date.now(); setMostrarComandos(true); }}
    >
      {/* O tamanho-base acompanha a largura da tela: o mesmo desenho preenche TV Full HD, 4K e videowall. */}
      <style>{`html{font-size:max(16px,calc(100vw / 100))} body{background:#0f1b33}`}</style>
      <header className="flex shrink-0 items-center gap-4 bg-[#1f3864] px-6 py-3 text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-cemadenrj.png" alt="CEMADEN-RJ" className="h-12 w-auto" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-blue-200">CEMADEN-RJ · Defesa Civil</p>
          <h1 className="truncate text-2xl font-extrabold leading-tight">{TITULOS[atual]}</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-extrabold tabular-nums leading-none">{hora}</p>
          <p className="text-xs capitalize text-blue-200">{dia}</p>
        </div>
      </header>

      <main className="min-h-0 flex-1 bg-gray-50 p-4">
        {semConexao ? (
          <div className="flex h-full items-center justify-center text-2xl font-bold text-red-700">Sem conexão com o painel — tentando novamente…</div>
        ) : !d ? (
          <div className="flex h-full items-center justify-center text-2xl text-gray-500">Carregando…</div>
        ) : (
          <RolagemAutomatica key={atual} progresso={progresso}>
            {atual === "nm" && (
              <div className="grid gap-4 grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <div>
                  <div className="mb-3 rounded-lg p-3 shadow-sm" style={{ background: ESCALA_NM[maior].cor, color: corTextoSobre(ESCALA_NM[maior].cor) }}>
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Maior nível vigente agora</p>
                    <p className="text-3xl font-extrabold leading-tight">{ESCALA_NM[maior].sigla} · {ESCALA_NM[maior].nome}</p>
                    <p className="text-sm">{maior === 0 ? "Todos os municípios em rotina de monitoramento." : `${d.resumo[String(maior)]} município(s) neste nível. ${SIGNIFICADO_NM[maior].acao}`}</p>
                  </div>
                  <MapaNiveis niveis={d.niveis} rotuloMin={2} altura={`calc(100vh - 20rem)`} />
                </div>
                <div className="space-y-2">
                  {NIVEIS_NM.map((n) => (
                    <div key={n} className="flex items-center gap-3 rounded-md border border-gray-200 bg-white p-2">
                      <span className="flex h-12 w-20 shrink-0 flex-col items-center justify-center rounded font-bold leading-tight" style={{ background: ESCALA_NM[n].cor, color: corTextoSobre(ESCALA_NM[n].cor) }}>
                        <span>{ESCALA_NM[n].sigla}</span>
                        <span className="text-xs">{d.resumo[String(n)] ?? 0} mun.</span>
                      </span>
                      <span className="min-w-0 text-sm"><b>{ESCALA_NM[n].nome}</b> — {SIGNIFICADO_NM[n].quando}</span>
                    </div>
                  ))}
                  {ativos.length > 0 && (
                    <div className="rounded-md border border-gray-200 bg-white p-2">
                      <p className="mb-1 text-sm font-bold">Municípios em NM 2 ou acima</p>
                      <ul className="grid grid-cols-2 gap-x-3 text-sm">
                        {ativos.slice(0, 16).map((n) => (
                          <li key={n.municipio} className="flex items-center gap-1.5 py-0.5">
                            <span className="rounded px-1.5 text-xs font-bold" style={{ background: ESCALA_NM[n.nivel].cor, color: corTextoSobre(ESCALA_NM[n.nivel].cor) }}>{ESCALA_NM[n.nivel].sigla}</span>
                            <span className="truncate">{n.municipio}</span>
                          </li>
                        ))}
                      </ul>
                      {ativos.length > 16 && <p className="mt-1 text-xs text-gray-500">e mais {ativos.length - 16} município(s)</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {atual === "previsao" && (
              <div className="mx-auto max-w-[110rem]"><PrevisaoMapa publico embutido /></div>
            )}

            {atual === "riscos" && (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {TIPOS.map((tipo) => {
                    const lista = d.riscos.filter((r) => r.tipo === tipo) as unknown as RiskAlert[];
                    return (
                      <div key={tipo} className="rounded-lg border border-gray-200 bg-white p-2">
                        <h3 className="mb-1 text-base font-semibold">{RISK_ALERT_TIPO_LABELS[tipo]}</h3>
                        <div style={{ height: "calc((100vh - 19rem) / 2)" }}>
                          <RiskChoroplethMap tipo={tipo} redecAlerts={lista.filter((r) => !r.municipio)} municipioAlerts={lista.filter((r) => r.municipio)} municipioRedecMap={regiaoPorMunicipio} compact />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-700">
                  {NIVEIS_RISCO.map((n) => <span key={n} className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-3.5 rounded-sm border border-black/10" style={{ background: RISK_LEVEL_COLORS[n] }} />{RISK_LEVEL_LABELS[n]}</span>)}
                </div>
              </div>
            )}

            {atual === "informativo" && inf.dado && (
              <div className="mx-auto max-w-[90rem] rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <pre className="whitespace-pre-wrap break-words font-sans text-2xl leading-relaxed text-gray-900">{inf.dado.texto}</pre>
                <p className="mt-4 text-base text-gray-600">Nº {inf.dado.numero}/{inf.dado.ano}, enviado em {fmtDataHora(inf.dado.enviado_em)}; vale até {fmtDataHora(inf.dado.vigente_ate)}.</p>
              </div>
            )}

            {atual === "sirenes" && (
              <div className="mx-auto max-w-[90rem]">
                {!sir.dado ? (
                  <p className="p-6 text-center text-2xl text-gray-500">{sir.erro ? "Situação das sirenes indisponível no momento." : "Carregando…"}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { r: "Sirenes", v: sir.dado.total, c: "#1f3864" },
                        { r: "Online", v: sir.dado.online, c: "#15803d" },
                        { r: "Offline", v: sir.dado.offline, c: sir.dado.offline > 0 ? "#b45309" : "#6b7280" },
                        { r: "Tocando agora", v: sir.dado.tocando_total, c: sir.dado.tocando_total > 0 ? "#b91c1c" : "#6b7280" },
                      ].map((c) => (
                        <div key={c.r} className="rounded-lg p-4 text-center text-white shadow-sm" style={{ background: c.c }}>
                          <p className="text-6xl font-extrabold tabular-nums leading-none">{c.v}</p>
                          <p className="mt-2 text-lg font-semibold">{c.r}</p>
                        </div>
                      ))}
                    </div>
                    {sir.dado.tocando_total === 0 ? (
                      <p className="mt-6 rounded-lg bg-white p-6 text-center text-2xl text-gray-700 shadow-sm">Nenhuma sirene tocando neste momento.</p>
                    ) : (
                      <div className="mt-4 rounded-lg border border-red-200 bg-white p-3 shadow-sm">
                        <p className="mb-2 text-lg font-bold text-red-700">Sirenes tocando</p>
                        <ul className="grid grid-cols-2 gap-x-6 text-lg">
                          {sir.dado.tocando.map((s) => (
                            <li key={`${s.nome}-${s.desde}`} className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-1">
                              <span className="truncate"><b>{s.municipio}</b>{s.bairro ? ` · ${s.bairro}` : ""} <span className="text-gray-500">({s.acao})</span></span>
                              <span className="shrink-0 text-sm tabular-nums text-gray-600">desde {fmtDataHora(s.desde)}</span>
                            </li>
                          ))}
                        </ul>
                        {sir.dado.tocando_total > sir.dado.tocando.length && <p className="mt-2 text-sm text-gray-500">e mais {sir.dado.tocando_total - sir.dado.tocando.length}.</p>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </RolagemAutomatica>
        )}
      </main>

      <footer className="shrink-0 bg-[#1f3864] px-6 pb-2 pt-1 text-white">
        <div className="h-1.5 w-full overflow-hidden rounded bg-white/20"><div className="h-full bg-white" style={{ width: `${progresso * 100}%`, transition: "width 0.25s linear" }} /></div>
        <div className="mt-1.5 flex items-center gap-3 text-xs text-blue-100">
          <span className="flex gap-1.5">{telas.map((t, i) => <span key={t} className={`h-2.5 w-2.5 rounded-full ${t === atual ? "bg-white" : "bg-white/30"}`} title={TITULOS[t]} aria-hidden="true" data-i={i} />)}</span>
          <span>{telas.indexOf(atual) + 1}/{telas.length}</span>
          <span className="ml-auto">{d ? `Dados de ${fmtDataHora(d.gerado_em)}` : ""}</span>
          <span className={`flex gap-2 transition-opacity ${mostrarComandos ? "opacity-100" : "opacity-0"}`}>
            <button type="button" onClick={() => avancar(-1)} className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25">◀ Anterior</button>
            <button type="button" onClick={() => setPausado((p) => !p)} className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25">{pausado ? "▶ Continuar" : "❚❚ Pausar"}</button>
            <button type="button" onClick={() => avancar(1)} className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25">Próxima ▶</button>
            <button type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => undefined)} className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25">Tela cheia (F)</button>
          </span>
        </div>
      </footer>
    </div>
  );
}
