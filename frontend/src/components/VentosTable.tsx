"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import ColumnResizer from "@/components/ColumnResizer";
import { CampoClicavel, HistoricoIconLink, W_HISTORICO } from "@/components/EstacaoCellLinks";
import { TableExportHandle } from "@/components/tableExportHandle";
import {
  getDelayStatus,
  normalizeMunicipioName,
  SOURCE_COLORS,
  SOURCE_LABELS,
  STATION_TYPE_LABELS,
  Station,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";
import { useColumnWidths } from "@/lib/useColumnWidths";

/** Tabela dedicada só a vento (pedido do usuário, 2026-09-29) — separada da
 * "Dados Meteorológicos" (que mistura todos os tipos de leitura), com
 * bússola visual por linha igual à do card de vento na página de estação
 * (ver VentoGauge em Gauges.tsx, versão mini aqui pra caber numa célula).
 * Cores/legenda por RAJADA (2026-09-29, pedido do usuário, referência:
 * print do CEMADEN-RJ "Monitoramento de vento") — mesma classificação
 * Fraca/Moderada/Forte/Muito forte, aplicada como cor de fundo da linha
 * (mesmo padrão de Precipitação/Hidrológica) + coluna "Situação". */

const PONTOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
function pontoCardeal(graus: number): string {
  return PONTOS[Math.round(graus / 45) % 8];
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

type FaixaRajada = { label: string; bg: string; text: string };
const FAIXAS_RAJADA: { min: number; faixa: FaixaRajada }[] = [
  { min: 76, faixa: { label: "Muito forte", bg: "#c084fc", text: "#3b0764" } },
  { min: 52, faixa: { label: "Forte", bg: "#f87171", text: "#7f1d1d" } },
  { min: 18.6, faixa: { label: "Moderada", bg: "#f0a868", text: "#7c2d12" } },
  { min: 0, faixa: { label: "Fraca", bg: "#dcfce7", text: "#166534" } },
];
function faixaDaRajada(rajadaKmh: number | null): FaixaRajada | null {
  if (rajadaKmh === null) return null;
  return FAIXAS_RAJADA.find((f) => rajadaKmh >= f.min)?.faixa ?? null;
}

function Bussola({ graus }: { graus: number | null }) {
  if (graus === null) return <span className="text-gray-300">—</span>;
  return (
    <span className="inline-flex items-center justify-center" title={`${Math.round(graus)}° (${pontoCardeal(graus)})`}>
      <svg viewBox="0 0 24 24" width={18} height={18}>
        <circle cx={12} cy={12} r={10} fill="none" stroke="#e5e7eb" strokeWidth={1.5} />
        <g transform={`rotate(${graus} 12 12)`}>
          <path d="M12 4 L15 13 L12 11 L9 13 Z" fill="#0369a1" />
        </g>
      </svg>
    </span>
  );
}

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "source", "situacao", "updated"]);

// Grade completa (mesmo padrão de Sirenes, pedido do usuário 2026-09-29) —
// border em toda célula, não só border-bottom.
const TH = "sticky top-0 z-20 border border-gray-300 bg-gray-100 px-1.5 py-1.5 align-middle align-bottom leading-tight";
const TH_ORDENAVEL = `${TH} cursor-pointer select-none whitespace-normal break-words`;
const TD = "border border-gray-200 px-1.5 py-1 align-middle";

const W_DESKTOP: Record<string, number> = {
  estacao: 170, municipio: 130, rajada: 100, vento: 96, direcao: 130, situacao: 100,
  redec: 140, fonte: 116, tipo: 110, atualizado: 130,
};
const W_MOBILE: Record<string, number> = {
  estacao: 120, municipio: 112, rajada: 90, vento: 84, direcao: 110, situacao: 92,
  redec: 140, fonte: 100, tipo: 96, atualizado: 110,
};
const ORDEM_COLUNAS = ["estacao", "municipio", "rajada", "vento", "direcao", "situacao", "redec", "fonte", "tipo", "atualizado"] as const;

function valorDe(s: Station, tipo: string): number | null {
  return s.latest_readings.find((r) => r.reading_type === tipo)?.value ?? null;
}

const VentosTable = forwardRef<
  TableExportHandle,
  {
    stations: Station[];
    municipioRedecMap?: Record<string, string>;
    onOpenStation: (id: number) => void;
  }
>(function VentosTable({ stations, municipioRedecMap = {}, onOpenStation }, ref) {
  const redecOf = (municipality: string) => municipioRedecMap[normalizeMunicipioName(municipality)] ?? "";
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths("larguras-ventos-v2", W_DESKTOP, W_MOBILE);
  const [sortKey, setSortKey] = useState<string>("vento_rajada_ms");
  const [sortAsc, setSortAsc] = useState(false);

  // Só estações que reportam pelo menos vento OU rajada OU direção.
  const filtered = useMemo(
    () =>
      stations.filter(
        (s) =>
          valorDe(s, "vento_ms") !== null || valorDe(s, "vento_rajada_ms") !== null || valorDe(s, "vento_dir_graus") !== null,
      ),
    [stations],
  );

  const mostRecentUpdate = (s: Station): string | null => {
    if (s.latest_readings.length === 0) return null;
    return s.latest_readings.reduce((latest, r) => (r.timestamp > latest ? r.timestamp : latest), s.latest_readings[0].timestamp);
  };

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "municipality") cmp = a.municipality.localeCompare(b.municipality);
      else if (sortKey === "redec") cmp = redecOf(a.municipality).localeCompare(redecOf(b.municipality));
      else if (sortKey === "source") cmp = a.source.localeCompare(b.source);
      else if (sortKey === "updated") cmp = (mostRecentUpdate(a) ?? "").localeCompare(mostRecentUpdate(b) ?? "");
      else {
        const va = valorDe(a, sortKey);
        const vb = valorDe(b, sortKey);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        cmp = va - vb;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortAsc, municipioRedecMap]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(COLUNAS_TEXTO.has(key));
    }
  };

  const arrow = (key: string) => (key === sortKey ? (sortAsc ? " ▲" : " ▼") : "");
  const resizer = (k: string) => <ColumnResizer width={w[k]} onChange={(px) => setWidth(k, px)} onReset={() => resetWidth(k)} />;

  const exportar = () => {
    const headers = ["Estação", "Município", "Rajada (km/h)", "Vento (km/h)", "Direção (°)", "Direção", "Situação", "REDEC", "Fonte", "Tipo", "Atualizado em"];
    const rows = sorted.map((s) => {
      const vento = valorDe(s, "vento_ms");
      const rajadaMs = valorDe(s, "vento_rajada_ms");
      const rajadaKmh = rajadaMs !== null ? Math.round(rajadaMs * 3.6 * 10) / 10 : null;
      const direcao = valorDe(s, "vento_dir_graus");
      const updated = mostRecentUpdate(s);
      return [
        s.name,
        s.municipality || "",
        rajadaKmh ?? "",
        vento !== null ? (Math.round(vento * 3.6 * 10) / 10).toString() : "",
        direcao !== null ? Math.round(direcao).toString() : "",
        direcao !== null ? pontoCardeal(direcao) : "",
        faixaDaRajada(rajadaKmh)?.label ?? "",
        redecOf(s.municipality),
        SOURCE_LABELS[s.source] ?? s.source,
        STATION_TYPE_LABELS[s.station_type] ?? s.station_type,
        updated ? formatTimestamp(updated) : "",
      ];
    });
    downloadCsv(`cemaden-rj-ventos-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  useImperativeHandle(ref, () => ({ exportar }));

  const larguraTotal = ORDEM_COLUNAS.reduce((soma, k) => soma + w[k], 0) + W_HISTORICO;

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table className="border-collapse text-xs sm:text-sm" style={{ tableLayout: "fixed", width: larguraTotal }}>
        <colgroup>
          {ORDEM_COLUNAS.map((k) => (
            <col key={k} style={{ width: w[k] }} />
          ))}
          <col style={{ width: W_HISTORICO }} />
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          <tr>
            <th
              className={`${TH_ORDENAVEL} left-0 z-30 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]`}
              style={{ width: w.estacao, maxWidth: w.estacao, minWidth: w.estacao }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
              {resizer("estacao")}
            </th>
            <th className={TH_ORDENAVEL} style={{ width: w.municipio, maxWidth: w.municipio, minWidth: w.municipio }} onClick={() => toggleSort("municipality")}>
              Município{arrow("municipality")}
              {resizer("municipio")}
            </th>
            <th
              className={`${TH_ORDENAVEL} text-right`}
              style={{ width: w.rajada, maxWidth: w.rajada, minWidth: w.rajada }}
              onClick={() => toggleSort("vento_rajada_ms")}
              title="Rajada de vento"
            >
              Rajada (km/h){arrow("vento_rajada_ms")}
              {resizer("rajada")}
            </th>
            <th
              className={`${TH_ORDENAVEL} text-right`}
              style={{ width: w.vento, maxWidth: w.vento, minWidth: w.vento }}
              onClick={() => toggleSort("vento_ms")}
              title="Velocidade do vento"
            >
              Vento (km/h){arrow("vento_ms")}
              {resizer("vento")}
            </th>
            <th
              className={`${TH_ORDENAVEL} text-center`}
              style={{ width: w.direcao, maxWidth: w.direcao, minWidth: w.direcao }}
              onClick={() => toggleSort("vento_dir_graus")}
              title="Direção do vento (° e posição na roda dos ventos)"
            >
              Direção (°){arrow("vento_dir_graus")}
              {resizer("direcao")}
            </th>
            <th
              className={`${TH_ORDENAVEL} text-center`}
              style={{ width: w.situacao, maxWidth: w.situacao, minWidth: w.situacao }}
              onClick={() => toggleSort("situacao")}
              title="Classificação pela rajada (ver legenda no rodapé)"
            >
              Situação{arrow("situacao")}
              {resizer("situacao")}
            </th>
            <th className={TH_ORDENAVEL} style={{ width: w.redec, maxWidth: w.redec, minWidth: w.redec }} onClick={() => toggleSort("redec")}>
              REDEC{arrow("redec")}
              {resizer("redec")}
            </th>
            <th className={TH_ORDENAVEL} style={{ width: w.fonte, maxWidth: w.fonte, minWidth: w.fonte }} onClick={() => toggleSort("source")}>
              Fonte{arrow("source")}
              {resizer("fonte")}
            </th>
            <th className={TH} style={{ width: w.tipo, maxWidth: w.tipo, minWidth: w.tipo }}>
              Tipo
              {resizer("tipo")}
            </th>
            <th className={TH_ORDENAVEL} style={{ width: w.atualizado, maxWidth: w.atualizado, minWidth: w.atualizado }} onClick={() => toggleSort("updated")}>
              Atualizado em{arrow("updated")}
              {resizer("atualizado")}
            </th>
            <th className={`${TH} text-center`} style={{ width: W_HISTORICO, maxWidth: W_HISTORICO, minWidth: W_HISTORICO }} title="Abrir em nova aba">
              Histórico
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const updated = mostRecentUpdate(s);
            const atraso = getDelayStatus(updated);
            const vento = valorDe(s, "vento_ms");
            const rajadaMs = valorDe(s, "vento_rajada_ms");
            const rajadaKmh = rajadaMs !== null ? Math.round(rajadaMs * 3.6 * 10) / 10 : null;
            const direcao = valorDe(s, "vento_dir_graus");
            const faixa = faixaDaRajada(rajadaKmh);
            const bgFundo = faixa?.bg ?? "#ffffff";
            const corTexto = faixa?.text;
            return (
              <tr key={`${s.source}-${s.id}`} title={faixa?.label}>
                <td
                  className={`${TD} sticky left-0 z-10 font-medium shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]`}
                  style={{ width: w.estacao, maxWidth: w.estacao, minWidth: w.estacao, backgroundColor: bgFundo, color: corTexto ?? "#111827" }}
                >
                  <CampoClicavel id={s.id} valor={s.name} onOpenStation={onOpenStation} className="text-left text-sedec-600 underline-offset-2 hover:underline" />
                </td>
                <td className={TD} style={{ width: w.municipio, maxWidth: w.municipio, minWidth: w.municipio, backgroundColor: bgFundo, color: corTexto ?? "#4b5563" }}>
                  <CampoClicavel id={s.id} valor={s.municipality || "—"} onOpenStation={onOpenStation} />
                </td>
                <td className={`${TD} text-right font-semibold`} style={{ backgroundColor: bgFundo, color: corTexto ?? "#111827" }}>
                  {rajadaKmh !== null ? rajadaKmh.toFixed(1) : "—"}
                </td>
                <td className={`${TD} text-right`} style={{ backgroundColor: bgFundo, color: corTexto ?? "#1f2937" }}>
                  {vento !== null ? (Math.round(vento * 3.6 * 10) / 10).toFixed(1) : "—"}
                </td>
                <td className={TD} style={{ backgroundColor: bgFundo }}>
                  <div className="flex items-center justify-center gap-1.5">
                    <Bussola graus={direcao} />
                    <span style={{ color: corTexto ?? "#374151" }}>{direcao !== null ? `${Math.round(direcao)}° ${pontoCardeal(direcao)}` : "—"}</span>
                  </div>
                </td>
                <td className={`${TD} text-center font-semibold`} style={{ backgroundColor: bgFundo, color: corTexto ?? "#9ca3af" }}>
                  {faixa?.label ?? "—"}
                </td>
                <td className={TD} style={{ backgroundColor: bgFundo, color: corTexto ?? "#6b7280" }}>
                  <CampoClicavel id={s.id} valor={redecOf(s.municipality) || "—"} onOpenStation={onOpenStation} />
                </td>
                <td
                  className={`${TD} font-semibold`}
                  style={{ backgroundColor: bgFundo, color: corTexto ?? (SOURCE_COLORS[s.source] ?? "#374151") }}
                  title={s.source}
                >
                  <CampoClicavel id={s.id} valor={SOURCE_LABELS[s.source] ?? s.source} onOpenStation={onOpenStation} />
                </td>
                <td className={TD} style={{ backgroundColor: bgFundo, color: corTexto ?? "#4b5563" }}>
                  <CampoClicavel id={s.id} valor={STATION_TYPE_LABELS[s.station_type] ?? s.station_type} onOpenStation={onOpenStation} />
                </td>
                <td className={TD} style={{ backgroundColor: bgFundo, color: corTexto ?? atraso.color }} title={atraso.label}>
                  {updated ? formatTimestamp(updated) : "—"}
                </td>
                <td className={`${TD} text-center`} style={{ backgroundColor: bgFundo }}>
                  <HistoricoIconLink id={s.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma estação com dado de vento encontrada.</div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500 sm:text-[11px]">
        <span>Situação (classificação pela rajada, referência CEMADEN-RJ):</span>
        {FAIXAS_RAJADA.slice().reverse().map(({ faixa }) => (
          <span key={faixa.label} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ backgroundColor: faixa.bg }} />
            {faixa.label}
          </span>
        ))}
      </div>
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        Fraca &lt; 18,6 km/h · Moderada 18,6–51,9 km/h · Forte 52–75,9 km/h · Muito forte ≥ 76 km/h. Só aparecem
        aqui estações que reportam velocidade, rajada ou direção do vento. Vento é guardado em m/s e exibido em
        km/h, igual ao resto do painel. Clique num cabeçalho pra ordenar; arraste a borda direita pra ajustar a
        largura da coluna.{" "}
        <button type="button" onClick={resetAll} className="underline hover:text-gray-600">
          Restaurar larguras
        </button>
      </div>
    </div>
  );
});

export default VentosTable;
