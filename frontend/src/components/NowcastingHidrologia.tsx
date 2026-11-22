"use client";

import { Copy, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { COTA_ESTILOS, fetchNowcastingHidrologia, InformeHidrologia, NowcastingHidrologia as Dados } from "@/lib/api";
import { intervaloVisivel } from "@/lib/intervaloVisivel";

// Aba Hidrologia > "Nowcasting" (22/11/2026): informe operacional SUGERIDO por município (estações em alerta ou acima), no modelo usado com as REDECs:
//   REDEC 10 – INFORME OPERACIONAL / Município / Data / Evento / estação, entrou em cota de Alerta! / COMDEC e REDEC 10 seguem monitorando!
// O texto é gerado no backend (core/nowcasting_hidrologia.py) a cada 5 min; o plantão pode editar antes de copiar (a edição fica até a página ser recarregada) e nada é enviado sozinho.

const chaveDe = (i: InformeHidrologia) => `${i.redec ?? "x"}|${i.municipio}`;

export default function NowcastingHidrologia() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [atencao, setAtencao] = useState(false);
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetchNowcastingHidrologia(atencao)
      .then((d) => { setDados(d); setErro(null); })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"))
      .finally(() => setCarregando(false));
  }, [atencao]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    carregar();
    return intervaloVisivel(carregar, 300_000);
  }, [carregar]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const informes = dados?.informes ?? [];
  const textoDe = (i: InformeHidrologia) => editados[chaveDe(i)] ?? i.texto;
  const idade = dados ? Math.max(0, Math.round((Date.now() - Date.parse(dados.gerado_em)) / 60_000)) : null;

  const copiar = async (rotulo: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
      setTimeout(() => setCopiado((c) => (c === rotulo ? null : c)), 2500);
    } catch {
      setCopiado(null);
    }
  };

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="sticky left-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 bg-white px-3 py-2 text-xs sm:text-sm">
        <span className="font-semibold text-gray-800">Informe operacional sugerido</span>
        <label className="flex items-center gap-1 text-gray-600">
          <input type="checkbox" checked={atencao} onChange={(ev) => setAtencao(ev.target.checked)} />
          incluir cota de atenção
        </label>
        <button type="button" onClick={carregar} className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50">
          <RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar
        </button>
        {informes.length > 1 && (
          <button type="button" onClick={() => copiar("todos", informes.map(textoDe).join("\n\n"))} className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700">
            <Copy size={12} /> {copiado === "todos" ? "Copiado!" : "Copiar todos"}
          </button>
        )}
        <span className="text-[11px] text-gray-500">{informes.length} município(s){idade != null ? ` · há ${idade} min` : ""} · estações automáticas com leitura de até 3 h</span>
      </div>

      {erro && <div className="m-3 rounded bg-red-50 p-2 text-xs text-red-600">Não foi possível gerar o texto ({erro}).</div>}
      {!dados && !erro && <div className="p-6 text-sm text-gray-500">Carregando…</div>}
      {dados && informes.length === 0 && (
        <div className="m-3 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Nenhuma estação em cota de {atencao ? "atenção" : "alerta"} ou acima neste momento — sem informe operacional a emitir.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2 2xl:grid-cols-3">
        {informes.map((i) => {
          const chave = chaveDe(i);
          const est = COTA_ESTILOS[i.classe];
          const editado = chave in editados;
          return (
            <section key={chave} className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <span className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: est.bg, color: est.text }}>{est.label}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                  {i.municipio} <span className="font-normal text-gray-500">· REDEC {i.redec ?? "—"}</span>
                </span>
                {editado && (
                  <button type="button" onClick={() => setEditados((e) => { const n = { ...e }; delete n[chave]; return n; })} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800" title="Voltar ao texto gerado">
                    <RotateCcw size={12} /> restaurar
                  </button>
                )}
                <button type="button" onClick={() => copiar(chave, textoDe(i))} className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                  <Copy size={12} /> {copiado === chave ? "Copiado!" : "Copiar"}
                </button>
              </header>
              <textarea
                value={textoDe(i)}
                onChange={(ev) => setEditados((e) => ({ ...e, [chave]: ev.target.value }))}
                spellCheck={false}
                rows={Math.max(8, textoDe(i).split("\n").length + 1)}
                className="w-full flex-1 resize-y rounded-b-lg bg-white p-3 font-mono text-xs leading-relaxed text-gray-900 outline-none focus:ring-2 focus:ring-blue-300"
              />
            </section>
          );
        })}
      </div>
      <div className="h-6" aria-hidden />
    </div>
  );
}
