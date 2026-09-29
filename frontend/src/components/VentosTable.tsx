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
 * (ver VentoGauge em Gauges.tsx, versão mini aqui pra caber numa célula). */

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

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "source", "updated"]);

const W_DESKTOP: Record<string, number> = {
  estacao: 170, municipio: 130, redec: 140, fonte: 116, tipo: 110, vento: 96, rajada: 96, direcao: 130, atualizado: 130,
};
const W_MOBILE: Record<string, number> = {
  estacao: 120, municipio: 112, redec: 140, fonte: 100, tipo: 96, vento: 84, rajada: 84, direcao: 110, atualizado: 110,
};

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
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths("larguras-ventos-v1", W_DESKTOP, W_MOBILE);
  const [sortKey, setSortKey] = useState<string>("vento_ms");
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
    const headers = ["Estação", "Município", "REDEC", "Fonte", "Tipo", "Vento (km/h)", "Rajada (km/h)", "Direção (°)", "Direção", "Atualizado em"];
    const rows = sorted.map((s) => {
      const vento = valorDe(s, "vento_ms");
      const rajada = valorDe(s, "vento_rajada_ms");
      const direcao = valorDe(s, "vento_dir_graus");
      const updated = mostRecentUpdate(s);
      return [
        s.name,
        s.municipality || "",
        redecOf(s.municipality),
        SOURCE_LABELS[s.source] ?? s.source,
        STATION_TYPE_LABELS[s.station_type] ?? s.station_type,
        vento !== null ? (Math.round(vento * 3.6 * 10) / 10).toString() : "",
        rajada !== null ? (Math.round(rajada * 3.6 * 10) / 10).toString() : "",
        direcao !== null ? Math.round(direcao).toString() : "",
        direcao !== null ? pontoCardeal(direcao) : "",
        updated ? formatTimestamp(updated) : "",
      ];
    });
    downloadCsv(`cemaden-rj-ventos-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  useImperativeHandle(ref, () => ({ exportar }));

  const larguraTotal = w.estacao + w.municipio + w.redec + w.fonte + w.tipo + w.vento + w.rajada + w.direcao + w.atualizado + W_HISTORICO;

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table className="border-collapse text-xs sm:text-sm" style={{ tableLayout: "fixed", width: larguraTotal }}>
        <colgroup>
          <col style={{ width: w.estacao }} />
          <col style={{ width: w.municipio }} />
          <col style={{ width: w.redec }} />
          <col style={{ width: w.fonte }} />
          <col style={{ width: w.tipo }} />
          <col style={{ width: w.vento }} />
          <col style={{ width: w.rajada }} />
          <col style={{ width: w.direcao }} />
          <col style={{ width: w.atualizado }} />
          <col style={{ width: W_HISTORICO }} />
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          <tr>
            <th
              className="sticky top-0 z-30 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-2 py-2 align-bottom leading-tight shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
              style={{ left: 0, width: w.estacao, maxWidth: w.estacao, minWidth: w.estacao }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
              {resizer("estacao")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-2 py-2 align-bottom leading-tight"
              style={{ width: w.municipio, maxWidth: w.municipio, minWidth: w.municipio }}
              onClick={() => toggleSort("municipality")}
            >
              Município{arrow("municipality")}
              {resizer("municipio")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-2 py-2 align-bottom leading-tight"
              style={{ width: w.redec, maxWidth: w.redec, minWidth: w.redec }}
              onClick={() => toggleSort("redec")}
            >
              REDEC{arrow("redec")}
              {resizer("redec")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-2 py-2 align-bottom leading-tight"
              style={{ width: w.fonte, maxWidth: w.fonte, minWidth: w.fonte }}
              onClick={() => toggleSort("source")}
            >
              Fonte{arrow("source")}
              {resizer("fonte")}
            </th>
            <th
              className="sticky top-0 z-20 whitespace-normal break-words bg-gray-100 px-2 py-2 align-bottom leading-tight"
              style={{ width: w.tipo, maxWidth: w.tipo, minWidth: w.tipo }}
            >
              Tipo
              {resizer("tipo")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-1 py-2 text-right align-bottom leading-tight"
              style={{ width: w.vento, maxWidth: w.vento, minWidth: w.vento }}
              onClick={() => toggleSort("vento_ms")}
              title="Velocidade do vento"
            >
              Vento (km/h){arrow("vento_ms")}
              {resizer("vento")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-1 py-2 text-right align-bottom leading-tight"
              style={{ width: w.rajada, maxWidth: w.rajada, minWidth: w.rajada }}
              onClick={() => toggleSort("vento_rajada_ms")}
              title="Rajada de vento"
            >
              Rajada (km/h){arrow("vento_rajada_ms")}
              {resizer("rajada")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-1 py-2 text-center align-bottom leading-tight"
              style={{ width: w.direcao, maxWidth: w.direcao, minWidth: w.direcao }}
              onClick={() => toggleSort("vento_dir_graus")}
              title="Direção do vento (° e posição na roda dos ventos)"
            >
              Direção (°){arrow("vento_dir_graus")}
              {resizer("direcao")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-nowrap bg-gray-100 px-2 py-2 align-bottom leading-tight"
              style={{ width: w.atualizado, maxWidth: w.atualizado, minWidth: w.atualizado }}
              onClick={() => toggleSort("updated")}
            >
              Atualizado em{arrow("updated")}
              {resizer("atualizado")}
            </th>
            <th
              className="sticky top-0 z-20 whitespace-nowrap bg-gray-100 px-1 py-2 text-center align-bottom leading-tight"
              style={{ width: W_HISTORICO, maxWidth: W_HISTORICO, minWidth: W_HISTORICO }}
              title="Abrir em nova aba"
            >
              Histórico
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const updated = mostRecentUpdate(s);
            const atraso = getDelayStatus(updated);
            const vento = valorDe(s, "vento_ms");
            const rajada = valorDe(s, "vento_rajada_ms");
            const direcao = valorDe(s, "vento_dir_graus");
            return (
              <tr key={`${s.source}-${s.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                <td
                  className="sticky z-10 whitespace-normal break-words align-middle bg-white px-2 py-1 font-medium leading-tight shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, width: w.estacao, maxWidth: w.estacao, minWidth: w.estacao }}
                >
                  <CampoClicavel id={s.id} valor={s.name} onOpenStation={onOpenStation} className="text-left text-sedec-600 underline-offset-2 hover:underline" />
                </td>
                <td className="whitespace-normal break-words align-middle px-2 py-1 leading-tight text-gray-600" style={{ width: w.municipio, maxWidth: w.municipio, minWidth: w.municipio }}>
                  <CampoClicavel id={s.id} valor={s.municipality || "—"} onOpenStation={onOpenStation} />
                </td>
                <td className="whitespace-normal break-words align-middle px-2 py-1 leading-tight text-gray-500" style={{ width: w.redec, maxWidth: w.redec, minWidth: w.redec }}>
                  <CampoClicavel id={s.id} valor={redecOf(s.municipality) || "—"} onOpenStation={onOpenStation} />
                </td>
                <td
                  className="whitespace-normal break-words align-middle px-2 py-1 font-semibold leading-tight"
                  style={{ width: w.fonte, maxWidth: w.fonte, minWidth: w.fonte, color: SOURCE_COLORS[s.source] ?? "#374151" }}
                  title={s.source}
                >
                  <CampoClicavel id={s.id} valor={SOURCE_LABELS[s.source] ?? s.source} onOpenStation={onOpenStation} />
                </td>
                <td className="whitespace-normal break-words align-middle px-2 py-1 leading-tight text-gray-600" style={{ width: w.tipo, maxWidth: w.tipo, minWidth: w.tipo }}>
                  <CampoClicavel id={s.id} valor={STATION_TYPE_LABELS[s.station_type] ?? s.station_type} onOpenStation={onOpenStation} />
                </td>
                <td className="whitespace-nowrap px-1.5 py-1 text-right align-middle text-gray-800">
                  {vento !== null ? (Math.round(vento * 3.6 * 10) / 10).toFixed(1) : "—"}
                </td>
                <td className="whitespace-nowrap px-1.5 py-1 text-right align-middle text-gray-800">
                  {rajada !== null ? (Math.round(rajada * 3.6 * 10) / 10).toFixed(1) : "—"}
                </td>
                <td className="px-1.5 py-1 align-middle">
                  <div className="flex items-center justify-center gap-1.5">
                    <Bussola graus={direcao} />
                    <span className="text-gray-700">{direcao !== null ? `${Math.round(direcao)}° ${pontoCardeal(direcao)}` : "—"}</span>
                  </div>
                </td>
                <td className="whitespace-normal break-words px-2 py-1 leading-tight" style={{ width: w.atualizado, maxWidth: w.atualizado, minWidth: w.atualizado, color: atraso.color }} title={atraso.label}>
                  {updated ? formatTimestamp(updated) : "—"}
                </td>
                <td className="px-1 py-1 text-center align-middle">
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
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        Só aparecem aqui estações que reportam velocidade, rajada ou direção do vento. Vento é guardado em m/s e
        exibido em km/h, igual ao resto do painel. Clique num cabeçalho pra ordenar; arraste a borda direita pra
        ajustar a largura da coluna.{" "}
        <button type="button" onClick={resetAll} className="underline hover:text-gray-600">
          Restaurar larguras
        </button>
      </div>
    </div>
  );
});

export default VentosTable;
