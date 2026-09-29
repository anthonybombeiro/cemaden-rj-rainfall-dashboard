"use client";

import { CalendarClock } from "lucide-react";
import Link from "next/link";

/** Pedido do usuário (2026-09-29): nas 5 tabelas de estação, várias células
 * (Estação, Município, REDEC, Fonte, Tipo) abrem o painel de histórico
 * DENTRO do painel (sem navegar, sem perder cabeçalho/menu/filtros — ver
 * `onOpenStation` em Dashboard.tsx/StationHistoryPanel.tsx). A ação de
 * "abrir de vez em nova aba" (rota /estacao?id=X separada) fica isolada
 * numa coluna própria no fim da linha, com o ícone CalendarClock — só ela
 * ainda navega de verdade. */

export function CampoClicavel({
  id,
  valor,
  onOpenStation,
  className,
  title,
}: {
  id: number;
  valor: string;
  onOpenStation: (id: number) => void;
  className?: string;
  title?: string;
}) {
  if (!valor) return <span>—</span>;
  return (
    <button
      type="button"
      onClick={() => onOpenStation(id)}
      className={className ?? "text-left hover:underline"}
      title={title ?? "Ver histórico desta estação"}
    >
      {valor}
    </button>
  );
}

export function HistoricoIconLink({ id }: { id: number }) {
  return (
    <Link
      href={`/estacao?id=${id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center text-gray-400 hover:text-sedec-600"
      title="Abrir histórico completo desta estação em nova aba"
    >
      <CalendarClock size={16} />
    </Link>
  );
}

export const W_HISTORICO = 40;
