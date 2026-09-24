"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchRiskAlerts,
  normalizeMunicipioName,
  RISK_ALERT_TIPO_LABELS,
  RISK_LEGEND_ITEMS,
  RISK_LEVEL_COLORS,
  RISK_LEVEL_LABELS,
  RiskAlert,
  RiskAlertTipo,
  RiskLevel,
} from "@/lib/api";
import ExportMapButton from "@/components/ExportMapButton";
import RiskChoroplethMap, { RiskMapHandle } from "@/components/RiskChoroplethMap";

const TIPOS: RiskAlertTipo[] = ["hidrologico", "geologico", "meteorologico", "incendio"];
const NIVEIS: RiskLevel[] = ["muito_baixo", "baixo", "moderado", "alto", "muito_alto"];
const COM_GRANULARIDADE_MUNICIPAL: RiskAlertTipo[] = ["geologico", "hidrologico"];

type DadosPorTipo = {
  redec: RiskAlert[];
  municipio: RiskAlert[];
};

function Legenda() {
  return (
    <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2 text-[11px] leading-tight text-gray-500 landscape:mt-1 landscape:pt-1 landscape:text-[9px]">
      {NIVEIS.map((n) => (
        <span key={n} className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10"
            style={{ backgroundColor: RISK_LEVEL_COLORS[n] }}
          />
          {RISK_LEVEL_LABELS[n]}
        </span>
      ))}
    </div>
  );
}

// Mesma lógica do AlertsPanel: sem isso, quem deixasse essa aba aberta
// numa TV/monitor de operação ficaria vendo o mesmo dado parado até
// recarregar a página na mão.
const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

export default function RiscosOverviewPanel() {
  const [dados, setDados] = useState<Record<RiskAlertTipo, DadosPorTipo>>({
    hidrologico: { redec: [], municipio: [] },
    geologico: { redec: [], municipio: [] },
    meteorologico: { redec: [], municipio: [] },
    incendio: { redec: [], municipio: [] },
  });
  const [municipioRedecMap, setMunicipioRedecMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [atualizandoManual, setAtualizandoManual] = useState(false);

  // Um ref de mapa por tipo — pra poder exportar CADA mapa como imagem
  // separadamente (pedido do usuário, 2026-09-24), sem precisar de um
  // componente novo por tipo.
  const mapRefs = useRef<Record<RiskAlertTipo, RiskMapHandle | null>>({
    hidrologico: null,
    geologico: null,
    meteorologico: null,
    incendio: null,
  });

  const desmontadoRef = useRef(false);

  // useCallback (não só efeito) pra dar pra chamar tanto sozinho quanto
  // sob demanda no botão "Atualizar agora" de cada mapa — mesmo padrão do
  // AlertsPanel. IMPORTANTE: `desmontadoRef` é resetado dentro do próprio
  // efeito de busca (ver useEffect abaixo), não só declarado 1x — sem
  // isso, o StrictMode do React em dev deixa isso preso em `true` pra
  // sempre e a tela trava em "Carregando mapas…" (só em `next dev`).
  const carregar = useCallback((mostrarLoading: boolean) => {
    if (mostrarLoading) setLoading(true);
    setError(null);

    return Promise.all(
      TIPOS.map((tipo) =>
        Promise.all([
          fetchRiskAlerts(tipo, "redec"),
          COM_GRANULARIDADE_MUNICIPAL.includes(tipo) ? fetchRiskAlerts(tipo, "municipio") : Promise.resolve([]),
        ]).then(([redec, municipio]) => [tipo, { redec, municipio }] as const),
      ),
    )
      .then((entradas) => {
        if (desmontadoRef.current) return;
        const proximo = Object.fromEntries(entradas) as Record<RiskAlertTipo, DadosPorTipo>;
        setDados(proximo);
        const mapa: Record<string, string> = {};
        for (const a of proximo.geologico.municipio) mapa[normalizeMunicipioName(a.municipio)] = a.redec;
        setMunicipioRedecMap(mapa);
        setAtualizadoEm(new Date());
      })
      .catch((err) => {
        if (!desmontadoRef.current) setError(err instanceof Error ? err.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!desmontadoRef.current && mostrarLoading) setLoading(false);
      });
  }, []);

  useEffect(() => {
    desmontadoRef.current = false;
    carregar(true);
    const intervalo = setInterval(() => carregar(false), INTERVALO_ATUALIZACAO_MS);
    return () => {
      desmontadoRef.current = true;
      clearInterval(intervalo);
    };
  }, [carregar]);

  const atualizarAgora = () => {
    setAtualizandoManual(true);
    carregar(false).finally(() => setAtualizandoManual(false));
  };

  const horaAtualizacao = atualizadoEm
    ? atualizadoEm.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";

  return (
    // Meta: em paisagem (PC, TV, tablet deitado) as 4 câmaras cabem inteiras
    // na tela, sem rolar — por isso landscape:overflow-hidden e o grid vira
    // flex-1 com 2 linhas fixas. Em retrato (celular, tablet em pé) mantém
    // sempre 2 colunas (nunca cai pra 1), pra pelo menos 2 mapas ficarem
    // visíveis juntos mesmo que o par de baixo precise de rolagem.
    <div className="flex h-full w-full flex-col overflow-y-auto bg-white p-3 landscape:overflow-hidden landscape:p-2">
      {/* Pedido do usuário (2026-09-24): texto descritivo suprimido;
          "Atualizado às..." sobe pra mesma linha do título, alinhado à
          direita; título renomeado. */}
      <div className="mb-2 flex items-center justify-between landscape:hidden">
        <h2 className="text-sm font-semibold text-gray-900">Mapas de Riscos - Visão Geral</h2>
        {atualizadoEm && <span className="text-xs text-gray-500">Atualizado às {horaAtualizacao}</span>}
      </div>

      {error && (
        <div className="mb-2 shrink-0 rounded bg-red-50 p-2 text-xs text-red-600">
          Não foi possível carregar alertas ({error}).
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando mapas…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 landscape:min-h-0 landscape:flex-1 landscape:grid-rows-2">
            {TIPOS.map((tipo) => (
              <div
                key={tipo}
                className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 p-1.5 landscape:p-1"
              >
                <div className="flex shrink-0 items-center justify-between gap-1">
                  <h3 className="truncate text-[11px] font-semibold text-gray-800 landscape:text-[10px]">
                    {RISK_ALERT_TIPO_LABELS[tipo]}
                  </h3>
                  {/* Pedido do usuário (2026-09-24): entre "atualizado" e
                      "atualizar agora", um botão pra exportar ESSE mapa
                      como imagem (baixar PNG ou copiar) — cada um dos 4
                      mapas gera sua própria imagem, com cabeçalho/legenda/
                      fonte/logo da Defesa Civil e horário embutidos (ver
                      ExportMapButton.tsx). */}
                  <div className="flex shrink-0 items-center gap-1 text-[10px] text-gray-400">
                    <span className="hidden sm:inline">{horaAtualizacao}</span>
                    <ExportMapButton
                      getSvgElement={() => mapRefs.current[tipo]?.getSvgElement() ?? null}
                      titulo={RISK_ALERT_TIPO_LABELS[tipo]}
                      tipo={tipo}
                      legendaItens={RISK_LEGEND_ITEMS}
                      atualizadoTexto={`Atualizado em ${new Date().toLocaleDateString("pt-BR")} às ${horaAtualizacao}`}
                    />
                    <button
                      type="button"
                      onClick={atualizarAgora}
                      disabled={atualizandoManual}
                      title="Buscar os 4 mapas de novo agora"
                      className="rounded border border-gray-300 p-0.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={atualizandoManual ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>
                <RiskChoroplethMap
                  ref={(handle) => {
                    mapRefs.current[tipo] = handle;
                  }}
                  tipo={tipo}
                  redecAlerts={dados[tipo].redec}
                  municipioAlerts={dados[tipo].municipio}
                  municipioRedecMap={municipioRedecMap}
                  compact
                />
              </div>
            ))}
          </div>
          {/* Legenda única pros 4 mapas (pedido do usuário: "ficou muito
              repetitivo" ter uma em cada mapa) — uma vez só, embaixo. */}
          <Legenda />
        </>
      )}

      <p className="mt-2 shrink-0 border-t border-gray-100 pt-1 text-[10px] text-gray-400 landscape:hidden">
        Fonte: Defesa Civil-RJ (CEMADEN-RJ/SEDEC), via API de integração do painel oficial. Classificação de risco
        emitida pela própria Defesa Civil — este painel só espelha o dado, não substitui os canais oficiais de
        alerta.
      </p>
    </div>
  );
}
