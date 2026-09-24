"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
  normalizeMunicipioName,
  RISK_LEVEL_COLORS,
  RISK_LEVEL_LABELS,
  RiskAlert,
  RiskAlertTipo,
  RiskLevel,
} from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";

const VIEW_W = 640;
const VIEW_H = 560;
// Município dentro da seleção (redec/município buscado) mas sem dado
// específico pra esse tipo de alerta — pedido do usuário (2026-09-24):
// antes era quase idêntico ao cinza de "fora da seleção" (#f3f4f6), dando
// a impressão de que a busca "não pintava nada" quando na verdade a
// maioria dos municípios da regional só não tinha alerta demais (hidro só
// lista quem já está "Alto"). Agora claramente mais escuro/visível que o
// cinza de fora, e ainda ganha um contorno mais forte (ver <path> abaixo).
const NO_DATA_COLOR = "#cbd5e1";
const DIMMED_COLOR = "#f3f4f6";

let geoCache: GeoJsonFeatureCollection | null = null;

export type Selecao = { tipo: "municipio" | "redec"; valor: string } | null;

/** Exposto via ref pra permitir exportar o mapa como imagem (pedido do
 * usuário, 2026-09-24) — ver ExportMapButton.tsx/exportMapImage.ts. Só o
 * elemento `<svg>` já renderizado (com zoom/seleção aplicados de
 * verdade), sem duplicar a lógica de desenho dos municípios. */
export type RiskMapHandle = { getSvgElement: () => SVGSVGElement | null };

const RiskChoroplethMap = forwardRef<
  RiskMapHandle,
  {
    tipo: RiskAlertTipo;
    redecAlerts: RiskAlert[];
    municipioAlerts: RiskAlert[];
    municipioRedecMap: Record<string, string>;
    /** Sem título interno nem busca — usado na aba "Riscos", onde os 4 mapas
     * aparecem lado a lado com um título próprio por fora. */
    compact?: boolean;
    selecao?: Selecao;
    onSelecaoChange?: (s: Selecao) => void;
    busca?: string;
    onBuscaChange?: (s: string) => void;
    hideSearchUI?: boolean;
  }
>(function RiskChoroplethMap(
  {
    tipo,
    redecAlerts,
    municipioAlerts,
    municipioRedecMap,
    compact = false,
    // Busca/seleção CONTROLADA pelo componente pai (pedido do usuário,
    // 2026-09-24: "integrar as buscas" — a mesma seleção também filtra os
    // cards e a tabela em AlertsPanel, não só o mapa). Quando não vierem
    // (ex: uso "compact" nos 4 mapas da aba Riscos, que não tem busca
    // nenhuma), o componente cai pro próprio estado interno — modo
    // desacoplado, como antes.
    selecao: selecaoControlada,
    onSelecaoChange,
    busca: buscaControlada,
    onBuscaChange,
    // Esconde o <h3>/campo de busca internos — usado por AlertsPanel, que
    // agora tem UMA busca só, renderizada por fora, acima dos cards.
    hideSearchUI = false,
  },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  useImperativeHandle(ref, () => ({ getSvgElement: () => svgRef.current }));

  const [geo, setGeo] = useState<GeoJsonFeatureCollection | null>(geoCache);
  const [buscaInterna, setBuscaInterna] = useState("");
  const [selecaoInterna, setSelecaoInterna] = useState<Selecao>(null);
  const controlado = onSelecaoChange !== undefined;
  const selecao = controlado ? (selecaoControlada ?? null) : selecaoInterna;
  const busca = controlado ? (buscaControlada ?? "") : buscaInterna;
  const setSelecao = onSelecaoChange ?? setSelecaoInterna;
  const setBusca = onBuscaChange ?? setBuscaInterna;

  useEffect(() => {
    if (geoCache) return;
    let cancelled = false;
    fetch("/rj_municipios.geojson")
      .then((r) => r.json())
      .then((data: GeoJsonFeatureCollection) => {
        geoCache = data;
        if (!cancelled) setGeo(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Geológico/hidrológico têm risco por município direto da fonte;
  // meteorológico/incêndio só têm por REDEC — nesse caso, todo município
  // daquela REDEC herda a cor da REDEC (só existe granularidade maior).
  const temGranularidadeMunicipal = tipo === "geologico" || tipo === "hidrologico";

  const corPorMunicipioNorm = useMemo(() => {
    const mapa = new Map<string, RiskLevel>();
    if (temGranularidadeMunicipal) {
      for (const a of municipioAlerts) {
        mapa.set(normalizeMunicipioName(a.municipio), a.risco);
      }
    } else {
      const riscoPorRedec = new Map(redecAlerts.map((a) => [a.redec, a.risco]));
      for (const [nomeNorm, redec] of Object.entries(municipioRedecMap)) {
        const risco = riscoPorRedec.get(redec);
        if (risco) mapa.set(nomeNorm, risco);
      }
    }
    return mapa;
  }, [temGranularidadeMunicipal, municipioAlerts, redecAlerts, municipioRedecMap]);

  const redecsDisponiveis = useMemo(
    () => Array.from(new Set(redecAlerts.map((a) => a.redec))).sort((a, b) => a.localeCompare(b)),
    [redecAlerts],
  );

  const opcoesBusca = useMemo(() => {
    if (!geo) return [];
    const municipios = geo.features
      .map((f) => f.properties.nome)
      .sort((a, b) => a.localeCompare(b))
      .map((nome) => ({ tipo: "municipio" as const, valor: nome }));
    const redecs = redecsDisponiveis.map((redec) => ({ tipo: "redec" as const, valor: redec }));
    const termo = busca.trim().toLowerCase();
    const todas = [...redecs, ...municipios];
    if (!termo) return [];
    return todas.filter((o) => o.valor.toLowerCase().includes(termo)).slice(0, 12);
  }, [geo, redecsDisponiveis, busca]);

  const emSelecao = (nomeNorm: string, nome: string): boolean => {
    if (!selecao) return true;
    if (selecao.tipo === "municipio") return nome === selecao.valor;
    return municipioRedecMap[nomeNorm] === selecao.valor;
  };

  // Zoom automático na região buscada (pedido do usuário, 2026-09-24: uma
  // REDEC pequena tipo "Serrana I" ficava perdida — um punhadinho de
  // municípios coloridos no meio de um mapa inteiro cinza do resto do
  // estado, dando a impressão de "não pintou nada"). Recalcula o bbox só
  // com os municípios da seleção; sem seleção, usa o estado inteiro.
  const project = useMemo(() => {
    if (!geo) return null;
    if (!selecao) return makeProjector(computeBBox(geo), VIEW_W, VIEW_H, 12);
    const selecionados = geo.features.filter((f) => emSelecao(f.properties.nomeNormalizado, f.properties.nome));
    if (selecionados.length === 0) return makeProjector(computeBBox(geo), VIEW_W, VIEW_H, 12);
    return makeProjector(computeBBox({ type: "FeatureCollection", features: selecionados }), VIEW_W, VIEW_H, 28);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, selecao, municipioRedecMap]);

  if (!geo || !project) {
    return <div className="p-6 text-center text-sm text-gray-400">Carregando mapa…</div>;
  }

  const selecionar = (op: { tipo: "municipio" | "redec"; valor: string }) => {
    setSelecao(op);
    setBusca(op.valor);
  };

  const limparSelecao = () => {
    setSelecao(null);
    setBusca("");
  };

  return (
    <div className={compact ? "flex h-full min-h-0 flex-col" : "mt-4"}>
      {!compact && !hideSearchUI && (
        <>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Mapa por Região/Município</h3>
          <div className="relative mb-2 max-w-xs">
            <div className="flex gap-2">
              <input
                type="text"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  if (selecao) setSelecao(null);
                }}
                placeholder="Buscar município ou regional…"
                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
              {(selecao || busca) && (
                <button
                  type="button"
                  onClick={limparSelecao}
                  className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                >
                  Limpar
                </button>
              )}
            </div>
            {busca && !selecao && opcoesBusca.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded border border-gray-200 bg-white text-xs shadow-md">
                {opcoesBusca.map((op) => (
                  <li key={`${op.tipo}-${op.valor}`}>
                    <button
                      type="button"
                      onClick={() => selecionar(op)}
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-gray-50"
                    >
                      <span>{op.valor}</span>
                      <span className="text-[10px] uppercase text-gray-400">
                        {op.tipo === "redec" ? "Regional" : "Município"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={
          compact
            ? "min-h-0 w-full flex-1 rounded border border-gray-200 bg-white"
            : "w-full max-w-2xl rounded border border-gray-200 bg-white"
        }
        role="img"
        aria-label={`Mapa do Rio de Janeiro por município — ${tipo}`}
      >
        {geo.features.map((feature) => {
          const nomeNorm = feature.properties.nomeNormalizado;
          const risco = corPorMunicipioNorm.get(nomeNorm);
          const destacado = emSelecao(nomeNorm, feature.properties.nome);
          const fill = !destacado ? DIMMED_COLOR : risco ? RISK_LEVEL_COLORS[risco] : NO_DATA_COLOR;

          return (
            <path
              key={feature.properties.codarea}
              d={geometryToPath(feature.geometry, project)}
              fill={fill}
              stroke={selecao && destacado ? "#1f3864" : "#ffffff"}
              strokeWidth={selecao && destacado ? 1.4 : 0.6}
            >
              <title>
                {feature.properties.nome}
                {risco ? ` — ${RISK_LEVEL_LABELS[risco]}` : " — sem dado"}
              </title>
            </path>
          );
        })}
      </svg>
    </div>
  );
});

export default RiskChoroplethMap;
