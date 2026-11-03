"use client";

import { toPng } from "html-to-image";
import { Download } from "lucide-react";
import { useRef, useState } from "react";

import { Acumulados, fmtMm, tituloAcumulados } from "@/lib/producaoMet";

/** Arte "Principais acumulados em 24 h" (modelo de 19/10/2026), 1024×1280 (4:5): cabeçalho CEMADEN-RJ, tabela Região / Município / Acumulados / Fonte
 * (10 linhas, um município por linha) e rodapé institucional. Cabeçalho, rodapé e ícones são recortes do modelo (public/arte). A fonte vem do
 * backend com o rótulo da arte (INMET, CEMADEN/MCTI, ANA, DC <município>…). */
const LARGURA = 1024;
const ALTURA = 1280;
const AZUL_TEXTO = "#1b4b7a";
const COLUNAS = "190px 256px 212px 254px";

export function ArteAcumulados({ dados }: { dados: Acumulados }) {
  const linhas = dados.itens.slice(0, 10);
  return (
    <div style={{ position: "relative", width: LARGURA, height: ALTURA, background: "#012a7a", overflow: "hidden", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div style={{ position: "absolute", left: 35, top: 205, width: 954, height: 910, boxSizing: "border-box", border: "8px solid #fd5e27", borderRadius: 72, background: "#fff", overflow: "hidden" }}>
        {/* marca d'água do modelo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-defesa-civil.png" alt="" style={{ position: "absolute", left: 24, top: 650, width: 220, opacity: 0.1 }} />
        <div style={{ position: "absolute", left: 250, top: 668, right: 20, textAlign: "center", color: "rgba(27,75,122,0.09)", fontWeight: 900, fontSize: 70, lineHeight: 1.05 }}>
          SIGA NOSSAS REDES
          <div style={{ fontSize: 66 }}>@DEFESACIVIL_RJ</div>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arte/acum-cabecalho.png" alt="" style={{ position: "absolute", left: 213, top: 58, width: 614, height: 180 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arte/acum-pluviometro.png" alt="" style={{ position: "absolute", left: 52, top: 215, width: 130, height: 147 }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arte/acum-24h.png" alt="" style={{ position: "absolute", left: 818, top: 224, width: 132, height: 126 }} />
      <div style={{ position: "absolute", left: 190, width: 620, top: 252, textAlign: "center", color: "#16437c", fontWeight: 800, fontSize: 40, lineHeight: "50px", letterSpacing: 0.5 }}>{tituloAcumulados(dados)}</div>
      <div style={{ position: "absolute", left: 160, width: 650, top: 298, textAlign: "center", color: "#16437c", fontWeight: 800, fontSize: 37, lineHeight: "46px", letterSpacing: 0.3 }}>PRINCIPAIS ACUMULADOS EM</div>

      <div style={{ position: "absolute", left: 65, top: 358, width: 912, display: "grid", gridTemplateColumns: COLUNAS, color: AZUL_TEXTO, fontWeight: 800, fontSize: 27, textAlign: "center", lineHeight: "46px" }}>
        <div>REGIÃO</div>
        <div>MUNICÍPIO</div>
        <div>ACUMULADOS</div>
        <div>FONTE</div>
      </div>
      <div style={{ position: "absolute", left: 65, top: 414, width: 912 }}>
        {linhas.map((l) => (
          <div key={l.municipio} style={{ display: "grid", gridTemplateColumns: COLUNAS, alignItems: "center", height: 66.6, borderTop: "1.5px solid #8a90a8", color: "#425982", fontSize: 27, textAlign: "center" }}>
            <div style={{ fontSize: l.regiao_nome.length > 11 ? 22 : 27, lineHeight: 1.1, padding: "0 6px" }}>{l.regiao_nome}</div>
            <div style={{ fontSize: l.municipio.length > 15 ? 23 : 27, lineHeight: 1.1, padding: "0 4px" }}>{l.municipio}</div>
            <div>{fmtMm(l.valor)} mm/24h</div>
            <div style={{ fontSize: l.fonte_rotulo.length > 14 ? 23 : 27 }}>{l.fonte_rotulo}</div>
          </div>
        ))}
        <div style={{ borderTop: "1.5px solid #8a90a8" }} />
      </div>

      {["left", "right"].map((lado) => (
        <div key={lado} style={{ position: "absolute", [lado]: 25, top: 1122, fontSize: 56, fontWeight: 900, color: "rgba(255,255,255,0.12)" }}>
          SEDEC-RJ
        </div>
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arte/acum-rodape.png" alt="" style={{ position: "absolute", left: 310, top: 1068, width: 402, height: 212 }} />
    </div>
  );
}

/** Pré-visualização reduzida da arte e botão que baixa o PNG em tamanho cheio (2×). */
export default function AcumuladosArte({ dados }: { dados: Acumulados }) {
  const alvo = useRef<HTMLDivElement>(null);
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
      a.download = `acumulados-24h-${dados.ref.slice(0, 10)}-${dados.ref.slice(11, 13)}h.png`;
      a.click();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a imagem.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={baixar} disabled={gerando} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        <Download size={14} /> {gerando ? "Gerando…" : "Baixar PNG"}
      </button>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <div style={{ width: LARGURA * escala, height: ALTURA * escala }} className="overflow-hidden rounded border border-gray-300">
        <div ref={alvo} style={{ width: LARGURA, height: ALTURA, transform: `scale(${escala})`, transformOrigin: "top left" }}>
          <ArteAcumulados dados={dados} />
        </div>
      </div>
    </div>
  );
}
