"use client";

import { useEffect, useState } from "react";

import { CoberturaPrevisao, fetchCoberturaPrevisao } from "@/lib/api";
import { intervaloVisivel } from "@/lib/intervaloVisivel";

// Aviso diário (28/10/2026): a partir das 15 h 30 (Brasília), enquanto a previsão de AMANHÃ não estiver completa — as 11 REDECs e o texto
// geral do estado — aparece esta faixa com o que falta e um botão para abrir o cadastro já no dia seguinte. Some quando fica completo;
// "Lembrar em 30 min" esconde a faixa por meia hora (guardado só neste navegador).

const TZ = "America/Sao_Paulo";
const HORA_AVISO = 15 * 60 + 30;
const ADIAR_MS = 30 * 60_000;
const CHAVE_ADIAR = "previsao-amanha-adiado-ate";
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function agoraSP(): { minutos: number; hoje: string } {
  const agora = new Date();
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(agora).map((p) => [p.type, p.value]));
  return { minutos: Number(partes.hour) * 60 + Number(partes.minute), hoje: new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(agora) };
}
const somaDias = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const rotuloDia = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};
const lerAdiado = (): number => {
  try {
    return Number(localStorage.getItem(CHAVE_ADIAR) ?? 0) || 0;
  } catch {
    return 0;
  }
};

/** Texto da faixa para o que falta no dia (exportado para teste visual). */
export function mensagemPendencia(c: CoberturaPrevisao): string {
  const dia = rotuloDia(c.data);
  if (c.lancadas === 0) return `A previsão de amanhã (${dia}) ainda não foi cadastrada: faltam as ${c.total} REDECs e o texto geral do estado.`;
  const partes: string[] = [];
  if (c.faltam.length) partes.push(c.faltam.length === 1 ? `1 REDEC (${c.faltam[0]})` : `${c.faltam.length} REDECs`);
  if (!c.texto_geral) partes.push("o texto geral do estado");
  return `A previsão de amanhã (${dia}) está incompleta: falta${partes.length > 1 ? "m" : ""} ${partes.join(" e ")}.`;
}

export default function PrevisaoAmanhaBanner({ onCadastrar, onPendente }: { onCadastrar: (dataIso: string) => void; onPendente?: (pendente: boolean) => void }) {
  const [cob, setCob] = useState<CoberturaPrevisao | null>(null);
  const [adiado, setAdiado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const consultar = () => {
      if (!cancelado) setAdiado(Date.now() < lerAdiado()); // reavalia a cada consulta: o adiamento de 30 min termina sozinho
      const { minutos, hoje } = agoraSP();
      if (minutos < HORA_AVISO) {
        if (!cancelado) setCob(null); // antes das 15 h 30 não avisa
        return;
      }
      fetchCoberturaPrevisao([somaDias(hoje, 1)])
        .then((r) => {
          if (!cancelado) setCob(r[0] ?? null);
        })
        .catch(() => {});
    };
    consultar();
    const parar = intervaloVisivel(consultar, 120_000);
    return () => {
      cancelado = true;
      parar();
    };
  }, []);

  const pendente = !!cob && !cob.completo;
  useEffect(() => {
    onPendente?.(pendente);
  }, [pendente, onPendente]);

  if (!cob || cob.completo || adiado) return null;
  const adiar = () => {
    const ate = Date.now() + ADIAR_MS;
    try {
      localStorage.setItem(CHAVE_ADIAR, String(ate));
    } catch {
      /* sem armazenamento: adia só nesta sessão */
    }
    setAdiado(true);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-500 px-3 py-1.5 text-[12px] font-bold leading-tight text-black sm:px-4 sm:text-sm" role="status">
      <span>⏰ {mensagemPendencia(cob)}</span>
      <span className="ml-auto flex gap-2">
        <button type="button" onClick={() => onCadastrar(cob.data)} className="rounded bg-black px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800">
          Cadastrar agora
        </button>
        <button type="button" onClick={adiar} className="rounded border border-black/40 px-2.5 py-1 text-xs font-semibold hover:bg-black/10">
          Lembrar em 30 min
        </button>
      </span>
    </div>
  );
}
