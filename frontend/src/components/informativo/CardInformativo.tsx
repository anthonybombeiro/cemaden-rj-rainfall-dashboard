"use client";

import { Pencil, Radar, Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { corGravidade, Detalhe, gravidade, nomeRegiao } from "@/lib/informativo";
import { fmtDataHora } from "@/lib/nivelMonitoramento";

function Etiqueta({ children, cor }: { children: React.ReactNode; cor?: string }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={cor ? { background: cor, color: "#fff" } : { background: "#f3f4f6", color: "#374151" }}>{children}</span>;
}

type Acoes = { onAbrir: (id: number) => void; onMensagem: (i: Detalhe) => void; onRadar: (i: Detalhe) => void; onValidar: (i: Detalhe) => void; onCancelar: (i: Detalhe) => void };

/** Card de um informativo enviado, no desenho dos cards de avisos do INMET e do mau tempo: faixa superior pela gravidade, título, etiquetas, a mensagem enviada e
 * os dados. Os controles vêm depois da mensagem: ícones de gerar a arte, radar, editar e lixeira (cancelar: nunca apaga), validação da Idap, notificações e sugestões. */
export default function CardInformativo({ i, destaque, rodape, acoes }: { i: Detalhe; destaque?: boolean; rodape?: React.ReactNode; acoes: Acoes }) {
  const [mais, setMais] = useState(false);
  const comInfo = i.itens.filter((x) => x.chuva_atual || x.chuva_prevista);
  const maior = comInfo.map((x) => x.chuva_prevista || x.chuva_atual).sort((a, b) => gravidade(b) - gravidade(a))[0] ?? "";
  const sms = i.itens.filter((x) => x.sms_enviado).map((x) => nomeRegiao(x.regiao));
  const radares = i.envios.filter((e) => e.tipo === "radar");
  const idap = i.envios.filter((e) => e.tipo === "idap");
  const pendentes = idap.filter((e) => !e.validado_em).length;
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${corGravidade(maior)}` }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">Informativo nº {i.numero}/{i.ano}</h3>
        <div className="-mr-1.5 -mt-1 flex shrink-0 gap-0.5">
          <button type="button" onClick={() => acoes.onMensagem(i)} aria-label="Gerar mensagem" title="Gerar a arte do informativo (imagem e texto)" className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"><Send size={15} /></button>
          <button type="button" onClick={() => acoes.onRadar(i)} aria-label="Gerar imagem do radar" title="Gerar a imagem do radar para enviar" className="rounded p-1.5 text-sky-600 hover:bg-sky-50"><Radar size={15} /></button>
          <button type="button" onClick={() => acoes.onAbrir(i.id)} aria-label="Editar" title="Abrir no compositor" className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={15} /></button>
          <button type="button" onClick={() => acoes.onCancelar(i)} aria-label="Cancelar informativo" title="Cancelar o informativo (não apaga; fica no histórico)" className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${destaque ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>{destaque ? "Vigente" : "Enviado"}</span>
        {sms.length > 0 && <Etiqueta cor="#0369a1">SMS {sms.length} região(ões)</Etiqueta>}
        {radares.length > 0 && <Etiqueta cor="#475569">Radar ×{radares.length}</Etiqueta>}
        {idap.length > 0 && <Etiqueta cor={pendentes ? "#d97706" : "#059669"}>Idap {pendentes ? `${pendentes} a validar` : "validada"}</Etiqueta>}
      </div>

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-700">{i.texto}</p>

      <dl className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
        <div className="flex justify-between gap-2"><dt>Enviado em</dt><dd className="font-medium text-gray-700">{i.enviado_em ? fmtDataHora(i.enviado_em) : "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt>Válido até</dt><dd className="font-medium text-gray-700">{i.vigente_ate ? fmtDataHora(i.vigente_ate) : "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt>Enviado por</dt><dd className="font-medium text-gray-700">{i.enviado_por || "—"}</dd></div>
      </dl>

      {rodape}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => acoes.onValidar(i)} className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600">Validar envio Idap</button>
        <button type="button" onClick={() => setMais((v) => !v)} className="text-xs font-medium text-blue-600 hover:underline">{mais ? "Ocultar notificações e sugestões" : "Ver notificações e sugestões"}</button>
      </div>
      {mais && (
        <div className="mt-2 space-y-2 text-xs text-gray-600">
          <div>
            <b>Notificações</b>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              <li>SMS (planilha de controle): {sms.length ? `marcado para ${sms.join(", ")}` : "nenhum marcado"}</li>
              {idap.map((e) => <li key={e.id}>{e.canal}: {fmtDataHora(e.enviado_em)} por {e.enviado_por}, {e.validado_em ? `validado por ${e.validado_por}` : "a validar"}</li>)}
              {radares.map((e) => <li key={e.id}>{e.detalhe}: {fmtDataHora(e.enviado_em)}</li>)}
              <li>Radar: reenvio a cada {i.radar_intervalo_min} min</li>
              {i.historico.map((h, k) => <li key={k}>{fmtDataHora(h.em)} — {h.acao}{h.detalhe ? ` (${h.detalhe})` : ""} · {h.por}</li>)}
            </ul>
          </div>
          <div>
            <b>Sugestões</b>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              {i.nm_sugerido.length === 0 && <li>Sem sugestão de NM.</li>}
              {i.nm_sugerido.map((n) => <li key={n.regiao}>NM {n.nm} — {nomeRegiao(n.regiao)}{n.so_a_pedido ? " (a pedido da meteorologia)" : ""}</li>)}
              {i.sms.aplicavel && <li>SMS: {i.sms.sms}</li>}
              {i.sms.aplicavel && i.sms.tv && <li>TV: {i.sms.tv}</li>}
            </ul>
          </div>
          {i.observacao && <p><b>Observação:</b> {i.observacao}</p>}
        </div>
      )}
    </div>
  );
}
