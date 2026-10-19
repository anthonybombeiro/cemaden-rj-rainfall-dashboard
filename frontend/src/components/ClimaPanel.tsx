"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  datasSubsazonal,
  mesesSazonal,
  notasTecnicas,
  PRODUTOS_SAZONAL,
  PRODUTOS_SUBSAZONAL,
  REGIOES_CLIMA,
  urlSazonal,
  urlSubsazonal,
  VARIAVEIS_CLIMA,
} from "@/lib/cptecClima";
import { fetchAnomalias, fetchDatasAnomalia, fetchPrecipitacaoAcumulada, MapaInmet, MapaPrecipitacao } from "@/lib/inmet";

type Modo = "anomalia" | "chuva" | "subsazonal" | "sazonal";
const MODOS: { id: Modo; rotulo: string; fonte: string }[] = [
  { id: "anomalia", rotulo: "Anomalias", fonte: "INMET" },
  { id: "chuva", rotulo: "Chuva acumulada", fonte: "INMET" },
  { id: "subsazonal", rotulo: "Subsazonal", fonte: "CPTEC" },
  { id: "sazonal", rotulo: "Sazonal", fonte: "CPTEC" },
];

const campo = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const isoDeAAAAMMDD = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

/** Mapa do Brasil em imagem, com zoom/arrasto simples (sem georreferência). Começa com o Sudeste em destaque. */
function ImagemZoom({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
        <button type="button" className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200" onClick={() => setZoom((z) => Math.min(z + 0.5, 4))}>
          Zoom +
        </button>
        <button type="button" className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200" onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}>
          Zoom −
        </button>
        <button type="button" className="rounded bg-gray-100 px-2 py-1 hover:bg-gray-200" onClick={() => setZoom(1)}>
          Brasil inteiro
        </button>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
      <div className="max-h-[75dvh] overflow-auto rounded-lg border border-gray-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="block" />
      </div>
    </div>
  );
}

function Anomalias() {
  const [datas, setDatas] = useState<string[]>([]);
  const [data, setData] = useState("");
  const [mapas, setMapas] = useState<MapaInmet[]>([]);
  const [qual, setQual] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetchDatasAnomalia()
      .then((d) => {
        setDatas(d.slice(0, 60));
        setData(d[0] ?? "");
      })
      .catch(() => setErro("Anomalias do INMET indisponíveis no momento."));
  }, []);
  useEffect(() => {
    if (!data) return;
    let cancelado = false;
    Promise.resolve().then(() => !cancelado && setCarregando(true));
    fetchAnomalias(data)
      .then((m) => {
        if (cancelado) return;
        setMapas(m);
        setQual(0);
        setErro(m.length ? null : "Sem mapa de anomalia para este dia.");
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar o mapa."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [data]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select aria-label="Data" value={data} onChange={(e) => setData(e.target.value)} className={campo}>
          {datas.map((d) => (
            <option key={d} value={d}>
              {dataBr(d)}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-gray-300 text-sm" role="group" aria-label="Variável">
          {mapas.map((m, i) => (
            <button key={m.parametro} type="button" onClick={() => setQual(i)} className={`px-3 py-1.5 font-medium ${qual === i ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
              {m.parametro.replace("Temperatura ", "T ")}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">Anomalia diária da temperatura em relação à normal climatológica (INMET).</span>
      </div>
      {erro && <p className="mb-2 rounded bg-amber-50 p-2 text-sm text-amber-800">{erro}</p>}
      {carregando ? <p className="p-6 text-center text-sm text-gray-400">Carregando…</p> : mapas[qual] && <ImagemZoom src={mapas[qual].base64} alt={`Anomalia ${mapas[qual].parametro}`} />}
    </div>
  );
}

function ChuvaAcumulada() {
  const [dias] = useState(() => Array.from({ length: 15 }, (_, i) => new Date(Date.now() - (i + 1) * 86400000).toISOString().slice(0, 10)));
  const [data, setData] = useState(dias[0]);
  const [mapas, setMapas] = useState<MapaPrecipitacao[]>([]);
  const [qual, setQual] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(() => !cancelado && setCarregando(true));
    fetchPrecipitacaoAcumulada(data)
      .then((m) => {
        if (cancelado) return;
        setMapas(m);
        setQual((q) => Math.min(q, Math.max(m.length - 1, 0)));
        setErro(m.length ? null : "Sem mapa de chuva para este dia.");
      })
      .catch(() => !cancelado && setErro("Mapas de chuva do INMET indisponíveis (cada dia pesa ~1,7 MB)."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [data]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select aria-label="Data final" value={data} onChange={(e) => setData(e.target.value)} className={campo}>
          {dias.map((d) => (
            <option key={d} value={d}>
              até {dataBr(d)}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1 text-sm" role="group" aria-label="Período">
          {mapas.map((m, i) => (
            <button key={m.parametro} type="button" onClick={() => setQual(i)} className={`rounded px-2.5 py-1.5 font-medium ${qual === i ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
              {m.parametro_extenso || m.parametro}
            </button>
          ))}
        </div>
      </div>
      {erro && <p className="mb-2 rounded bg-amber-50 p-2 text-sm text-amber-800">{erro}</p>}
      {carregando ? <p className="p-6 text-center text-sm text-gray-400">Carregando (~1,7 MB)…</p> : mapas[qual] && <ImagemZoom src={mapas[qual].base64} alt={`Chuva acumulada ${mapas[qual].parametro_extenso}`} />}
    </div>
  );
}

/** Grade de figuras do CPTEC (subsazonal: semanas; sazonal: meses/trimestres). */
function Tendencia({ tipo }: { tipo: "subsazonal" | "sazonal" }) {
  const datas = useMemo(() => (tipo === "subsazonal" ? datasSubsazonal() : mesesSazonal()), [tipo]);
  const produtos = tipo === "subsazonal" ? PRODUTOS_SUBSAZONAL : PRODUTOS_SAZONAL;
  const [data, setData] = useState(datas[tipo === "subsazonal" ? 0 : 1] ?? datas[0]);
  const [regiao, setRegiao] = useState("as");
  const [variavel, setVariavel] = useState("prec");
  const [figura, setFigura] = useState("anomaly");
  const [produto, setProduto] = useState(produtos[0].id);
  const [falhas, setFalhas] = useState<Record<string, boolean>>({});
  const v = VARIAVEIS_CLIMA.find((x) => x.id === variavel) ?? VARIAVEIS_CLIMA[0];
  const prod = produtos.find((p) => p.id === produto) ?? produtos[0];
  const figuraOk = v.figuras.some((f) => f.id === figura) ? figura : v.figuras[0].id;
  const nomeUnidade = (n: number) => (tipo === "subsazonal" ? (produto === "week" ? `Semana ${n}` : prod.rotulo) : produto === "mnth" ? `Mês ${n}` : `Trimestre ${n}`);
  const notas = notasTecnicas();

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select aria-label={tipo === "subsazonal" ? "Inicialização" : "Mês de emissão"} value={data} onChange={(e) => { setData(e.target.value); setFalhas({}); }} className={campo}>
          {datas.map((d) => (
            <option key={d} value={d}>
              {tipo === "subsazonal" ? `Inicialização ${dataBr(isoDeAAAAMMDD(d))}` : `Emissão ${d.slice(4, 6)}/${d.slice(0, 4)}`}
            </option>
          ))}
        </select>
        <select aria-label="Região" value={regiao} onChange={(e) => { setRegiao(e.target.value); setFalhas({}); }} className={campo}>
          {REGIOES_CLIMA.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rotulo}
            </option>
          ))}
        </select>
        <select aria-label="Variável" value={variavel} onChange={(e) => { setVariavel(e.target.value); setFalhas({}); }} className={campo}>
          {VARIAVEIS_CLIMA.map((x) => (
            <option key={x.id} value={x.id}>
              {x.rotulo}
            </option>
          ))}
        </select>
        {v.figuras.length > 1 && (
          <select aria-label="Campo" value={figuraOk} onChange={(e) => { setFigura(e.target.value); setFalhas({}); }} className={campo}>
            {v.figuras.map((f) => (
              <option key={f.id} value={f.id}>
                {f.rotulo}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Produto" value={produto} onChange={(e) => { setProduto(e.target.value); setFalhas({}); }} className={campo}>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: prod.quadros }, (_, i) => i + 1).map((n) => {
          const url = tipo === "subsazonal" ? urlSubsazonal(data, variavel, figuraOk, produto, n, regiao) : urlSazonal(data, variavel, figuraOk, produto, n, regiao);
          return (
            <figure key={url} className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
              <figcaption className="mb-1 text-xs font-semibold text-gray-600">{nomeUnidade(n)}</figcaption>
              {falhas[url] ? (
                <p className="p-8 text-center text-sm text-gray-500">Figura não publicada para esta combinação.</p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`${v.rotulo} — ${nomeUnidade(n)}`} loading="lazy" className="mx-auto w-full" onError={() => setFalhas((f) => ({ ...f, [url]: true }))} />
              )}
            </figure>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">
        Modelo BAM-1.2 — CPTEC/INPE.{" "}
        {tipo === "subsazonal" ? "Rodadas aos domingos e quartas-feiras." : "Emitida mensalmente."}
      </p>
      {tipo === "sazonal" && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <h3 className="mb-1 font-bold text-gray-700">Nota técnica trimestral (PDF)</h3>
          <div className="flex flex-wrap gap-2">
            {notas.map((n) => (
              <a key={n.url} href={n.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded bg-gray-100 px-2.5 py-1.5 text-blue-700 hover:bg-gray-200">
                {n.rotulo} <ExternalLink size={13} />
              </a>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Se o PDF do trimestre atual ainda não saiu, o link abre o site do CPTEC com erro: use o anterior.</p>
        </div>
      )}
    </div>
  );
}

/** Sub-aba "Clima": anomalias e chuva acumulada (INMET) e previsão subsazonal e sazonal (CPTEC). */
export default function ClimaPanel() {
  const [modo, setModo] = useState<Modo>("anomalia");
  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Clima</span>
        <span className="text-xs text-gray-500"> · observado (INMET) e tendência (CPTEC)</span>
      </h2>
      <div className="mb-3 flex flex-wrap gap-1 text-sm" role="tablist" aria-label="Produto de clima">
        {MODOS.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={modo === m.id} onClick={() => setModo(m.id)} className={`rounded-full px-3 py-1 font-medium ${modo === m.id ? "bg-sedec-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            {m.rotulo} <span className="text-[10px] opacity-70">· {m.fonte}</span>
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm sm:p-3">
        {modo === "anomalia" && <Anomalias />}
        {modo === "chuva" && <ChuvaAcumulada />}
        {modo === "subsazonal" && <Tendencia key="sub" tipo="subsazonal" />}
        {modo === "sazonal" && <Tendencia key="saz" tipo="sazonal" />}
      </div>
    </div>
  );
}
