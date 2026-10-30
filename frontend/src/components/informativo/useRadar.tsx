"use client";

import { useCallback, useEffect, useState } from "react";

import { FONTES_RADAR, gerarQuadroRadar, QuadroRadar } from "@/lib/radarImagem";

/** Escolha do radar e busca do quadro (refaz ao trocar de radar). `ativo` falso não consulta nada. */
export function useRadar(ativo = true) {
  const [fonteId, setFonteId] = useState(FONTES_RADAR[0].id);
  const [quadro, setQuadro] = useState<QuadroRadar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const gerar = useCallback(() => {
    const fonte = FONTES_RADAR.find((f) => f.id === fonteId) ?? FONTES_RADAR[0];
    setOcupado(true);
    setErro(null);
    gerarQuadroRadar(fonte)
      .then(setQuadro)
      .catch((e) => { setQuadro(null); setErro(e instanceof Error ? e.message : "Falha ao consultar o radar."); })
      .finally(() => setOcupado(false));
  }, [fonteId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (ativo) gerar(); }, [ativo, gerar]);
  return { fonteId, setFonteId, quadro, ocupado, erro, gerar };
}

export function SeletorRadar({ fonteId, setFonteId, ocupado, erro, gerar }: { fonteId: string; setFonteId: (v: string) => void; ocupado: boolean; erro: string | null; gerar: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-gray-700">Radar</span>
      <select value={fonteId} onChange={(e) => setFonteId(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">{FONTES_RADAR.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}</select>
      <button type="button" onClick={gerar} disabled={ocupado} className="rounded border border-gray-300 bg-white px-2.5 py-1 font-medium hover:bg-gray-50 disabled:opacity-50">{ocupado ? "Buscando o quadro…" : "Atualizar quadro"}</button>
      {erro && <span className="text-red-700">{erro}</span>}
    </div>
  );
}
