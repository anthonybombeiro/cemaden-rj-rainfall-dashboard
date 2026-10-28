"use client";

import { useEffect, useMemo, useState } from "react";

import {
  corTextoSobre,
  decidirNivel,
  EntradaDecisao,
  EntradaRegistro,
  ErrosRegistro,
  ESCALA_NM,
  NiveisResposta,
  NIVEIS_NM,
  registrarNivel,
} from "@/lib/nivelMonitoramento";

const campo = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900";
const rotulo = "mb-0.5 block text-xs font-medium text-gray-600";

export type PreLancamento = { nivel?: number; equipe?: string; motivo?: string; antecedencia?: string };

const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const paraIso = (v: string) => (v ? new Date(v).toISOString() : null);

/** Regras do PLANCON espelhadas no navegador só para orientar (o servidor é quem recusa de fato — core/niveis_monitoramento.py). */
function errosLocais(f: Estado): string[] {
  const e: string[] = [];
  const ferr = new Set(f.ferramentas);
  if (f.nivel <= 1 && ferr.size) e.push("NM 0 e NM 1 não têm envio pela Idap: retire as ferramentas.");
  if ((f.nivel === 2 || f.nivel === 3) && (ferr.has("TV por assinatura") || ferr.has("DCA"))) e.push("TV por assinatura e DCA são vedados nos NM 2 e NM 3.");
  if (f.nivel >= 3 && !f.motivo.trim()) e.push("Informe o motivo / a justificativa técnica.");
  if (f.nivel >= 4) {
    if (f.antecedencia === "mais_2h") e.push("NM 4 exige impacto em até 2 h: com mais de 2 h o máximo é NM 3 – Alto.");
    else if (!f.antecedencia) e.push("Informe a antecedência do impacto.");
    if (!f.area) e.push("Sem área delimitada (polígono/KMZ) não há NM 4 nem DCA.");
    if (!f.pop) e.push("Confirme a população exposta na área delimitada.");
    if (!f.aprovado.trim()) e.push("Informe quem aprovou (Diretor ou Oficial de Ligação).");
    if (!f.equipe) e.push("Informe a equipe que originou o nível.");
    const avisos = f.comdec && f.redec;
    if (!avisos && !(f.nivel === 5 && f.simultaneo && f.avisoMotivo.trim())) e.push("Registre o horário do aviso à COMDEC e à REDEC (no NM 5 pode ser simultâneo, com o motivo).");
  }
  return e;
}

type Estado = {
  nivel: number;
  equipe: string;
  antecedencia: string;
  area: boolean;
  pop: boolean;
  motivo: string;
  ferramentas: string[];
  horas: number;
  aprovado: string;
  comdec: string;
  redec: string;
  simultaneo: boolean;
  avisoMotivo: string;
  encerramento: boolean;
};
const VAZIO: Estado = { nivel: 3, equipe: "", antecedencia: "", area: false, pop: false, motivo: "", ferramentas: [], horas: 24, aprovado: "", comdec: "", redec: "", simultaneo: false, avisoMotivo: "", encerramento: false };

export default function LancarNivel({
  dados,
  selecionados,
  pre,
  onRegistrado,
  onLimpar,
}: {
  dados: NiveisResposta;
  selecionados: string[];
  pre: PreLancamento | null;
  onRegistrado: () => void;
  onLimpar: () => void;
}) {
  const [f, setF] = useState<Estado>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [assistente, setAssistente] = useState(false);
  const [dec, setDec] = useState<EntradaDecisao>({ equipe: "geo", risco: 3, fenomeno: "vendaval", situacao: "gat", antecedencia: "ate", area: true, pop: true, monitorada: false });
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!pre) return;
    setF((x) => ({ ...x, nivel: pre.nivel ?? x.nivel, equipe: pre.equipe ?? x.equipe, motivo: pre.motivo ?? x.motivo, antecedencia: pre.antecedencia ?? x.antecedencia }));
    setOk(null);
    setErros([]);
  }, [pre]);

  const atuais = useMemo(() => dados.niveis.filter((n) => selecionados.includes(n.municipio)), [dados, selecionados]);
  const algumAtivo = atuais.some((n) => n.nivel >= 2);
  const resultado = useMemo(() => decidirNivel(dec), [dec]);
  const avisosLocais = errosLocais(f);
  const L = ESCALA_NM[f.nivel];
  const podeTvDca = f.nivel >= 4;
  const ferrDisponiveis = dados.ferramentas.filter((x) => f.nivel >= 2 && (podeTvDca || (x !== "TV por assinatura" && x !== "DCA")));
  const autonomos = atuais.filter((n) => n.autonomo_dca);

  const trocarNivel = (n: number) =>
    setF((x) => {
      const livre = n <= 1 ? [] : x.ferramentas.filter((t) => n >= 4 || (t !== "TV por assinatura" && t !== "DCA"));
      return { ...x, nivel: n, ferramentas: livre, encerramento: n <= 1 ? x.encerramento : false };
    });

  const enviar = async () => {
    setErros([]);
    setOk(null);
    if (!selecionados.length) return setErros(["Escolha ao menos um município no mapa ou na lista."]);
    if (f.nivel >= 4 && !window.confirm(`Registrar ${L.sigla} – ${L.nome} para ${selecionados.length} município(s)?\n\nIsto só ATUALIZA o painel. O alerta à população é enviado na Idap, por quem tem cadastro, depois da aprovação e do aviso à COMDEC e à REDEC.`)) return;
    const corpo: EntradaRegistro = {
      municipios: selecionados,
      nivel: f.nivel,
      equipe: f.equipe,
      antecedencia: f.antecedencia,
      area_delimitada: f.area,
      populacao_exposta: f.pop,
      motivo: f.motivo,
      ferramentas: f.ferramentas,
      vigencia_horas: f.nivel >= 2 ? f.horas : undefined,
      aprovado_por: f.aprovado,
      comdec_avisada_em: paraIso(f.comdec),
      redec_avisada_em: paraIso(f.redec),
      aviso_simultaneo: f.simultaneo,
      aviso_motivo: f.avisoMotivo,
      encerramento: f.nivel <= 1 && f.encerramento,
    };
    setEnviando(true);
    try {
      const r = await registrarNivel(corpo);
      setOk(`${L.sigla} – ${L.nome} registrado para ${r.registrados} município(s).`);
      setF((x) => ({ ...VAZIO, nivel: x.nivel }));
      onRegistrado();
    } catch (e) {
      setErros(e instanceof ErrosRegistro ? e.erros : [e instanceof Error ? e.message : "Falha ao registrar."]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-md border border-blue-100 bg-blue-50 p-2 text-xs text-blue-900">
        Este registro <b>atualiza o painel e o histórico</b>. O envio do alerta à população é feito na <b>Idap</b>, pelo usuário habilitado, depois da aprovação e dos avisos prévios.
      </div>

      {/* municípios escolhidos */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className={rotulo}>Municípios ({selecionados.length})</span>
          {selecionados.length > 0 && (
            <button type="button" onClick={onLimpar} className="text-xs text-blue-600 hover:underline">
              limpar seleção
            </button>
          )}
        </div>
        {selecionados.length === 0 ? (
          <p className="rounded border border-dashed border-gray-300 p-2 text-xs text-gray-500">Clique nos municípios no mapa (Ctrl/Shift para vários), escolha uma regional ou use a busca acima do mapa.</p>
        ) : (
          <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
            {atuais.map((n) => (
              <span key={n.municipio} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-black/20" style={{ background: ESCALA_NM[n.nivel].cor }} />
                {n.municipio}
                <span className="text-gray-400">{ESCALA_NM[n.nivel].sigla}</span>
              </span>
            ))}
          </div>
        )}
        {autonomos.length > 0 && f.nivel >= 2 && (
          <p className="mt-1 text-xs text-amber-700">Autônomo para DCA: {autonomos.map((n) => n.municipio).join(", ")} — o envio é do município; o CEMADEN-RJ recomenda e acompanha.</p>
        )}
      </div>

      {/* assistente */}
      <div className="rounded-md border border-gray-200">
        <button type="button" onClick={() => setAssistente((a) => !a)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-gray-700" aria-expanded={assistente}>
          <span>Assistente de decisão (regras do PLANCON)</span>
          <span>{assistente ? "▾" : "▸"}</span>
        </button>
        {assistente && (
          <div className="space-y-2 border-t border-gray-200 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={rotulo}>Equipe</span>
                <select className={campo} value={dec.equipe} onChange={(e) => setDec({ ...dec, equipe: e.target.value as EntradaDecisao["equipe"], risco: e.target.value === "met" && dec.risco === 0 ? 1 : dec.risco })}>
                  <option value="geo">Geologia</option>
                  <option value="hid">Hidrologia</option>
                  <option value="met">Meteorologia</option>
                </select>
              </label>
              <label>
                <span className={rotulo}>{dec.equipe === "met" ? "Severidade meteorológica" : "Grau de risco"}</span>
                <select className={campo} value={dec.risco} onChange={(e) => setDec({ ...dec, risco: Number(e.target.value) })}>
                  {["Muito baixo", "Baixo", "Moderado", "Alto", "Muito alto"].map((t, i) => (dec.equipe === "met" && i === 0 ? null : <option key={i} value={i}>{t}</option>))}
                </select>
              </label>
              {dec.equipe === "met" && (
                <label className="col-span-2">
                  <span className={rotulo}>Fenômeno</span>
                  <select className={campo} value={dec.fenomeno} onChange={(e) => setDec({ ...dec, fenomeno: e.target.value as EntradaDecisao["fenomeno"] })}>
                    <option value="vendaval">Vendaval / rajadas</option>
                    <option value="chuva">Chuva muito forte</option>
                    <option value="granizo">Granizo</option>
                    <option value="raios">Raios e rajadas sobre aglomeração</option>
                    <option value="tornado">Tornado / microexplosão</option>
                    <option value="lento">Umidade baixa, calor, frio ou ressaca</option>
                  </select>
                </label>
              )}
              <label className="col-span-2">
                <span className={rotulo}>Situação</span>
                <select className={campo} value={dec.situacao} onChange={(e) => setDec({ ...dec, situacao: e.target.value as EntradaDecisao["situacao"] })}>
                  <option value="prev">{dec.equipe === "met" ? "Apenas previsto em modelo" : "Apenas previsto (gatilho não atingido)"}</option>
                  <option value="gat">{dec.equipe === "met" ? "Já detectado (radar / descargas / estações)" : "Gatilho atingido por chuva observada / recomendação de mobilização"}</option>
                  <option value="curso">{dec.equipe === "met" ? "Em curso com ocorrências registradas" : "Em curso com ocorrências ou agravamento após mobilização"}</option>
                </select>
              </label>
              <label>
                <span className={rotulo}>Quando chega o impacto?</span>
                <select className={campo} value={dec.antecedencia} onChange={(e) => setDec({ ...dec, antecedencia: e.target.value as EntradaDecisao["antecedencia"] })}>
                  <option value="mais">Mais de 2 h</option>
                  <option value="ate">Em até 2 h</option>
                </select>
              </label>
              <div className="flex flex-col justify-end gap-1 text-xs text-gray-700">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={dec.area} onChange={(e) => setDec({ ...dec, area: e.target.checked })} /> Área delimitada</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={dec.pop} onChange={(e) => setDec({ ...dec, pop: e.target.checked })} /> População exposta</label>
                {dec.equipe === "met" && dec.fenomeno === "chuva" && <label className="flex items-center gap-1.5"><input type="checkbox" checked={dec.monitorada} onChange={(e) => setDec({ ...dec, monitorada: e.target.checked })} /> Área com monitoramento hidro/geo</label>}
              </div>
            </div>
            <div className="rounded-md p-2" style={{ background: ESCALA_NM[resultado.nivel].cor, color: corTextoSobre(ESCALA_NM[resultado.nivel].cor) }}>
              <p className="text-base font-bold leading-tight">{ESCALA_NM[resultado.nivel].sigla} · {ESCALA_NM[resultado.nivel].nome}</p>
              <p className="text-xs">{ESCALA_NM[resultado.nivel].alerta}</p>
            </div>
            <ul className="space-y-1 text-xs">
              {resultado.notas.map((t) => <li key={t} className="text-gray-700">{t}</li>)}
              {resultado.avisos.map((t) => <li key={t} className="font-medium text-amber-700">{t}</li>)}
              {resultado.impedimentos.map((t) => <li key={t} className="font-medium text-red-700">{t}</li>)}
            </ul>
            <button
              type="button"
              className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900"
              onClick={() => {
                trocarNivel(resultado.nivel);
                setF((x) => ({ ...x, nivel: resultado.nivel, equipe: dec.equipe, antecedencia: dec.antecedencia === "ate" ? "ate_2h" : "mais_2h", area: dec.area, pop: dec.pop }));
                setAssistente(false);
              }}
            >
              Usar este nível no formulário
            </button>
            <p className="text-[11px] text-gray-500">O assistente aplica as regras do PLANCON; a decisão final é do técnico responsável e da aprovação prevista no item 2.6.4.</p>
          </div>
        )}
      </div>

      {/* nível */}
      <div>
        <span className={rotulo}>Nível de Monitoramento</span>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {NIVEIS_NM.map((n) => {
            const e = ESCALA_NM[n];
            const ativo = f.nivel === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => trocarNivel(n)}
                aria-pressed={ativo}
                className={`rounded-md border-2 px-1 py-1.5 text-center text-xs font-bold leading-tight ${ativo ? "border-gray-900 shadow" : "border-transparent opacity-80 hover:opacity-100"}`}
                style={{ background: e.cor, color: corTextoSobre(e.cor) }}
              >
                {e.sigla}
                <span className="block text-[10px] font-semibold">{e.nome}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-gray-500">{L.alerta} · {L.nr}</p>
      </div>

      {f.nivel <= 1 && algumAtivo && (
        <label className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          <input type="checkbox" className="mt-0.5" checked={f.encerramento} onChange={(e) => set("encerramento", e.target.checked)} />
          <span>Retorno à normalidade: <b>encerrar/cancelar o alerta vigente</b> (padrão CAP) — não é um alerta novo.</span>
        </label>
      )}

      {f.nivel >= 2 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={rotulo}>Equipe que originou</span>
              <select className={campo} value={f.equipe} onChange={(e) => set("equipe", e.target.value)}>
                <option value="">—</option>
                {Object.entries(dados.equipes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              <span className={rotulo}>Quando chega o impacto?</span>
              <select className={campo} value={f.antecedencia} onChange={(e) => set("antecedencia", e.target.value)}>
                <option value="">—</option>
                {Object.entries(dados.antecedencias).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.area} onChange={(e) => set("area", e.target.checked)} /> Área delimitada (polígono/KMZ)</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.pop} onChange={(e) => set("pop", e.target.checked)} /> População exposta</label>
          </div>
          <label className="block">
            <span className={rotulo}>Motivo / justificativa técnica{f.nivel >= 3 ? " *" : ""}</span>
            <textarea className={`${campo} min-h-[3.5rem]`} value={f.motivo} onChange={(e) => set("motivo", e.target.value)} placeholder="Ex.: gatilho II atingido na estação X (92 mm em 24 h); radar mostra célula em direção a …" />
          </label>
          <div>
            <span className={rotulo}>Ferramentas da Idap usadas</span>
            <div className="flex flex-wrap gap-1.5">
              {ferrDisponiveis.map((t) => {
                const on = f.ferramentas.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => set("ferramentas", on ? f.ferramentas.filter((x) => x !== t) : [...f.ferramentas, t])} className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700"}`}>
                    {t}
                  </button>
                );
              })}
            </div>
            {!podeTvDca && <p className="mt-1 text-[11px] text-gray-500">TV por assinatura e DCA só no NM 4 e NM 5.</p>}
          </div>
          <label className="block">
            <span className={rotulo}>Vigência (horas, máx. {dados.vigencia_max_h})</span>
            <input type="number" min={1} max={dados.vigencia_max_h} className={`${campo} w-28`} value={f.horas} onChange={(e) => set("horas", Number(e.target.value))} />
          </label>
        </>
      )}

      {f.nivel >= 4 && (
        <div className="space-y-2 rounded-md border border-purple-200 bg-purple-50 p-2.5">
          <p className="text-xs font-semibold text-purple-900">Antes de enviar {L.sigla} – {L.nome}</p>
          <label className="block">
            <span className={rotulo}>Aprovado por (Diretor ou Oficial de Ligação) *</span>
            <input className={campo} value={f.aprovado} onChange={(e) => set("aprovado", e.target.value)} />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label>
              <span className={rotulo}>COMDEC avisada em *</span>
              <div className="flex gap-1">
                <input type="datetime-local" className={campo} value={f.comdec} onChange={(e) => set("comdec", e.target.value)} />
                <button type="button" className="shrink-0 rounded border border-gray-300 bg-white px-2 text-xs" onClick={() => set("comdec", agoraLocal())}>agora</button>
              </div>
            </label>
            <label>
              <span className={rotulo}>REDEC avisada em *</span>
              <div className="flex gap-1">
                <input type="datetime-local" className={campo} value={f.redec} onChange={(e) => set("redec", e.target.value)} />
                <button type="button" className="shrink-0 rounded border border-gray-300 bg-white px-2 text-xs" onClick={() => set("redec", agoraLocal())}>agora</button>
              </div>
            </label>
          </div>
          {f.nivel === 5 && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={f.simultaneo} onChange={(e) => set("simultaneo", e.target.checked)} /> Aviso simultâneo ao envio (risco iminente — só NM 5)</label>
              {f.simultaneo && <input className={campo} placeholder="Motivo do aviso simultâneo" value={f.avisoMotivo} onChange={(e) => set("avisoMotivo", e.target.value)} />}
            </>
          )}
        </div>
      )}

      {avisosLocais.length > 0 && (
        <ul className="space-y-0.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" aria-live="polite">
          {avisosLocais.map((t) => <li key={t}>• {t}</li>)}
        </ul>
      )}
      {erros.length > 0 && (
        <ul className="space-y-0.5 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert">
          {erros.map((t) => <li key={t}>• {t}</li>)}
        </ul>
      )}
      {ok && <p className="rounded-md border border-green-200 bg-green-50 p-2 text-xs font-medium text-green-800" role="status">{ok}</p>}

      <button
        type="button"
        onClick={enviar}
        disabled={enviando || selecionados.length === 0}
        className="w-full rounded-md px-3 py-2 text-sm font-bold shadow-sm disabled:opacity-50"
        style={{ background: L.cor, color: corTextoSobre(L.cor) }}
      >
        {enviando ? "Registrando…" : `Registrar ${L.sigla} – ${L.nome}${selecionados.length ? ` em ${selecionados.length} município(s)` : ""}`}
      </button>
    </div>
  );
}
