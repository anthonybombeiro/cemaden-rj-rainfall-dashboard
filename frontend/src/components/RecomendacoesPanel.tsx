"use client";

import { Download, LayoutGrid, Pencil, Send, Table2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import RecomendacaoForm from "@/components/RecomendacaoForm";
import RecomendacaoMensagem from "@/components/RecomendacaoMensagem";
import { downloadCsv } from "@/lib/csvExport";
import { MUNICIPIOS_CANONICOS } from "@/lib/municipios-canonical";
import {
  apagarRecomendacao,
  COR_PROBABILIDADE,
  dataBr,
  fetchRecomendacoes,
  fetchResumoRecomendacoes,
  FiltroRecomendacao,
  GATILHOS,
  horaCurta,
  indiceAutomatico,
  mm,
  PROBABILIDADES,
  Recomendacao,
  rotuloGatilhos,
  ResumoRecomendacoes,
} from "@/lib/recomendacoes";

const campo = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";

function Etiqueta({ children, cor }: { children: React.ReactNode; cor?: { fundo: string; texto: string } }) {
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: cor?.fundo ?? "#e5e7eb", color: cor?.texto ?? "#374151" }}>
      {children}
    </span>
  );
}

function Acionaram({ r }: { r: Recomendacao }) {
  if (r.acionaram === null) return <Etiqueta cor={{ fundo: "#fef3c7", texto: "#92400e" }}>Aguardando validação</Etiqueta>;
  return r.acionaram ? <Etiqueta cor={{ fundo: "#d1fae5", texto: "#065f46" }}>Acionaram: SIM</Etiqueta> : <Etiqueta cor={{ fundo: "#fee2e2", texto: "#991b1b" }}>Acionaram: NÃO</Etiqueta>;
}

const sirenesTexto = (r: Recomendacao) => [r.sirenes_qtd != null && r.acionaram ? `${r.sirenes_qtd} sirene${r.sirenes_qtd === 1 ? "" : "s"}` : "", r.sirenes_acionadas].filter(Boolean).join(" · ");

function Cartao({ r, onEditar, onValidar, onMensagem, onApagar, admin }: { r: Recomendacao; onEditar: () => void; onValidar: () => void; onMensagem: () => void; onApagar: () => void; admin: boolean }) {
  const cor = COR_PROBABILIDADE[r.probabilidade] ?? COR_PROBABILIDADE.Moderada;
  // o texto só aparece quando foi digitado à mão (os valores de chuva já aparecem nos quadradinhos)
  const indice = r.indice_alcancado && r.indice_alcancado !== indiceAutomatico(r) ? r.indice_alcancado : "";
  return (
    <article className="flex flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-sm" style={{ borderLeft: `6px solid ${cor.barra}` }}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-500">
            Recomendação {r.numero} · {dataBr(r.data)} {horaCurta(r.hora)}
          </div>
          <h3 className="truncate text-base font-bold text-gray-900">{r.municipio}</h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={onMensagem} aria-label="Enviar mensagem" title="Gerar a mensagem de envio da recomendação" className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50">
            <Send size={15} />
          </button>
          <button type="button" onClick={onEditar} aria-label="Editar" title="Editar" className="rounded p-1.5 text-gray-500 hover:bg-gray-100">
            <Pencil size={15} />
          </button>
          {admin && (
            <button type="button" onClick={onApagar} aria-label="Apagar" title="Apagar (administrador)" className="rounded p-1.5 text-red-500 hover:bg-red-50">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </header>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Etiqueta cor={cor}>Probabilidade {r.probabilidade}</Etiqueta>
        {r.gatilho && <Etiqueta>Gatilho{r.gatilho.includes(",") ? "s" : ""} {rotuloGatilhos(r.gatilho)}</Etiqueta>}
        {r.estagio_operacional && <Etiqueta>{r.estagio_operacional}</Etiqueta>}
        <Acionaram r={r} />
      </div>
      <dl className="mt-2 space-y-1 text-sm">
        {r.estacao && (
          <div>
            <dt className="inline font-semibold text-gray-600">Estação: </dt>
            <dd className="inline text-gray-900">{r.estacao}</dd>
          </div>
        )}
        {indice && (
          <div>
            <dt className="inline font-semibold text-gray-600">Índice alcançado: </dt>
            <dd className="inline text-gray-900">{indice}</dd>
          </div>
        )}
        {(r.chuva_1h_mm != null || r.chuva_24h_mm != null || r.chuva_96h_mm != null || r.chuva_30d_mm != null) && (
          <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
            {(
              [
                ["1 h", r.chuva_1h_mm],
                ["24 h", r.chuva_24h_mm],
                ["96 h", r.chuva_96h_mm],
                ["30 d", r.chuva_30d_mm],
              ] as const
            ).map(([t, v]) => (
              <div key={t} className="rounded bg-gray-50 py-1">
                <div className="text-gray-500">{t}</div>
                <div className="font-semibold text-gray-900">{mm(v)}</div>
              </div>
            ))}
          </div>
        )}
        {r.acionaram && sirenesTexto(r) && (
          <div>
            <dt className="inline font-semibold text-gray-600">Sirenes acionadas: </dt>
            <dd className="inline text-gray-900">{sirenesTexto(r)}</dd>
          </div>
        )}
        {r.observacao && <p className="rounded bg-gray-50 p-2 text-xs text-gray-700">{r.observacao}</p>}
      </dl>
      {r.acionaram === null && (
        <button type="button" onClick={onValidar} className="mt-2 rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">
          Validar (município acionou?)
        </button>
      )}
      <footer className="mt-auto pt-2 text-[11px] text-gray-400">Responsável: {r.responsavel || "—"}</footer>
    </article>
  );
}

function Tabela({ itens, onEditar, onValidar, onMensagem, onApagar, admin }: { itens: Recomendacao[]; onEditar: (r: Recomendacao) => void; onValidar: (r: Recomendacao) => void; onMensagem: (r: Recomendacao) => void; onApagar: (r: Recomendacao) => void; admin: boolean }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[78rem] text-left text-xs">
        <thead className="sticky top-0 bg-gray-100 text-[11px] uppercase text-gray-600">
          <tr>
            {["Nº", "Município", "Data", "Hora", "Probabilidade", "Estação pluviométrica", "Índice alcançado", "1h", "24h", "96h", "30d", "Gat.", "Estágio", "Acionaram?", "Sirenes acionadas", "Responsável", "Observação", ""].map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((r) => {
            const cor = COR_PROBABILIDADE[r.probabilidade] ?? COR_PROBABILIDADE.Moderada;
            return (
              <tr key={r.id} className="border-t border-gray-100 align-top hover:bg-gray-50">
                <td className="whitespace-nowrap px-2 py-1.5 font-semibold">{r.numero}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{r.municipio}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{dataBr(r.data)}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{horaCurta(r.hora)}</td>
                <td className="px-2 py-1.5">
                  <Etiqueta cor={cor}>{r.probabilidade}</Etiqueta>
                </td>
                <td className="min-w-[10rem] px-2 py-1.5">{r.estacao}</td>
                <td className="min-w-[9rem] px-2 py-1.5">{r.indice_alcancado || indiceAutomatico(r)}</td>
                <td className="px-2 py-1.5">{r.chuva_1h_mm ?? "—"}</td>
                <td className="px-2 py-1.5">{r.chuva_24h_mm ?? "—"}</td>
                <td className="px-2 py-1.5">{r.chuva_96h_mm ?? "—"}</td>
                <td className="px-2 py-1.5">{r.chuva_30d_mm ?? "—"}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-center">{rotuloGatilhos(r.gatilho) || "—"}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{r.estagio_operacional || "—"}</td>
                <td className="px-2 py-1.5">
                  <Acionaram r={r} />
                </td>
                <td className="min-w-[9rem] px-2 py-1.5">{r.acionaram ? sirenesTexto(r) || "—" : "—"}</td>
                <td className="whitespace-nowrap px-2 py-1.5">{r.responsavel}</td>
                <td className="min-w-[14rem] px-2 py-1.5 text-gray-600">{r.observacao}</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <button type="button" onClick={() => onMensagem(r)} aria-label="Enviar mensagem" title="Gerar a mensagem de envio" className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                    <Send size={14} />
                  </button>
                  {r.acionaram === null && (
                    <button type="button" onClick={() => onValidar(r)} className="mr-1 rounded bg-amber-500 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-600">
                      Validar
                    </button>
                  )}
                  <button type="button" onClick={() => onEditar(r)} aria-label="Editar" className="rounded p-1 text-gray-500 hover:bg-gray-100">
                    <Pencil size={14} />
                  </button>
                  {admin && (
                    <button type="button" onClick={() => onApagar(r)} aria-label="Apagar" className="rounded p-1 text-red-500 hover:bg-red-50">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Sub-aba "Recomendações": consulta das recomendações de alarme em cartões ou tabela, com filtros, resumo, edição e exportação CSV. */
export default function RecomendacoesPanel({ admin, responsavelPadrao, recarregar }: { admin: boolean; responsavelPadrao: string; recarregar: number }) {
  const [filtro, setFiltro] = useState<FiltroRecomendacao>({});
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"cards" | "tabela">("cards");
  const [itens, setItens] = useState<Recomendacao[] | null>(null);
  const [resumo, setResumo] = useState<ResumoRecomendacoes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ rec: Recomendacao; modo: "editar" | "validacao" } | null>(null);
  const [mensagem, setMensagem] = useState<Recomendacao | null>(null);
  const [versao, setVersao] = useState(0);

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: anoAtual - 2019 }, (_, i) => String(anoAtual - i));

  // a busca de texto espera o usuário parar de digitar
  useEffect(() => {
    const t = setTimeout(() => setFiltro((f) => (f.q === busca ? f : { ...f, q: busca })), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(() => {
    let cancelado = false;
    Promise.resolve().then(() => !cancelado && setErro(null));
    Promise.all([fetchRecomendacoes(filtro), fetchResumoRecomendacoes(filtro)])
      .then(([l, r]) => {
        if (cancelado) return;
        setItens(l);
        setResumo(r);
      })
      .catch(() => !cancelado && setErro("Não foi possível carregar as recomendações."));
    return () => {
      cancelado = true;
    };
  }, [filtro]);
  useEffect(() => carregar(), [carregar, versao, recarregar]);

  const apagar = async (r: Recomendacao) => {
    if (!window.confirm(`Apagar a recomendação ${r.numero} (${r.municipio})? Esta ação não pode ser desfeita.`)) return;
    try {
      await apagarRecomendacao(r.id);
      setVersao((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível apagar.");
    }
  };

  const exportar = () => {
    if (!itens) return;
    downloadCsv(
      `recomendacoes-cemaden-rj-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Número", "Município", "Data", "Hora", "Probabilidade de deslizamento", "Estação pluviométrica", "Índice alcançado", "mm/1h", "mm/24h", "mm/96h", "30 dias", "Gatilho", "Estágio operacional", "Acionaram?", "Qtd. sirenes", "Sirenes acionadas", "Responsável", "Observação"],
      itens.map((r) => [r.numero, r.municipio, dataBr(r.data), horaCurta(r.hora), r.probabilidade, r.estacao, r.indice_alcancado || indiceAutomatico(r), r.chuva_1h_mm, r.chuva_24h_mm, r.chuva_96h_mm, r.chuva_30d_mm, r.gatilho, r.estagio_operacional, r.acionaram === null ? "AGUARDANDO" : r.acionaram ? "SIM" : "NÃO", r.sirenes_qtd, r.sirenes_acionadas, r.responsavel, r.observacao]),
    );
  };

  const set = (k: keyof FiltroRecomendacao, v: string) => setFiltro((f) => ({ ...f, [k]: v }));
  const temFiltro = Object.values(filtro).some(Boolean);

  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-gray-50 p-2 sm:p-3">
      {resumo && (
        <div className="mb-2 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Recomendações", String(resumo.total), "#1d4ed8"],
            ["Aguardando validação", String(resumo.pendentes), "#b45309"],
            ["Acionaram / não acionaram", `${resumo.acionaram} / ${resumo.nao_acionaram}`, "#047857"],
            ["Acatamento (validadas)", resumo.pct_acatamento == null ? "—" : `${String(resumo.pct_acatamento).replace(".", ",")}%`, "#7c3aed"],
          ].map(([t, v, c]) => (
            <div key={t} className="rounded-lg border border-gray-200 bg-white p-2 text-center shadow-sm">
              <div className="text-2xl font-extrabold" style={{ color: c }}>
                {v}
              </div>
              <div className="text-[11px] text-gray-500">{t}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
        <select aria-label="Ano" value={filtro.ano ?? ""} onChange={(e) => set("ano", e.target.value)} className={campo}>
          <option value="">Todos os anos</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select aria-label="Município" value={filtro.municipio ?? ""} onChange={(e) => set("municipio", e.target.value)} className={`${campo} max-w-[11rem]`}>
          <option value="">Todos os municípios</option>
          {MUNICIPIOS_CANONICOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select aria-label="Probabilidade" value={filtro.probabilidade ?? ""} onChange={(e) => set("probabilidade", e.target.value)} className={campo}>
          <option value="">Probabilidade</option>
          {PROBABILIDADES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select aria-label="Gatilho" value={filtro.gatilho ?? ""} onChange={(e) => set("gatilho", e.target.value)} className={campo}>
          <option value="">Gatilho</option>
          {GATILHOS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select aria-label="Validação" value={filtro.validacao ?? ""} onChange={(e) => set("validacao", e.target.value)} className={campo}>
          <option value="">Validação</option>
          <option value="pendente">Aguardando</option>
          <option value="validada">Validadas</option>
        </select>
        <select aria-label="Acionaram" value={filtro.acionaram ?? ""} onChange={(e) => set("acionaram", e.target.value)} className={campo}>
          <option value="">Acionaram?</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar (estação, sirene, observação…)" className={`${campo} min-w-[12rem] flex-1`} />
        {temFiltro && (
          <button
            type="button"
            onClick={() => {
              setFiltro({});
              setBusca("");
            }}
            className="rounded bg-gray-100 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            Limpar
          </button>
        )}
        <div className="ml-auto flex gap-1.5">
          <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Modo de exibição">
            <button type="button" onClick={() => setModo("cards")} className={`flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium ${modo === "cards" ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
              <LayoutGrid size={15} /> Cartões
            </button>
            <button type="button" onClick={() => setModo("tabela")} className={`flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium ${modo === "tabela" ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
              <Table2 size={15} /> Tabela
            </button>
          </div>
          <button type="button" onClick={exportar} disabled={!itens?.length} className="flex items-center gap-1 rounded bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-40" title="Baixar CSV (abre no Excel)">
            <Download size={15} /> CSV
          </button>
        </div>
      </div>

      {erro && <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
      {!itens && !erro ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : itens && itens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">{temFiltro ? "Nenhuma recomendação com esses filtros." : "Nenhuma recomendação cadastrada ainda. Use a sub-aba Cadastrar recomendação."}</div>
      ) : itens ? (
        modo === "cards" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {itens.map((r) => (
              <Cartao key={r.id} r={r} admin={admin} onEditar={() => setEditando({ rec: r, modo: "editar" })} onValidar={() => setEditando({ rec: r, modo: "validacao" })} onMensagem={() => setMensagem(r)} onApagar={() => apagar(r)} />
            ))}
          </div>
        ) : (
          <Tabela itens={itens} admin={admin} onEditar={(r) => setEditando({ rec: r, modo: "editar" })} onValidar={(r) => setEditando({ rec: r, modo: "validacao" })} onMensagem={setMensagem} onApagar={apagar} />
        )
      ) : null}

      {mensagem && <RecomendacaoMensagem rec={mensagem} onClose={() => setMensagem(null)} />}
      {editando && (
        <div className="fixed inset-0 z-[3000] flex items-start justify-center overflow-auto bg-black/50 p-2 sm:p-6" onClick={() => setEditando(null)}>
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <RecomendacaoForm
              editando={editando.rec}
              modo={editando.modo}
              responsavelPadrao={responsavelPadrao}
              onCancelar={() => setEditando(null)}
              onSalvo={() => {
                setEditando(null);
                setVersao((v) => v + 1);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
