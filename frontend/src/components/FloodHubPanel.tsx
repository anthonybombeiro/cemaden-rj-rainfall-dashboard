"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ATRIBUICAO_FH,
  ESTILO_SEVERIDADE,
  FloodHubResposta,
  PostoFH,
  ROTULO_TENDENCIA,
  ValidacaoLinha,
  fetchFloodHub,
  fetchFloodHubValidacao,
  severidadeEfetiva,
} from "@/lib/floodhub";

/** Aba "Flood Hub" (Dados → Flood Hub): situação e previsão de cheias do Google por posto, alertas
 * informativos e validação (Flood Hub × cota observada). Regras em docs/floodhub.md. */

export function ChipSeveridade({ sev }: { sev: string | null | undefined }) {
  if (!sev) return <span className="text-gray-400">—</span>;
  const e = ESTILO_SEVERIDADE[sev] ?? ESTILO_SEVERIDADE.UNKNOWN;
  return (
    <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: e.bg, color: e.text }}>
      {e.rotulo}
    </span>
  );
}

const fmtNum = (v: number | null | undefined, c = 1) => (v == null ? "—" : v.toFixed(c).replace(".", ","));
const fmtDataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function BlocoAlertasFH({ alertas }: { alertas: PostoFH[] }) {
  if (alertas.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        Nenhum posto verificado do Flood Hub em “acima do normal” ou pior, na situação atual ou na previsão.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-orange-300 bg-orange-50 p-3">
      <h3 className="mb-1 text-sm font-bold text-orange-900">Alerta informativo — Flood Hub ({alertas.length})</h3>
      <ul className="space-y-1 text-sm">
        {alertas.map((p) => (
          <li key={p.gauge_id} className="flex flex-wrap items-center gap-2">
            <ChipSeveridade sev={severidadeEfetiva(p)} />
            <span className="font-medium">{p.nome}</span>
            <span className="text-gray-600">{[p.rio, p.municipio].filter(Boolean).join(" · ")}</span>
            {p.tendencia && <span className="text-xs text-gray-500">{ROTULO_TENDENCIA[p.tendencia]}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-orange-800">Informativo: não aciona sirene nem substitui o protocolo.</p>
    </div>
  );
}

export default function FloodHubPanel({ onOpenStation }: { onOpenStation?: (id: number) => void }) {
  const [sub, setSub] = useState<"postos" | "validacao">("postos");
  const [todos, setTodos] = useState(false);
  const [dados, setDados] = useState<FloodHubResposta | null>(null);
  const [validacao, setValidacao] = useState<ValidacaoLinha[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro("");
    Promise.all([fetchFloodHub({ todos }), fetchFloodHubValidacao(14)])
      .then(([d, v]) => {
        setDados(d);
        setValidacao(v.linhas);
      })
      .catch(() => setErro("Não foi possível carregar o Flood Hub agora."))
      .finally(() => setCarregando(false));
  }, [todos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const resumoValidacao = useMemo(() => {
    const comRes = (validacao ?? []).filter((l) => l.resultado);
    const ok = comRes.filter((l) => l.resultado === "Confere").length;
    return { total: comRes.length, ok };
  }, [validacao]);

  return (
    <div className="h-full w-full overflow-y-auto overflow-x-hidden bg-gray-50 p-3 pb-6 md:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 text-base font-bold">Google Flood Hub — cheias em rios</h2>
        <div className="flex w-full flex-wrap items-center gap-2 text-xs md:ml-auto md:w-auto">
          <span className="text-gray-500">Atualizado: {fmtDataHora(dados?.atualizado_em ?? null)}</span>
          <button type="button" onClick={carregar} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1">
            <RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </div>

      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {dados && <BlocoAlertasFH alertas={dados.alertas} />}

      <div className="my-3 flex flex-wrap gap-1.5">
        {(
          [
            ["postos", "Postos e previsão"],
            ["validacao", "Validação (Flood Hub × observado)"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${sub === k ? "bg-blue-600 text-white" : "bg-white text-gray-700 shadow-sm"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {dados && sub === "postos" && (
        <>
          <label className="mb-2 flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
            Incluir postos ainda não verificados pelo Google ({dados.total_nao_verificados}) — usar com cautela
          </label>
          <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-gray-100 text-left text-[11px] uppercase text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Situação</th>
                  <th className="px-2 py-1.5">Posto / rio</th>
                  <th className="px-2 py-1.5">Município</th>
                  <th className="px-2 py-1.5">Tendência</th>
                  <th className="px-2 py-1.5 text-right">Pico previsto</th>
                  <th className="px-2 py-1.5">Previsão</th>
                  <th className="px-2 py-1.5 text-right">Limiares (atenção / perigo / extremo)</th>
                  <th className="px-2 py-1.5">Estação nossa</th>
                  <th className="px-2 py-1.5">Emitido</th>
                </tr>
              </thead>
              <tbody>
                {dados.postos.map((p) => (
                  <tr key={p.gauge_id} className="border-t border-gray-100 align-top">
                    <td className="px-2 py-1"><ChipSeveridade sev={p.severidade} /></td>
                    <td className="px-2 py-1">
                      <div className="font-medium">{p.nome}</div>
                      <div className="text-[10px] text-gray-500">
                        {p.rio || "—"} · {p.fonte === "HYBAS" ? "ponto virtual" : p.fonte}{p.verificado ? "" : " · não verificado"}{p.tem_modelo ? "" : " · sem previsão"}
                      </div>
                    </td>
                    <td className="px-2 py-1">{p.municipio || "fora do RJ"}</td>
                    <td className="px-2 py-1">{p.tendencia ? ROTULO_TENDENCIA[p.tendencia] : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {p.previsao?.pico != null ? `${fmtNum(p.previsao.pico, 0)} ${p.unidade === "CUBIC_METERS_PER_SECOND" ? "m³/s" : "m"}` : "—"}
                    </td>
                    <td className="px-2 py-1"><ChipSeveridade sev={p.previsao?.severidade_prevista} /></td>
                    <td className="px-2 py-1 text-right tabular-nums text-gray-600">
                      {p.limiares.atencao != null ? `${fmtNum(p.limiares.atencao, 0)} / ${fmtNum(p.limiares.perigo, 0)} / ${fmtNum(p.limiares.extremo, 0)}` : "—"}
                    </td>
                    <td className="px-2 py-1">
                      {p.estacao ? (
                        <button type="button" className="text-left text-blue-700 hover:underline" onClick={() => onOpenStation?.(p.estacao!.id)}>
                          {p.estacao.nome} <span className="text-gray-500">({fmtNum(p.estacao.distancia_km)} km)</span>
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-gray-600">{fmtDataHora(p.emitido_em)}</td>
                  </tr>
                ))}
                {dados.postos.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-2 py-4 text-center text-gray-500">Nenhum posto.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-gray-500">
            Postos <b>ANA</b> são estações reais (só situação, sem previsão); postos <b>hybas</b> são pontos virtuais da rede de rios com
            modelo do Google (previsão de <b>vazão</b> em m³/s, não de nível). Severidade: Sem cheia, Acima do normal (vazão ≥ limiar de
            atenção), Severo (≥ perigo), Extremo (≥ extremo). {ATRIBUICAO_FH}
          </p>
        </>
      )}

      {dados && sub === "validacao" && (
        <>
          <p className="mb-2 text-xs text-gray-600">
            Compara, por dia (últimos 14), a severidade informada pelo Flood Hub com a classe da <b>cota</b> máxima observada na estação
            nossa mais próxima (até 3 km): normal ↔ Sem cheia, atenção ↔ Acima do normal, alerta/transbordo ↔ Severo, extrema ↔ Extremo.
            {resumoValidacao.total > 0 && ` Confere em ${resumoValidacao.ok} de ${resumoValidacao.total} comparações.`} O histórico começa em 16/10/2026 e
            se acumula a cada dia. Os postos do Google são pontos próximos, não o mesmo ponto da nossa régua: use como indicativo.
          </p>
          <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-gray-100 text-left text-[11px] uppercase text-gray-600">
                <tr>
                  <th className="px-2 py-1.5">Dia</th>
                  <th className="px-2 py-1.5">Estação</th>
                  <th className="px-2 py-1.5">Município</th>
                  <th className="px-2 py-1.5">Flood Hub</th>
                  <th className="px-2 py-1.5 text-right">Nível máx. (cm)</th>
                  <th className="px-2 py-1.5">Classe da cota</th>
                  <th className="px-2 py-1.5">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {(validacao ?? []).map((l) => (
                  <tr key={l.dia + l.gauge_id} className="border-t border-gray-100">
                    <td className="px-2 py-1 whitespace-nowrap">{l.dia.split("-").reverse().slice(0, 2).join("/")}</td>
                    <td className="px-2 py-1">
                      <button type="button" className="text-left text-blue-700 hover:underline" onClick={() => onOpenStation?.(l.estacao_id)}>
                        {l.estacao}
                      </button>
                    </td>
                    <td className="px-2 py-1">{l.municipio || "—"}</td>
                    <td className="px-2 py-1"><ChipSeveridade sev={l.floodhub} /></td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmtNum(l.nivel_max_cm)}</td>
                    <td className="px-2 py-1">{l.classe_cota ?? "—"}</td>
                    <td className="px-2 py-1">
                      {l.resultado ? (
                        <span className={l.resultado === "Confere" ? "text-emerald-700" : "text-amber-700"}>{l.resultado}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {(validacao ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-4 text-center text-gray-500">Ainda sem dias para comparar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
