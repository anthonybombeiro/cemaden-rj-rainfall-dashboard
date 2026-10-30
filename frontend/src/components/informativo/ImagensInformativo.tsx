"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getJson, REDECS } from "@/lib/api";
import { ItemRegiao, INTENSIDADES, nomeRegiao, urlImagemRadar } from "@/lib/informativo";
import { carregarGeoRj, caminho, centroide, GeoRj, horaLocal, mercatorY, projecao } from "@/lib/mapaCanvas";

const RADARES: { id: string; nome: string }[] = [
  { id: "mosaic", nome: "Mosaico" },
  { id: "gua", nome: "Guaratiba" },
  { id: "mac", nome: "Macaé" },
  { id: "mdn", nome: "Mendanha" },
  { id: "sumare", nome: "Sumaré" },
  { id: "nit", nome: "Niterói" },
];
type RadarResp = { tipo: string; timestamp: string; image_url: string; bounds: [[number, number], [number, number]] };

const gravidade = (chave: string) => INTENSIDADES.findIndex((o) => o.chave === chave);
const COR_GRAVIDADE = (g: number) => (g <= 0 ? "#f3f4f6" : g <= 2 ? "#63B8FF" : g <= 4 ? "#FFFF66" : g <= 6 ? "#FFA600" : "#CC0000");

function Botoes({ canvas, arquivo, pronto }: { canvas: React.RefObject<HTMLCanvasElement | null>; arquivo: string; pronto: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const blob = () => new Promise<Blob>((ok, falha) => canvas.current?.toBlob((b) => (b ? ok(b) : falha(new Error("sem imagem"))), "image/png"));
  const baixar = async () => {
    try {
      const url = URL.createObjectURL(await blob());
      const a = document.createElement("a");
      a.href = url; a.download = arquivo; a.click();
      URL.revokeObjectURL(url);
      setMsg(null);
    } catch { setMsg("Não foi possível exportar a imagem (o navegador bloqueou o canvas)."); }
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": await blob() })]);
      setMsg("Imagem copiada.");
    } catch { setMsg("Não foi possível copiar a imagem; use Baixar PNG."); }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={!pronto} onClick={baixar} className="rounded bg-gray-800 px-2.5 py-1.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50">Baixar PNG</button>
      <button type="button" disabled={!pronto} onClick={copiar} className="rounded border border-gray-300 bg-white px-2.5 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-50">Copiar imagem</button>
      {msg && <span className="text-gray-600">{msg}</span>}
    </div>
  );
}

/** F14: recorte do estado do RJ no quadro de radar escolhido, com as divisas municipais e a legenda do protocolo
 * ("Radar Tool INEA (…)" + "Atualização de HHhMM (horário local)."), pronto para baixar ou copiar. */
export function RadarRecorte() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [radar, setRadar] = useState("mosaic");
  const [geo, setGeo] = useState<GeoRj | null>(null);
  const [dado, setDado] = useState<RadarResp | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => { carregarGeoRj().then(setGeo).catch(() => setErro("Não foi possível carregar o mapa do estado.")); }, []);
  const buscar = useCallback(() => {
    setCarregando(true); setErro(null); setImg(null);
    getJson<RadarResp>(`/imagery/radar-inea/?tipo=${radar}&produto=zh`)
      .then((d) => {
        setDado(d);
        const i = new Image();
        i.crossOrigin = "use-credentials";
        i.onload = () => { setImg(i); setCarregando(false); };
        i.onerror = () => { setErro("Não foi possível baixar o quadro de radar."); setCarregando(false); };
        i.src = urlImagemRadar(d.image_url);
      })
      .catch((e) => { setErro(e instanceof Error ? e.message : "Falha ao consultar o radar."); setCarregando(false); });
  }, [radar]);
  // busca o quadro ao abrir e ao trocar de radar (sincroniza com a API externa)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { buscar(); }, [buscar]);

  const quando = dado ? new Date(`${dado.timestamp.replace(" ", "T")}Z`) : null; // o backend devolve UTC
  const legenda = [`Radar Tool INEA (${RADARES.find((r) => r.id === radar)?.nome})`, quando ? `Atualização de ${horaLocal(quando)} (horário local).` : ""];

  useEffect(() => {
    const c = ref.current;
    if (!c || !geo || !img || !dado) return;
    const L = 1200, faixa = 96;
    const p = projecao(geo.bbox, L, 14);
    c.width = L; c.height = p.altura + faixa;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
    const [[latMin, lonMin], [latMax, lonMax]] = dado.bounds;
    const sx = (lon: number) => ((lon - lonMin) / (lonMax - lonMin)) * img.naturalWidth;
    const sy = (lat: number) => ((mercatorY(latMax) - mercatorY(lat)) / (mercatorY(latMax) - mercatorY(latMin))) * img.naturalHeight;
    const dx0 = p.xy(geo.bbox.minLon, geo.bbox.maxLat), dx1 = p.xy(geo.bbox.maxLon, geo.bbox.minLat);
    g.fillStyle = "#e5eaf0";
    geo.municipios.features.forEach((f) => g.fill(caminho(f, p)));
    g.drawImage(img, sx(geo.bbox.minLon), sy(geo.bbox.maxLat), sx(geo.bbox.maxLon) - sx(geo.bbox.minLon), sy(geo.bbox.minLat) - sy(geo.bbox.maxLat), dx0[0], dx0[1], dx1[0] - dx0[0], dx1[1] - dx0[1]);
    g.strokeStyle = "rgba(30,41,59,0.55)"; g.lineWidth = 0.9;
    geo.municipios.features.forEach((f) => g.stroke(caminho(f, p)));
    g.strokeStyle = "#1f3864"; g.lineWidth = 2.4;
    geo.redecs.features.forEach((f) => g.stroke(caminho(f, p)));
    g.fillStyle = "#1f3864"; g.fillRect(0, p.altura, L, faixa);
    g.fillStyle = "#ffffff"; g.textBaseline = "middle";
    g.font = "bold 34px Arial, sans-serif"; g.fillText(legenda[0], 28, p.altura + 32);
    g.font = "28px Arial, sans-serif"; g.fillText(legenda[1], 28, p.altura + 68);
    g.textAlign = "right"; g.font = "bold 26px Arial, sans-serif"; g.fillText("CEMADEN-RJ", L - 28, p.altura + 48); g.textAlign = "left";
  }, [geo, img, dado, legenda[0], legenda[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <b>Recorte do radar</b>
        <select value={radar} onChange={(e) => setRadar(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">{RADARES.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}</select>
        <button type="button" onClick={buscar} disabled={carregando} className="rounded border border-gray-300 bg-white px-2.5 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-50">Atualizar quadro</button>
      </div>
      {erro && <p className="text-red-700">{erro}</p>}
      {carregando && <p className="text-gray-500">Carregando o quadro…</p>}
      <canvas ref={ref} className={`w-full rounded border border-gray-200 ${img ? "" : "hidden"}`} />
      <Botoes canvas={ref} arquivo={`radar-${radar}-${quando ? horaLocal(quando).replace("h", "") : "agora"}.png`} pronto={!!img} />
      <p className="text-[11px] text-gray-500">Fonte: Radar Tool do INEA (refletividade). Reenvie o radar conforme o relógio do Acompanhamento.</p>
    </div>
  );
}

/** F20: mapa das 11 REDECs coloridas pela previsão de 6 h do informativo (a mesma escala de cores da chuva), com balões numerados na ordem oficial das REDECs
 * (1 Capital, 2 Baixada Fluminense…) e a lista ao lado com a intensidade de cada região, raios e granizo. */
export function MapaInformativo({ itens, numero, ano, hora }: { itens: ItemRegiao[]; numero?: number; ano?: number; hora?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [geo, setGeo] = useState<GeoRj | null>(null);
  useEffect(() => { carregarGeoRj().then(setGeo).catch(() => undefined); }, []);
  useEffect(() => {
    const c = ref.current;
    if (!c || !geo) return;
    const L = 1080, topo = 132, base = 96, linha = 50, mapaL = 640;
    const p = projecao(geo.bbox, mapaL, 6);
    const corpo = Math.max(p.altura, linha * REDECS.length + 24);
    c.width = L; c.height = topo + corpo + base;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, L, c.height);
    g.fillStyle = "#1f3864"; g.fillRect(0, 0, L, topo);
    g.fillStyle = "#ffffff"; g.textBaseline = "middle";
    g.font = "bold 42px Arial, sans-serif"; g.fillText(`INFORMATIVO METEOROLÓGICO${numero ? ` nº ${numero}/${ano}` : ""}`, 36, 48);
    g.font = "28px Arial, sans-serif"; g.fillText(`Previsão para as próximas 6 horas${hora ? ` · ${hora}` : ""}`, 36, 94);
    const por = new Map(itens.map((i) => [i.regiao, i]));
    const num = (regiao: string) => (REDECS as readonly string[]).indexOf(regiao) + 1;
    const cor = (regiao: string) => COR_GRAVIDADE(por.has(regiao) ? gravidade(por.get(regiao)!.chuva_prevista) : 0);
    // mapa (à esquerda)
    g.save(); g.translate(24, topo + (corpo - p.altura) / 2);
    geo.redecs.features.forEach((f) => { g.fillStyle = cor(f.properties.redec); g.fill(caminho(f, p)); });
    g.strokeStyle = "rgba(30,41,59,0.35)"; g.lineWidth = 0.7;
    geo.municipios.features.forEach((f) => g.stroke(caminho(f, p)));
    g.strokeStyle = "#1f3864"; g.lineWidth = 2.6;
    geo.redecs.features.forEach((f) => g.stroke(caminho(f, p)));
    g.textAlign = "center"; g.font = "bold 20px Arial, sans-serif";
    geo.redecs.features.forEach((f) => {
      const [lon, lat] = centroide(f);
      const [x, y] = p.xy(lon, lat);
      g.fillStyle = "#1f3864"; g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.fill();
      g.lineWidth = 2.5; g.strokeStyle = "#ffffff"; g.stroke();
      g.fillStyle = "#ffffff"; g.fillText(String(num(f.properties.redec)), x, y + 1);
    });
    g.restore(); g.textAlign = "left";
    // lista (à direita), na ordem oficial
    const x0 = 700;
    REDECS.forEach((regiao, k) => {
      const y = topo + 12 + (corpo - linha * REDECS.length) / 2 + k * linha;
      const i = por.get(regiao);
      g.fillStyle = cor(regiao); g.fillRect(x0, y + 6, 14, linha - 12);
      g.fillStyle = "#1f3864"; g.beginPath(); g.arc(x0 + 40, y + linha / 2, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffffff"; g.font = "bold 20px Arial, sans-serif"; g.textAlign = "center"; g.fillText(String(k + 1), x0 + 40, y + linha / 2 + 1); g.textAlign = "left";
      g.fillStyle = "#162033"; g.font = "bold 22px Arial, sans-serif"; g.fillText(nomeRegiao(regiao), x0 + 68, y + 15);
      const prev = i?.chuva_prevista ? (INTENSIDADES.find((o) => o.chave === i.chuva_prevista)?.rotulo ?? "") : "Sem previsão";
      g.fillStyle = "#475569"; g.font = "19px Arial, sans-serif"; g.fillText(`${prev}${i?.raios ? "  ⚡" : ""}${i?.granizo ? "  ❄" : ""}`, x0 + 68, y + 38);
    });
    const y0 = topo + corpo;
    g.fillStyle = "#f8fafc"; g.fillRect(0, y0, L, base);
    const chaves: [string, string][] = [["#63B8FF", "Fraca"], ["#FFFF66", "Moderada"], ["#FFA600", "Forte"], ["#CC0000", "Muito forte"], ["#f3f4f6", "Sem previsão"]];
    chaves.forEach(([cr, nome], k) => {
      const x = 36 + k * 200;
      g.fillStyle = cr; g.fillRect(x, y0 + 20, 34, 24); g.strokeStyle = "#94a3b8"; g.lineWidth = 1; g.strokeRect(x, y0 + 20, 34, 24);
      g.fillStyle = "#162033"; g.font = "21px Arial, sans-serif"; g.fillText(nome, x + 44, y0 + 33);
    });
    g.font = "19px Arial, sans-serif"; g.fillStyle = "#475569"; g.fillText("⚡ raios   ❄ granizo pontual   ·   CEMADEN-RJ · Defesa Civil do Estado do Rio de Janeiro", 36, y0 + 72);
  }, [geo, itens, numero, ano, hora]);
  return (
    <div className="space-y-2 text-xs">
      <b>Mapa da previsão (11 REDECs)</b>
      <canvas ref={ref} className="w-full rounded border border-gray-200" />
      <Botoes canvas={ref} arquivo={`informativo-${numero ?? "rascunho"}-${ano ?? ""}-mapa.png`} pronto={!!geo} />
    </div>
  );
}
