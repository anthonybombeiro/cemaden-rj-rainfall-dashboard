"use client";

import { useState } from "react";

import { INTENSIDADES, nomeRegiao, RAJADAS, REGIOES_ORDEM } from "@/lib/informativo";

/** Mesmas regras do `onde()` do backend: "em todo o estado" (11), "em todas as regiões, exceto X" (8 a 10), "na região X", "nas regiões A, B e C". */
export function ondeRegioes(selecionadas: string[]): string {
  const rs = REGIOES_ORDEM.filter((r) => selecionadas.includes(r));
  const lista = (nomes: string[]) => (nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`);
  if (rs.length >= REGIOES_ORDEM.length) return "em todo o estado";
  if (rs.length >= 8) return `em todas as regiões, exceto ${lista(REGIOES_ORDEM.filter((r) => !rs.includes(r)).map(nomeRegiao))}`;
  if (rs.length === 1) return `na região ${nomeRegiao(rs[0])}`;
  return `nas regiões ${lista(rs.map(nomeRegiao))}`;
}

type Modelo = "granizo" | "raios_rajadas" | "pancadas" | "melhora" | "atualizacao";
const MODELOS: { id: Modelo; rotulo: string }[] = [
  { id: "granizo", rotulo: "Granizo pontual" },
  { id: "raios_rajadas", rotulo: "Raios e rajadas" },
  { id: "pancadas", rotulo: "Pancadas isoladas" },
  { id: "melhora", rotulo: "Melhora do cenário" },
  { id: "atualizacao", rotulo: "Atualização" },
];

/** F28: modo texto livre guiado — para casos fora do padrão da matriz (granizo isolado, raios e rajadas, melhora, atualização). Monta a frase no estilo dos
 * informativos reais e a insere no texto; o cabeçalho, o rodapé, a numeração e o registro continuam os mesmos. */
export default function TextoLivreGuiado({ onInserir }: { onInserir: (paragrafo: string) => void }) {
  const [modelo, setModelo] = useState<Modelo>("granizo");
  const [regioes, setRegioes] = useState<string[]>([]);
  const [intensidade, setIntensidade] = useState("moderada_forte");
  const [vento, setVento] = useState("moderado");
  const [nota, setNota] = useState("");
  const onde = regioes.length ? ondeRegioes(regioes) : "";
  const rotuloInt = (INTENSIDADES.find((o) => o.chave === intensidade)?.rotulo ?? "").toLowerCase();
  const rotuloVento = (RAJADAS.find((o) => o.chave === vento)?.rotulo ?? "").toLowerCase().replace("rajadas ", "");
  const frase =
    modelo === "atualizacao" ? (nota.trim() ? `🔄 Atualização: ${nota.trim()}` : "") :
    !onde ? "" :
    modelo === "granizo" ? `❄️ Possibilidade de granizo pontual ${onde}.` :
    modelo === "raios_rajadas" ? `⛈️ Raios e rajadas de vento ${rotuloVento} ${onde}.` :
    modelo === "pancadas" ? `⛈️ Pancadas isoladas de chuva ${rotuloInt} ${onde}.` :
    `✅ Cenário em melhora: sem previsão de chuva significativa para as próximas 6 horas ${onde}.`;
  return (
    <details className="rounded-md border border-gray-200 bg-white p-2.5 text-xs">
      <summary className="cursor-pointer font-semibold">Frases para casos fora do padrão (texto livre guiado)</summary>
      <div className="mt-2 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {MODELOS.map((m) => <button key={m.id} type="button" onClick={() => setModelo(m.id)} className={`rounded-full border px-2.5 py-1 ${modelo === m.id ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white"}`}>{m.rotulo}</button>)}
        </div>
        {modelo !== "atualizacao" && (
          <div className="flex flex-wrap gap-1.5">
            {REGIOES_ORDEM.map((r) => <button key={r} type="button" onClick={() => setRegioes((l) => (l.includes(r) ? l.filter((x) => x !== r) : [...l, r]))} className={`rounded-full border px-2 py-1 ${regioes.includes(r) ? "border-sky-700 bg-sky-700 text-white" : "border-gray-300 bg-white"}`}>{nomeRegiao(r)}</button>)}
          </div>
        )}
        {modelo === "pancadas" && <select value={intensidade} onChange={(e) => setIntensidade(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">{INTENSIDADES.filter((o) => o.chave).map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}</select>}
        {modelo === "raios_rajadas" && <select value={vento} onChange={(e) => setVento(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">{RAJADAS.filter((o) => o.chave).map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}</select>}
        {modelo === "atualizacao" && <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="O que mudou (uma frase)" className="w-full rounded border border-gray-300 px-1.5 py-1" />}
        <p className="rounded bg-gray-50 p-1.5 text-gray-800">{frase || "Escolha as regiões para montar a frase."}</p>
        <button type="button" disabled={!frase} onClick={() => { onInserir(frase); setRegioes([]); setNota(""); }} className="rounded bg-gray-800 px-3 py-1.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50">Inserir no texto</button>
      </div>
    </details>
  );
}
