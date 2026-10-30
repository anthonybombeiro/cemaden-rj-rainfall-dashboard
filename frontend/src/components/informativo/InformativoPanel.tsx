"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  Acompanhamento,
  acaoInformativo,
  criarInformativo,
  Detalhe,
  Estatisticas,
  fetchAcompanhamento,
  fetchEstatisticas,
  fetchInformativo,
  fetchInformativos,
  INTENSIDADES,
  ItemRegiao,
  itemVazio,
  nomeRegiao,
  previaInformativo,
  Previa,
  RAJADAS,
  REGIOES_ORDEM,
  Resumo,
  salvarInformativo,
  urlExportar,
} from "@/lib/informativo";
import { fmtDataHora } from "@/lib/nivelMonitoramento";

import ApoioChuva from "./ApoioChuva";
import FilaRevisao from "./FilaRevisao";
import TextoLivreGuiado from "./TextoLivreGuiado";
import Verificacao from "./Verificacao";

type Sub = "compor" | "acompanhar" | "historico" | "verificacao";

const ESTADO: Record<Resumo["estado"], { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "bg-gray-100 text-gray-700" },
  revisado: { rotulo: "Revisado", cor: "bg-sky-100 text-sky-800" },
  enviado: { rotulo: "Enviado", cor: "bg-emerald-100 text-emerald-800" },
  cancelado: { rotulo: "Cancelado", cor: "bg-red-100 text-red-800" },
};

/** Aba Produção → Meteorologia: compõe o informativo (texto no modelo do grupo de operadores), acompanha a vigência de 6 h e o relógio do radar, e guarda o
 * histórico. O painel NÃO envia nada (SMS/WhatsApp/Telegram): registra o que a equipe enviou. */
export default function InformativoPanel() {
  const [sub, setSub] = useState<Sub>("acompanhar");
  const [abertoId, setAbertoId] = useState<number | null>(null);

  const abrir = (id: number) => {
    setAbertoId(id);
    setSub("compor");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {(["acompanhar", "compor", "historico", "verificacao"] as Sub[]).map((s) => (
          <button key={s} type="button" onClick={() => setSub(s)} className={`rounded-full px-3 py-1.5 font-medium ${sub === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
            {s === "acompanhar" ? "Acompanhamento" : s === "compor" ? "Compor informativo" : s === "historico" ? "Histórico" : "Verificação"}
          </button>
        ))}
      </div>
      {sub === "acompanhar" && <Acompanhar onNovo={() => { setAbertoId(null); setSub("compor"); }} onAbrir={abrir} />}
      {sub === "compor" && <Compor key={abertoId ?? "novo"} id={abertoId} onSalvo={setAbertoId} />}
      {sub === "historico" && <Historico onAbrir={abrir} />}
      {sub === "verificacao" && <Verificacao />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ acompanhamento
function Acompanhar({ onNovo, onAbrir }: { onNovo: () => void; onAbrir: (id: number) => void }) {
  const [a, setA] = useState<Acompanhamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => fetchAcompanhamento().then(setA).catch((e) => setErro(e.message)), []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
  }, [carregar]);
  if (erro) return <p className="text-sm text-red-700">{erro}</p>;
  if (!a) return <p className="text-sm text-gray-500">Carregando…</p>;
  const v = a.vigente;
  return (
    <div className="max-w-3xl space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-600">Próximo número: <b>{a.proximo_numero.numero}/{a.proximo_numero.ano}</b>{a.rascunhos > 0 && ` · ${a.rascunhos} rascunho(s) em aberto`}</span>
        <button type="button" onClick={onNovo} className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700">Novo informativo</button>
      </div>
      {v ? (
        <div className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>Vigente: nº {v.numero}/{v.ano}</b>
            <button type="button" onClick={() => onAbrir(v.id)} className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs hover:bg-emerald-100">Abrir</button>
          </div>
          <p>Enviado {v.enviado_em ? fmtDataHora(v.enviado_em) : ""} por {v.enviado_por}. Vale por mais <b>{Math.floor(v.minutos_restantes / 60)} h {v.minutos_restantes % 60} min</b>.</p>
          <p className={v.radar_atrasado ? "font-semibold text-red-700" : ""}>
            Radar: reenviar a cada {v.radar_intervalo_min} min ({v.radar_faixa.replace("_", " ")}) — próximo até {fmtDataHora(v.radar_proximo_em)}{v.radar_atrasado ? " (ATRASADO)" : ""}.
          </p>
          {v.sms_pendentes.length > 0 && <p className="text-amber-800">SMS (IDAP) ainda não marcado como enviado: {v.sms_pendentes.map(nomeRegiao).join(", ")}.</p>}
        </div>
      ) : (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-gray-700">Nenhum informativo vigente (valem 6 h a partir do envio).</p>
      )}
      {a.emitir?.motivo && (
        <p className={`rounded-md border p-2.5 font-semibold ${a.emitir.urgencia === "alta" ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
          {a.emitir.emitir ? (a.emitir.urgencia === "alta" ? "Emitir agora: " : "Considere emitir: ") : ""}{a.emitir.motivo}
        </p>
      )}
      {Object.keys(a.chuva_atual).length > 0 && (
        <p className="text-xs text-gray-700">
          Chuva nas estações (última hora): {Object.entries(a.chuva_atual).sort((x, y) => y[1].max_1h_mm - x[1].max_1h_mm).map(([r, c]) => `${nomeRegiao(r)} ${c.rotulo.toLowerCase()} (${c.max_1h_mm} mm/h)`).join(" · ")}
        </p>
      )}
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-700">Informativos de hoje ({a.hoje.length})</p>
        {a.hoje.length === 0 ? <p className="text-xs text-gray-500">Nenhum informativo hoje.</p> : (
          <ul className="space-y-1 text-xs">
            {a.hoje.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1.5">
                <b>nº {i.numero}/{i.ano}</b>
                <span>{i.emitido_em ? fmtDataHora(i.emitido_em) : "—"}</span>
                <span className={`rounded px-1.5 py-0.5 ${ESTADO[i.estado].cor}`}>{ESTADO[i.estado].rotulo}</span>
                <span className="min-w-0 flex-1 truncate text-gray-600">{i.regioes.map(nomeRegiao).join(", ") || "—"}</span>
                <button type="button" onClick={() => onAbrir(i.id)} className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50">Abrir</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {a.lacunas.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
          Há números faltando na sequência de {a.ano}: <b>{a.lacunas.slice(0, 20).join(", ")}{a.lacunas.length > 20 ? "…" : ""}</b>. Pode ser informativo emitido fora do painel — confira antes de preencher.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ compositor
function Compor({ id, onSalvo }: { id: number | null; onSalvo: (id: number) => void }) {
  const [det, setDet] = useState<Detalhe | null>(null);
  const [itens, setItens] = useState<ItemRegiao[]>(REGIOES_ORDEM.map(itemVazio));
  const [aprox, setAprox] = useState({ regioes: [] as string[], intensidade: "", por: "" });
  const [texto, setTexto] = useState("");
  const [manual, setManual] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const bloqueado = det ? det.estado === "enviado" || det.estado === "cancelado" : false;

  const aplica = useCallback((d: Detalhe) => {
    setDet(d);
    setItens(REGIOES_ORDEM.map((r) => d.itens.find((i) => i.regiao === r) ?? itemVazio(r)));
    setAprox(d.aproximacao);
    setTexto(d.texto);
    setManual(d.editado_a_mao || d.texto_livre);
  }, []);
  useEffect(() => {
    if (id) fetchInformativo(id).then(aplica).catch((e) => setMsg({ tipo: "erro", texto: e.message }));
  }, [id, aplica]);

  // prévia ao vivo (não salva): 400 ms depois da última alteração
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (bloqueado) return;
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      previaInformativo({ itens: itens.filter((i) => i.chuva_atual || i.chuva_prevista), aproximacao: aprox.regioes.length ? aprox : undefined, numero: det?.numero, ano: det?.ano, emitido_em: det?.emitido_em ?? undefined })
        .then((p) => { setPrevia(p); if (!manual) setTexto(p.texto); })
        .catch(() => undefined);
    }, 400);
    return () => { if (t.current) clearTimeout(t.current); };
  }, [itens, aprox, det, manual, bloqueado]);

  const muda = (regiao: string, campo: keyof ItemRegiao, valor: string | boolean) => setItens((l) => l.map((i) => (i.regiao === regiao ? { ...i, [campo]: valor } : i)));
  const preenchidos = itens.filter((i) => i.chuva_atual || i.chuva_prevista);

  const executa = async (fn: () => Promise<Detalhe>, ok: string) => {
    setOcupado(true);
    setMsg(null);
    try {
      const d = await fn();
      aplica(d);
      onSalvo(d.id);
      setMsg({ tipo: "ok", texto: ok });
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error ? e.message : "Falha." });
    } finally {
      setOcupado(false);
    }
  };
  const salvar = () =>
    executa(async () => {
      const corpo = { itens: preenchidos, aproximacao_regioes: aprox.regioes, aproximacao_por: aprox.por, aproximacao_intensidade: aprox.intensidade, ...(manual ? { texto } : {}) };
      return det ? salvarInformativo(det.id, corpo) : criarInformativo({ itens: preenchidos }).then((d) => salvarInformativo(d.id, corpo));
    }, "Rascunho salvo.");
  const acao = (a: "revisar" | "enviar") => () => executa(async () => { const base = det ?? (await criarInformativo({ itens: preenchidos })); if (!det || a === "enviar") await salvarInformativo(base.id, { itens: preenchidos, ...(manual ? { texto } : {}) }); return acaoInformativo(base.id, a); }, a === "enviar" ? "Envio registrado. Lembre: o painel não envia — copie o texto e envie nos canais." : "Marcado como revisado.");
  const cancelar = () => {
    const motivo = window.prompt("Motivo do cancelamento (o informativo não é apagado):");
    if (motivo && det) executa(() => acaoInformativo(det.id, "cancelar", { motivo }), "Informativo cancelado.");
  };
  // insere a frase do texto livre guiado antes do rodapé ("Em caso de mudança de cenário…"); passa a valer como texto ajustado à mão
  const inserirFrase = (frase: string) => {
    const ponto = texto.indexOf("Em caso de mudança de cenário");
    const sem_fim = (t: string) => t.replace(/\n+$/, "");
    setTexto(ponto >= 0 ? `${sem_fim(texto.slice(0, ponto))}\n${frase}\n\n${texto.slice(ponto)}` : `${sem_fim(texto)}\n${frase}`);
    setManual(true);
  };
  const copiar = () => navigator.clipboard?.writeText(texto).then(() => setMsg({ tipo: "ok", texto: "Texto copiado." })).catch(() => setMsg({ tipo: "erro", texto: "Não foi possível copiar." }));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <b>{det ? `Informativo nº ${det.numero}/${det.ano}` : "Novo informativo"}</b>
          {det && <span className={`rounded px-2 py-0.5 text-xs font-medium ${ESTADO[det.estado].cor}`}>{ESTADO[det.estado].rotulo}</span>}
          {det?.importado && <span className="text-xs text-gray-500">importado da planilha</span>}
        </div>
        {!bloqueado && <ApoioChuva itens={itens} desabilitado={ocupado} onAplicar={(novos, resumo) => { setItens(novos); setMsg({ tipo: "ok", texto: resumo }); }} />}
        <div className="space-y-2">
          {itens.map((i) => (
            <div key={i.regiao}>
            <fieldset disabled={bloqueado} className="rounded-md border border-gray-200 bg-white p-2 text-xs">
              <legend className="px-1 text-xs font-semibold text-gray-800">{nomeRegiao(i.regiao)}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-0.5">Chuva atual
                  <select value={i.chuva_atual} onChange={(e) => muda(i.regiao, "chuva_atual", e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">
                    {INTENSIDADES.map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">Previsão 6 h
                  <select value={i.chuva_prevista} onChange={(e) => muda(i.regiao, "chuva_prevista", e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">
                    {INTENSIDADES.map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-1"><input type="checkbox" checked={i.raios_atual} onChange={(e) => muda(i.regiao, "raios_atual", e.target.checked)} /> raios (agora)</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={i.raios} onChange={(e) => muda(i.regiao, "raios", e.target.checked)} /> raios (previsão)</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={i.isolada} onChange={(e) => muda(i.regiao, "isolada", e.target.checked)} /> isolada</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={i.granizo} onChange={(e) => muda(i.regiao, "granizo", e.target.checked)} /> granizo</label>
                <select value={i.vento_previsto} onChange={(e) => muda(i.regiao, "vento_previsto", e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">
                  {RAJADAS.map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
                </select>
              </div>
            </fieldset>
            {det && det.estado !== "cancelado" && INTENSIDADES.findIndex((o) => o.chave === i.chuva_prevista) >= 4 && (
              <label className="mt-1 flex items-center gap-1 px-1 text-xs font-medium text-amber-800">
                <input type="checkbox" checked={!!i.sms_enviado} onChange={(e) => executa(() => acaoInformativo(det.id, "sms", { regioes: [i.regiao], enviado: e.target.checked }), "SMS atualizado.")} /> SMS enviado (IDAP)
              </label>
            )}
            </div>
          ))}
        </div>
        <fieldset disabled={bloqueado} className="rounded-md border border-gray-200 bg-white p-2 text-xs">
          <legend className="px-1 font-semibold text-gray-800">Núcleos se aproximam (opcional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {REGIOES_ORDEM.map((r) => (
              <button key={r} type="button" onClick={() => setAprox((a) => ({ ...a, regioes: a.regioes.includes(r) ? a.regioes.filter((x) => x !== r) : [...a.regioes, r] }))} className={`rounded-full border px-2 py-1 ${aprox.regioes.includes(r) ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 bg-white"}`}>{nomeRegiao(r)}</button>
            ))}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select value={aprox.intensidade} onChange={(e) => setAprox((a) => ({ ...a, intensidade: e.target.value }))} className="rounded border border-gray-300 px-1.5 py-1">
              {INTENSIDADES.map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
            </select>
            <input value={aprox.por} onChange={(e) => setAprox((a) => ({ ...a, por: e.target.value }))} placeholder="Por onde (ex.: Minas Gerais)" className="rounded border border-gray-300 px-1.5 py-1" />
          </div>
        </fieldset>
      </div>

      <div className="space-y-3">
        <div className="rounded-md border border-gray-200 bg-white p-2.5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
            <b>Texto{manual ? " (ajustado à mão)" : " (gerado)"}</b>
            <span className="flex gap-1.5">
              {manual && !bloqueado && <button type="button" onClick={() => { setManual(false); if (previa) setTexto(previa.texto); }} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">Regerar</button>}
              <button type="button" onClick={copiar} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">Copiar</button>
            </span>
          </div>
          <textarea value={texto} readOnly={bloqueado} onChange={(e) => { setTexto(e.target.value); setManual(true); }} rows={18} className="w-full rounded border border-gray-200 p-2 font-mono text-xs leading-relaxed" />
          <p className="mt-1 text-[11px] text-gray-500">{texto.length} caracteres. Texto livre fica por sua conta; a matriz ao lado só gera o texto enquanto você não editar à mão.</p>
        </div>
        {!bloqueado && <TextoLivreGuiado onInserir={inserirFrase} />}
        {(det?.nm_sugerido ?? previa?.nm_sugerido ?? []).length > 0 && (
          <p className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
            NM sugerido pela previsão: {(det?.nm_sugerido ?? previa?.nm_sugerido ?? []).map((n) => `${nomeRegiao(n.regiao)} NM ${n.nm}${n.so_a_pedido ? " (só a pedido da meteorologia)" : ""}`).join("; ")}. É sugestão: o lançamento do NM é do plantonista.
          </p>
        )}
        {(det?.sms ?? previa?.sms)?.aplicavel && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <b>SMS (IDAP, ≤146):</b> {(det?.sms ?? previa?.sms)?.sms}
            <br /><b>TV (≤62):</b> {(det?.sms ?? previa?.sms)?.tv}
            <p className="mt-1">{(det?.sms ?? previa?.sms)?.aviso}</p>
          </div>
        )}
        {det?.estado === "enviado" && <p className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700"><b>Livro de Ocorrências:</b> {det.livro_ocorrencias}</p>}
        {msg && <p className={`text-xs ${msg.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`}>{msg.texto}</p>}
        {!bloqueado && (
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" disabled={ocupado} onClick={salvar} className="rounded border border-gray-300 bg-white px-3 py-2 font-medium hover:bg-gray-50 disabled:opacity-50">Salvar rascunho</button>
            {det?.estado !== "revisado" && <button type="button" disabled={ocupado || preenchidos.length === 0} onClick={acao("revisar")} className="rounded border border-sky-300 bg-sky-50 px-3 py-2 font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50">Marcar revisado</button>}
            <button type="button" disabled={ocupado || preenchidos.length === 0} onClick={acao("enviar")} className="rounded bg-emerald-700 px-3 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-50">Registrar envio</button>
            {det && <button type="button" disabled={ocupado} onClick={cancelar} className="rounded border border-red-300 bg-white px-3 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Cancelar</button>}
          </div>
        )}
        {det?.estado === "enviado" && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={det.publico} onChange={(e) => executa(() => salvarInformativo(det.id, { publico: e.target.checked }), "Publicação atualizada.")} /> Mostrar na página pública enquanto vigente (6 h)
          </label>
        )}
        {det && det.historico.length > 0 && (
          <details className="text-xs text-gray-600">
            <summary className="cursor-pointer">Histórico de alterações ({det.historico.length})</summary>
            <ul className="mt-1 space-y-0.5">{det.historico.map((h, k) => <li key={k}>{fmtDataHora(h.em)} — {h.por}: {h.acao}{h.detalhe ? ` (${h.detalhe})` : ""}</li>)}</ul>
          </details>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ histórico
function Historico({ onAbrir }: { onAbrir: (id: number) => void }) {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [estado, setEstado] = useState("");
  const [regiao, setRegiao] = useState("");
  const [lista, setLista] = useState<Resumo[] | null>(null);
  const [est, setEst] = useState<Estatisticas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const q: Record<string, string> = { ano: String(ano), limite: "300" };
    if (estado) q.estado = estado;
    if (regiao) q.regiao = regiao;
    fetchInformativos(q).then((r) => setLista(r.informativos)).catch((e) => setErro(e.message));
    fetchEstatisticas(ano).then(setEst).catch(() => setEst(null));
  }, [ano, estado, regiao]);
  const duplicar = async (id: number) => {
    try {
      const d = await criarInformativo({ duplicar_de: id });
      onAbrir(d.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao duplicar.");
    }
  };
  return (
    <div className="space-y-3 text-sm">
      <FilaRevisao onMudou={() => setAno((a) => a)} />
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="flex flex-col gap-0.5">Ano
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded border border-gray-300 px-1.5 py-1">{Array.from({ length: anoAtual - 2019 }, (_, k) => anoAtual - k).map((a) => <option key={a}>{a}</option>)}</select>
        </label>
        <label className="flex flex-col gap-0.5">Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1"><option value="">Todos</option>{Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
        </label>
        <label className="flex flex-col gap-0.5">Região
          <select value={regiao} onChange={(e) => setRegiao(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1"><option value="">Todas</option>{REGIOES_ORDEM.map((r) => <option key={r} value={r}>{nomeRegiao(r)}</option>)}</select>
        </label>
        <a href={urlExportar(ano)} className="rounded border border-gray-300 bg-white px-3 py-1.5 font-medium hover:bg-gray-50">Exportar CSV</a>
      </div>
      {est && <p className="text-xs text-gray-600">{est.total} informativo(s) em {est.ano} (sem cancelados){Object.keys(est.por_regiao).length ? " · mais citadas: " + Object.entries(est.por_regiao).sort((a, b) => b[1].informativos - a[1].informativos).slice(0, 3).map(([r, v]) => `${nomeRegiao(r)} (${v.informativos})`).join(", ") : ""}</p>}
      {erro && <p className="text-red-700">{erro}</p>}
      {!lista ? <p className="text-gray-500">Carregando…</p> : lista.length === 0 ? <p className="text-gray-500">Nenhum informativo com esses filtros.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="border-b text-gray-500"><tr><th className="py-1.5 pr-2">Nº</th><th className="pr-2">Data/hora</th><th className="pr-2">Estado</th><th className="pr-2">Regiões</th><th className="pr-2">SMS</th><th /></tr></thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2 font-medium">{i.numero}/{i.ano}</td>
                  <td className="pr-2">{i.emitido_em ? fmtDataHora(i.emitido_em) : "—"}</td>
                  <td className="pr-2"><span className={`rounded px-1.5 py-0.5 ${ESTADO[i.estado].cor}`}>{ESTADO[i.estado].rotulo}</span></td>
                  <td className="pr-2">{i.regioes.length ? i.regioes.map(nomeRegiao).join(", ") : "—"}</td>
                  <td className="pr-2">{i.sms_regioes.length ? i.sms_regioes.map(nomeRegiao).join(", ") : "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" onClick={() => onAbrir(i.id)} className="mr-1 rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">Abrir</button>
                    <button type="button" onClick={() => duplicar(i.id)} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">Duplicar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
