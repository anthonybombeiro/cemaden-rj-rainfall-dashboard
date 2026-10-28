"use client";

import { toPng } from "html-to-image";
import { ChevronLeft, ChevronRight, Share2, Smartphone, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CartaoRedec, CartaoTextoGeral, CorpoFeed, CorpoStory, FEED_H, FEED_W, LegendaTempo, MapaRedec, nomeBonito, ORDEM_REDEC, rotuloTempo, STORY_H, STORY_W, textoUmidade, textoVento } from "@/components/PrevisaoMapaCorpo";
import ShareModal from "@/components/ShareModal";
import { fetchDataUltimaPrevisao, fetchPrevisoes, fetchTextoGeralPrevisao, Previsao } from "@/lib/api";
import { GeoJsonFeatureCollection } from "@/lib/geo";
import { EMOJI_POR_ICONE } from "@/lib/meteorologia";
import { copiarImagemParaAreaDeTransferencia, copiarParaAreaDeTransferencia, ehDispositivoMovel, ShareData } from "@/lib/shareExport";

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

/** Modal de exportação em tamanho real (story 1080×1920 ou post 1080×1350): prévia reduzida, PNG exato, copiar imagem/texto. */
function ExportModal({ titulo, w, h, nomeArquivo, texto, onClose, children }: { titulo: string; w: number; h: number; nomeArquivo: string; texto: string; onClose: () => void; children: React.ReactNode }) {
  const alvo = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(0.3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const movel = ehDispositivoMovel();

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const calc = () => setEscala(Math.min(el.clientWidth / w, (window.innerHeight * 0.66) / h));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  const gerar = async (): Promise<Blob> => {
    if (!alvo.current) throw new Error("Imagem não está pronta");
    const opcoes = { width: w, height: h, pixelRatio: 1, backgroundColor: "#ffffff", style: { transform: "none" } };
    // a 1ª captura pode falhar ou travar enquanto as imagens ainda carregam: até 3 tentativas, cada uma com limite de 8 s
    let url = "";
    for (let t = 0; t < 3 && !url; t++) {
      try {
        url = await Promise.race([toPng(alvo.current, opcoes), new Promise<string>((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), 8000))]);
      } catch {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    if (!url) throw new Error("Não foi possível gerar a imagem. Tente de novo em alguns segundos.");
    return (await fetch(url)).blob();
  };
  const executar = async (acao: (blob: Blob) => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await acao(await gerar());
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) setMsg(e instanceof Error ? e.message : "Erro ao gerar a imagem");
    } finally {
      setBusy(false);
    }
  };
  const baixar = () =>
    executar(async (blob) => {
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = `${nomeArquivo}.png`;
      a.click();
      URL.revokeObjectURL(u);
    });
  const copiar = () =>
    executar(async (blob) => {
      const ok = await copiarImagemParaAreaDeTransferencia(blob);
      setMsg(ok ? "Imagem copiada." : "Copiar não é suportado neste navegador — use Baixar.");
    });
  const compartilhar = () =>
    executar(async (blob) => {
      const arq = new File([blob], `${nomeArquivo}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq], title: titulo });
      else setMsg("Compartilhamento direto não suportado — use Baixar.");
    });
  const copiarTexto = async () => setMsg((await copiarParaAreaDeTransferencia(texto)) ? "Texto copiado." : "Não foi possível copiar o texto.");

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 p-2" onClick={onClose}>
      <div className="flex max-h-[96vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <h2 className="text-sm font-bold text-gray-800">{titulo}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div ref={caixa} className="min-h-0 flex-1 overflow-auto bg-gray-100 p-2">
          <div className="mx-auto overflow-hidden shadow" style={{ width: w * escala, height: h * escala }}>
            <div style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: w, height: h }}>
              <div ref={alvo} style={{ width: w, height: h }}>
                {children}
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t border-gray-200 p-3">
          {msg && <div className="rounded bg-amber-50 p-2 text-xs text-amber-800">{msg}</div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={baixar} disabled={busy} className="rounded bg-sedec-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sedec-700 disabled:opacity-50">
              🖼️ Baixar imagem ({w}×{h})
            </button>
            <button type="button" onClick={copiar} disabled={busy} className="rounded border border-sedec-300 px-3 py-1.5 text-xs font-medium text-sedec-700 hover:bg-sedec-50 disabled:opacity-50">
              📋 Copiar imagem
            </button>
            {movel && (
              <button type="button" onClick={compartilhar} disabled={busy} className="rounded border border-sedec-300 px-3 py-1.5 text-xs font-medium text-sedec-700 hover:bg-sedec-50 disabled:opacity-50">
                📤 Compartilhar
              </button>
            )}
            <button type="button" onClick={copiarTexto} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
              📝 Copiar texto
            </button>
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
  const [textoGeral, setTextoGeral] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [compartilhar, setCompartilhar] = useState<"feed" | "tabela" | "story" | null>(null);

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
    // Texto geral do estado: se falhar, a previsão aparece mesmo assim (só sem o cartão de texto).
    fetchTextoGeralPrevisao(data)
      .then((t) => !cancelado && setTextoGeral(t.texto_geral ?? ""))
      .catch(() => !cancelado && setTextoGeral(""));
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

  const ordenadas = useMemo(() => ORDEM_REDEC.map((r) => ({ regiao: r, p: previsoes.find((x) => x.regiao === r) })), [previsoes]);
  const hm = (t?: string) => (t ? t.slice(0, 5) : "—");
  const texto = useMemo(() => {
    if (!data) return "";
    return [
      "*Previsão do tempo — CEMADEN-RJ*",
      `📅 ${dataExtenso(data)}`,
      "",
      ...(textoGeral ? [textoGeral, ""] : []),
      ...ordenadas
        .filter((x) => x.p)
        .flatMap(({ regiao, p }) => [
          `${EMOJI_POR_ICONE[p!.icone] ?? "▪️"} *${nomeBonito(regiao)}* — ${rotuloTempo(p!.icone)}`,
          `🌡 ${r0(p!.temperatura_minima)}° / ${r0(p!.temperatura_maxima)}° · 💧 Umidade ${textoUmidade(p!)} · 💨 Vento ${textoVento(p!)}`,
          `🌅 Nasce ${hm(p!.nascer_sol)} · 🌇 Pôr do sol ${hm(p!.por_sol)}`,
          ...(p!.comentario ? [p!.comentario] : []),
          "",
        ]),
      "📡 CEMADEN-RJ / SEDEC-RJ",
    ].join("\n");
  }, [data, ordenadas, textoGeral]);

  const dadosTabela: ShareData | null = useMemo(() => {
    if (!data) return null;
    return {
      titulo: "Previsão do tempo por REDEC — CEMADEN-RJ",
      dataHora: dataExtenso(data),
      colunas: [
        { chave: "regiao", rotulo: "REDEC", larguraPct: 19 },
        { chave: "tempo", rotulo: "Situação", larguraPct: 22 },
        { chave: "min", rotulo: "Mín", alinhamento: "center", larguraPct: 6 },
        { chave: "max", rotulo: "Máx", alinhamento: "center", larguraPct: 6 },
        { chave: "ur", rotulo: "Umidade", alinhamento: "center", larguraPct: 10 },
        { chave: "vento", rotulo: "Vento", larguraPct: 22 },
        { chave: "sol", rotulo: "Sol", alinhamento: "center", larguraPct: 15 },
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
            sol: `${hm(p!.nascer_sol)} / ${hm(p!.por_sol)}`,
          },
        })),
      fonteTexto: "Previsão: CEMADEN-RJ · Defesa Civil do Estado do Rio de Janeiro",
      nomeArquivo: `cemaden-rj-previsao-tabela-${data}`,
      destaque: textoGeral || undefined,
    };
  }, [data, ordenadas, textoGeral]);

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
          <button type="button" disabled={!previsoes.length} onClick={() => setCompartilhar("feed")} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`} title="Post de feed 1080×1350">
            <Share2 size={15} />
            Post
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
            <LegendaTempo className="mt-2 text-[11px]" />
            <CartaoTextoGeral texto={textoGeral} variante="tela" className="mt-3" />
          </div>
          <div className="grid grid-cols-1 content-start gap-2 sm:grid-cols-2">
            {ordenadas.map(({ regiao, p }) => (
              <CartaoRedec key={regiao} regiao={regiao} p={p} variante="tela" ativo={selecionada === regiao} onClick={() => setSelecionada((a) => (a === regiao ? null : regiao))} />
            ))}
          </div>
        </div>
      )}

      {compartilhar === "tabela" && dadosTabela && <ShareModal data={dadosTabela} onClose={() => setCompartilhar(null)} />}
      {compartilhar === "story" && geo && data && (
        <ExportModal titulo="Story 1080×1920" w={STORY_W} h={STORY_H} nomeArquivo={`cemaden-rj-previsao-story-${data}`} texto={texto} onClose={() => setCompartilhar(null)}>
          <CorpoStory geo={geo} previsoes={previsoes} titulo="Previsão do tempo" data={dataExtenso(data)} textoGeral={textoGeral} />
        </ExportModal>
      )}
      {compartilhar === "feed" && geo && data && (
        <ExportModal titulo="Post 1080×1350" w={FEED_W} h={FEED_H} nomeArquivo={`cemaden-rj-previsao-post-${data}`} texto={texto} onClose={() => setCompartilhar(null)}>
          <CorpoFeed geo={geo} previsoes={previsoes} titulo="Previsão do tempo" data={dataExtenso(data)} textoGeral={textoGeral} />
        </ExportModal>
      )}
    </div>
  );
}
