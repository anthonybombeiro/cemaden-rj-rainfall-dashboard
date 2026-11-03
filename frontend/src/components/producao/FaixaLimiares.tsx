"use client";

import { Check, Clipboard } from "lucide-react";
import { useEffect, useState } from "react";

import { intervaloVisivel } from "@/lib/intervaloVisivel";
import { AlertaLimiar, alertasDeLimiar, fetchLimiares, Limiares } from "@/lib/producaoMet";

/** Alertas de limiar do protocolo (chuva > 25 mm/h; 3+ estações com 40 mm/24 h; umidade < 30 %): cada alerta ativo mostra a ação e um texto pronto
 * para copiar. Atualiza a cada 2 min com a aba visível. Em modo `compacta` some quando nada passa dos limiares. */
export default function FaixaLimiares({ compacta = false }: { compacta?: boolean }) {
  const [dados, setDados] = useState<Limiares | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const buscar = () => fetchLimiares().then((d) => vivo && setDados(d)).catch(() => {});
    buscar();
    const parar = intervaloVisivel(buscar, 120_000);
    return () => {
      vivo = false;
      parar();
    };
  }, []);

  if (!dados) return null;
  const alertas: AlertaLimiar[] = alertasDeLimiar(dados);
  if (!alertas.length)
    return compacta ? null : (
      <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
        Nenhum limiar do protocolo ultrapassado agora (chuva &gt; {dados.limiares.chuva_1h_mm} mm/h, {dados.limiares.estacoes_24h_n}+ estações com {dados.limiares.estacoes_24h_mm} mm/24 h, umidade &lt;{" "}
        {dados.limiares.umidade_pct}%).
      </p>
    );

  const copiar = async (a: AlertaLimiar) => {
    try {
      await navigator.clipboard.writeText(a.texto);
      setCopiado(a.chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      /* sem permissão: o texto continua visível na faixa */
    }
  };
  return (
    <div className="space-y-1.5" role="status">
      {alertas.map((a) => (
        <div key={a.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border-l-4 bg-white px-3 py-1.5 text-xs shadow-sm" style={{ borderColor: a.cor }}>
          <span className="font-bold" style={{ color: a.cor }}>
            ⚠ {a.titulo}
          </span>
          <span className="text-gray-600">{a.acao}</span>
          <button type="button" onClick={() => copiar(a)} className="ml-auto inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-0.5 font-semibold text-gray-700 hover:bg-gray-50">
            {copiado === a.chave ? <Check size={12} /> : <Clipboard size={12} />} {copiado === a.chave ? "Copiado" : "Copiar texto"}
          </button>
          {!compacta && <span className="basis-full text-[11px] text-gray-500">{a.texto}</span>}
        </div>
      ))}
    </div>
  );
}
