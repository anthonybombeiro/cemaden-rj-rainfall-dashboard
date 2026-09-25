"use client";

import { useCallback, useEffect, useState } from "react";

/** Larguras de coluna ajustáveis pelo usuário, guardadas no navegador
 * (localStorage) por tabela. `mobile` sobrepõe os padrões em telas < 640px. */
export function useColumnWidths(
  storageKey: string,
  desktop: Record<string, number>,
  mobile: Record<string, number> = {},
) {
  const [widths, setWidths] = useState<Record<string, number>>(desktop);
  const [defaults, setDefaults] = useState<Record<string, number>>(desktop);

  useEffect(() => {
    const pequena = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
    const base = pequena ? { ...desktop, ...mobile } : desktop;
    let salvo: Record<string, number> = {};
    try {
      salvo = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    } catch {
      salvo = {};
    }
    setDefaults(base);
    setWidths({ ...base, ...salvo });
    // desktop/mobile são constantes do módulo; só roda no primeiro render do cliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persistir = useCallback(
    (next: Record<string, number>) => {
      try {
        const so_diferentes = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== defaults[k]));
        window.localStorage.setItem(storageKey, JSON.stringify(so_diferentes));
      } catch {
        // sem localStorage (modo privado etc.): a largura vale só nesta sessão.
      }
    },
    [storageKey, defaults],
  );

  const setWidth = useCallback(
    (key: string, px: number) => {
      setWidths((atual) => {
        const next = { ...atual, [key]: Math.round(px) };
        persistir(next);
        return next;
      });
    },
    [persistir],
  );

  const resetWidth = useCallback(
    (key: string) => setWidth(key, defaults[key]),
    [defaults, setWidth],
  );

  const resetAll = useCallback(() => {
    setWidths(defaults);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignora
    }
  }, [defaults, storageKey]);

  return { widths, setWidth, resetWidth, resetAll };
}
