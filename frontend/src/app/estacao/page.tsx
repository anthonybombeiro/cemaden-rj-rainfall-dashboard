"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import StationHistoryPanel from "@/components/StationHistoryPanel";

/** Rota standalone (nova aba, via o ícone de histórico nas tabelas — ver
 * EstacaoCellLinks.tsx) — o clique normal numa estação abre o MESMO
 * conteúdo como painel in-app dentro do Dashboard, sem navegar (ver
 * Dashboard.tsx). Essa página existe só pra quem quer abrir/compartilhar
 * o histórico de uma estação de vez, numa aba própria. */
function EstacaoPageContent() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const stationId = idParam ? Number(idParam) : NaN;

  if (!idParam || Number.isNaN(stationId)) {
    return (
      <div className="p-6 text-sm text-red-600">
        Nenhuma estação informada. Volte ao{" "}
        <Link href="/" className="underline">
          painel
        </Link>{" "}
        e clique no ícone de histórico numa das tabelas.
      </div>
    );
  }

  return (
    <StationHistoryPanel
      stationId={stationId}
      topo={
        <Link href="/" className="text-sm text-sedec-600 hover:underline">
          ← Voltar ao painel
        </Link>
      }
    />
  );
}

export default function EstacaoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Carregando…</div>}>
      <EstacaoPageContent />
    </Suspense>
  );
}
