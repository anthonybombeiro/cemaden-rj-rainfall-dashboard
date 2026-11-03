"use client";

import { Check, Clipboard, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { assuntoLivro, dataCurta, fetchLivro, hhmm, LivroResposta, RegistroLivro, salvarLivro, textoLivro, TIPOS_OCORRENCIA } from "@/lib/producaoMet";

/** Livro de ocorrências (L.O.) e passagem de plantão — procedimento 03 do protocolo. Um registro por turno (07 h → 07 h). Informativos, avisos e envios
 * da Idap do turno entram sozinhos; o técnico completa os técnicos, o operador e as demais ocorrências. O texto sai pronto para colar no e-mail
 * (assunto "Ocorrências Gerais – dd/mm/aa hh/mmh") e no arquivo "Livro de ocorrências". O painel não envia e-mail. */
const VAZIO: RegistroLivro = { plantao: "", operador: "", tecnico_encerra: "", hora_encerra: "07:00", tecnico_inicia: "", hora_inicia: "07:00", ocorrencias: [], texto: "", atualizado_por: "", atualizado_em: "" };

function Copiar({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          /* sem permissão para a área de transferência */
        }
      }}
      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold hover:bg-gray-50"
    >
      {ok ? <Check size={13} /> : <Clipboard size={13} />} {ok ? "Copiado" : rotulo}
    </button>
  );
}

export default function Livro() {
  const [resp, setResp] = useState<LivroResposta | null>(null);
  const [f, setF] = useState<RegistroLivro>(VAZIO);
  const [textoManual, setTextoManual] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [turno, setTurno] = useState<string | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const r = await fetchLivro(turno);
      setResp(r);
      setF(r.registro ?? VAZIO);
      setTextoManual(!!r.registro?.texto);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar o livro.");
    }
  }, [turno]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const gerado = useMemo(() => (resp ? textoLivro(resp.data, f, resp.automatico) : ""), [resp, f]);
  const texto = textoManual ? f.texto : gerado;
  const set = <K extends keyof RegistroLivro>(k: K, v: RegistroLivro[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = async () => {
    if (!resp) return;
    try {
      await salvarLivro({ ...f, texto, data: resp.data });
      setSalvo(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar.");
    }
  };
  const campo = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
  const a = resp?.automatico;

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold">Livro de ocorrências {resp ? `— plantão de ${dataCurta(resp.data)} (07h → 07h)` : ""}</h2>
        <button type="button" onClick={() => resp && setTurno(new Date(new Date(`${resp.data}T12:00:00`).getTime() - 86_400_000).toLocaleDateString("sv-SE"))} className="ml-auto rounded border px-2 py-1 text-xs hover:bg-gray-50">Turno anterior</button>
        {turno && <button type="button" onClick={() => setTurno(undefined)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Turno atual</button>}
      </div>
      {erro && <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">{erro}</p>}
      {resp && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs">Plantão<input value={f.plantao} onChange={(e) => set("plantao", e.target.value)} placeholder="ex.: 03/11 07h → 04/11 07h" className={campo} /></label>
            <label className="text-xs">Operador<input value={f.operador} onChange={(e) => set("operador", e.target.value)} className={campo} /></label>
            <span />
            <label className="text-xs">Técnico que encerra<input value={f.tecnico_encerra} onChange={(e) => set("tecnico_encerra", e.target.value)} className={campo} /></label>
            <label className="text-xs">Horário<input type="time" value={f.hora_encerra} onChange={(e) => set("hora_encerra", e.target.value)} className={campo} /></label>
            <span />
            <label className="text-xs">Técnico que inicia<input value={f.tecnico_inicia} onChange={(e) => set("tecnico_inicia", e.target.value)} className={campo} /></label>
            <label className="text-xs">Horário<input type="time" value={f.hora_inicia} onChange={(e) => set("hora_inicia", e.target.value)} className={campo} /></label>
          </div>

          {a && (a.informativos.length > 0 || a.avisos.length > 0 || a.idap.length > 0) && (
            <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <b>Preenchido pelo painel neste turno:</b>
              <ul className="mt-1 list-disc pl-5">
                {a.informativos.map((i) => <li key={`i${i.numero}`}>Informativo nº {i.numero}/{i.ano} enviado às {hhmm(i.enviado_em)}</li>)}
                {a.avisos.map((x) => <li key={`a${x.numero}`}>Aviso nº {x.numero}/{x.ano} emitido às {hhmm(x.emitido_em)}{x.idap_municipios.length ? ` · SMS+TV: ${x.idap_municipios.length} município(s)` : ""}</li>)}
                {a.idap.map((e, k) => <li key={`d${k}`}>Idap ({e.canal}) do informativo nº {e.numero}/{e.ano} às {hhmm(e.enviado_em)}</li>)}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Demais ocorrências</span>
              <button type="button" onClick={() => set("ocorrencias", [...f.ocorrencias, { tipo: "outra", texto: "" }])} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-gray-50"><Plus size={12} /> Adicionar</button>
            </div>
            {f.ocorrencias.map((o, i) => (
              <div key={i} className="flex gap-2">
                <select value={o.tipo} onChange={(e) => set("ocorrencias", f.ocorrencias.map((x, k) => (k === i ? { ...x, tipo: e.target.value } : x)))} className="w-52 shrink-0 rounded border border-gray-300 px-1 py-1 text-xs">
                  {TIPOS_OCORRENCIA.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select>
                <input value={o.texto} onChange={(e) => set("ocorrencias", f.ocorrencias.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)))} placeholder="Ex.: Radar do Inea indisponível das 15h às 19h" className={campo} />
                <button type="button" onClick={() => set("ocorrencias", f.ocorrencias.filter((_, k) => k !== i))} className="rounded border px-2 text-gray-500 hover:bg-gray-50" aria-label="Remover"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">Texto do e-mail</span>
              {textoManual && <button type="button" onClick={() => setTextoManual(false)} className="rounded border px-2 py-0.5 hover:bg-gray-50">Gerar de novo a partir dos campos</button>}
              <span className="ml-auto flex gap-1.5">
                <Copiar rotulo="Copiar assunto" texto={assuntoLivro()} />
                <Copiar rotulo="Copiar texto" texto={texto} />
                {resp.destinatarios.length > 0 && <Copiar rotulo="Copiar destinatários" texto={resp.destinatarios.join("; ")} />}
              </span>
            </div>
            <textarea rows={14} value={texto} onChange={(e) => { setTextoManual(true); set("texto", e.target.value); }} className={`${campo} font-mono text-xs leading-snug`} />
            <p className="mt-1 text-[11px] text-gray-500">
              {resp.destinatarios.length ? `${resp.destinatarios.length} destinatário(s) configurado(s) no Admin.` : "Destinatários do e-mail: cadastre em Admin → Configuração do plantão (um por linha)."} Depois de enviar, cole o corpo no arquivo “Livro de ocorrências – mês”.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button type="button" onClick={salvar} className="rounded bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700">Salvar registro do turno</button>
            {salvo && <span className="text-emerald-700">Salvo às {salvo}</span>}
            {f.atualizado_por && !salvo && <span className="text-gray-500">Última edição: {f.atualizado_por}</span>}
          </div>
        </>
      )}
      {!resp && !erro && <p className="text-xs text-gray-500">Carregando…</p>}
    </div>
  );
}
