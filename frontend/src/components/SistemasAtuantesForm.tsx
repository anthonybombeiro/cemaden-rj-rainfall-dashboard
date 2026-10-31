"use client";

import { useEffect, useState } from "react";

import { fetchSistemasDia, salvarSistemasDia, SistemaCatalogo, SistemasDia } from "@/lib/api";

const hoje = () => new Date().toLocaleDateString("sv-SE");
const br = (d: string) => d.split("-").reverse().join("/");

/** Sistemas atuantes do dia: chips do catálogo fixo (a ordem do clique define o principal) + um sistema em texto livre. Cartão à parte: não mexe no cadastro da previsão. */
export default function SistemasAtuantesForm() {
  const [data, setData] = useState(hoje);
  const [catalogo, setCatalogo] = useState<SistemaCatalogo[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [outro, setOutro] = useState("");
  const [anterior, setAnterior] = useState<SistemasDia | null>(null);
  const [salvo, setSalvo] = useState<SistemasDia | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchSistemasDia(data)
      .then((d) => {
        if (!vivo) return;
        setCatalogo(d.catalogo);
        setSel(d.sistemas);
        setOutro(d.outro);
        setAnterior(d.anterior);
        setSalvo(d.atualizado_em ? d : null);
        setMsg(null);
      })
      .catch(() => vivo && setMsg({ ok: false, texto: "Não foi possível carregar os sistemas do dia." }));
    return () => { vivo = false; };
  }, [data]);

  const alterna = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const rotulo = (id: string) => catalogo.find((c) => c.id === id)?.rotulo ?? id;
  const salvar = async () => {
    setOcupado(true);
    try {
      const r = await salvarSistemasDia(data, sel, outro.trim());
      setSalvo(r.atualizado_em ? r : null);
      setMsg({ ok: true, texto: sel.length || outro.trim() ? "Sistemas do dia salvos." : "Registro do dia removido." });
    } catch {
      setMsg({ ok: false, texto: "Não foi possível salvar. Tente de novo." });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mx-auto mb-4 w-full max-w-3xl rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Sistemas atuantes do dia</h3>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          Dia
          <input type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} className="rounded border border-gray-300 px-2 py-1" />
        </label>
      </div>
      <p className="mb-1.5 text-xs text-gray-500">Escolha um ou mais. O primeiro marcado é o principal (cor do calendário no Resumo 24 h).</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {catalogo.map((c) => {
          const pos = sel.indexOf(c.id);
          return (
            <button key={c.id} type="button" onClick={() => alterna(c.id)} className={`rounded-full border px-3 py-1 text-sm ${pos >= 0 ? "border-blue-600 bg-blue-50 font-medium text-blue-800" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>
              {pos >= 0 && <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: c.cor }} />}
              {c.rotulo}{pos >= 0 && sel.length > 1 ? ` · ${pos + 1}` : ""}
            </button>
          );
        })}
      </div>
      <input type="text" value={outro} maxLength={80} onChange={(e) => setOutro(e.target.value)} placeholder="Outro sistema, em texto livre" className="mb-3 w-full rounded border border-gray-300 px-3 py-1.5 text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={salvar} disabled={ocupado} className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{ocupado ? "Salvando…" : "Salvar"}</button>
        {anterior && (anterior.sistemas.length > 0 || anterior.outro) && (
          <button type="button" onClick={() => { setSel(anterior.sistemas); setOutro(anterior.outro); }} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50" title="Copia para o formulário; falta salvar">
            Repetir de {br(anterior.data)}: {[...anterior.sistemas.map(rotulo), anterior.outro].filter(Boolean).join(" + ")}
          </button>
        )}
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.texto}</span>}
      </div>
      {salvo && <p className="mt-2 text-xs text-gray-500">Último registro de {br(salvo.data)} por {salvo.atualizado_por || "—"}.</p>}
    </div>
  );
}
