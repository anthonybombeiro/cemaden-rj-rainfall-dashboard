"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchSistemasDia, fetchSistemasMes, fetchTextoGeralPrevisao, SistemaCatalogo, SistemasDia, SistemasMes } from "@/lib/api";

const br = (d: string) => d.split("-").reverse().join("/");
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Cartão do Resumo 24 h: sistemas atuantes do dia, texto geral da previsão (só leitura) e calendário do mês (cor = sistema principal; dia sem registro fica cinza). */
export default function SistemasAtuantesResumo({ dia }: { dia: string }) {
  const [catalogo, setCatalogo] = useState<SistemaCatalogo[]>([]);
  const [atual, setAtual] = useState<SistemasDia | null>(null);
  const [texto, setTexto] = useState("");
  const [mes, setMes] = useState(dia.slice(0, 7));
  const [dados, setDados] = useState<SistemasMes | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMes(dia.slice(0, 7)), [dia]);
  useEffect(() => {
    let vivo = true;
    fetchSistemasDia(dia).then((d) => { if (vivo) { setCatalogo(d.catalogo); setAtual(d); } }).catch(() => {});
    fetchTextoGeralPrevisao(dia).then((t) => vivo && setTexto(t.texto_geral)).catch(() => vivo && setTexto(""));
    return () => { vivo = false; };
  }, [dia]);
  useEffect(() => {
    let vivo = true;
    fetchSistemasMes(mes).then((m) => vivo && setDados(m)).catch(() => vivo && setDados(null));
    return () => { vivo = false; };
  }, [mes, atual?.atualizado_em]);

  const cat = (id: string) => catalogo.find((c) => c.id === id);
  const porDia = useMemo(() => new Map((dados?.dias ?? []).map((d) => [d.data, d])), [dados]);
  const [ano, m] = mes.split("-").map(Number);
  const dias = new Date(ano, m, 0).getDate();
  const vazios = new Date(ano, m - 1, 1).getDay();
  const vai = (n: number) => { const d = new Date(ano, m - 1 + n, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); };
  const tem = !!atual && (atual.sistemas.length > 0 || !!atual.outro);
  const usados = [...new Set((dados?.dias ?? []).map((d) => d.sistemas[0]).filter(Boolean))];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Sistemas atuantes — {br(dia)}</h3>
          {tem ? (
            <div className="flex flex-wrap gap-1.5">
              {atual!.sistemas.map((id) => (
                <span key={id} className="rounded-full border border-gray-300 px-2.5 py-0.5 text-sm"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: cat(id)?.cor ?? "#ccc" }} />{cat(id)?.rotulo ?? id}</span>
              ))}
              {atual!.outro && <span className="rounded-full border border-gray-300 px-2.5 py-0.5 text-sm">{atual!.outro}</span>}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Sem registro para este dia. Preencha em Meteorologia → Cadastro.</p>
          )}
          {tem && atual?.atualizado_em && <p className="mt-1.5 text-xs text-gray-500">Registrado por {atual.atualizado_por || "—"}.</p>}
          <h3 className="mb-1 mt-4 text-sm font-semibold">Texto geral do dia</h3>
          <p className="text-sm text-gray-800">{texto || <span className="text-gray-500">Sem texto geral cadastrado para este dia.</span>}</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Calendário de {MESES[m - 1]} de {ano}</h3>
            <span className="flex gap-1">
              <button type="button" aria-label="Mês anterior" onClick={() => vai(-1)} className="rounded border border-gray-300 p-1 hover:bg-gray-50"><ChevronLeft size={14} /></button>
              <button type="button" aria-label="Próximo mês" onClick={() => vai(1)} className="rounded border border-gray-300 p-1 hover:bg-gray-50"><ChevronRight size={14} /></button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((x, i) => <div key={i} className="text-gray-500">{x}</div>)}
            {Array.from({ length: vazios }, (_, i) => <div key={`v${i}`} />)}
            {Array.from({ length: dias }, (_, i) => {
              const iso = `${mes}-${String(i + 1).padStart(2, "0")}`;
              const r = porDia.get(iso);
              const principal = r?.sistemas[0] ? cat(r.sistemas[0]) : undefined;
              const nome = r ? [...r.sistemas.map((id) => cat(id)?.rotulo ?? id), r.outro].filter(Boolean).join(" + ") : "sem registro";
              return <div key={iso} title={nome} className={`rounded py-1 ${iso === dia ? "ring-2 ring-blue-600" : ""}`} style={{ background: r ? principal?.cor ?? "#d4d4d8" : "#f3f4f6", color: r ? "#2C2C2A" : "#9ca3af" }}>{i + 1}</div>;
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
            {usados.map((id) => <span key={id}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: cat(id)?.cor }} />{cat(id)?.rotulo ?? id}</span>)}
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-gray-100 align-middle ring-1 ring-gray-300" />sem registro</span>
          </div>
        </div>
      </div>
    </div>
  );
}
