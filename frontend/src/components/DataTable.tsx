"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import ColumnResizer from "@/components/ColumnResizer";
import { TableExportHandle } from "@/components/tableExportHandle";
import {
  getDelayStatus,
  normalizeMunicipioName,
  READING_TYPE_LABELS,
  SOURCE_COLORS,
  SOURCE_LABELS,
  STATION_TYPE_LABELS,
  Station,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";
import { useColumnWidths } from "@/lib/useColumnWidths";

// Chaves "x:..." são colunas CALCULADAS (máx./mín. das últimas 24h, vindas de
// `Station.extremos_24h`), não tipos de leitura.
const COLUMN_ORDER = [
  "chuva_mm",
  "nivel_m",
  "temperatura_c",
  "x:temp_max",
  "x:temp_min",
  "umidade_pct",
  "x:umid_max",
  "x:umid_min",
  "pressao_hpa",
  "pressao_nm_hpa",
  "ponto_orvalho_c",
  "sensacao_termica_c",
  "vento_ms",
  "vento_rajada_ms",
  "vento_dir_graus",
  "radiacao_wm2",
  "uv_indice",
  "mare_m",
];

/** Valor de uma coluna pra uma estação: última leitura do tipo, ou extremo de 24h. */
function valorColuna(s: Station, key: string): number | null {
  if (key.startsWith("x:")) {
    const campo = key.slice(2) as "temp_max" | "temp_min" | "umid_max" | "umid_min";
    return s.extremos_24h?.[campo] ?? null;
  }
  return s.latest_readings.find((r) => r.reading_type === key)?.value ?? null;
}

/** Tipos de leitura que aparecem na tabela de Dados Meteorológicos — chuva
 * fica de fora porque tem tela própria (com acumulados), ver PrecipitationTable. */
export const METEOROLOGICAL_READING_TYPES = [
  "temperatura_c",
  "umidade_pct",
  "pressao_hpa",
  "pressao_nm_hpa",
  "ponto_orvalho_c",
  "sensacao_termica_c",
  "radiacao_wm2",
  "uv_indice",
  "vento_ms",
  "vento_rajada_ms",
  "vento_dir_graus",
  "nivel_m",
  "mare_m",
];

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

// Guardamos vento em m/s (SI) no banco; exibimos em km/h a pedido do
// usuário. Conversão só de exibição — não afeta ordenação (transformação
// monotônica, a ordem relativa é a mesma nas duas unidades).
const WIND_READING_TYPES = new Set(["vento_ms", "vento_rajada_ms"]);

function formatReadingValue(readingType: string, value: number): string {
  const emKmh = WIND_READING_TYPES.has(readingType) ? value * 3.6 : value;
  return (Math.round(emKmh * 10) / 10).toString();
}

const FIXED_SORT_KEYS = new Set(["name", "municipality", "source", "updated"]);

// Mesmo padrão de largura/sticky da tabela de Precipitação (pedido do
// usuário, 2026-09-23: "faça a mesma correção... nas tabelas dados
// meteorologicos e sirenes") — colgroup + maxWidth/minWidth explícitos em
// CADA célula (table-layout:fixed sozinho não é respeitado por células
// sticky no Chrome, ver PrecipitationTable.tsx), só Estação fixa rolando
// a tabela pro lado.

// Larguras padrão (px), ajustáveis arrastando a borda direita do cabeçalho (lembradas no
// navegador). Em telas < 640px os padrões são menores. Texto quebra em várias linhas.
const W_DESKTOP: Record<string, number> = { estacao: 170, municipio: 130, redec: 140, fonte: 116, tipo: 110, coluna: 100, atualizado: 130 };
const W_MOBILE: Record<string, number> = { estacao: 120, municipio: 112, redec: 140, fonte: 100, tipo: 96, coluna: 92, atualizado: 110 };

const DataTable = forwardRef<
  TableExportHandle,
  {
    stations: Station[];
    /** Restringe colunas e estações exibidas a esses tipos de leitura (default: todos). */
    readingTypes?: string[];
    /** Coluna usada pra ordenar de cara — "name"/"municipality"/"source"/"updated"
     * ou um tipo de leitura (ex: "temperatura_c"). Colunas de valor começam
     * ordenadas do maior pro menor; as demais, A→Z. */
    defaultSortKey?: string;
    /** Município (normalizado) → REDEC — pra mostrar/exportar a coluna REDEC.
     * Sem isso a coluna fica em branco, não quebra nada (ver page.tsx). */
    municipioRedecMap?: Record<string, string>;
  }
>(function DataTable({ stations, readingTypes, defaultSortKey = "municipality", municipioRedecMap = {} }, ref) {
  const redecOf = (municipality: string) => municipioRedecMap[normalizeMunicipioName(municipality)] ?? "";
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths("larguras-meteorologico-v1", W_DESKTOP, W_MOBILE);
  const [sortKey, setSortKey] = useState<string>(defaultSortKey);
  const [sortAsc, setSortAsc] = useState(!FIXED_SORT_KEYS.has(defaultSortKey) ? false : true);

  const allowedTypes = useMemo(() => (readingTypes ? new Set(readingTypes) : null), [readingTypes]);

  const filteredStations = useMemo(() => {
    if (!allowedTypes) return stations;
    return stations.filter((s) => s.latest_readings.some((r) => allowedTypes.has(r.reading_type)));
  }, [stations, allowedTypes]);

  const columns = useMemo(() => {
    const present = new Set<string>();
    filteredStations.forEach((s) => s.latest_readings.forEach((r) => present.add(r.reading_type)));
    const temExtremos = (campo: string) => filteredStations.some((s) => (s.extremos_24h as Record<string, number | null> | null | undefined)?.[campo] != null);
    return COLUMN_ORDER.filter((c) => {
      if (c.startsWith("x:")) return temExtremos(c.slice(2));
      return present.has(c) && (!allowedTypes || allowedTypes.has(c));
    });
  }, [filteredStations, allowedTypes]);

  const mostRecentUpdate = (s: Station): string | null => {
    if (s.latest_readings.length === 0) return null;
    return s.latest_readings.reduce((latest, r) => (r.timestamp > latest ? r.timestamp : latest), s.latest_readings[0].timestamp);
  };

  const sorted = useMemo(() => {
    const copy = [...filteredStations];
    copy.sort((a, b) => {
      if (sortKey === "name") return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      if (sortKey === "municipality")
        return sortAsc ? a.municipality.localeCompare(b.municipality) : b.municipality.localeCompare(a.municipality);
      if (sortKey === "source") return sortAsc ? a.source.localeCompare(b.source) : b.source.localeCompare(a.source);
      if (sortKey === "updated") {
        const ua = mostRecentUpdate(a) ?? "";
        const ub = mostRecentUpdate(b) ?? "";
        return sortAsc ? ua.localeCompare(ub) : ub.localeCompare(ua);
      }
      // Coluna de valor (ex: temperatura_c) — quem não tem leitura desse
      // tipo vai sempre pro fim, não importa a direção.
      const va = valorColuna(a, sortKey);
      const vb = valorColuna(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortAsc ? va - vb : vb - va;
    });
    return copy;
  }, [filteredStations, sortKey, sortAsc]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(!FIXED_SORT_KEYS.has(key) ? false : true);
    }
  };

  const arrow = (key: string) => (key === sortKey ? (sortAsc ? " ▲" : " ▼") : "");
  const resizer = (k: string) => (
    <ColumnResizer width={w[k]} onChange={(px) => setWidth(k, px)} onReset={() => resetWidth(k)} />
  );

  const exportar = () => {
    const headers = [
      "Estação",
      "Município",
      "REDEC",
      "Fonte",
      "Tipo",
      ...columns.map((c) => READING_TYPE_LABELS[c] ?? c),
      "Atualizado em",
    ];
    const rows = sorted.map((s) => {
      const updated = mostRecentUpdate(s);
      return [
        s.name,
        s.municipality || "",
        redecOf(s.municipality),
        SOURCE_LABELS[s.source] ?? s.source,
        STATION_TYPE_LABELS[s.station_type] ?? s.station_type,
        ...columns.map((c) => {
          const v = valorColuna(s, c);
          return v != null ? formatReadingValue(c, v) : "";
        }),
        updated ? formatTimestamp(updated) : "",
      ];
    });
    downloadCsv(`cemaden-rj-estacoes-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  // Botão "Exportar CSV" vive na barra de filtro flutuante fora desta
  // tabela (ver FilterToggleBar.tsx/Dashboard.tsx, pedido do usuário
  // 2026-09-23: economizar altura).
  useImperativeHandle(ref, () => ({ exportar }));

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table
        className="border-collapse text-xs sm:text-sm"
        style={{ tableLayout: "fixed", width: w.estacao + w.municipio + w.redec + w.fonte + w.tipo + columns.length * w.coluna + w.atualizado }}
      >
        <colgroup>
          <col style={{ width: w.estacao }} />
          <col style={{ width: w.municipio }} />
          <col style={{ width: w.redec }} />
          <col style={{ width: w.fonte }} />
          <col style={{ width: w.tipo }} />
          {columns.map((c) => (
            <col key={c} style={{ width: w.coluna }} />
          ))}
          <col style={{ width: w.atualizado }} />
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          <tr>
            <th
              className="sticky top-0 align-bottom leading-tight z-30 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
              style={{ left: 0, width: w.estacao, maxWidth: w.estacao, minWidth: w.estacao }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
              {resizer("estacao")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.municipio, maxWidth: w.municipio, minWidth: w.municipio }}
              onClick={() => toggleSort("municipality")}
            >
              Município{arrow("municipality")}
              {resizer("municipio")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.redec, maxWidth: w.redec, minWidth: w.redec }}
            >
              REDEC
              {resizer("redec")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.fonte, maxWidth: w.fonte, minWidth: w.fonte }}
              onClick={() => toggleSort("source")}
            >
              Fonte{arrow("source")}
              {resizer("fonte")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.tipo, maxWidth: w.tipo, minWidth: w.tipo }}
            >
              Tipo
              {resizer("tipo")}
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-1 py-2 text-right"
                style={{ width: w.coluna, maxWidth: w.coluna, minWidth: w.coluna }}
                onClick={() => toggleSort(c)}
                title={READING_TYPE_LABELS[c] ?? c}
              >
                {READING_TYPE_LABELS[c] ?? c}
                {arrow(c)}
              {resizer("coluna")}
            </th>
            ))}
            <th
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: w.atualizado, maxWidth: w.atualizado, minWidth: w.atualizado }}
              onClick={() => toggleSort("updated")}
            >
              Atualizado em{arrow("updated")}
              {resizer("atualizado")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const updated = mostRecentUpdate(s);
            const atraso = getDelayStatus(updated);
            return (
              <tr key={`${s.source}-${s.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                <td
                  className="sticky z-10 whitespace-normal break-words leading-tight align-middle bg-white px-2 py-1 font-medium text-gray-900 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, width: w.estacao, maxWidth: w.estacao, minWidth: w.estacao }}
                  title={s.name}
                >
                  {s.name}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1 text-gray-600"
                  style={{ width: w.municipio, maxWidth: w.municipio, minWidth: w.municipio }}
                >
                  {s.municipality || "—"}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1 text-gray-500"
                  style={{ width: w.redec, maxWidth: w.redec, minWidth: w.redec }}
                >
                  {redecOf(s.municipality) || "—"}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1 font-semibold"
                  style={{ width: w.fonte, maxWidth: w.fonte, minWidth: w.fonte, color: SOURCE_COLORS[s.source] ?? "#374151" }}
                  title={s.source}
                >
                  {SOURCE_LABELS[s.source] ?? s.source}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1 text-gray-600"
                  style={{ width: w.tipo, maxWidth: w.tipo, minWidth: w.tipo }}
                >
                  {STATION_TYPE_LABELS[s.station_type] ?? s.station_type}
                </td>
                {columns.map((c) => (
                  <td
                    key={c}
                    className="whitespace-nowrap px-1.5 py-1 text-right text-gray-800"
                    style={{ width: w.coluna, maxWidth: w.coluna, minWidth: w.coluna }}
                  >
                    {(() => {
                      const v = valorColuna(s, c);
                      return v != null ? formatReadingValue(c, v) : "—";
                    })()}
                  </td>
                ))}
                <td
                  className="whitespace-normal break-words leading-tight px-2 py-1"
                  style={{ width: w.atualizado, maxWidth: w.atualizado, minWidth: w.atualizado, color: atraso.color }}
                  title={atraso.label}
                >
                  {updated ? formatTimestamp(updated) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma estação encontrada com os filtros atuais.</div>
      )}
      <div className="sticky left-0 border-t border-gray-100 p-2 text-xs text-gray-400">
        Arraste a borda direita de um cabeçalho para ajustar a largura da coluna (duplo clique restaura).{" "}
        <button type="button" onClick={resetAll} className="underline hover:text-gray-600">
          Restaurar larguras
        </button>
      </div>
    </div>
  );
});

export default DataTable;
