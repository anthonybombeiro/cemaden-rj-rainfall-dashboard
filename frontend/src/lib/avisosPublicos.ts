import { useEffect, useState } from "react";

import { API_BASE_URL } from "@/lib/api";

/** Aviso meteorológico vigente, como o endpoint público (`/api/publico/avisos/`, sem login) entrega: só avisos emitidos e dentro da vigência. */
export type AvisoPublico = {
  numero: number;
  ano: number;
  vigencia_inicio: string;
  vigencia_fim: string;
  regioes: string[]; // vazio = todo o estado
  sistemas: string[]; // rótulos do catálogo
  icones: string[]; // "chuva" e/ou "vento"
  texto: string; // trechos entre ** ficam em negrito
  emitido_em: string | null;
};

export const fetchAvisosPublicos = (): Promise<AvisoPublico[]> =>
  fetch(`${API_BASE_URL}/publico/avisos/`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { avisos: [] }))
    .then((d) => (d.avisos ?? []) as AvisoPublico[]);

/** Avisos vigentes agora; atualiza a cada `ms` (1 min) e some sozinho quando a vigência acaba. `null` = ainda carregando. */
export function useAvisosPublicos(ms = 60_000): AvisoPublico[] | null {
  const [avisos, setAvisos] = useState<AvisoPublico[] | null>(null);
  useEffect(() => {
    let vivo = true;
    const carregar = () => fetchAvisosPublicos().then((a) => { if (vivo) setAvisos(a); }).catch(() => { if (vivo && avisos === null) setAvisos([]); });
    carregar();
    const t = setInterval(() => { if (document.visibilityState === "visible") carregar(); }, ms);
    return () => { vivo = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms]);
  return avisos;
}
