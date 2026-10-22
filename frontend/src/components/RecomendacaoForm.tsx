"use client";

import { useEffect, useMemo, useState } from "react";

import RecomendacaoMensagem from "@/components/RecomendacaoMensagem";
import { fetchSirenes, fetchStations } from "@/lib/api";
import { MUNICIPIOS_CANONICOS } from "@/lib/municipios-canonical";
import {
  dataBr,
  ESTAGIOS,
  fetchMunicipiosRecomendacao,
  fetchProximoNumero,
  GATILHOS,
  gatilhosAtingidos,
  horaCurta,
  indiceAutomatico,
  MunicipioGatilho,
  PROBABILIDADES,
  Recomendacao,
  RecomendacaoInput,
  salvarRecomendacao,
} from "@/lib/recomendacoes";

const hojeIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const agoraHM = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

const campo = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";
const rotulo = "mb-0.5 block text-xs font-semibold text-gray-600";

/** Nomes de estações e sirenes por município (sugestões nos campos de texto); carregados uma vez. */
type Sugestoes = { estacoes: { n: string; m: string }[]; sirenes: { n: string; m: string }[] };
let cacheSugestoes: Promise<Sugestoes> | null = null;
function carregarSugestoes(): Promise<Sugestoes> {
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
  acionaram: boolean | null;
  qtd: string;
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
    hora: r ? horaCurta(r.hora) : agoraHM(),
    probabilidade: r?.probabilidade ?? "Alta",
    estacao: r?.estacao ?? "",
    indice_alcancado: r?.indice_alcancado ?? "",
    c1: s(r?.chuva_1h_mm),
    c24: s(r?.chuva_24h_mm),
    c96: s(r?.chuva_96h_mm),
    c30: s(r?.chuva_30d_mm),
    gatilho: r?.gatilho ?? "",
    estagio: r?.estagio_operacional ?? "",
    acionaram: r?.acionaram ?? null,
    qtd: s(r?.sirenes_qtd),
    sirenes: r?.sirenes_acionadas ?? "",
    responsavel: r?.responsavel ?? responsavel,
    observacao: r?.observacao ?? "",
  };
}

function Segmentos<T extends string | boolean | null>({ valor, opcoes, onChange, rotuloAria, corAtiva }: { valor: T; opcoes: [T, string][]; onChange: (v: T) => void; rotuloAria: string; corAtiva?: (v: T) => string }) {
  return (
    <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label={rotuloAria}>
      {opcoes.map(([v, t]) => (
        <button key={t} type="button" onClick={() => onChange(v)} className={`flex-1 px-2 py-1.5 text-xs font-medium sm:text-sm ${valor === v ? `${corAtiva?.(v) ?? "bg-blue-600"} text-white` : "bg-white text-gray-700 hover:bg-gray-100"}`}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** Cadastro, edição e validação de recomendação de alarme.
 * - `envio` (padrão para nova): dados que vão na mensagem ao município — município, data/hora, pluviômetro, chuva, gatilho;
 * - `validacao`: o que se lança DEPOIS (o município acionou? quantas e quais sirenes? observação);
 * - `editar`: tudo. */
export default function RecomendacaoForm({
  editando,
  modo,
  responsavelPadrao,
  onSalvo,
  onCancelar,
}: {
  editando?: Recomendacao;
  modo?: "envio" | "validacao" | "editar";
  responsavelPadrao: string;
  onSalvo: (r: Recomendacao) => void;
  onCancelar?: () => void;
}) {
  const m: "envio" | "validacao" | "editar" = modo ?? (editando ? "editar" : "envio");
  const [f, setF] = useState<Estado>(() => inicial(editando, responsavelPadrao));
  const [sug, setSug] = useState<Sugestoes | null>(null);
  const [municipios, setMunicipios] = useState<MunicipioGatilho[] | null>(null);
  const [proximo, setProximo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<Recomendacao | null>(null);
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    let cancelado = false;
    carregarSugestoes().then((s) => !cancelado && setSug(s));
    fetchMunicipiosRecomendacao()
      .then((l) => !cancelado && setMunicipios(l))
      .catch(() => {});
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

  const listaMunicipios = useMemo(() => {
    const base = municipios?.map((x) => x.municipio) ?? [...MUNICIPIOS_CANONICOS];
    return f.municipio && !base.includes(f.municipio) ? [f.municipio, ...base] : base;
  }, [municipios, f.municipio]);
  const limiares = municipios?.find((x) => x.municipio === f.municipio);
  const estacoesDoMunicipio = useMemo(() => (sug && f.municipio ? Array.from(new Set(sug.estacoes.filter((e) => e.m === f.municipio).map((e) => e.n))).sort() : []), [sug, f.municipio]);
  const sirenesDoMunicipio = useMemo(() => (sug && f.municipio ? Array.from(new Set(sug.sirenes.filter((e) => e.m === f.municipio).map((e) => e.n))).sort() : []), [sug, f.municipio]);
  const atingidos = gatilhosAtingidos(limiares, num(f.c1), num(f.c24), num(f.c96), num(f.c30));

  const enviar = async (e: React.FormEvent | null, gerarMensagem = false) => {
    e?.preventDefault();
    setErro(null);
    setOk(null);
    const chuvas = [f.c1, f.c24, f.c96, f.c30].map(num);
    if (chuvas.some((v) => Number.isNaN(v)) || Number.isNaN(num(f.qtd))) {
      setErro("Use apenas números nos campos de chuva e de quantidade (ex.: 54,2).");
      return;
    }
    if (!f.municipio) {
      setErro("Informe o município.");
      return;
    }
    const base = { chuva_1h_mm: chuvas[0], chuva_24h_mm: chuvas[1], chuva_96h_mm: chuvas[2], chuva_30d_mm: chuvas[3] };
    const nomes = f.sirenes
      .split(/[;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    let qtd = num(f.qtd);
    if (f.acionaram && qtd == null && nomes.length) qtd = nomes.length;
    if (f.acionaram === false) qtd = 0;
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
      sirenes_qtd: f.acionaram === null ? null : qtd,
      sirenes_acionadas: f.acionaram ? f.sirenes.trim() : "",
      responsavel: f.responsavel.trim(),
      observacao: f.observacao.trim(),
    };
    setSalvando(true);
    try {
      const salva = await salvarRecomendacao(dados, editando?.id);
      setOk(`Recomendação ${salva.numero} ${editando ? "atualizada" : "cadastrada — aguardando validação"}.`);
      if (!editando) setF(inicial(undefined, responsavelPadrao));
      if (gerarMensagem) setMensagem(salva);
      onSalvo(salva);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  };

  const titulo = m === "validacao" ? `Validar recomendação ${editando?.numero ?? ""}` : editando ? `Editar recomendação ${editando.numero}` : "Cadastrar recomendação de alarme";

  return (
    <>
    <form onSubmit={(e) => enviar(e)} className="mx-auto w-full max-w-3xl space-y-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <h2 className="text-base font-bold text-gray-800">{titulo}</h2>
      {m === "envio" && <p className="text-xs text-gray-500">Cadastre no momento do envio. A validação (o município acionou? quais sirenes?) é lançada depois, pelo botão <b>Validar</b> do cartão.</p>}

      {m === "validacao" && editando && (
        <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
          <b>{editando.municipio}</b> · {dataBr(editando.data)} {horaCurta(editando.hora)} · {editando.estacao || "—"} · Gatilho {editando.gatilho || "—"} · Probabilidade {editando.probabilidade}
        </div>
      )}

      {m !== "validacao" && (
        <>
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
              <label className={rotulo}>Município * <span className="font-normal text-gray-400">(só os {listaMunicipios.length > 20 ? "" : `${listaMunicipios.length} `}com gestão de sirenes)</span></label>
              <select required value={f.municipio} onChange={(e) => set("municipio", e.target.value)} className={campo}>
                <option value="">Selecione…</option>
                {listaMunicipios.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo}>Probabilidade de deslizamento *</label>
              <Segmentos valor={f.probabilidade} opcoes={PROBABILIDADES.map((p) => [p, p] as [string, string])} onChange={(v) => set("probabilidade", v)} rotuloAria="Probabilidade" />
            </div>
          </div>

          <div>
            <label className={rotulo}>Pluviômetro (estação pluviométrica)</label>
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

          <div>
            <label className={rotulo}>Gatilho</label>
            <Segmentos valor={f.gatilho} opcoes={[["", "—"], ...GATILHOS.map((g) => [g, g] as [string, string])]} onChange={(v) => set("gatilho", v)} rotuloAria="Gatilho" />
            {limiares && (
              <p className="mt-1 text-[11px] text-gray-500">
                Limiares de {limiares.municipio}: I ≥ {limiares.gi_1h ?? "—"} mm/1h · II ≥ {limiares.gii_1h ?? "—"}/1h + {limiares.gii_24h ?? "—"}/24h · III ≥ {limiares.giii_1h ?? "—"}/1h + {limiares.giii_96h ?? "—"}/96h · IV ≥ {limiares.giv_1h ?? "—"}/1h + {limiares.giv_30d ?? "—"}/30d
              </p>
            )}
            {atingidos.length > 0 && (
              <p className="mt-1 text-xs text-emerald-800">
                Pelos valores informados, atingidos: <b>{atingidos.join(", ")}</b>{" "}
                {atingidos.length > 0 && (
                  <button type="button" onClick={() => set("gatilho", atingidos[atingidos.length - 1])} className="ml-1 rounded bg-emerald-100 px-2 py-0.5 font-semibold hover:bg-emerald-200">
                    usar {atingidos[atingidos.length - 1]}
                  </button>
                )}
              </p>
            )}
          </div>
        </>
      )}

      {m !== "envio" && (
        <fieldset className="space-y-3 rounded border border-gray-200 p-2">
          <legend className="px-1 text-xs font-semibold text-gray-600">Validação (depois do envio)</legend>
          <div>
            <label className={rotulo}>O município acionou a sirene?</label>
            <div className="sm:w-80">
              <Segmentos
                valor={f.acionaram}
                opcoes={[
                  [null, "Aguardando"],
                  [true, "Sim"],
                  [false, "Não"],
                ]}
                onChange={(v) => set("acionaram", v)}
                rotuloAria="Acionaram"
                corAtiva={(v) => (v === true ? "bg-emerald-600" : v === false ? "bg-red-600" : "bg-amber-500")}
              />
            </div>
          </div>
          {f.acionaram === true && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <div>
                  <label className={rotulo}>Qtd. de sirenes</label>
                  <input inputMode="numeric" value={f.qtd} onChange={(e) => set("qtd", e.target.value)} placeholder="auto" className={campo} />
                </div>
                <div className="sm:col-span-3">
                  <label className={rotulo}>Sirenes acionadas (nomes)</label>
                  <textarea value={f.sirenes} onChange={(e) => set("sirenes", e.target.value)} rows={2} placeholder="Uma ou mais, separadas por ; (ex.: Rua Nova; Morro do Estado)" className={campo} />
                </div>
              </div>
              {sirenesDoMunicipio.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sirenesDoMunicipio.slice(0, 40).map((n) => (
                    <button key={n} type="button" onClick={() => set("sirenes", f.sirenes ? `${f.sirenes}; ${n}` : n)} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-200" title="Adicionar ao campo">
                      + {n}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {m !== "validacao" && (
          <>
            <div>
              <label className={rotulo}>Responsável</label>
              <input value={f.responsavel} onChange={(e) => set("responsavel", e.target.value)} className={campo} />
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
          </>
        )}
        <div className={m === "validacao" ? "sm:col-span-3" : ""}>
          <label className={rotulo}>Observação</label>
          <textarea value={f.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} className={campo} placeholder="ex.: O município não acatou a recomendação / chuva já havia cessado." />
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
          {salvando ? "Salvando…" : m === "validacao" ? "Salvar validação" : editando ? "Salvar alterações" : "Cadastrar"}
        </button>
        {m === "envio" && !editando && (
          <button type="button" disabled={salvando} onClick={() => enviar(null, true)} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            Cadastrar e gerar mensagem
          </button>
        )}
      </div>
    </form>
    {mensagem && <RecomendacaoMensagem rec={mensagem} onClose={() => setMensagem(null)} />}
    </>
  );
}
