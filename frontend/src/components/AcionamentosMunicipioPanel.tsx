"use client";

import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { downloadCsv } from "@/lib/csvExport";
import { MUNICIPIOS_CANONICOS } from "@/lib/municipios-canonical";
import { AcionamentoInput, AcionamentoMunicipio, apagarAcionamentoMunicipio, dataBr, fetchAcionamentosMunicipio, PROBABILIDADES, salvarAcionamentoMunicipio } from "@/lib/recomendacoes";

const campo = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";
const rotulo = "mb-0.5 block text-xs font-semibold text-gray-600";
const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function Formulario({ editando, onSalvo, onCancelar }: { editando?: AcionamentoMunicipio; onSalvo: () => void; onCancelar: () => void }) {
  const [f, setF] = useState({
    municipio: editando?.municipio ?? "",
    data: editando?.data ?? hojeIso(),
    hora: editando?.hora?.slice(0, 5) ?? "",
    probabilidade: editando?.probabilidade ?? "",
    sirene: editando?.sirene ?? "",
    tipo_alarme: editando?.tipo_alarme ?? "MOBILIZAÇÃO",
    quantidade: editando?.quantidade == null ? "" : String(editando.quantidade),
    responsavel: editando?.responsavel ?? "",
    observacao: editando?.observacao ?? "",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const q = f.quantidade.trim() === "" ? null : Number(f.quantidade);
    if (q !== null && (!Number.isInteger(q) || q < 0)) {
      setErro("Quantidade deve ser um número inteiro.");
      return;
    }
    const dados: AcionamentoInput = { municipio: f.municipio, data: f.data, hora: f.hora || null, probabilidade: f.probabilidade, sirene: f.sirene.trim(), tipo_alarme: f.tipo_alarme.trim() || "MOBILIZAÇÃO", quantidade: q, responsavel: f.responsavel.trim(), observacao: f.observacao.trim() };
    setSalvando(true);
    try {
      await salvarAcionamentoMunicipio(dados, editando?.id);
      onSalvo();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-3 rounded-lg bg-white p-4 shadow-xl">
      <h2 className="text-base font-bold text-gray-800">{editando ? "Editar acionamento pelo município" : "Novo acionamento pelo município"}</h2>
      <p className="text-xs text-gray-500">Mobilização de sirene feita pelo próprio município, sem recomendação do CEMADEN-RJ (vale para os 92 municípios, inclusive os autônomos).</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className={rotulo}>Município *</label>
          <select required value={f.municipio} onChange={(e) => set("municipio", e.target.value)} className={campo}>
            <option value="">Selecione…</option>
            {MUNICIPIOS_CANONICOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Data *</label>
          <input type="date" required value={f.data} onChange={(e) => set("data", e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Hora</label>
          <input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} className={campo} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={rotulo}>Probabilidade de deslizamento</label>
          <select value={f.probabilidade} onChange={(e) => set("probabilidade", e.target.value)} className={campo}>
            <option value="">—</option>
            {PROBABILIDADES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={rotulo}>Tipo de alarme</label>
          <input value={f.tipo_alarme} onChange={(e) => set("tipo_alarme", e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Quantidade de sirenes</label>
          <input inputMode="numeric" value={f.quantidade} onChange={(e) => set("quantidade", e.target.value)} className={campo} />
        </div>
      </div>
      <div>
        <label className={rotulo}>Sirene(s)</label>
        <textarea value={f.sirene} onChange={(e) => set("sirene", e.target.value)} rows={2} className={campo} placeholder="Nome(s) da(s) sirene(s) mobilizada(s)" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo}>Responsável / usuário (do município)</label>
          <input value={f.responsavel} onChange={(e) => set("responsavel", e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Observação</label>
          <input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} className={campo} placeholder="ex.: Inundação" />
        </div>
      </div>
      {erro && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancelar} className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Cancelar
        </button>
        <button type="submit" disabled={salvando} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

/** Sub-aba "Acionamentos do município": mobilizações de sirene feitas pelo próprio município (sem recomendação do CEMADEN-RJ). */
export default function AcionamentosMunicipioPanel({ admin }: { admin: boolean }) {
  const [filtro, setFiltro] = useState<{ ano?: string; municipio?: string; q?: string }>({});
  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState<AcionamentoMunicipio[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<{ editando?: AcionamentoMunicipio } | null>(null);
  const [versao, setVersao] = useState(0);
  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: anoAtual - 2019 }, (_, i) => String(anoAtual - i));

  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => (f.q === busca ? f : { ...f, q: busca })), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(() => {
    let cancelado = false;
    fetchAcionamentosMunicipio(filtro)
      .then((l) => {
        if (cancelado) return;
        setItens(l);
        setErro(null);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar os acionamentos."));
    return () => {
      cancelado = true;
    };
  }, [filtro]);
  useEffect(() => carregar(), [carregar, versao]);

  const apagar = async (a: AcionamentoMunicipio) => {
    if (!window.confirm(`Apagar o acionamento de ${a.municipio} em ${dataBr(a.data)}? Esta ação não pode ser desfeita.`)) return;
    try {
      await apagarAcionamentoMunicipio(a.id);
      setVersao((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível apagar.");
    }
  };
  const exportar = () =>
    itens &&
    downloadCsv(
      `acionamentos-pelo-municipio-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Município", "Data", "Hora", "Probabilidade de deslizamento", "Sirene", "Tipo de alarme", "Quantidade", "Responsável/Usuário", "Observação"],
      itens.map((a) => [a.municipio, dataBr(a.data), a.hora?.slice(0, 5) ?? "", a.probabilidade, a.sirene, a.tipo_alarme, a.quantidade, a.responsavel, a.observacao]),
    );

  const campoF = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";
  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-gray-50 p-2 sm:p-3">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
        <select aria-label="Ano" value={filtro.ano ?? ""} onChange={(e) => setFiltro((f) => ({ ...f, ano: e.target.value }))} className={campoF}>
          <option value="">Todos os anos</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select aria-label="Município" value={filtro.municipio ?? ""} onChange={(e) => setFiltro((f) => ({ ...f, municipio: e.target.value }))} className={`${campoF} max-w-[11rem]`}>
          <option value="">Todos os municípios</option>
          {MUNICIPIOS_CANONICOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar (sirene, responsável, observação…)" className={`${campoF} min-w-[12rem] flex-1`} />
        <span className="text-xs text-gray-500">{itens ? `${itens.length} registro${itens.length === 1 ? "" : "s"}` : ""}</span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={exportar} disabled={!itens?.length} className="flex items-center gap-1 rounded bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40">
            <Download size={15} /> CSV
          </button>
          <button type="button" onClick={() => setForm({})} className="flex items-center gap-1 rounded bg-blue-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus size={15} /> Novo
          </button>
        </div>
      </div>
      {erro && <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
      {!itens && !erro ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : itens && itens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">Nenhum acionamento registrado.</div>
      ) : itens ? (
        <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[56rem] text-left text-xs">
            <thead className="sticky top-0 bg-gray-100 text-[11px] uppercase text-gray-600">
              <tr>
                {["Município", "Data", "Hora", "Probabilidade", "Sirene(s)", "Tipo", "Qtd.", "Responsável/Usuário", "Observação", ""].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 align-top hover:bg-gray-50">
                  <td className="whitespace-nowrap px-2 py-1.5 font-semibold">{a.municipio}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{dataBr(a.data)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{a.hora?.slice(0, 5) ?? "—"}</td>
                  <td className="px-2 py-1.5">{a.probabilidade || "—"}</td>
                  <td className="min-w-[10rem] px-2 py-1.5">{a.sirene || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{a.tipo_alarme}</td>
                  <td className="px-2 py-1.5">{a.quantidade ?? "—"}</td>
                  <td className="px-2 py-1.5">{a.responsavel || "—"}</td>
                  <td className="min-w-[8rem] px-2 py-1.5 text-gray-600">{a.observacao}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <button type="button" onClick={() => setForm({ editando: a })} aria-label="Editar" className="rounded p-1 text-gray-500 hover:bg-gray-100">
                      <Pencil size={14} />
                    </button>
                    {admin && (
                      <button type="button" onClick={() => apagar(a)} aria-label="Apagar" className="rounded p-1 text-red-500 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {form && (
        <div className="fixed inset-0 z-[3000] flex items-start justify-center overflow-auto bg-black/50 p-2 sm:p-6" onClick={() => setForm(null)}>
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <Formulario
              editando={form.editando}
              onCancelar={() => setForm(null)}
              onSalvo={() => {
                setForm(null);
                setVersao((v) => v + 1);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
