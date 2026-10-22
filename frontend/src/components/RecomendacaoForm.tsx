"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchSirenes, fetchStations } from "@/lib/api";
import { MUNICIPIOS_CANONICOS } from "@/lib/municipios-canonical";
import { ESTAGIOS, fetchProximoNumero, GATILHOS, indiceAutomatico, PROBABILIDADES, Recomendacao, RecomendacaoInput, salvarRecomendacao } from "@/lib/recomendacoes";

const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const agoraHM = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

const campo = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";
const rotulo = "mb-0.5 block text-xs font-semibold text-gray-600";

/** Nomes de estações e sirenes por município (para sugestão nos campos de texto); carregados uma vez. */
let cacheSugestoes: Promise<{ estacoes: { n: string; m: string }[]; sirenes: { n: string; m: string }[] }> | null = null;
function carregarSugestoes() {
  cacheSugestoes ??= Promise.all([fetchStations().catch(() => []), fetchSirenes().catch(() => [])]).then(([est, sir]) => ({
    estacoes: est.map((s) => ({ n: s.name, m: s.municipality })),
    sirenes: sir.map((s) => ({ n: s.name, m: s.municipality })),
  }));
  return cacheSugestoes;
}

type Estado = {
  numero: string;
  municipio: string;
  data: string;
  hora: string;
  probabilidade: string;
  estacao: string;
  indice_alcancado: string;
  c1: string;
  c24: string;
  c96: string;
  c30: string;
  gatilho: string;
  estagio: string;
  acionaram: boolean;
  sirenes: string;
  responsavel: string;
  observacao: string;
};

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

function inicial(r: Recomendacao | undefined, responsavel: string): Estado {
  const s = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
  return {
    numero: r?.numero ?? "",
    municipio: r?.municipio ?? "",
    data: r?.data ?? hojeIso(),
    hora: r ? r.hora.slice(0, 5) : agoraHM(),
    probabilidade: r?.probabilidade ?? "",
    estacao: r?.estacao ?? "",
    indice_alcancado: r?.indice_alcancado ?? "",
    c1: s(r?.chuva_1h_mm),
    c24: s(r?.chuva_24h_mm),
    c96: s(r?.chuva_96h_mm),
    c30: s(r?.chuva_30d_mm),
    gatilho: r?.gatilho ?? "",
    estagio: r?.estagio_operacional ?? "",
    acionaram: r?.acionaram ?? false,
    sirenes: r?.sirenes_acionadas ?? "",
    responsavel: r?.responsavel ?? responsavel,
    observacao: r?.observacao ?? "",
  };
}

/** Cadastro (e edição) de recomendação de alarme. O número NN_AAAA é gerado sozinho (editável). */
export default function RecomendacaoForm({ editando, responsavelPadrao, onSalvo, onCancelar }: { editando?: Recomendacao; responsavelPadrao: string; onSalvo: (r: Recomendacao) => void; onCancelar?: () => void }) {
  const [f, setF] = useState<Estado>(() => inicial(editando, responsavelPadrao));
  const [sug, setSug] = useState<{ estacoes: { n: string; m: string }[]; sirenes: { n: string; m: string }[] } | null>(null);
  const [proximo, setProximo] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    let cancelado = false;
    carregarSugestoes().then((s) => !cancelado && setSug(s));
    return () => {
      cancelado = true;
    };
  }, []);
  useEffect(() => {
    if (editando || !f.data) return;
    let cancelado = false;
    fetchProximoNumero(f.data)
      .then((n) => !cancelado && setProximo(n))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [editando, f.data, ok]);

  const estacoesDoMunicipio = useMemo(() => (sug && f.municipio ? Array.from(new Set(sug.estacoes.filter((e) => e.m === f.municipio).map((e) => e.n))).sort() : []), [sug, f.municipio]);
  const sirenesDoMunicipio = useMemo(() => (sug && f.municipio ? Array.from(new Set(sug.sirenes.filter((e) => e.m === f.municipio).map((e) => e.n))).sort() : []), [sug, f.municipio]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setOk(null);
    const chuvas = [f.c1, f.c24, f.c96, f.c30].map(num);
    if (chuvas.some((v) => Number.isNaN(v))) {
      setErro("Chuva: use apenas números (ex.: 54,2).");
      return;
    }
    if (!f.municipio || !f.probabilidade) {
      setErro("Informe município e probabilidade de deslizamento.");
      return;
    }
    const base = { chuva_1h_mm: chuvas[0], chuva_24h_mm: chuvas[1], chuva_96h_mm: chuvas[2], chuva_30d_mm: chuvas[3] };
    const dados: RecomendacaoInput = {
      numero: f.numero.trim(),
      municipio: f.municipio,
      data: f.data,
      hora: f.hora,
      probabilidade: f.probabilidade as RecomendacaoInput["probabilidade"],
      estacao: f.estacao.trim(),
      indice_alcancado: f.indice_alcancado.trim() || indiceAutomatico(base),
      ...base,
      gatilho: f.gatilho as RecomendacaoInput["gatilho"],
      estagio_operacional: f.estagio as RecomendacaoInput["estagio_operacional"],
      acionaram: f.acionaram,
      sirenes_acionadas: f.acionaram ? f.sirenes.trim() : "",
      responsavel: f.responsavel.trim(),
      observacao: f.observacao.trim(),
    };
    setSalvando(true);
    try {
      const salva = await salvarRecomendacao(dados, editando?.id);
      setOk(`Recomendação ${salva.numero} ${editando ? "atualizada" : "cadastrada"}.`);
      if (!editando) setF(inicial(undefined, responsavelPadrao));
      onSalvo(salva);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mx-auto w-full max-w-3xl space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <h2 className="text-base font-bold text-gray-800">{editando ? `Editar recomendação ${editando.numero}` : "Cadastrar recomendação de alarme"}</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={rotulo}>Número da recomendação</label>
          <input value={f.numero} onChange={(e) => set("numero", e.target.value)} placeholder={editando ? "" : proximo ? `automático: ${proximo}` : "automático"} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Data *</label>
          <input type="date" required value={f.data} onChange={(e) => set("data", e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Hora *</label>
          <input type="time" required value={f.hora} onChange={(e) => set("hora", e.target.value)} className={campo} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
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
          <label className={rotulo}>Probabilidade de deslizamento *</label>
          <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Probabilidade">
            {PROBABILIDADES.map((p) => (
              <button key={p} type="button" onClick={() => set("probabilidade", p)} className={`flex-1 px-1 py-1.5 text-xs font-medium sm:text-sm ${f.probabilidade === p ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className={rotulo}>Estação pluviométrica</label>
        <input value={f.estacao} onChange={(e) => set("estacao", e.target.value)} list="rec-estacoes" placeholder={f.municipio ? "Digite ou escolha uma estação do município" : "Escolha o município primeiro"} className={campo} />
        <datalist id="rec-estacoes">
          {estacoesDoMunicipio.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <fieldset className="rounded border border-gray-200 p-2">
        <legend className="px-1 text-xs font-semibold text-gray-600">Índice alcançado (mm)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["c1", "mm / 1 h"],
              ["c24", "mm / 24 h"],
              ["c96", "mm / 96 h"],
              ["c30", "mm / 30 dias"],
            ] as const
          ).map(([k, r]) => (
            <div key={k}>
              <label className={rotulo}>{r}</label>
              <input inputMode="decimal" value={f[k]} onChange={(e) => set(k, e.target.value)} className={campo} placeholder="—" />
            </div>
          ))}
        </div>
        <div className="mt-2">
          <label className={rotulo}>Texto do índice (opcional — se vazio, é montado dos valores acima)</label>
          <input value={f.indice_alcancado} onChange={(e) => set("indice_alcancado", e.target.value)} placeholder="ex.: 54 mm/1h · 435,8 mm/30d" className={campo} />
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo}>Gatilho</label>
          <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Gatilho">
            {["", ...GATILHOS].map((g) => (
              <button key={g || "nenhum"} type="button" onClick={() => set("gatilho", g)} className={`flex-1 px-2 py-1.5 text-sm font-medium ${f.gatilho === g ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
                {g || "—"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={rotulo}>Estágio operacional</label>
          <select value={f.estagio} onChange={(e) => set("estagio", e.target.value)} className={campo}>
            <option value="">—</option>
            {ESTAGIOS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={rotulo}>O município acionou a sirene? *</label>
        <div className="flex overflow-hidden rounded border border-gray-300 sm:w-60" role="group" aria-label="Acionaram">
          {[
            [true, "Sim"],
            [false, "Não"],
          ].map(([v, t]) => (
            <button key={String(t)} type="button" onClick={() => set("acionaram", v as boolean)} className={`flex-1 px-3 py-1.5 text-sm font-medium ${f.acionaram === v ? (v ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "bg-white text-gray-700 hover:bg-gray-100"}`}>
              {t as string}
            </button>
          ))}
        </div>
      </div>

      {f.acionaram && (
        <div>
          <label className={rotulo}>Sirenes acionadas</label>
          <textarea value={f.sirenes} onChange={(e) => set("sirenes", e.target.value)} rows={2} placeholder="Uma ou mais sirenes (ex.: 1 - Rua Nova; 2 - Morro do Estado)" className={campo} />
          {sirenesDoMunicipio.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {sirenesDoMunicipio.slice(0, 40).map((n) => (
                <button key={n} type="button" onClick={() => set("sirenes", f.sirenes ? `${f.sirenes}; ${n}` : n)} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200" title="Adicionar ao campo">
                  + {n}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={rotulo}>Responsável</label>
          <input value={f.responsavel} onChange={(e) => set("responsavel", e.target.value)} className={campo} />
        </div>
        <div className="sm:col-span-2">
          <label className={rotulo}>Observação</label>
          <textarea value={f.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className={campo} placeholder="ex.: O município não acatou a recomendação de mobilização da sirene." />
        </div>
      </div>

      {erro && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</div>}
      {ok && <div className="rounded bg-emerald-50 p-2 text-sm text-emerald-800">{ok}</div>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={salvando} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar recomendação"}
        </button>
      </div>
    </form>
  );
}
