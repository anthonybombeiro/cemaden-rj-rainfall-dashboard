"use client";

import { useCallback, useEffect, useState } from "react";

import { gerarImagem, Gerada, RADARES, SATELITES, Selecao, SELECAO_PADRAO, TipoSatelite } from "@/lib/camadaImagem";

/** Escolha da fonte (radar e produto, ou satélite) e busca da imagem (refaz ao trocar). `ativo` falso não consulta nada. */
export function useCamada(inicial: Selecao = SELECAO_PADRAO, ativo = true) {
  const [sel, setSel] = useState<Selecao>(inicial);
  const [imagem, setImagem] = useState<Gerada | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const gerar = useCallback(() => {
    setOcupado(true);
    setErro(null);
    gerarImagem(sel)
      .then(setImagem)
      .catch((e) => { setImagem(null); setErro(e instanceof Error ? e.message : "Falha ao gerar a imagem."); })
      .finally(() => setOcupado(false));
  }, [sel]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (ativo) gerar(); }, [ativo, gerar]);
  return { sel, setSel, imagem, ocupado, erro, gerar };
}
export type Camada = ReturnType<typeof useCamada>;

const campo = "rounded border border-gray-300 px-1.5 py-1";

/** Seletor da fonte: Radar (radar + produto) ou Satélite (tipo); `somenteRadar` esconde o satélite. */
export function SeletorCamada({ c, somenteRadar = false }: { c: Camada; somenteRadar?: boolean }) {
  const { sel, setSel, ocupado, erro, gerar } = c;
  const radar = RADARES.find((r) => r.id === sel.radar) ?? RADARES[0];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!somenteRadar && (
        <span className="flex gap-1">
          {(["radar", "satelite"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setSel({ ...sel, tipo: t })} className={`rounded-full border px-2.5 py-1 font-medium ${sel.tipo === t ? "border-sedec-600 bg-sedec-600 text-white" : "border-gray-300 text-gray-700"}`}>{t === "radar" ? "Radar" : "Satélite"}</button>
          ))}
        </span>
      )}
      {sel.tipo === "radar" ? (
        <>
          <select aria-label="Radar" value={sel.radar} onChange={(e) => { const r = RADARES.find((x) => x.id === e.target.value) ?? RADARES[0]; setSel({ ...sel, radar: r.id, produto: r.produtos[0].id }); }} className={campo}>{RADARES.map((r) => <option key={r.id} value={r.id}>{r.rotulo}</option>)}</select>
          <select aria-label="Produto" value={sel.produto} onChange={(e) => setSel({ ...sel, produto: e.target.value })} className={campo}>{radar.produtos.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}</select>
        </>
      ) : (
        <select aria-label="Satélite" value={sel.satelite} onChange={(e) => setSel({ ...sel, satelite: e.target.value as TipoSatelite })} className={campo}>{SATELITES.map((s) => <option key={s.id} value={s.id}>{s.rotulo}</option>)}</select>
      )}
      <button type="button" onClick={gerar} disabled={ocupado} className="rounded border border-gray-300 bg-white px-2.5 py-1 font-medium hover:bg-gray-50 disabled:opacity-50">{ocupado ? "Buscando a imagem…" : "Atualizar imagem"}</button>
      {erro && <span className="text-red-700">{erro}</span>}
    </div>
  );
}
