"use client";

import { toPng } from "html-to-image";
import { ChevronLeft, ChevronRight, Share2, Smartphone, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CartaoRedec, CorpoPost, CorpoStory, LegendaTempo, MapaRedec, nomeBonito, ORDEM_REDEC, rotuloTempo, STORY_H, STORY_W, textoUmidade, textoVento } from "@/components/PrevisaoMapaCorpo";
import ShareModal from "@/components/ShareModal";
import { fetchDataUltimaPrevisao, fetchPrevisoes, Previsao } from "@/lib/api";
import { GeoJsonFeatureCollection } from "@/lib/geo";
import { EMOJI_POR_ICONE } from "@/lib/meteorologia";
import { copiarImagemParaAreaDeTransferencia, ehDispositivoMovel, ShareData } from "@/lib/shareExport";

const TZ = "America/Sao_Paulo";
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const somaDias = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dataExtenso = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${a}`;
};
const r0 = (n: number) => Math.round(Number(n));

/** Modal do story vertical 1080×1920: prévia reduzida e exportação em tamanho real (PNG 1080×1920). */
function StoryModal({ geo, previsoes, data, sol, onClose }: { geo: GeoJsonFeatureCollection; previsoes: Previsao[]; data: string; sol: { nascer: string; por: string } | null; onClose: () => void }) {
  const alvo = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const movel = ehDispositivoMovel();

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const calc = () => setEscala(Math.min(el.clientWidth / STORY_W, (window.innerHeight * 0.68) / STORY_H));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gerar = async (): Promise<Blob> => {
    if (!alvo.current) throw new Error("Story não está pronto");
    const opcoes = { width: STORY_W, height: STORY_H, pixelRatio: 1, backgroundColor: "#ffffff", style: { transform: "none" } };
    let url: string;
    try {
      url = await toPng(alvo.current, opcoes);
    } catch {
      // a primeira captura pode falhar enquanto as imagens ainda carregam: tenta de novo
      await new Promise((r) => setTimeout(r, 800));
      url = await toPng(alvo.current, opcoes);
    }
    return (await fetch(url)).blob();
  };
  const baixar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await gerar();
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `cemaden-rj-previsao-story-${data}.png`;
      a.click();
      URL.revokeObjectURL(u);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao gerar a imagem");
    } finally {
      setBusy(false);
    }
  };
  const copiar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await copiarImagemParaAreaDeTransferencia(await gerar());
      setMsg(ok ? "Imagem copiada." : "Copiar não é suportado neste navegador — use Baixar.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao copiar");
    } finally {
      setBusy(false);
    }
  };
  const compartilhar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const blob = await gerar();
      const arq = new File([blob], `cemaden-rj-previsao-story-${data}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: "Previsão do tempo — CEMADEN-RJ" });
      else setMsg("Compartilhamento direto não suportado — use Baixar.");
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-2" onClick={onClose}>
      <div className="flex max-h-[96vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <h2 className="text-sm font-bold text-gray-800">Story 1080×1920</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div ref={caixa} className="min-h-0 flex-1 overflow-auto bg-gray-100 p-2">
          <div className="mx-auto overflow-hidden shadow" style={{ width: STORY_W * escala, height: STORY_H * escala }}>
            <div style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: STORY_W, height: STORY_H }}>
              <div ref={alvo} style={{ width: STORY_W, height: STORY_H }}>
                <CorpoStory geo={geo} previsoes={previsoes} titulo="Previsão do tempo" data={dataExtenso(data)} sol={sol} />
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t border-gray-200 p-3">
          {msg && <div className="rounded bg-amber-50 p-2 text-xs text-amber-800">{msg}</div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={baixar} disabled={busy} className="rounded bg-sedec-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sedec-700 disabled:opacity-50">
              🖼️ Baixar imagem (1080×1920)
            </button>
            <button type="button" onClick={copiar} disabled={busy} className="rounded border border-sedec-300 px-3 py-1.5 text-xs font-medium text-sedec-700 hover:bg-sedec-50 disabled:opacity-50">
              📋 Copiar imagem
            </button>
            {movel && (
              <button type="button" onClick={compartilhar} disabled={busy} className="rounded border border-sedec-300 px-3 py-1.5 text-xs font-medium text-sedec-700 hover:bg-sedec-50 disabled:opacity-50">
                📤 Compartilhar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mapa → "Previsão": previsão do CEMADEN-RJ do dia no mapa das REDECs (sem mapa-base), com cartões completos (situação, mín/máx,
 * umidade, vento e comentário) e exportação em post quadrado, story vertical 1080×1920 e tabela. */
export default function PrevisaoMapa() {
  const [geo, setGeo] = useState<GeoJsonFeatureCollection | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [compartilhar, setCompartilhar] = useState<"mapa" | "tabela" | "story" | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/redecs.geojson")
      .then((r) => r.json())
      .then((g: GeoJsonFeatureCollection) => !cancelado && setGeo(g))
      .catch(() => !cancelado && setErro("Não foi possível carregar o mapa das REDECs."));
    fetchDataUltimaPrevisao()
      .then((d) => !cancelado && setData(d ?? hojeIso()))
      .catch(() => !cancelado && setData(hojeIso()));
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregando(true);
      setSelecionada(null);
    });
    fetchPrevisoes(data)
      .then((p) => {
        if (cancelado) return;
        setPrevisoes(p);
        setErro(null);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar a previsão."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [data]);

  const capital = previsoes.find((p) => p.regiao === "CAPITAL") ?? previsoes[0];
  const sol = useMemo(() => (capital?.nascer_sol && capital?.por_sol ? { nascer: capital.nascer_sol.slice(0, 5), por: capital.por_sol.slice(0, 5) } : null), [capital]);
  const ordenadas = useMemo(() => ORDEM_REDEC.map((r) => ({ regiao: r, p: previsoes.find((x) => x.regiao === r) })), [previsoes]);

  const dadosMapa: ShareData | null = useMemo(() => {
    if (!geo || !data) return null;
    const texto = [
      `*Previsão do tempo — CEMADEN-RJ*`,
      `📅 ${dataExtenso(data)}`,
      "",
      ...ordenadas
        .filter((x) => x.p)
        .flatMap(({ regiao, p }) => [
          `${EMOJI_POR_ICONE[p!.icone] ?? "▪️"} *${nomeBonito(regiao)}* — ${rotuloTempo(p!.icone)}`,
          `🌡 ${r0(p!.temperatura_minima)}° / ${r0(p!.temperatura_maxima)}° · 💧 UR ${textoUmidade(p!)} · 🌬 ${textoVento(p!)}`,
          ...(p!.comentario ? [p!.comentario] : []),
          "",
        ]),
      ...(sol ? [`☀ Nasce ${sol.nascer} · ☾ Pôr do sol ${sol.por} (Capital)`, ""] : []),
      "📡 CEMADEN-RJ / SEDEC-RJ",
    ].join("\n");
    return {
      titulo: "Previsão do tempo — CEMADEN-RJ",
      dataHora: dataExtenso(data),
      colunas: [],
      linhas: [],
      fonteTexto: "Previsão: CEMADEN-RJ · Defesa Civil do Estado do Rio de Janeiro",
      nomeArquivo: `cemaden-rj-previsao-${data}`,
      corpo: <CorpoPost geo={geo} previsoes={previsoes} sol={sol} />,
      textoPronto: texto,
    };
  }, [geo, data, previsoes, sol, ordenadas]);

  const dadosTabela: ShareData | null = useMemo(() => {
    if (!data) return null;
    return {
      titulo: "Previsão do tempo por REDEC — CEMADEN-RJ",
      dataHora: dataExtenso(data),
      colunas: [
        { chave: "regiao", rotulo: "REDEC", larguraPct: 21 },
        { chave: "tempo", rotulo: "Situação", larguraPct: 26 },
        { chave: "min", rotulo: "Mín", alinhamento: "center", larguraPct: 7 },
        { chave: "max", rotulo: "Máx", alinhamento: "center", larguraPct: 7 },
        { chave: "ur", rotulo: "Umidade", alinhamento: "center", larguraPct: 11 },
        { chave: "vento", rotulo: "Vento", larguraPct: 28 },
      ],
      linhas: ordenadas
        .filter((x) => x.p)
        .map(({ regiao, p }) => ({
          valores: {
            regiao: nomeBonito(regiao),
            tempo: `${EMOJI_POR_ICONE[p!.icone] ?? ""} ${rotuloTempo(p!.icone)}`,
            min: `${r0(p!.temperatura_minima)}°`,
            max: `${r0(p!.temperatura_maxima)}°`,
            ur: textoUmidade(p!),
            vento: textoVento(p!),
          },
        })),
      fonteTexto: "Previsão: CEMADEN-RJ · Defesa Civil do Estado do Rio de Janeiro",
      nomeArquivo: `cemaden-rj-previsao-tabela-${data}`,
    };
  }, [data, ordenadas]);

  const btn = "flex items-center gap-1 rounded px-2.5 py-1.5 text-sm font-medium disabled:opacity-40";
  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-white p-2 sm:p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <button type="button" aria-label="Dia anterior" onClick={() => data && setData(somaDias(data, -1))} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200">
          <ChevronLeft size={16} />
        </button>
        <input type="date" value={data ?? ""} onChange={(e) => e.target.value && setData(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1" />
        <button type="button" aria-label="Próximo dia" onClick={() => data && setData(somaDias(data, 1))} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200">
          <ChevronRight size={16} />
        </button>
        {data && <span className="font-semibold text-gray-800">{dataExtenso(data)}</span>}
        <div className="flex w-full flex-wrap gap-1.5 sm:ml-auto sm:w-auto">
          <button type="button" disabled={!previsoes.length} onClick={() => setCompartilhar("story")} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} title="Story vertical 1080×1920 com comentários">
            <Smartphone size={15} />
            Story
          </button>
          <button type="button" disabled={!previsoes.length} onClick={() => setCompartilhar("mapa")} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} title="Post quadrado com o mapa">
            <Share2 size={15} />
            Post do mapa
          </button>
          <button type="button" disabled={!previsoes.length} onClick={() => setCompartilhar("tabela")} className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`} title="Post em tabela">
            <Table2 size={15} />
            Tabela
          </button>
        </div>
      </div>

      {erro && <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
      {!geo || carregando ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : !previsoes.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Ainda não há previsão cadastrada para {data ? dataExtenso(data) : "este dia"}. Use as setas para ver outro dia.</div>
      ) : (
        <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="lg:sticky lg:top-0 lg:self-start">
            <MapaRedec geo={geo} previsoes={previsoes} largura={720} altura={460} selecionada={selecionada} onSelecionar={(r) => setSelecionada((a) => (a === r ? null : r))} className="w-full rounded-lg bg-sky-50" />
            <LegendaTempo sol={sol} className="mt-2 text-[11px]" />
          </div>
          <div className="grid grid-cols-1 content-start gap-2 sm:grid-cols-2">
            {ordenadas.map(({ regiao, p }) => (
              <CartaoRedec key={regiao} regiao={regiao} p={p} variante="tela" ativo={selecionada === regiao} onClick={() => setSelecionada((a) => (a === regiao ? null : regiao))} />
            ))}
          </div>
        </div>
      )}

      {compartilhar === "mapa" && dadosMapa && <ShareModal data={dadosMapa} onClose={() => setCompartilhar(null)} />}
      {compartilhar === "tabela" && dadosTabela && <ShareModal data={dadosTabela} onClose={() => setCompartilhar(null)} />}
      {compartilhar === "story" && geo && data && <StoryModal geo={geo} previsoes={previsoes} data={data} sol={sol} onClose={() => setCompartilhar(null)} />}
    </div>
  );
}
