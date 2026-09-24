"use client";

import { useEffect, useRef, useState } from "react";

/** Dropdown de múltipla escolha (checkboxes) — pedido do usuário (2026-09-23):
 * os filtros de Município/Tipo de estação/Fonte/REDEC eram `<select>` de
 * escolha única, e ele quer poder ver várias opções ao mesmo tempo (ex:
 * duas ou três fontes juntas). Lista vazia de selecionados = "todos", igual
 * ao comportamento anterior do `<select>` com a opção "Todos"/"Todas". */
export default function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("touchstart", onClickOutside);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("touchstart", onClickOutside);
    };
  }, [open]);

  const toggleValue = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  const summary =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selecionados`;

  return (
    <div className="relative flex-1 md:flex-none" ref={ref}>
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      {/* Cor de texto SEMPRE explícita (text-gray-900) — nunca herdar do
          body: foi exatamente essa herança que deixava o texto invisível
          quando o SO estava em modo escuro (ver globals.css). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 flex w-full min-w-[8.5rem] items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white p-1.5 text-left text-sm text-gray-900 focus:border-sedec-400 focus:outline-none focus:ring-1 focus:ring-sedec-400"
      >
        <span className="truncate">{summary}</span>
        <span className="text-gray-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => onChange([])}
            className="mb-1 w-full rounded px-2 py-1 text-left text-xs font-medium text-sedec-600 hover:bg-sedec-50"
          >
            Limpar (mostrar todos)
          </button>
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggleValue(opt.value)}
              />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
