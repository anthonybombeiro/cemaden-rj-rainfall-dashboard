"use client";

import { Filter } from "lucide-react";
import { ReactNode, useState } from "react";

import RefreshNowButton from "@/components/RefreshNowButton";

/** Barra de filtro flutuante (pedido do usuário, 2026-09-23: "quase metade
 * da tela está perdida nos celulares... veja as opções e me apresente" —
 * escolheu "painel flutuante, igual ao Mapa"). Diferente do painel do
 * Mapa (que flutua sobre o mapa inteiro, sem mais nada por perto), aqui a
 * barra em si fica SEMPRE visível (fina, uma linha só: botão Filtros +
 * Atualizar agora + contagem + Exportar CSV) e só o GRUPO de filtros
 * (Município/Tipo/Fonte/REDEC) vira um painel flutuante que aparece por
 * cima da tabela ao clicar em "Filtros" — assim nunca se perde acesso a
 * exportar/atualizar/ver quantas estações têm, só o espaço dos 4
 * dropdowns some quando fechado (era o que mais desperdiçava altura,
 * principalmente empilhado no celular). Fechado por padrão: dado é o
 * conteúdo principal da tela, filtro é secundário. */
export default function FilterToggleBar({
  filterControls,
  statusText,
  errors,
  onExport,
  onRefreshDone,
  extraSummary,
  onShare,
}: {
  filterControls: ReactNode;
  statusText: string;
  errors?: ReactNode;
  onExport: () => void;
  onRefreshDone: () => void;
  extraSummary?: ReactNode;
  /** Abre o modal de "Compartilhar" (resumo pronto pra Telegram/WhatsApp,
   * ver ShareModal.tsx) — só passado pelas tabelas que já têm essa
   * curadoria implementada (pedido do usuário, 2026-09-29: começar por
   * Ventos e Sirenes). Sem essa prop, o botão nem aparece. */
  onShare?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative border-b border-gray-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Filter size={14} />
          {open ? "Ocultar filtros" : "Filtros"}
        </button>
        <RefreshNowButton onDone={onRefreshDone} />
        {extraSummary}
        <span className="text-xs text-gray-500">{statusText}</span>
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="ml-auto rounded border border-sedec-300 bg-sedec-50 px-2 py-1 text-xs font-medium text-sedec-700 hover:bg-sedec-100"
            title="Gerar resumo pronto pra compartilhar no Telegram/WhatsApp (imagem ou texto)"
          >
            📤 Compartilhar
          </button>
        )}
        <button
          type="button"
          onClick={onExport}
          className={`${onShare ? "" : "ml-auto"} rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50`}
          title="Exportar a tabela (com o filtro e a ordenação atuais) em CSV"
        >
          ⬇ Exportar CSV
        </button>
      </div>
      {errors}
      {open && (
        <div className="absolute left-3 right-3 top-full z-40 mt-1 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-lg sm:left-3 sm:right-auto sm:w-auto">
          {filterControls}
        </div>
      )}
    </div>
  );
}
