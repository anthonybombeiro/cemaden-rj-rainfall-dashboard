"use client";

import { ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { apagarEnvio, CANAIS_IDAP, Detalhe, Envio, ErroApi, fmtErro, gravidade, nomeRegiao, registrarEnvio, validarEnvio } from "@/lib/informativo";
import { horaLocal } from "@/lib/mapaCanvas";

const hora = (iso: string) => horaLocal(new Date(iso));

/** Popup de validação do envio pela Idap (como "Validar" da recomendação): marca as ferramentas usadas (as mesmas do lançamento do NM), quem autorizou, as regiões e,
 * se houver, a identificação do disparo. Preencher e confirmar é a validação. O painel não dispara nada; as regras do PLANCON (TV e DCA só no NM 4 e 5, SMS só com
 * previsão moderada a forte ou mais) viram avisos que pedem confirmação. */
export default function ValidarIdap({ det, onAtualiza, onClose }: { det: Detalhe; onAtualiza: (d: Detalhe) => void; onClose: () => void }) {
  const [canais, setCanais] = useState<string[]>([]);
  const [autorizado, setAutorizado] = useState("");
  const [regioes, setRegioes] = useState<string[]>([]);
  const [protocolo, setProtocolo] = useState("");
  const [obs, setObs] = useState("");
  const [confirmo, setConfirmo] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const candidatas = det.itens.filter((i) => gravidade(i.chuva_prevista) >= 3).map((i) => i.regiao);
  const feitos = det.envios.filter((e) => e.tipo === "idap");

  const registra = async (confirmar = false) => {
    try {
      const r = await registrarEnvio(det.id, { tipo: "idap", canais, autorizado_por: autorizado, regioes, protocolo, observacao: obs, validado: confirmo, confirmar_avisos: confirmar });
      onAtualiza(r.informativo);
      setCanais([]); setRegioes([]); setProtocolo(""); setObs("");
      setMsg({ tipo: "ok", texto: confirmo ? "Envio validado e registrado." : "Envio registrado (validação pendente)." });
    } catch (e) {
      if (e instanceof ErroApi && e.avisos.length && !confirmar) {
        if (window.confirm(`${e.avisos.join("\n\n")}\n\nRegistrar mesmo assim?`)) await registra(true);
      } else setMsg({ tipo: "erro", texto: fmtErro(e) });
    }
  };
  const valida = async (e: Envio) => {
    try { onAtualiza((await validarEnvio(e.id, !e.validado_em)).informativo); setMsg(null); } catch (x) { setMsg({ tipo: "erro", texto: fmtErro(x) }); }
  };
  const apaga = async (e: Envio) => {
    if (!window.confirm(`Apagar o registro de ${e.canal}? (só administrador)`)) return;
    try { onAtualiza(await apagarEnvio(e.id)); } catch (x) { setMsg({ tipo: "erro", texto: fmtErro(x) }); }
  };
  const alterna = (lista: string[], v: string, set: (l: string[]) => void) => set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="font-bold text-gray-800">Validar envio pela Idap · informativo {det.numero}/{det.ano}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
          <p className="rounded bg-gray-50 p-2 text-xs text-gray-600">O painel não dispara nada: registre aqui o que foi enviado na Idap. Preencher e confirmar é a validação.</p>
          {feitos.length > 0 && (
            <div className="space-y-1">
              <b className="text-xs">Já registrados</b>
              {feitos.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1 text-xs">
                  <span className="font-semibold">{e.canal}</span>
                  <span className="text-gray-600">{hora(e.enviado_em)} · autorizado por {e.autorizado_por}{e.regioes.length ? ` · ${e.regioes.map(nomeRegiao).join(", ")}` : ""}{e.protocolo ? ` · Idap ${e.protocolo}` : ""}</span>
                  <button type="button" onClick={() => valida(e)} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${e.validado_em ? "bg-emerald-100 text-emerald-800" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
                    <ShieldCheck size={12} />{e.validado_em ? `validado por ${e.validado_por}` : "Validar"}
                  </button>
                  <button type="button" onClick={() => apaga(e)} aria-label="Apagar" title="Apagar (administrador)" className="ml-auto rounded p-1 text-red-500 hover:bg-red-50"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold text-gray-700">Ferramentas da Idap usadas</legend>
            <div className="flex flex-wrap gap-1.5">
              {CANAIS_IDAP.map((c) => (
                <label key={c} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${canais.includes(c) ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white"}`}>
                  <input type="checkbox" className="hidden" checked={canais.includes(c)} onChange={() => alterna(canais, c, setCanais)} />{c}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-0.5 text-xs">Autorizado por (ok do diretor ou do oficial de ligação)
            <input value={autorizado} onChange={(e) => setAutorizado(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <div className="text-xs">
            <span className="font-semibold text-gray-700">Regiões</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {(candidatas.length ? candidatas : det.itens.map((i) => i.regiao)).map((r) => (
                <button key={r} type="button" onClick={() => alterna(regioes, r, setRegioes)} className={`rounded-full border px-2 py-0.5 ${regioes.includes(r) ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white"}`}>{nomeRegiao(r)}</button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-0.5 text-xs">Identificação do disparo na Idap (opcional)
            <input value={protocolo} onChange={(e) => setProtocolo(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-0.5 text-xs">Observação (opcional)
            <input value={obs} onChange={(e) => setObs(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} /> Confirmo que o disparo saiu na Idap (validado)</label>
          {msg && <p className={`text-xs ${msg.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.texto}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 p-3">
          <button type="button" onClick={onClose} className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Fechar</button>
          <button type="button" onClick={() => registra()} disabled={canais.length === 0} className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50">Registrar validação</button>
        </div>
      </div>
    </div>
  );
}
