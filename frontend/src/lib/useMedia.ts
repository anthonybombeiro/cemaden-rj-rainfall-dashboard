import { useSyncExternalStore } from "react";

/** true quando a consulta de mídia (ex.: "(min-width: 1024px)") é verdadeira; false no servidor. */
export function useMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
