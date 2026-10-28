"use client";

import { AlertTriangle, Check, FileText, Save, Sparkles } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchPrevisoes, fetchPrevisoesPeriodo, fetchSolDoDia, fetchTextoGeralPrevisao, Previsao, PREVISAO_JA_EXISTE, PrevisaoInput, REDECS, salvarPrevisao, salvarTextoGeralPrevisao, SolDoDia } from "@/lib/api";
import { ICONES_TEMPO, iconeSrc, VENTOS } from "@/lib/meteorologia";
import { AvisoValidacao, avisosDaPrevisao, proporTextoGeral } from "@/lib/previsaoTexto";

type Campos = {
  tmax: string;
  tmin: string;
  umax: string;
  umin: string;
  vento: string;
  direcao: string;
  nascer: string;
  por: string;
  comentario: string;
  icone: string;
};

const VAZIO: Campos = {
  tmax: "",
  tmin: "",
  umax: "",
  umin: "",
  vento: "Fraco",
  direcao: "",
  nascer: "",
  por: "",
  comentario: "",
  icone: "",
};

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const EVENTO_TEXTO_GERAL = "previsao:texto-geral";
const irParaTextoGeral = () => window.dispatchEvent(new Event(EVENTO_TEXTO_GERAL));

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDiasIso = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

function deCampos(p: Previsao): Campos {
  return {
    tmax: String(p.temperatura_maxima),
    tmin: String(p.temperatura_minima),
    umax: String(p.umidade_maxima),
    umin: String(p.umidade_minima),
    vento: p.vento_velocidade,
    direcao: p.vento_direcao,
    nascer: p.nascer_sol,
    por: p.por_sol,
    comentario: p.comentario,
    icone: p.icone,
  };
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validar(c: Campos): string | null {
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const [tmax, tmin, umax, umin] = [n(c.tmax), n(c.tmin), n(c.umax), n(c.umin)];
  if ([tmax, tmin, umax, umin].some(Number.isNaN)) return "Preencha as temperaturas e umidades (máxima e mínima).";
  if (![tmax, tmin, umax, umin].every(Number.isInteger)) return "Use números inteiros nas temperaturas e umidades.";
  if (tmin > tmax) return "A temperatura mínima não pode ser maior que a máxima.";
  if (umin > umax) return "A umidade mínima não pode ser maior que a máxima.";
  if (umin < 0 || umax > 100) return "A umidade deve estar entre 0 e 100% (o teto é 100%).";
  if (tmin < -10 || tmax > 50) return "Confira as temperaturas (esperado entre -10 e 50 °C).";
  if (c.nascer && !HORA.test(c.nascer)) return "Nascer do sol deve estar no formato HH:MM.";
  if (c.por && !HORA.test(c.por)) return "Pôr do sol deve estar no formato HH:MM.";
  if (!c.icone) return "Escolha a imagem do clima.";
  return null;
}

const inputCls = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

function dataBR(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function ConfirmarSubstituicao({
  novo,
  atual,
  saving,
  onCancel,
  onConfirm,
}: {
  novo: PrevisaoInput;
  atual: Previsao | null;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const linhas: [string, string, string][] = atual
    ? [
        ["Temperatura máxima", `${atual.temperatura_maxima}°C`, `${novo.temperatura_maxima}°C`],
        ["Temperatura mínima", `${atual.temperatura_minima}°C`, `${novo.temperatura_minima}°C`],
        ["Umidade", `${atual.umidade_minima}% a ${atual.umidade_maxima}%`, `${novo.umidade_minima}% a ${novo.umidade_maxima}%`],
        ["Vento", `${atual.vento_velocidade} ${atual.vento_direcao}`.trim(), `${novo.vento_velocidade} ${novo.vento_direcao}`.trim()],
        ["Nascer / Pôr do sol", `${atual.nascer_sol || "—"} / ${atual.por_sol || "—"}`, `${novo.nascer_sol || "—"} / ${novo.por_sol || "—"}`],
        ["Imagem do clima", ICONES_TEMPO.find((i) => i.key === atual.icone)?.label ?? "—", ICONES_TEMPO.find((i) => i.key === novo.icone)?.label ?? "—"],
        ["Comentário", atual.comentario || "—", novo.comentario || "—"],
      ]
    : [];
  const diferentes = linhas.filter(([, a, n]) => a !== n);
  return (
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 px-3"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmar-titulo"
    >
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirmar-titulo" className="text-lg font-bold text-gray-900">
          Substituir previsão existente?
        </h2>
        <p className="mt-2 text-sm text-gray-700">
          Já existe previsão de <strong>{novo.regiao}</strong> para <strong>{dataBR(novo.data)}</strong>
          {atual?.criado_por ? (
            <>
              , cadastrada por <strong>{atual.criado_por}</strong>
              {atual.atualizado_por && atual.atualizado_por !== atual.criado_por ? (
                <>
                  {" "}
                  e alterada por <strong>{atual.atualizado_por}</strong>
                </>
              ) : null}
              {atual.atualizado_em ? <> em {new Date(atual.atualizado_em).toLocaleString("pt-BR")}</> : null}
            </>
          ) : null}
          . Ao confirmar, ela será <strong>substituída</strong> e o valor anterior não poderá ser recuperado.
        </p>
        {diferentes.length > 0 ? (
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-2 font-medium">Campo</th>
                <th className="py-1 pr-2 font-medium">Atual</th>
                <th className="py-1 font-medium">Novo</th>
              </tr>
            </thead>
            <tbody>
              {diferentes.map(([campo, a, n]) => (
                <tr key={campo} className="border-t border-gray-100 align-top">
                  <td className="py-1 pr-2 text-gray-600">{campo}</td>
                  <td className="py-1 pr-2 text-gray-800">{a}</td>
                  <td className="py-1 font-semibold text-red-700">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-600">Os valores são iguais aos já cadastrados.</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? "Substituindo…" : "Substituir previsão"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmarAvisos({ avisos, regiao, saving, onCancel, onConfirm }: { avisos: AvisoValidacao[]; regiao: string; saving: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 px-3" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="avisos-titulo">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="avisos-titulo" className="flex items-center gap-2 text-lg font-bold text-gray-900">
          <AlertTriangle size={20} className="text-amber-600" />
          Confira antes de salvar
        </h2>
        <p className="mt-2 text-sm text-gray-700">
          A previsão de <strong>{regiao}</strong> tem {avisos.length === 1 ? "um ponto" : `${avisos.length} pontos`} fora do padrão. Se estiver certo, salve mesmo assim.
        </p>
        <ul className="mt-3 space-y-2">
          {avisos.map((a) => (
            <li key={a.codigo} className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              {a.texto}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Voltar e corrigir
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
            Salvar mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}

/** Texto geral do estado: fecha o dia depois das 11 REDECs. Ao clicar na caixa vazia, entra um texto proposto a partir das previsões já
 * lançadas (comentário em comum + imagens do clima + frase do vento); o operador edita e salva. */
function TextoGeralCard({ data, doDia, onSalvo, caixaRef }: { data: string; doDia: Previsao[]; onSalvo: (texto: string) => void; caixaRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const [texto, setTexto] = useState("");
  const [salvo, setSalvo] = useState("");
  const [carregado, setCarregado] = useState(false);
  const [proposto, setProposto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const proposta = useMemo(() => proporTextoGeral(doDia), [doDia]);

  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregado(false);
      setProposto(false);
      setMsg(null);
    });
    fetchTextoGeralPrevisao(data)
      .then((t) => {
        if (cancelado) return;
        setTexto(t.texto_geral ?? "");
        setSalvo(t.texto_geral ?? "");
        onSalvo(t.texto_geral ?? "");
      })
      .catch(() => {
        if (cancelado) return;
        setTexto("");
        setSalvo("");
        onSalvo("");
      })
      .finally(() => !cancelado && setCarregado(true));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const preencher = () => {
    if (!proposta.texto) return;
    setTexto(proposta.texto);
    setProposto(true);
    setMsg(null);
  };
  const aoClicar = () => {
    if (carregado && !texto.trim() && proposta.texto) preencher(); // caixa vazia: clicar já traz a proposta
  };
  // "Texto geral" (chip) e o fim do cadastro das 11 REDECs: rola até o card, foca a caixa e, se estiver vazia, já traz a proposta
  const aoClicarRef = useRef(aoClicar);
  useEffect(() => {
    aoClicarRef.current = aoClicar;
  });
  useEffect(() => {
    const ir = () => {
      document.getElementById("texto-geral-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      caixaRef.current?.focus({ preventScroll: true });
      aoClicarRef.current();
    };
    window.addEventListener(EVENTO_TEXTO_GERAL, ir);
    return () => window.removeEventListener(EVENTO_TEXTO_GERAL, ir);
  }, [caixaRef]);
  const gravar = async () => {
    const t = texto.trim().replace(/\s+/g, " ");
    if (!t) {
      setMsg({ tipo: "erro", texto: "Escreva o texto geral ou clique na caixa para receber a proposta." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await salvarTextoGeralPrevisao(data, t);
      setTexto(r.texto_geral);
      setSalvo(r.texto_geral);
      setProposto(false);
      onSalvo(r.texto_geral);
      setMsg({ tipo: "ok", texto: "Texto geral salvo." });
    } catch (err) {
      setMsg({ tipo: "erro", texto: err instanceof Error ? err.message : "Erro ao salvar o texto geral." });
    } finally {
      setSaving(false);
    }
  };

  const faltam = REDECS.filter((r) => !doDia.some((p) => p.regiao === r));
  const alterado = texto.trim() !== salvo.trim();
  return (
    <section id="texto-geral-card" className="mx-auto mt-4 max-w-4xl space-y-3 rounded-lg border-2 border-blue-300 bg-blue-50 p-4 shadow-sm" aria-label="Texto geral do estado">
      <div className="flex flex-wrap items-center gap-2">
        <FileText size={18} className="text-blue-800" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-blue-900">Texto geral do estado</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${faltam.length === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {REDECS.length - faltam.length}/{REDECS.length} REDECs lançadas
        </span>
        {salvo && !alterado && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">salvo</span>}
      </div>
      <p className="text-xs text-blue-900">
        Fecha o dia: aparece no topo da previsão (mapa, cartões, story, post e texto copiado), sempre antes das REDECs.
        {faltam.length > 0 && <> Faltam: {faltam.join(", ")}.</>}
      </p>
      <textarea
        ref={caixaRef}
        rows={4}
        maxLength={600}
        value={texto}
        disabled={!carregado}
        onClick={aoClicar}
        onFocus={aoClicar}
        onChange={(e) => {
          setTexto(e.target.value);
          setMsg(null);
        }}
        placeholder={proposta.texto ? "Clique aqui para receber um texto proposto a partir das previsões lançadas." : "Lance a previsão das REDECs para receber uma proposta de texto."}
        className="w-full rounded border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-blue-900">
        <span>{texto.length}/600</span>
        {proposto && <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">Texto proposto — edite à vontade antes de salvar.</span>}
        <button type="button" onClick={preencher} disabled={!proposta.texto || !carregado} className="flex items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-40">
          <Sparkles size={13} />
          {texto.trim() ? "Refazer proposta" : "Propor texto"}
        </button>
      </div>
      {proposta.avisos.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-800">
          {proposta.avisos.map((a) => (
            <li key={a}>• {a}</li>
          ))}
        </ul>
      )}
      {msg && <div className={`rounded p-2 text-sm ${msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.texto}</div>}
      <div className="flex justify-end">
        <button type="button" onClick={() => void gravar()} disabled={saving || !carregado || !alterado} className="flex items-center gap-1.5 rounded-md bg-sedec-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          <Save size={15} />
          {saving ? "Salvando…" : "Salvar texto geral"}
        </button>
      </div>
    </section>
  );
}

export default function PrevisaoForm({ dataInicial }: { dataInicial?: string }) {
  const [data, setData] = useState(dataInicial ?? hojeISO());
  const [regiao, setRegiao] = useState<string>(REDECS[0]);
  const [c, setC] = useState<Campos>(VAZIO);
  const [doDia, setDoDia] = useState<Previsao[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pendente, setPendente] = useState<PrevisaoInput | null>(null);
  // Conferências ao salvar (valores fora do padrão): o operador confirma ou volta e corrige.
  const [avisos, setAvisos] = useState<{ dados: PrevisaoInput; lista: AvisoValidacao[] } | null>(null);
  const [textoGeralSalvo, setTextoGeralSalvo] = useState("");
  const caixaTexto = useRef<HTMLTextAreaElement | null>(null);
  // Nascer/pôr do sol automáticos (tabela de referência por REDEC, 2026-2035).
  const [sol, setSol] = useState<SolDoDia | null>(null);
  const [solAuto, setSolAuto] = useState({ nascer: false, por: false });

  const porRegiao = useMemo(() => new Map(doDia.map((p) => [p.regiao, p])), [doDia]);

  const carregarDia = useCallback(async (d: string) => {
    try {
      setDoDia(await fetchPrevisoes(d));
    } catch {
      setDoDia([]);
    }
  }, []);

  useEffect(() => {
    void carregarDia(data);
  }, [data, carregarDia]);

  // Trocou de dia/região: carrega o registro existente (edição) ou limpa.
  useEffect(() => {
    const existente = porRegiao.get(regiao);
    setC(existente ? deCampos(existente) : VAZIO);
    setErro(null);
  }, [regiao, porRegiao]);

  useEffect(() => {
    let cancelado = false;
    fetchSolDoDia(data)
      .then((r) => {
        if (!cancelado) setSol(r);
      })
      .catch(() => {
        if (!cancelado) setSol(null);
      });
    return () => {
      cancelado = true;
    };
  }, [data]);

  // Preenche nascer/pôr do sol só quando estão vazios (nunca sobrescreve o que o
  // operador digitou ou o que já estava gravado); o operador pode editar depois.
  useEffect(() => {
    const s = sol && sol.data === data ? sol.regioes[regiao] : undefined;
    const reg = porRegiao.get(regiao);
    setSolAuto({ nascer: !!s && !reg?.nascer_sol, por: !!s && !reg?.por_sol });
    if (!s) return;
    setC((atual) => ({ ...atual, nascer: atual.nascer || s.nascer, por: atual.por || s.por }));
  }, [sol, data, regiao, porRegiao]);

  const solAtual = sol && sol.data === data ? sol.regioes[regiao] : undefined;

  const set = (k: keyof Campos) => (v: string) => {
    if (k === "nascer" || k === "por") setSolAuto((a) => ({ ...a, [k]: false }));
    setC((atual) => ({ ...atual, [k]: v }));
  };
  const existente = porRegiao.get(regiao);

  function montar(): PrevisaoInput {
    return {
      data,
      regiao,
      temperatura_maxima: Number(c.tmax),
      temperatura_minima: Number(c.tmin),
      umidade_maxima: Number(c.umax),
      umidade_minima: Number(c.umin),
      vento_velocidade: c.vento,
      vento_direcao: c.direcao.trim(),
      nascer_sol: c.nascer,
      por_sol: c.por,
      comentario: c.comentario.trim(),
      icone: c.icone,
    };
  }

  async function gravar(dados: PrevisaoInput, substituir: boolean) {
    setSaving(true);
    setErro(null);
    try {
      await salvarPrevisao(dados, substituir);
      setPendente(null);
      setOk(`Previsão de ${dados.regiao} salva para ${dados.data.split("-").reverse().join("/")}.`);
      const atualizadas = await fetchPrevisoes(dados.data);
      setDoDia(atualizadas);
      const proxima = REDECS.find((r) => r !== dados.regiao && !atualizadas.some((p) => p.regiao === r));
      if (proxima) setRegiao(proxima);
      else {
        // as 11 REDECs estão lançadas: leva o operador ao texto geral, que fecha o dia
        setOk(`Previsão de ${dados.regiao} salva. As 11 REDECs estão lançadas: falta o texto geral do estado.`);
        setTimeout(irParaTextoGeral, 150);
      }
    } catch (err) {
      if (err instanceof Error && err.message === PREVISAO_JA_EXISTE) {
        // Outra pessoa cadastrou enquanto este formulário estava aberto: recarrega e pergunta.
        await carregarDia(dados.data);
        setPendente(dados);
      } else {
        setPendente(null);
        setErro(err instanceof Error ? err.message : "Erro ao salvar a previsão.");
      }
    } finally {
      setSaving(false);
    }
  }

  function seguirParaGravar(dados: PrevisaoInput) {
    if (existente) {
      setPendente(dados); // já existe: pede confirmação antes de substituir
    } else {
      void gravar(dados, false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOk(null);
    const problema = validar(c);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    const dados = montar();
    // Conferências (não bloqueiam): valores fora do padrão das outras REDECs e do histórico da região, imagem x comentário, datas estranhas.
    let historico: Previsao[] = [];
    try {
      historico = await fetchPrevisoesPeriodo(somaDiasIso(dados.data, -14), dados.data);
    } catch {
      historico = []; // sem histórico, vale só a comparação com as REDECs do dia
    }
    const lista = avisosDaPrevisao(dados, doDia, historico, hojeSP());
    if (lista.length) {
      setAvisos({ dados, lista });
      return;
    }
    seguirParaGravar(dados);
  }

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-3 sm:p-4">
      <form onSubmit={(e) => void enviar(e)} className="mx-auto max-w-4xl space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls} htmlFor="prev-data">
              Data
            </label>
            <input
              id="prev-data"
              type="date"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className={labelCls} htmlFor="prev-regiao">
              Região
            </label>
            <select id="prev-regiao" value={regiao} onChange={(e) => setRegiao(e.target.value)} className={inputCls}>
              {REDECS.map((r) => (
                <option key={r} value={r}>
                  {r}
                  {porRegiao.has(r) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
          {existente && (
            <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
              Já existe previsão — salvar substitui (última alteração: {existente.atualizado_por || "—"}).
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {REDECS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegiao(r)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                r === regiao
                  ? "border-sedec-600 bg-sedec-600 text-white"
                  : porRegiao.has(r)
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-gray-300 bg-white text-gray-500"
              }`}
            >
              {porRegiao.has(r) && <Check size={11} />}
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={irParaTextoGeral}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${textoGeralSalvo ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-blue-300 bg-blue-50 text-blue-700"}`}
          >
            {textoGeralSalvo && <Check size={11} />}
            Texto geral
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Temperatura máxima (°C)</label>
            <input inputMode="numeric" maxLength={2} value={c.tmax} onChange={(e) => set("tmax")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Temperatura mínima (°C)</label>
            <input inputMode="numeric" maxLength={2} value={c.tmin} onChange={(e) => set("tmin")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Umidade máxima (%)</label>
            <input inputMode="numeric" maxLength={3} value={c.umax} onChange={(e) => set("umax")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Umidade mínima (%)</label>
            <input inputMode="numeric" maxLength={3} value={c.umin} onChange={(e) => set("umin")(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Velocidade do vento</label>
            <select value={c.vento} onChange={(e) => set("vento")(e.target.value)} className={inputCls}>
              {VENTOS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Direção do vento</label>
            <input maxLength={20} placeholder="Ex.: NE/E" value={c.direcao} onChange={(e) => set("direcao")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nascer do sol</label>
            <input maxLength={5} placeholder="HH:MM" value={c.nascer} onChange={(e) => set("nascer")(e.target.value)} className={inputCls} />
            {solAuto.nascer && <p className="mt-0.5 text-[10px] text-sky-700">Automático (tabela de referência) — pode editar.</p>}
            {solAtual && c.nascer !== solAtual.nascer && (
              <button
                type="button"
                onClick={() => {
                  setC((a) => ({ ...a, nascer: solAtual.nascer }));
                  setSolAuto((a) => ({ ...a, nascer: true }));
                }}
                className="mt-0.5 text-[10px] text-sky-700 underline"
              >
                Restaurar automático ({solAtual.nascer})
              </button>
            )}
          </div>
          <div>
            <label className={labelCls}>Pôr do sol</label>
            <input maxLength={5} placeholder="HH:MM" value={c.por} onChange={(e) => set("por")(e.target.value)} className={inputCls} />
            {solAuto.por && <p className="mt-0.5 text-[10px] text-sky-700">Automático (tabela de referência) — pode editar.</p>}
            {solAtual && c.por !== solAtual.por && (
              <button
                type="button"
                onClick={() => {
                  setC((a) => ({ ...a, por: solAtual.por }));
                  setSolAuto((a) => ({ ...a, por: true }));
                }}
                className="mt-0.5 text-[10px] text-sky-700 underline"
              >
                Restaurar automático ({solAtual.por})
              </button>
            )}
          </div>
        </div>

        <div>
          <label className={labelCls}>Comentário ({c.comentario.length}/200)</label>
          <textarea
            rows={3}
            maxLength={200}
            value={c.comentario}
            onChange={(e) => set("comentario")(e.target.value)}
            className={inputCls}
          />
        </div>

        <fieldset>
          <legend className={labelCls}>Imagem do clima</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ICONES_TEMPO.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => set("icone")(i.key)}
                aria-pressed={c.icone === i.key}
                className={`flex items-center gap-2 rounded border p-2 text-left text-xs ${
                  c.icone === i.key ? "border-sedec-600 bg-blue-50 ring-1 ring-sedec-600" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconeSrc(i.key)} alt="" className="h-9 w-9 shrink-0 object-contain" />
                <span className="text-gray-700">{i.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {erro && <div className="rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
        {ok && <div className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{ok}</div>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-sedec-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? "Salvando…" : existente ? "Atualizar previsão" : "Salvar previsão"}
          </button>
        </div>
      </form>
      <TextoGeralCard data={data} doDia={doDia} onSalvo={setTextoGeralSalvo} caixaRef={caixaTexto} />
      {avisos && (
        <ConfirmarAvisos
          avisos={avisos.lista}
          regiao={avisos.dados.regiao}
          saving={saving}
          onCancel={() => setAvisos(null)}
          onConfirm={() => {
            const d = avisos.dados;
            setAvisos(null);
            seguirParaGravar(d);
          }}
        />
      )}
      {pendente && (
        <ConfirmarSubstituicao
          novo={pendente}
          atual={porRegiao.get(pendente.regiao) ?? null}
          saving={saving}
          onCancel={() => setPendente(null)}
          onConfirm={() => void gravar(pendente, true)}
        />
      )}
    </div>
  );
}

