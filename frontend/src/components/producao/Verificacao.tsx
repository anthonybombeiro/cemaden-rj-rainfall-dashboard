"use client";

import { FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { exportarPng, exportarXlsx } from "@/lib/exportacao";
import { nomeRegiao } from "@/lib/producaoMet";
import {
  CAT, classeTemp, COR_TEMP, Diferenca, dm, fetchDiferencas, fetchVerificacaoAno, fetchVerificacaoMes, fmt, fmtTemp, Indices, NOMES_CAMPO, VerificacaoAno, VerificacaoMes,
} from "@/lib/verificacao";

type Aba = "chuva" | "indices" | "temperatura" | "faltas" | "diferencas";
const ABAS: { key: Aba; rotulo: string }[] = [
  { key: "chuva", rotulo: "Chuva (calendário)" },
  { key: "indices", rotulo: "Índices (Wilks)" },
  { key: "temperatura", rotulo: "Temperatura" },
  { key: "faltas", rotulo: "Sem dados / possíveis erros" },
  { key: "diferencas", rotulo: "Planilha × painel" },
];
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const curto = (r: string) => nomeRegiao(r).replace("Baixada Fluminense", "B. Flum.").replace("Baixada Litorânea", "B. Litor.").replace("Metropolitana", "Metrop.");

function TabelaIndices({ linhas }: { linhas: { nome: string; ix: Indices }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-gray-500">
          <tr>
            <th className="py-1 text-left">REDEC</th><th title="acertos">a</th><th title="falsos alarmes">b</th><th title="omissões">c</th><th title="acertos negativos">d</th><th>n</th>
            <th title="(a+d)/n">Acurácia</th><th title="a/(a+b+c)">Threat score</th><th title="(a+b)/(a+c)">BIAS</th><th title="b/(a+b)">FAR</th><th title="a/(a+c)">POD</th>
            <th title="a·d / b·c (Wilks)">Razão de possibilidades</th><th title="(a+d)/(b+c), como na planilha antiga">(a+d)/(b+c)</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ nome, ix }, i) => (
            <tr key={nome} className={`border-t border-gray-100 text-center ${i === linhas.length - 1 && nome === "Total" ? "bg-gray-50 font-semibold" : ""}`}>
              <td className="py-1 text-left">{nome}</td><td>{ix.a}</td><td>{ix.b}</td><td>{ix.c}</td><td>{ix.d}</td><td>{ix.n}</td>
              <td>{fmt(ix.acuracia)}</td><td>{fmt(ix.threat_score)}</td><td>{fmt(ix.bias)}</td><td>{fmt(ix.far)}</td><td>{fmt(ix.pod)}</td><td>{fmt(ix.razao_possibilidades, 2)}</td><td>{fmt(ix.razao_acertos_erros, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/** Escala de cor da magnitude (0 → 1): vermelho → laranja → amarelo → verde-oliva → verde, como no heatmap sugerido pela meteorologia. */
const PARADAS: [number, [number, number, number]][] = [
  [0, [196, 68, 68]], [0.33, [226, 154, 105]], [0.5, [242, 210, 124]], [0.67, [186, 186, 122]], [1, [66, 149, 112]],
];
function corMagnitude(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "#f3f4f6";
  const x = Math.max(0, Math.min(1, v));
  for (let i = 1; i < PARADAS.length; i++) {
    const [p1, c1] = PARADAS[i];
    if (x <= p1) {
      const [p0, c0] = PARADAS[i - 1];
      const t = (x - p0) / (p1 - p0 || 1);
      return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * t)).join(",")})`;
    }
  }
  return "#429570";
}

/** Heatmap de Acurácia, CSI (threat score), FAR e POD por REDEC + gráfico de barras da razão acertos/erros (a+d)/(b+c). */
function IndicesVisual({ linhas, titulo }: { linhas: { nome: string; ix: Indices }[]; titulo: string }) {
  const [qualidade, setQualidade] = useState(false); // false = cor por magnitude (FAR baixo = vermelho); true = FAR invertido (baixo = verde)
  const cols: { k: "acuracia" | "threat_score" | "far" | "pod"; rot: string; dica: string }[] = [
    { k: "acuracia", rot: "Acurácia", dica: "(a+d)/n: fração de previsões corretas" },
    { k: "threat_score", rot: "CSI", dica: "a/(a+b+c): índice de sucesso crítico (threat score)" },
    { k: "far", rot: "FAR", dica: "b/(a+b): taxa de falsos alarmes — QUANTO MENOR, MELHOR" },
    { k: "pod", rot: "POD", dica: "a/(a+c): probabilidade de detecção" },
  ];
  const razoes = linhas.map(({ nome, ix }) => ({ nome, v: ix.razao_acertos_erros, n: ix.n, b: ix.b, c: ix.c }));
  const finitos = razoes.map((r) => r.v).filter((v): v is number => v !== null);
  const maxR = Math.max(2, ...finitos);
  const pos = (v: number) => `${Math.min(100, (v / maxR) * 100)}%`;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Mapa de calor — {titulo}</h3>
          <label className="ml-auto flex cursor-pointer items-center gap-1 text-[11px] text-gray-600">
            <input type="checkbox" checked={qualidade} onChange={(e) => setQualidade(e.target.checked)} /> inverter o FAR (verde = bom)
          </label>
        </div>
        <table className="w-full border-separate text-center text-xs" style={{ borderSpacing: 3 }}>
          <thead><tr className="text-gray-600"><th className="py-1 text-left">REDEC</th>{cols.map((c) => <th key={c.k} title={c.dica} className="py-1">{c.rot}{c.k === "far" ? " ↓" : ""}</th>)}</tr></thead>
          <tbody>
            {linhas.map(({ nome, ix }) => (
              <tr key={nome} className={nome === "Total" ? "font-semibold" : ""}>
                <td className="py-1 text-left">{nome}</td>
                {cols.map((c) => {
                  const v = ix[c.k];
                  const cor = corMagnitude(v === null ? null : c.k === "far" && qualidade ? 1 - v : v);
                  return <td key={c.k} title={`${nome} — ${c.dica}`} className="rounded py-1.5 text-gray-900" style={{ background: cor }}>{fmt(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
          <span>0 — Baixo</span>
          <span className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${[0, 0.33, 0.5, 0.67, 1].map((x) => corMagnitude(x)).join(",")})` }} />
          <span>1 — Alto</span>
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          {qualidade ? "FAR invertido: verde = poucos falsos alarmes (bom). " : "Cores indicam magnitude, não qualidade. "}
          <b>FAR é um índice em que quanto menor, melhor</b>; nos demais (acurácia, CSI, POD) quanto maior, melhor. Células em cinza = sem casos para calcular.
        </p>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Razão entre acertos e erros por REDEC — (a+d)/(b+c)</h3>
        <div className="space-y-1">
          {razoes.map((r) => {
            const semErros = r.v === null && r.n > 0 && r.b + r.c === 0;
            const valor = semErros ? maxR : r.v;
            const cor = valor === null ? "#d1d5db" : valor > 1 ? "#429570" : valor === 1 ? "#e0b84a" : "#c44444";
            return (
              <div key={r.nome} className="flex items-center gap-2 text-xs">
                <span className="w-28 shrink-0 truncate text-right" title={r.nome}>{r.nome}</span>
                <div className="relative h-5 flex-1 rounded bg-gray-100">
                  {valor !== null && <div className="h-5 rounded" style={{ width: pos(valor), background: cor }} />}
                  <div className="absolute inset-y-0 border-l-2 border-dashed border-gray-500" style={{ left: pos(1) }} title="R = 1: acertos = erros" />
                </div>
                <span className="w-24 shrink-0 font-semibold">{semErros ? "∞ (sem erros)" : fmt(r.v, 2)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          R &lt; 1: mais erros que acertos · R = 1: acertos e erros em igual número (linha tracejada) · R &gt; 1: mais acertos que erros. Quanto maior, melhor.
          Sem erros no período a razão é indefinida (barra cheia).
        </p>
      </div>
    </div>
  );
}

/** Resumo 24 h → Verificação: Previsto × Observado por REDEC (chuva e temperatura), com índices de Wilks e extremos. Critério de chuva:
 * > 1 mm em 1 h ou > 10 mm no dia. Tudo calculado pelo painel (comando diário) e corrigido pela planilha da equipe onde ela existe. */
export default function Verificacao() {
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState<Aba>("chuva");
  const [d, setD] = useState<VerificacaoMes | null>(null);
  const [ano, setAno] = useState<VerificacaoAno | null>(null);
  const [dif, setDif] = useState<Diferenca[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const alvo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    setD(null);
    fetchVerificacaoMes(mes).then((x) => vivo && (setD(x), setErro(null))).catch((e) => vivo && setErro(e instanceof Error ? e.message : "Falha ao carregar."));
    return () => { vivo = false; };
  }, [mes]);
  useEffect(() => {
    if (aba === "indices") fetchVerificacaoAno(Number(mes.slice(0, 4))).then(setAno).catch(() => setAno(null));
    if (aba === "diferencas" && !dif) fetchDiferencas().then((x) => setDif(x.diferencas)).catch(() => setDif([]));
  }, [aba, mes, dif]);

  const regs = d?.regioes ?? [];
  const xlsx = () => {
    if (!d) return;
    const cel = (c: (typeof d.dias)[number]["regioes"][string] | undefined) => (!c || c.cat === null ? "" : `${c.chuva_prev ? "S" : "N"}/${c.chuva_obs ? "S" : "N"}`);
    void exportarXlsx(`verificacao-${mes}.xlsx`, [
      { nome: "Chuva Prev-Obs", linhas: [["Data", ...regs.map(nomeRegiao)], ...d.dias.map((x) => [dm(x.data), ...regs.map((r) => cel(x.regioes[r]))])] },
      { nome: "Indices", linhas: [["REDEC", "a", "b", "c", "d", "n", "Acuracia", "Threat score", "BIAS", "FAR", "POD", "Razao de possibilidades (ad/bc)", "(a+d)/(b+c)"], ...[...regs.map((r) => [r, d.contingencia[r]] as const), ["Total", d.total] as const].map(([n, i]) => [n === "Total" ? n : nomeRegiao(n), i.a, i.b, i.c, i.d, i.n, i.acuracia, i.threat_score, i.bias, i.far, i.pod, i.razao_possibilidades, i.razao_acertos_erros])] },
      { nome: "Tmax obs", linhas: [["Data", ...regs.map(nomeRegiao)], ...d.dias.map((x) => [dm(x.data), ...regs.map((r) => x.regioes[r]?.tmax_obs ?? null)])] },
      { nome: "Tmin obs", linhas: [["Data", ...regs.map(nomeRegiao)], ...d.dias.map((x) => [dm(x.data), ...regs.map((r) => x.regioes[r]?.tmin_obs ?? null)])] },
      { nome: "Tmax prev", linhas: [["Data", ...regs.map(nomeRegiao)], ...d.dias.map((x) => [dm(x.data), ...regs.map((r) => x.regioes[r]?.tmax_prev ?? null)])] },
      { nome: "Tmin prev", linhas: [["Data", ...regs.map(nomeRegiao)], ...d.dias.map((x) => [dm(x.data), ...regs.map((r) => x.regioes[r]?.tmin_prev ?? null)])] },
      { nome: "Mensal por REDEC", linhas: [["REDEC", "Tmax", "Data", "Estação", "Tmin", "Data", "Estação"], ...regs.map((r) => { const t = d.temperatura_mensal[r]; return [nomeRegiao(r), t.tmax, dm(t.tmax_data), t.tmax_estacao, t.tmin, dm(t.tmin_data), t.tmin_estacao]; })] },
      { nome: "Extremos por estação", linhas: [["REDEC", "Estação", "Município", "Tmax", "Data", "Tmin", "Data", "Dias", "Dias com alerta"], ...d.estacoes_mes.map((e) => [nomeRegiao(e.regiao), e.estacao, e.municipio, e.tmax, dm(e.tmax_data), e.tmin, dm(e.tmin_data), e.dias, e.alertas])] },
      { nome: "Sem dados", linhas: [["Tipo", "Data", "REDECs"], ...(["chuva", "temperatura"] as const).flatMap((t) => d.dias_sem_dado[t].map((x) => [t, dm(x.data), x.regioes.map((r) => (r === "todas" ? r : nomeRegiao(r))).join(", ")]))] },
      { nome: "Possíveis erros", linhas: [["Data", "REDEC", "Descrição"], ...d.alertas.map((a) => [dm(a.data), nomeRegiao(a.regiao), a.texto])] },
    ]);
  };

  const th = "px-1 py-1 text-[10px] font-semibold text-gray-600";
  return (
    <div className="mx-auto max-w-[1400px] space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} className="rounded border border-gray-300 bg-white px-2 py-1" aria-label="Mês" />
        <div className="flex flex-wrap gap-1">
          {ABAS.map((a) => (
            <button key={a.key} type="button" onClick={() => setAba(a.key)} className={`rounded-full px-3 py-1 text-xs font-semibold ${aba === a.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{a.rotulo}</button>
          ))}
        </div>
        <span className="ml-auto flex gap-1.5">
          <button type="button" onClick={xlsx} disabled={!d} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50"><FileSpreadsheet size={13} /> XLSX</button>
          <button type="button" onClick={() => alvo.current && void exportarPng(alvo.current, `verificacao-${mes}-${aba}.png`)} disabled={!d} className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs hover:bg-gray-50"><ImageIcon size={13} /> PNG</button>
        </span>
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {!d && !erro && <p className="text-xs text-gray-500">Carregando…</p>}
      {d && (
        <div ref={alvo} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[11px] text-gray-500">Chuva observada: alguma estação da REDEC com mais de {d.criterio.chuva_1h_mm} mm em 1 h ou mais de {d.criterio.chuva_dia_mm} mm no dia. Células em branco = sem dado (não é zero).</p>

          {aba === "chuva" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-[11px]">{Object.entries(CAT).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: v.cor }} />{v.rotulo}</span>)}<span className="text-gray-500">Cada célula: previsto/observado (S = sim, N = não).</span></div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-center text-[11px]">
                  <thead><tr><th className={th}>Dia</th>{regs.map((r) => <th key={r} className={th}>{curto(r)}</th>)}</tr></thead>
                  <tbody>
                    {d.dias.map((x) => (
                      <tr key={x.data}>
                        <td className="border-t border-gray-100 px-1 text-left text-gray-600">{dm(x.data)}</td>
                        {regs.map((r) => {
                          const c = x.regioes[r];
                          const tip = c ? `${nomeRegiao(r)} — ${dm(x.data)}\nmáx. 1 h: ${fmt(c.chuva_max_1h, 1)} mm · máx. dia: ${fmt(c.chuva_max_24h, 1)} mm${c.chuva_estacao ? ` (${c.chuva_estacao})` : ""}${c.planilha.some((p) => p.startsWith("chuva")) ? "\n(valor da planilha)" : ""}` : "";
                          return <td key={r} title={tip} className="border border-white px-0.5 py-0.5" style={{ background: c?.cat ? CAT[c.cat].cor : "#f3f4f6" }}>{c && c.cat ? `${c.chuva_prev ? "S" : "N"}/${c.chuva_obs ? "S" : "N"}` : c && (c.chuva_prev !== null || c.chuva_obs !== null) ? `${c.chuva_prev === null ? "—" : c.chuva_prev ? "S" : "N"}/${c.chuva_obs === null ? "—" : c.chuva_obs ? "S" : "N"}` : ""}</td>;
                        })}
                      </tr>
                    ))}
                    {(["a", "b", "c", "d"] as const).map((k) => (
                      <tr key={k} className="font-semibold"><td className="border-t border-gray-200 px-1 text-left" style={{ color: "#374151" }}>{{ a: "Acertos", b: "Falsos alarmes", c: "Omissões", d: "Ac. negativos" }[k]}</td>{regs.map((r) => <td key={r} className="border-t border-gray-200" style={{ background: `${CAT[k].cor}66` }}>{d.contingencia[r][k]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aba === "indices" && (
            <div className="space-y-4">
              <IndicesVisual titulo={`mês selecionado (${mes.split("-").reverse().join("/")})`} linhas={[...regs.map((r) => ({ nome: nomeRegiao(r), ix: d.contingencia[r] })), { nome: "Total", ix: d.total }]} />
              {ano && <IndicesVisual titulo={`ano ${mes.slice(0, 4)}`} linhas={[...regs.map((r) => ({ nome: nomeRegiao(r), ix: ano.contingencia[r] })), { nome: "Total", ix: ano.total }]} />}
              <div>
                <h3 className="mb-1 text-sm font-semibold">Tabelas (mês selecionado)</h3>
                <TabelaIndices linhas={[...regs.map((r) => ({ nome: nomeRegiao(r), ix: d.contingencia[r] })), { nome: "Total", ix: d.total }]} />
              </div>
              {ano ? (
                <>
                  <div><h3 className="mb-1 text-sm font-semibold">Ano {mes.slice(0, 4)} por REDEC</h3><TabelaIndices linhas={[...regs.map((r) => ({ nome: nomeRegiao(r), ix: ano.contingencia[r] })), { nome: "Total", ix: ano.total }]} /></div>
                  <div><h3 className="mb-1 text-sm font-semibold">Ano {mes.slice(0, 4)} por mês (todas as REDECs)</h3><TabelaIndices linhas={ano.por_mes.filter((m) => m.n > 0).map((m) => ({ nome: String(m.mes).padStart(2, "0"), ix: m }))} /></div>
                </>
              ) : <p className="text-xs text-gray-500">Carregando o ano…</p>}
              <p className="text-[11px] text-gray-500">a = acertos · b = falsos alarmes · c = omissões · d = acertos negativos. Razão de possibilidades = a·d / b·c (Wilks); a coluna (a+d)/(b+c) reproduz a fórmula da planilha antiga. Fonte: Wilks.</p>
            </div>
          )}

          {aba === "temperatura" && <Temperatura d={d} regs={regs} th={th} />}

          {aba === "faltas" && (
            <div className="grid gap-4 md:grid-cols-2">
              {(["chuva", "temperatura"] as const).map((t) => (
                <div key={t}>
                  <h3 className="mb-1 text-sm font-semibold">{t === "chuva" ? "Dias sem chuva observada" : "Dias sem temperatura observada"} ({d.dias_sem_dado[t].length})</h3>
                  {d.dias_sem_dado[t].length === 0 ? <p className="text-xs text-emerald-700">Nenhum.</p> : (
                    <table className="w-full text-xs"><tbody>{d.dias_sem_dado[t].map((x) => <tr key={x.data} className="border-t border-gray-100"><td className="w-14 py-0.5">{dm(x.data)}</td><td className="text-gray-600">{x.regioes.map((r) => (r === "todas" ? "todas as REDECs" : nomeRegiao(r))).join(", ")}</td></tr>)}</tbody></table>
                  )}
                </div>
              ))}
              <div className="md:col-span-2">
                <h3 className="mb-1 text-sm font-semibold">Possíveis erros de dado, para avaliação do técnico ({d.alertas.length})</h3>
                {d.alertas.length === 0 ? <p className="text-xs text-emerald-700">Nenhum no mês.</p> : (
                  <table className="w-full text-xs"><tbody>{d.alertas.map((a, i) => <tr key={i} className="border-t border-gray-100"><td className="w-14 py-0.5">{dm(a.data)}</td><td className="w-28">{nomeRegiao(a.regiao)}</td><td className="text-amber-800">⚠ {a.texto}</td></tr>)}</tbody></table>
                )}
              </div>
            </div>
          )}

          {aba === "diferencas" && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Onde a planilha e o painel discordam ({dif?.length ?? "…"})</h3>
              <p className="mb-2 text-[11px] text-gray-500">O valor da planilha é o usado; o do painel está aqui só para conferência (temperatura: diferença maior que 0,5 °C).</p>
              {dif && dif.length > 0 && (
                <div className="max-h-[60vh] overflow-auto">
                  <table className="w-full text-xs"><thead className="text-gray-500"><tr><th className="text-left">Data</th><th className="text-left">REDEC</th><th className="text-left">Campo</th><th>Planilha</th><th>Painel</th></tr></thead>
                    <tbody>{dif.map((x, i) => { const sn = (v: boolean | number) => (typeof v === "boolean" ? (v ? "Sim" : "Não") : fmtTemp(v)); return <tr key={i} className="border-t border-gray-100 text-center"><td className="py-0.5 text-left">{x.data.split("-").reverse().join("/")}</td><td className="text-left">{nomeRegiao(x.regiao)}</td><td className="text-left">{NOMES_CAMPO[x.campo] ?? x.campo}</td><td>{sn(x.planilha)}</td><td>{sn(x.painel)}</td></tr>; })}</tbody></table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Temperatura({ d, regs, th }: { d: VerificacaoMes; regs: string[]; th: string }) {
  const [tipo, setTipo] = useState<"tmax" | "tmin">("tmax");
  const pontos = useMemo(() => d.dias, [d]);
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 text-xs">
        {(["tmax", "tmin"] as const).map((t) => <button key={t} type="button" onClick={() => setTipo(t)} className={`rounded-full px-3 py-1 font-semibold ${tipo === t ? "bg-blue-600 text-white" : "bg-gray-100"}`}>{t === "tmax" ? "Máximas" : "Mínimas"}</button>)}
        <span className="self-center text-[11px] text-gray-500">Observado (°C); cor = diferença para o previsto: verde ≤ 2, amarelo ≤ 4, vermelho acima. ⚠ = possível erro de dado. Em branco = sem dado.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-[11px]">
          <thead><tr><th className={th}>Dia</th>{regs.map((r) => <th key={r} className={th}>{curto(r)}</th>)}</tr></thead>
          <tbody>
            {pontos.map((x) => (
              <tr key={x.data}>
                <td className="border-t border-gray-100 px-1 text-left text-gray-600">{dm(x.data)}</td>
                {regs.map((r) => {
                  const c = x.regioes[r];
                  const obs = c ? (tipo === "tmax" ? c.tmax_obs : c.tmin_obs) : null;
                  const prev = c ? (tipo === "tmax" ? c.tmax_prev : c.tmin_prev) : null;
                  const k = classeTemp(obs, prev);
                  const est = c ? (tipo === "tmax" ? c.tmax_estacao : c.tmin_estacao) : "";
                  const alerta = c?.alertas.some((a) => a.includes(tipo === "tmax" ? "Tmax" : "Tmin"));
                  return <td key={r} title={obs === null ? "" : `previsto ${prev ?? "—"} °C · ${est || "valor da planilha"}`} className="border border-white px-0.5 py-0.5" style={{ background: k ? COR_TEMP[k] : "#f3f4f6" }}>{fmtTemp(obs)}{alerta ? " ⚠" : ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-semibold">Extremos do mês por REDEC</h3>
          <table className="w-full text-xs"><thead className="text-gray-500"><tr><th className="text-left">REDEC</th><th>Tmax</th><th className="text-left">Dia / estação</th><th>Tmin</th><th className="text-left">Dia / estação</th></tr></thead>
            <tbody>{regs.map((r) => { const t = d.temperatura_mensal[r]; return <tr key={r} className="border-t border-gray-100 text-center"><td className="py-0.5 text-left">{nomeRegiao(r)}</td><td className="font-semibold text-red-700">{fmtTemp(t.tmax)}</td><td className="text-left text-gray-600">{dm(t.tmax_data)} {t.tmax_estacao}</td><td className="font-semibold text-blue-700">{fmtTemp(t.tmin)}</td><td className="text-left text-gray-600">{dm(t.tmin_data)} {t.tmin_estacao}</td></tr>; })}</tbody></table>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">Extremos do mês por estação ({d.estacoes_mes.length})</h3>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-xs"><thead className="sticky top-0 bg-white text-gray-500"><tr><th className="text-left">Estação</th><th className="text-left">REDEC</th><th>Tmax</th><th>Tmin</th><th>⚠</th></tr></thead>
              <tbody>{d.estacoes_mes.map((e) => <tr key={`${e.regiao}${e.estacao}`} className="border-t border-gray-100 text-center"><td className="py-0.5 text-left">{e.estacao}<span className="text-gray-400"> · {e.municipio}</span></td><td className="text-left">{curto(e.regiao)}</td><td title={dm(e.tmax_data)}>{fmtTemp(e.tmax)}</td><td title={dm(e.tmin_data)}>{fmtTemp(e.tmin)}</td><td>{e.alertas || ""}</td></tr>)}</tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}
