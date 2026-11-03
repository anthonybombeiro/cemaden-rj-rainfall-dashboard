"use client";

import { toPng } from "html-to-image";
import { CloudRain, Download, Wind } from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { AvisoMet, LEGENDA_CHUVA_AVISO, numeroAviso, vigenciaAviso } from "@/lib/producaoMet";

/** Arte do aviso meteorológico, 1024×1280 (4:5), no desenho do aviso nº 013/2025 do protocolo: faixa laranja com título, ícones (chuva e/ou vento),
 * nº, vigência e região; cartão branco com o texto (trechos entre ** em negrito), sistema atuante, fonte e rodapé institucional. O tamanho do texto
 * se ajusta ao comprimento. `legenda` acrescenta a escala de chuva do protocolo. */
const LARGURA = 1024;
const ALTURA = 1280;
const AZUL = "#1b4b7a";

const tamanhoTexto = (n: number, legenda: boolean) => {
  const base = n <= 380 ? 40 : n <= 520 ? 36 : n <= 700 ? 32 : n <= 900 ? 28 : 25;
  return legenda ? base - 2 : base;
};

function Negrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("**").map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

const Pontos = ({ style }: { style: React.CSSProperties }) => (
  <div style={{ position: "absolute", backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.85) 3px, transparent 3.5px)", backgroundSize: "34px 34px", ...style }} />
);

export function ArteAviso({ aviso, nomeSistema, legenda }: { aviso: AvisoMet; nomeSistema: (id: string) => string; legenda: boolean }) {
  const regiao = aviso.regioes.length ? aviso.regioes.map((r) => r.charAt(0) + r.slice(1).toLowerCase()).join(", ") : "Todas as regiões do Estado.";
  const sistemas = aviso.sistemas.map(nomeSistema).join(" e ");
  const paragrafos = aviso.texto.split(/\n{2,}/);
  const fonte = tamanhoTexto(aviso.texto.length, legenda);
  const [pref, ...posf] = vigenciaAviso(aviso).split(" ATÉ ");
  return (
    <div style={{ position: "relative", width: LARGURA, height: ALTURA, overflow: "hidden", fontFamily: "Arial, Helvetica, sans-serif", background: "linear-gradient(160deg,#0c4fa6 0%,#0a3a8a 45%,#0a1f5e 100%)" }}>
      <Pontos style={{ left: 355, top: 62, width: 310, height: 6 }} />
      <Pontos style={{ left: 355, top: 1236, width: 310, height: 34 }} />
      <div style={{ position: "absolute", left: 68, top: 325, width: 888, height: 750, background: "#fff", borderRadius: 56, boxSizing: "border-box", padding: "70px 36px 24px", color: AZUL, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", fontSize: fonte, lineHeight: 1.18, textAlign: "justify" }}>
          {paragrafos.map((p, i) => (
            <p key={i} style={{ margin: "0 0 0.7em" }}>
              <Negrito texto={p} />
            </p>
          ))}
        </div>
        {legenda && (
          <div style={{ marginTop: 6, fontSize: 19, lineHeight: "24px", color: "#fff", background: "#0a2a68", borderRadius: 10, padding: "6px 14px" }}>
            {LEGENDA_CHUVA_AVISO.map((l) => (
              <div key={l.faixa}>
                {l.faixa} — {l.nome.toLowerCase()}
              </div>
            ))}
          </div>
        )}
        {sistemas && <div style={{ textAlign: "center", fontSize: 34, marginTop: 10 }}>Sistema{aviso.sistemas.length > 1 ? "s" : ""}: {sistemas}.</div>}
        <div style={{ textAlign: "center", fontSize: 26, letterSpacing: 2, marginTop: 14 }}>FONTE: SEDEC-RJ/CEMADEN-RJ</div>
      </div>

      <div style={{ position: "absolute", left: 165, top: 57, width: 725, height: 318, background: "#ff5a00", borderRadius: "170px 0 150px 150px" }} />
      {aviso.icones.includes("chuva") && <CloudRain size={170} color="#fff" strokeWidth={1.4} style={{ position: "absolute", left: 10, top: 150 }} />}
      {aviso.icones.includes("vento") && <Wind size={150} color="#fff" strokeWidth={1.4} style={{ position: "absolute", left: 862, top: 130 }} />}
      <div style={{ position: "absolute", left: 165, width: 725, top: 88, textAlign: "center", color: "#fff", fontWeight: 800, fontSize: 52, lineHeight: "66px", letterSpacing: 4 }}>
        AVISO
        <br />
        METEOROLÓGICO
      </div>
      <div style={{ position: "absolute", left: 165, width: 725, top: 236, textAlign: "center", color: "#fff", fontSize: 21, lineHeight: "29px", letterSpacing: 2 }}>
        Nº{numeroAviso(aviso)}
        <br />
        {pref}
        <br />
        {posf.length ? `ATÉ ${posf.join(" ATÉ ")}` : ""}
        <br />
        REGIÃO: {regiao}
      </div>

      <div style={{ position: "absolute", left: 322, top: 1055, width: 396, height: 168, background: "#001453", borderRadius: "60px 60px 60px 60px", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "0 12px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arte/logo-bombeiros.png" alt="" style={{ height: 94 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arte/logo-sedec.png" alt="" style={{ height: 94 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arte/logo-govrj.png" alt="" style={{ height: 94 }} />
      </div>
    </div>
  );
}

/** Pré-visualização reduzida da arte do aviso e botão que baixa o PNG em tamanho cheio (2×). */
export default function AvisoArte({ aviso, nomeSistema }: { aviso: AvisoMet; nomeSistema: (id: string) => string }) {
  const alvo = useRef<HTMLDivElement>(null);
  const [legenda, setLegenda] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const escala = 0.5;

  const baixar = async () => {
    if (!alvo.current) return;
    setGerando(true);
    setErro(null);
    try {
      const url = await toPng(alvo.current, { width: LARGURA, height: ALTURA, pixelRatio: 2, cacheBust: true, style: { transform: "none", margin: "0" } });
      const a = document.createElement("a");
      a.href = url;
      a.download = `aviso-meteorologico-${aviso.numero}-${aviso.ano}.png`;
      a.click();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={baixar} disabled={gerando} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          <Download size={14} /> {gerando ? "Gerando…" : "Baixar PNG"}
        </button>
        <label className="inline-flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={legenda} onChange={(e) => setLegenda(e.target.checked)} /> Legenda de chuva
        </label>
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div style={{ width: LARGURA * escala, height: ALTURA * escala }} className="overflow-hidden rounded border border-gray-300">
        <div ref={alvo} style={{ width: LARGURA, height: ALTURA, transform: `scale(${escala})`, transformOrigin: "top left" }}>
          <ArteAviso aviso={aviso} nomeSistema={nomeSistema} legenda={legenda} />
        </div>
      </div>
    </div>
  );
}
