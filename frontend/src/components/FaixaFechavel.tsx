"use client";

import { X } from "lucide-react";
import { ReactNode, useState } from "react";

// Faixa de aviso do topo que o operador pode fechar para ganhar tela (19/11/2026). O fechamento é só deste navegador (sessionStorage) e a faixa
// VOLTA sozinha se o conteúdo mudar (`chave` diferente) ou, quando `voltaEmMin` é informado, depois desse tempo (avisos de segurança, como o das sirenes).

const PREFIXO = "faixa-fechada:";

function lerFechada(id: string, chave: string): boolean {
  try {
    const bruto = sessionStorage.getItem(PREFIXO + id);
    if (!bruto) return false;
    const { chave: c, ate } = JSON.parse(bruto) as { chave: string; ate: number | null };
    return c === chave && (ate == null || Date.now() < ate);
  } catch {
    return false;
  }
}

export default function FaixaFechavel({
  id,
  chave,
  voltaEmMin,
  className = "",
  children,
}: {
  id: string;
  chave: string;
  voltaEmMin?: number;
  className?: string;
  children: ReactNode;
}) {
  const [, forcar] = useState(0);
  if (lerFechada(id, chave)) return null;
  const fechar = () => {
    try {
      sessionStorage.setItem(PREFIXO + id, JSON.stringify({ chave, ate: voltaEmMin ? Date.now() + voltaEmMin * 60_000 : null }));
    } catch {
      /* sem armazenamento: não há como lembrar; a faixa só fecha se o armazenamento funcionar */
    }
    forcar((n) => n + 1);
  };
  return (
    <div className={`relative ${className}`}>
      <div className="pr-7">{children}</div>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar aviso"
        title={voltaEmMin ? `Fechar (volta em ${voltaEmMin} min se continuar)` : "Fechar (volta se a situação mudar)"}
        className="absolute right-1 top-1 rounded p-0.5 opacity-70 hover:bg-black/10 hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
