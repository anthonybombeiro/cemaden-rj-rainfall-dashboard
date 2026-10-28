"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import MapaNiveis from "@/components/monitoramento/MapaNiveis";
import RiskChoroplethMap from "@/components/RiskChoroplethMap";
import { normalizeMunicipioName, RISK_ALERT_TIPO_LABELS, RISK_LEVEL_COLORS, RISK_LEVEL_LABELS, RiskAlert, RiskAlertTipo, RiskLevel } from "@/lib/api";
import { corTextoSobre, ESCALA_NM, fetchPublico, fmtDataHora, NIVEIS_NM, PublicoResposta, SIGNIFICADO_NM } from "@/lib/nivelMonitoramento";

const TIPOS: RiskAlertTipo[] = ["hidrologico", "geologico", "meteorologico", "incendio"];
const NIVEIS_RISCO: RiskLevel[] = ["muito_baixo", "baixo", "moderado", "alto", "muito_alto"];

/** Página pública (sem login) do Nível de Monitoramento do CEMADEN-RJ: nível vigente por município e visão geral dos mapas de risco,
 * para as COMDECs e demais órgãos de proteção e defesa civil. Só leitura; atualiza sozinha a cada minuto. */
export default function PublicoMonitoramento() {
  const [d, setD] = useState<PublicoResposta | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(() => {
    fetchPublico().then((r) => { setD(r); setErro(false); }).catch(() => setErro(true));
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(() => { if (document.visibilityState === "visible") carregar(); }, 60_000);
    return () => clearInterval(t);
  }, [carregar]);

  const regiaoPorMunicipio = useMemo(() => Object.fromEntries((d?.niveis ?? []).map((n) => [normalizeMunicipioName(n.municipio), n.regiao])), [d]);
  const maior = d ? Math.max(...d.niveis.map((n) => n.nivel)) : 0;
  const ativos = useMemo(() => (d?.niveis ?? []).filter((n) => n.nivel >= 2).sort((a, b) => b.nivel - a.nivel || a.regiao.localeCompare(b.regiao) || a.municipio.localeCompare(b.municipio)), [d]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-[#1f3864] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-cemadenrj.png" alt="CEMADEN-RJ" className="h-9 w-auto self-start sm:h-10" />
          <div className="min-w-0 sm:flex-1">
            <h1 className="text-base font-extrabold leading-tight sm:text-xl">Nível de Monitoramento — Estado do Rio de Janeiro</h1>
            <p className="text-xs text-blue-100">CEMADEN-RJ · Defesa Civil RJ · PLANCON 2026/2027</p>
          </div>
          <p className="text-xs text-blue-100 sm:text-right">{d ? `Atualizado em ${fmtDataHora(d.gerado_em)}` : erro ? "Sem conexão" : "Carregando…"}</p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-4">
        {erro && !d && <p className="rounded bg-red-50 p-3 text-sm text-red-700">Não foi possível carregar os dados agora. Tente novamente em instantes.</p>}
        {d && (
          <>
            <section aria-label="Resumo" className="rounded-lg p-3 shadow-sm" style={{ background: ESCALA_NM[maior].cor, color: corTextoSobre(ESCALA_NM[maior].cor) }}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Maior nível vigente agora</p>
              <p className="text-2xl font-extrabold leading-tight">{ESCALA_NM[maior].sigla} · {ESCALA_NM[maior].nome}</p>
              <p className="text-sm">{maior === 0 ? "Todos os municípios em rotina de monitoramento." : `${d.resumo[String(maior)]} município(s) neste nível. ${SIGNIFICADO_NM[maior].acao}`}</p>
            </section>

            <section aria-labelledby="mapa-nm" className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div>
                <h2 id="mapa-nm" className="mb-2 text-sm font-bold text-gray-800">Mapa do Nível de Monitoramento por município</h2>
                <MapaNiveis niveis={d.niveis} rotuloMin={3} altura="min(75vh, 620px)" />
                <p className="mt-1 text-[11px] text-gray-500">Contorno azul: regionais de Defesa Civil (REDEC). Passe o mouse ou toque num município para ver o nível. Hachurado = vigência vencida, em revisão.</p>
              </div>
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-gray-800">Os seis níveis</h2>
                {NIVEIS_NM.map((n) => (
                  <div key={n} className="flex gap-2 rounded-md border border-gray-200 bg-white p-2 text-xs">
                    <span className="flex h-9 w-14 shrink-0 flex-col items-center justify-center rounded font-bold leading-tight" style={{ background: ESCALA_NM[n].cor, color: corTextoSobre(ESCALA_NM[n].cor) }}>
                      <span>{ESCALA_NM[n].sigla}</span>
                      <span className="text-[9px]">{d.resumo[String(n)] ?? 0} mun.</span>
                    </span>
                    <span className="min-w-0">
                      <b className="text-gray-800">{ESCALA_NM[n].nome}</b> — {SIGNIFICADO_NM[n].quando}
                      <span className="block text-gray-500">Ação: {SIGNIFICADO_NM[n].acao}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="lista-nm">
              <h2 id="lista-nm" className="mb-2 text-sm font-bold text-gray-800">Municípios em NM 2 ou acima</h2>
              {ativos.length === 0 ? (
                <p className="rounded bg-white p-3 text-sm text-gray-600 shadow-sm">Nenhum município acima do NM 1 neste momento.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Município</th><th className="px-3 py-2">Regional</th><th className="px-3 py-2">Nível</th><th className="px-3 py-2">Vigência</th></tr></thead>
                    <tbody>
                      {ativos.map((n) => (
                        <tr key={n.municipio} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 font-medium">{n.municipio}</td>
                          <td className="px-3 py-1.5 text-gray-600">{n.regiao}</td>
                          <td className="px-3 py-1.5"><span className="whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold" style={{ background: ESCALA_NM[n.nivel].cor, color: corTextoSobre(ESCALA_NM[n.nivel].cor) }}>{ESCALA_NM[n.nivel].sigla} {ESCALA_NM[n.nivel].nome}</span></td>
                          <td className={`px-3 py-1.5 text-xs ${n.vencida ? "font-semibold text-red-600" : "text-gray-600"}`}>{n.vencida ? "Vencida — em revisão" : n.vigencia_ate ? `até ${fmtDataHora(n.vigencia_ate)}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="riscos">
              <h2 id="riscos" className="mb-2 text-sm font-bold text-gray-800">Visão geral dos mapas de risco</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {TIPOS.map((tipo) => {
                  const lista = d.riscos.filter((r) => r.tipo === tipo) as unknown as RiskAlert[];
                  return (
                    <div key={tipo} className="rounded-lg border border-gray-200 bg-white p-2">
                      <h3 className="mb-1 text-xs font-semibold text-gray-800">{RISK_ALERT_TIPO_LABELS[tipo]}</h3>
                      <div className="h-72">
                        <RiskChoroplethMap tipo={tipo} redecAlerts={lista.filter((r) => !r.municipio)} municipioAlerts={lista.filter((r) => r.municipio)} municipioRedecMap={regiaoPorMunicipio} compact />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
                {NIVEIS_RISCO.map((n) => <span key={n} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10" style={{ background: RISK_LEVEL_COLORS[n] }} />{RISK_LEVEL_LABELS[n]}</span>)}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-[11px] leading-snug text-gray-500">
        Fonte: CEMADEN-RJ / SEDEC-RJ. O Nível de Monitoramento segue a Portaria MIDR nº 2.458/2026 e o PLANCON 2026/2027 e é definido por município (vale o mais alto entre meteorologia, hidrologia e geologia). Esta página não substitui os alertas oficiais enviados à população (SMS, Defesa Civil Alerta e demais canais) nem a orientação da Defesa Civil do seu município. Emergência: 199 (Defesa Civil) ou 193 (Bombeiros).
      </footer>
    </div>
  );
}
