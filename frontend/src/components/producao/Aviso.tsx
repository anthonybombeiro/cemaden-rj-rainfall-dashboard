"use client";

import { Bold, Check, Clipboard, Plus } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchSistemasDia, REDECS, SistemaCatalogo } from "@/lib/api";
import {
  acaoAvisoMet, AvisoMet, criarAvisoMet, EntradaAviso, fetchAvisosMet, hhmm, nomeRegiao, numeroAviso, paraInputLocal, salvarAvisoMet, textoAviso, vigenciaAviso,
} from "@/lib/producaoMet";

/** Aviso meteorológico (nº/AAAA): rascunho com vigência, região, sistemas atuantes, texto (negrito com **), SMS/TV do Idap (146 e 62 caracteres) e o
 * registro do envio. O painel não envia nada: copia o texto e (com o modelo aprovado) baixa a arte. */
const ARTE_LIBERADA = process.env.NEXT_PUBLIC_MET_EXPERIMENTAL === "1";
const AvisoArte = ARTE_LIBERADA ? lazy(() => import("@/components/producao/AvisoArte")) : null;
const COR_ESTADO: Record<string, string> = { rascunho: "bg-gray-200 text-gray-700", emitido: "bg-emerald-100 text-emerald-800", cancelado: "bg-red-100 text-red-700" };

const Contador = ({ n, max }: { n: number; max: number }) => <span className={`text-[11px] ${n > max ? "font-bold text-red-600" : "text-gray-500"}`}>{n}/{max}</span>;

export default function Aviso() {
  const [lista, setLista] = useState<AvisoMet[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [catalogo, setCatalogo] = useState<SistemaCatalogo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoMet | null>(null);
  const [form, setForm] = useState<EntradaAviso>({});
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async (escolher?: number) => {
    try {
      const l = await fetchAvisosMet();
      setLista(l);
      setSel((atual) => escolher ?? atual ?? l[0]?.id ?? null);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar os avisos.");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
    fetchSistemasDia(new Date().toLocaleDateString("sv-SE")).then((d) => setCatalogo(d.catalogo)).catch(() => {});
  }, [carregar]);

  useEffect(() => {
    const a = lista.find((x) => x.id === sel) ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAviso(a);
    setForm(a ? { vigencia_inicio: a.vigencia_inicio, vigencia_fim: a.vigencia_fim, regioes: a.regioes, sistemas: a.sistemas, icones: a.icones, texto: a.texto, sms_texto: a.sms_texto, tv_texto: a.tv_texto, idap_enviado: a.idap_enviado, idap_municipios: a.idap_municipios, idap_protocolo: a.idap_protocolo } : {});
  }, [sel, lista]);

  const nomeSistema = useCallback((id: string) => catalogo.find((c) => c.id === id)?.rotulo ?? id, [catalogo]);
  const editavel = aviso?.estado === "rascunho";
  const soIdap = aviso?.estado === "emitido";
  const set = <K extends keyof EntradaAviso>(k: K, v: EntradaAviso[K]) => setForm((f) => ({ ...f, [k]: v }));
  const alternar = <T extends string>(k: "regioes" | "sistemas" | "icones", v: T) => {
    const atual = (form[k] ?? []) as string[];
    set(k, (atual.includes(v) ? atual.filter((x) => x !== v) : [...atual, v]) as never);
  };

  const executar = async (f: () => Promise<AvisoMet>) => {
    setOcupado(true);
    try {
      const a = await f();
      await carregar(a.id);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setOcupado(false);
    }
  };
  const novo = () => executar(() => criarAvisoMet({}));
  const salvar = () => aviso && executar(() => salvarAvisoMet(aviso.id, form));
  const emitir = () => aviso && executar(async () => { await salvarAvisoMet(aviso.id, form); return acaoAvisoMet(aviso.id, "emitir"); });
  const cancelar = () => {
    const motivo = window.prompt("Motivo do cancelamento:");
    if (aviso && motivo?.trim()) executar(() => acaoAvisoMet(aviso.id, "cancelar", motivo.trim()));
  };
  const negrito = () => {
    const t = area.current;
    if (!t) return;
    const { selectionStart: i, selectionEnd: f, value } = t;
    if (i === f) return;
    set("texto", `${value.slice(0, i)}**${value.slice(i, f)}**${value.slice(f)}`);
  };
  const copiar = async () => {
    if (!aviso) return;
    try {
      await navigator.clipboard.writeText(textoAviso({ ...aviso, ...form } as AvisoMet, nomeSistema));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão para a área de transferência */
    }
  };
  const vista = useMemo(() => (aviso ? ({ ...aviso, ...form } as AvisoMet) : null), [aviso, form]);
  const campo = "w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100";

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        <button type="button" onClick={novo} disabled={ocupado} className="inline-flex w-full items-center justify-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          <Plus size={14} /> Novo aviso
        </button>
        <ul className="space-y-1">
          {lista.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setSel(a.id)} className={`w-full rounded border px-2 py-1.5 text-left text-xs ${sel === a.id ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                <span className="font-bold">Nº {numeroAviso(a)}</span>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${COR_ESTADO[a.estado]}`}>{a.estado}</span>
                <span className="block text-[11px] text-gray-500">{new Date(a.vigencia_inicio).toLocaleDateString("pt-BR")} {hhmm(a.vigencia_inicio)} → {hhmm(a.vigencia_fim)}</span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="text-xs text-gray-500">Nenhum aviso neste ano.</li>}
        </ul>
      </aside>

      <section className="min-w-0 space-y-3">
        {erro && <p className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">{erro}</p>}
        {!aviso && <p className="text-sm text-gray-500">Escolha um aviso ou crie um novo (o número do ano é reservado ao criar).</p>}
        {aviso && vista && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold">Aviso meteorológico nº {numeroAviso(aviso)}</h2>
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${COR_ESTADO[aviso.estado]}`}>{aviso.estado}</span>
              <span className="text-[11px] text-gray-500">{vigenciaAviso(vista)}</span>
              <button type="button" onClick={copiar} className="ml-auto inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-semibold hover:bg-gray-50">
                {copiado ? <Check size={13} /> : <Clipboard size={13} />} {copiado ? "Copiado" : "Copiar texto"}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs">Válido a partir de
                <input type="datetime-local" disabled={!editavel} value={paraInputLocal(form.vigencia_inicio)} onChange={(e) => set("vigencia_inicio", e.target.value)} className={campo} />
              </label>
              <label className="text-xs">até
                <input type="datetime-local" disabled={!editavel} value={paraInputLocal(form.vigencia_fim)} onChange={(e) => set("vigencia_fim", e.target.value)} className={campo} />
              </label>
            </div>
            <div className="text-xs">
              <div className="mb-1 font-semibold">Região <span className="font-normal text-gray-500">(nenhuma marcada = todo o estado)</span></div>
              <div className="flex flex-wrap gap-1">
                {REDECS.map((r) => (
                  <button key={r} type="button" disabled={!editavel} onClick={() => alternar("regioes", r)} className={`rounded border px-2 py-0.5 ${form.regioes?.includes(r) ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white"}`}>{nomeRegiao(r)}</button>
                ))}
              </div>
            </div>
            <div className="text-xs">
              <div className="mb-1 font-semibold">Sistema atuante</div>
              <div className="flex flex-wrap gap-1">
                {catalogo.map((c) => (
                  <button key={c.id} type="button" disabled={!editavel} onClick={() => alternar("sistemas", c.id)} className={`rounded border px-2 py-0.5 ${form.sistemas?.includes(c.id) ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white"}`}>{c.rotulo}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 text-xs">
              <span className="font-semibold">Ícones:</span>
              {(["chuva", "vento"] as const).map((i) => (
                <label key={i} className="inline-flex items-center gap-1"><input type="checkbox" disabled={!editavel} checked={!!form.icones?.includes(i)} onChange={() => alternar("icones", i)} /> {i}</label>
              ))}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold">Texto do aviso <span className="font-normal text-gray-500">(selecione um trecho e use Negrito)</span></span>
                {editavel && <button type="button" onClick={negrito} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 hover:bg-gray-50"><Bold size={12} /> Negrito</button>}
              </div>
              <textarea ref={area} rows={9} disabled={!editavel} value={form.texto ?? ""} onChange={(e) => set("texto", e.target.value)} className={`${campo} leading-snug`} />
            </div>

            <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3">
              <legend className="px-1 text-xs font-semibold">SMS e TV pelo Idap (o painel não envia: copie e registre)</legend>
              <label className="block text-xs">
                <span className="flex justify-between">Mensagem SMS <Contador n={(form.sms_texto ?? "").length} max={146} /></span>
                <textarea rows={2} disabled={aviso.estado === "cancelado"} value={form.sms_texto ?? ""} onChange={(e) => set("sms_texto", e.target.value)} className={campo} />
              </label>
              <label className="block text-xs">
                <span className="flex justify-between">Mensagem TV (só severidade MUITO ALTA) <Contador n={(form.tv_texto ?? "").length} max={62} /></span>
                <input disabled={aviso.estado === "cancelado"} value={form.tv_texto ?? ""} onChange={(e) => set("tv_texto", e.target.value)} className={campo} />
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs">
                <input type="checkbox" disabled={aviso.estado === "cancelado"} checked={!!form.idap_enviado} onChange={(e) => set("idap_enviado", e.target.checked)} /> Enviado pelo Idap
                {aviso.idap_enviado_em && <span className="text-gray-500">às {hhmm(aviso.idap_enviado_em)}</span>}
              </label>
              {form.idap_enviado && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs">Municípios (separados por vírgula)
                    <input disabled={aviso.estado === "cancelado"} value={(form.idap_municipios ?? []).join(", ")} onChange={(e) => set("idap_municipios", e.target.value.split(",").map((m) => m.trim()).filter(Boolean))} className={campo} />
                  </label>
                  <label className="text-xs">Protocolo do disparo
                    <input disabled={aviso.estado === "cancelado"} value={form.idap_protocolo ?? ""} onChange={(e) => set("idap_protocolo", e.target.value)} className={campo} />
                  </label>
                </div>
              )}
            </fieldset>

            <div className="flex flex-wrap gap-2 text-xs">
              {aviso.estado !== "cancelado" && <button type="button" onClick={salvar} disabled={ocupado} className="rounded border border-gray-300 px-3 py-1.5 font-semibold hover:bg-gray-50 disabled:opacity-60">Salvar</button>}
              {editavel && <button type="button" onClick={emitir} disabled={ocupado} className="rounded bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">Marcar como emitido</button>}
              {soIdap && <button type="button" onClick={() => executar(() => acaoAvisoMet(aviso.id, "reabrir"))} disabled={ocupado} className="rounded border border-gray-300 px-3 py-1.5 font-semibold hover:bg-gray-50">Reabrir como rascunho</button>}
              {aviso.estado !== "cancelado" && <button type="button" onClick={cancelar} disabled={ocupado} className="rounded border border-red-300 px-3 py-1.5 font-semibold text-red-700 hover:bg-red-50">Cancelar aviso</button>}
              {aviso.estado === "cancelado" && <span className="text-red-700">Cancelado: {aviso.motivo_cancelamento}</span>}
              {aviso.emitido_em && <span className="self-center text-gray-500">emitido por {aviso.emitido_por} às {hhmm(aviso.emitido_em)}</span>}
            </div>
            {AvisoArte && (
              <Suspense fallback={null}>
                <AvisoArte aviso={vista} nomeSistema={nomeSistema} />
              </Suspense>
            )}
          </>
        )}
      </section>
    </div>
  );
}
