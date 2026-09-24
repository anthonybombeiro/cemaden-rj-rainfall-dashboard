"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

import { refreshNow } from "@/lib/api";

/** Botão "atualizar agora" (pedido do usuário, 2026-09-23) — reusado nas
 * tabelas de Precipitação/Dados Meteorológicos/Sirenes/Hidrológicas: pede
 * pro backend rodar a ingestão de TODAS as fontes imediatamente (não só a
 * fonte relevante pra aba atual — pedido foi "todas as estações"), depois
 * chama `onDone` pra quem estiver usando recarregar os dados. Real: chama
 * `/api/refresh/`, que de fato busca dado novo nas fontes externas — não é
 * só um "recarregar a página" (ver RefreshNowButton → refreshNow no
 * lib/api.ts e RefreshNowView no backend). Pode demorar ~15-45s (várias
 * fontes em paralelo no servidor); o ícone gira e o botão fica desabilitado
 * enquanto isso. */
export default function RefreshNowButton({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshNow();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="Busca o dado mais recente de todas as fontes agora, sem esperar o próximo ciclo automático (pode levar até 1 minuto)"
        className="flex items-center gap-1.5 rounded-lg border border-sedec-300 bg-sedec-50 px-3 py-1.5 text-sm font-medium text-sedec-700 hover:bg-sedec-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {loading ? "Atualizando…" : "Atualizar agora"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
