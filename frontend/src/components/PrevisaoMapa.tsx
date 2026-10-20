"use client";

import { ChevronLeft, ChevronRight, Share2, Table2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import PrevisaoMapaCorpo, { CLASSES_TEMPO, MAPA_H, MAPA_W } from "@/components/PrevisaoMapaCorpo";
import ShareModal from "@/components/ShareModal";
import { fetchDataUltimaPrevisao, fetchPrevisoes, Previsao } from "@/lib/api";
import { GeoJsonFeatureCollection } from "@/lib/geo";
import { EMOJI_POR_ICONE, ICONES_TEMPO } from "@/lib/meteorologia";
import { ShareData } from "@/lib/shareExport";

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
const rotuloTempo = (icone: string) => ICONES_TEMPO.find((i) => i.key === icone)?.label ?? icone;

function Legenda({ sol }: { sol: { nascer: string; por: string } | null }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-slate-600">
      {CLASSES_TEMPO.map((c) => (
        <span key={c.rotulo} className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10" style={{ background: c.cor }} />
          {c.rotulo}
        </span>
      ))}
      <span className="text-slate-400">·</span>
      <span>
        <b className="text-blue-700">mín</b> / <b className="text-red-600">máx</b> em °C
      </span>
      {sol && (
        <span>
          · ☀ nasce {sol.nascer} · ☾ pôr do sol {sol.por} (Capital)
        </span>
      )}
    </div>
  );
}

/** Mapa → "Previsão": previsão do CEMADEN-RJ do dia sobre o mapa das REDECs (sem mapa-base), com exportação em formato de post
 * (imagem quadrada com as logos, igual às abas de Ventos e Hidrologia) e uma versão em tabela. */
export default function PrevisaoMapa() {
  const [geo, setGeo] = useState<GeoJsonFeatureCollection | null>(null);
  const [data, setData] = useState<string | null>(null);
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [compartilhar, setCompartilhar] = useState<"mapa" | "tabela" | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

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

  // encolhe o desenho (tamanho fixo de post) para caber na largura da tela
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setEscala(Math.min(1.4, el.clientWidth / MAPA_W)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [geo]);

  const capital = previsoes.find((p) => p.regiao === "CAPITAL") ?? previsoes[0];
  const sol = capital?.nascer_sol && capital?.por_sol ? { nascer: capital.nascer_sol.slice(0, 5), por: capital.por_sol.slice(0, 5) } : null;
  const detalhe = previsoes.find((p) => p.regiao === selecionada) ?? null;

  const dadosMapa: ShareData | null = useMemo(() => {
    if (!geo || !data) return null;
    const ordenadas = [...previsoes].sort((a, b) => a.regiao.localeCompare(b.regiao, "pt-BR"));
    const texto = [
      `*Previsão do tempo — CEMADEN-RJ*`,
      `📅 ${dataExtenso(data)}`,
      "",
      ...ordenadas.map((p) => `${EMOJI_POR_ICONE[p.icone] ?? "▪️"} *${p.regiao}* — ${Math.round(p.temperatura_minima)}° / ${Math.round(p.temperatura_maxima)}° · ${rotuloTempo(p.icone)}`),
      ...(sol ? ["", `☀ Nasce ${sol.nascer} · ☾ Pôr do sol ${sol.por} (Capital)`] : []),
      "",
      "📡 CEMADEN-RJ / SEDEC-RJ",
    ].join("\n");
    return {
      titulo: "Previsão do tempo — CEMADEN-RJ",
      dataHora: dataExtenso(data),
      colunas: [],
      linhas: [],
      fonteTexto: "Previsão: CEMADEN-RJ · Defesa Civil do Estado do Rio de Janeiro",
      nomeArquivo: `cemaden-rj-previsao-${data}`,
      corpo: (
        <div className="flex h-full flex-col items-center justify-start gap-2">
          <PrevisaoMapaCorpo geo={geo} previsoes={previsoes} />
          <Legenda sol={sol} />
        </div>
      ),
      textoPronto: texto,
    };
  }, [geo, data, previsoes, sol]);

  const dadosTabela: ShareData | null = useMemo(() => {
    if (!data) return null;
    const ordenadas = [...previsoes].sort((a, b) => a.regiao.localeCompare(b.regiao, "pt-BR"));
    return {
      titulo: "Previsão do tempo por REDEC — CEMADEN-RJ",
      dataHora: dataExtenso(data),
      colunas: [
        { chave: "regiao", rotulo: "REDEC", larguraPct: 24 },
        { chave: "tempo", rotulo: "Tempo", larguraPct: 32 },
        { chave: "min", rotulo: "Mín", alinhamento: "center", larguraPct: 9 },
        { chave: "max", rotulo: "Máx", alinhamento: "center", larguraPct: 9 },
        { chave: "vento", rotulo: "Vento", larguraPct: 26 },
      ],
      linhas: ordenadas.map((p) => ({
        valores: {
          regiao: p.regiao,
          tempo: `${EMOJI_POR_ICONE[p.icone] ?? ""} ${rotuloTempo(p.icone)}`,
          min: `${Math.round(p.temperatura_minima)}°`,
          max: `${Math.round(p.temperatura_maxima)}°`,
          vento: `${p.vento_velocidade}${p.vento_direcao ? ` (${p.vento_direcao})` : ""}`,
        },
      })),
      fonteTexto: "Previsão: CEMADEN-RJ · Defesa Civil do Estado do Rio de Janeiro",
      nomeArquivo: `cemaden-rj-previsao-tabela-${data}`,
    };
  }, [data, previsoes]);

  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" aria-label="Dia anterior" onClick={() => data && setData(somaDias(data, -1))} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200">
          <ChevronLeft size={16} />
        </button>
        <input type="date" value={data ?? ""} onChange={(e) => e.target.value && setData(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1" />
        <button type="button" aria-label="Próximo dia" onClick={() => data && setData(somaDias(data, 1))} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200">
          <ChevronRight size={16} />
        </button>
        {data && <span className="font-semibold text-gray-800">{dataExtenso(data)}</span>}
        <span className="text-xs text-gray-500">Previsão do CEMADEN-RJ por REDEC · clique numa região para ver os detalhes</span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" disabled={!previsoes.length} onClick={() => setCompartilhar("mapa")} className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-40" title="Gerar imagem do mapa para Instagram/WhatsApp">
            <Share2 size={15} />
            Post do mapa
          </button>
          <button type="button" disabled={!previsoes.length} onClick={() => setCompartilhar("tabela")} className="flex items-center gap-1 rounded bg-gray-100 px-2.5 py-1.5 font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40" title="Gerar imagem em tabela">
            <Table2 size={15} />
            Post em tabela
          </button>
        </div>
      </div>

      {erro && <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
      {!geo || carregando ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : !previsoes.length ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">Ainda não há previsão cadastrada para {data ? dataExtenso(data) : "este dia"}. Use as setas para ver outro dia.</div>
      ) : (
        <>
          <div ref={caixa} className="w-full max-w-4xl self-center">
            <div style={{ height: MAPA_H * escala }}>
              <div style={{ transform: `scale(${escala})`, transformOrigin: "top left", width: MAPA_W, height: MAPA_H }}>
                <PrevisaoMapaCorpo geo={geo} previsoes={previsoes} selecionada={selecionada} onSelecionar={(r) => setSelecionada((a) => (a === r ? null : r))} />
              </div>
            </div>
          </div>
          <div className="mt-2">
            <Legenda sol={sol} />
          </div>
          {detalhe && (
            <div className="mt-3 w-full max-w-3xl self-center rounded-lg border border-gray-200 border-t-4 border-t-blue-600 bg-gray-50 p-3 text-sm">
              <h3 className="mb-1 font-bold text-gray-800">
                {detalhe.regiao} · {rotuloTempo(detalhe.icone)}
              </h3>
              <p className="text-gray-700">
                Mín <b className="text-blue-700">{Math.round(detalhe.temperatura_minima)}°C</b> · Máx <b className="text-red-600">{Math.round(detalhe.temperatura_maxima)}°C</b> · Umidade {Math.round(detalhe.umidade_minima)}–{Math.round(detalhe.umidade_maxima)}% · Vento {detalhe.vento_velocidade}
                {detalhe.vento_direcao ? ` (${detalhe.vento_direcao})` : ""} · ☀ {detalhe.nascer_sol?.slice(0, 5)} · ☾ {detalhe.por_sol?.slice(0, 5)}
              </p>
              {detalhe.comentario && <p className="mt-1 whitespace-pre-line text-gray-600">{detalhe.comentario}</p>}
            </div>
          )}
        </>
      )}

      {compartilhar === "mapa" && dadosMapa && <ShareModal data={dadosMapa} onClose={() => setCompartilhar(null)} />}
      {compartilhar === "tabela" && dadosTabela && <ShareModal data={dadosTabela} onClose={() => setCompartilhar(null)} />}
    </div>
  );
}
