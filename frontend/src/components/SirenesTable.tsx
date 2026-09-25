"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import ColumnResizer from "@/components/ColumnResizer";
import { TableExportHandle } from "@/components/tableExportHandle";
import { SireneStation } from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";
import { useColumnWidths } from "@/lib/useColumnWidths";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function formatMm(value: number | null): string {
  if (value === null) return "—";
  return `${(Math.round(value * 10) / 10).toFixed(1)} mm`;
}

/** Quanto MAIOR, mais precisa de atenção — usado só pro sort padrão
 * ("prioridade"): tocando agora > offline > online normal. O backend já
 * devolve nessa mesma ordem (ver StationViewSet.sirenes), isso só faz o
 * clique em "Status"/qualquer outro cabeçalho conseguir voltar pra essa
 * ordem depois de ordenar por outra coisa. */
function prioridade(s: SireneStation): number {
  if (s.tocando) return 2;
  if (s.status_estacao === "inativa") return 1;
  return 0;
}

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "bairro", "updated"]);

// Mesmo padrão de largura/sticky da tabela de Precipitação (pedido do
// usuário, 2026-09-23) — colgroup + maxWidth/minWidth explícitos, só
// Estação fixa. "Atualizado em" ganhou mais espaço (era w-28/112px,
// cortava a data — mesmo problema já corrigido nas outras tabelas).

// Larguras padrão (px), ajustáveis arrastando a borda direita do cabeçalho (lembradas no
// navegador). Em telas < 640px os padrões são menores. Texto quebra em várias linhas.
const W_DESKTOP: Record<string, number> = { estacao: 170, municipio: 130, redec: 140, bairro: 170, status: 104, acionamento: 130, chuva: 84, atualizado: 130 };
const W_MOBILE: Record<string, number> = { estacao: 120, municipio: 112, redec: 140, bairro: 130, status: 100, acionamento: 120, chuva: 80, atualizado: 110 };

const SirenesTable = forwardRef<TableExportHandle, { stations: SireneStation[] }>(function SirenesTable(
  { stations },
  ref,
) {
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths("larguras-sirenes-v1", W_DESKTOP, W_MOBILE);
  const [sortKey, setSortKey] = useState<string>("prioridade");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...stations];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "prioridade") cmp = prioridade(a) - prioridade(b);
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "municipality") cmp = a.municipality.localeCompare(b.municipality);
      else if (sortKey === "redec") cmp = a.redec.localeCompare(b.redec);
      else if (sortKey === "bairro") cmp = a.bairro.localeCompare(b.bairro);
      else if (sortKey === "status") cmp = a.status_estacao.localeCompare(b.status_estacao);
      else if (sortKey === "ultima_chuva_mm") {
        if (a.ultima_chuva_mm == null && b.ultima_chuva_mm == null) cmp = 0;
        else if (a.ultima_chuva_mm == null) cmp = -1;
        else if (b.ultima_chuva_mm == null) cmp = 1;
        else cmp = a.ultima_chuva_mm - b.ultima_chuva_mm;
      } else if (sortKey === "updated") cmp = (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [stations, sortKey, sortAsc]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(COLUNAS_TEXTO.has(key));
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
      "Bairro",
      "Endereço",
      "Status",
      "Acionamento",
      "Tocando desde",
      "Última chuva (mm)",
      "Atualizado em",
    ];
    const rows = sorted.map((s) => [
      s.name,
      s.municipality || "",
      s.redec || "",
      s.bairro || "",
      [s.rua, s.numero].filter(Boolean).join(", "),
      s.status_estacao === "ativa" ? "Online" : s.status_estacao === "inativa" ? "Offline" : "Desconhecido",
      s.tocando ? "TOCANDO" : "Normal",
      s.tocando_desde ? formatTimestamp(s.tocando_desde) : "",
      s.tem_pluviometro ? (s.ultima_chuva_mm ?? "") : "",
      formatTimestamp(s.updated_at),
    ]);
    downloadCsv(`cemaden-rj-sirenes-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  // Botão "Exportar CSV" e o resumo online/offline/tocando saíram daqui —
  // agora vivem na barra de filtro flutuante fora desta tabela (ver
  // FilterToggleBar.tsx/Dashboard.tsx, pedido do usuário 2026-09-23:
  // economizar altura — essa era a única das 4 tabelas que ainda tinha
  // uma barra interna própria).
  useImperativeHandle(ref, () => ({ exportar }));

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table
        className="border-collapse text-xs sm:text-sm"
        style={{ tableLayout: "fixed", width: w.estacao + w.municipio + w.redec + w.bairro + w.status + w.acionamento + w.chuva + w.atualizado }}
      >
        <colgroup>
          <col style={{ width: w.estacao }} />
          <col style={{ width: w.municipio }} />
          <col style={{ width: w.redec }} />
          <col style={{ width: w.bairro }} />
          <col style={{ width: w.status }} />
          <col style={{ width: w.acionamento }} />
          <col style={{ width: w.chuva }} />
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
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.redec, maxWidth: w.redec, minWidth: w.redec }}
              onClick={() => toggleSort("redec")}
            >
              REDEC{arrow("redec")}
              {resizer("redec")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.bairro, maxWidth: w.bairro, minWidth: w.bairro }}
              onClick={() => toggleSort("bairro")}
            >
              Bairro / Endereço{arrow("bairro")}
              {resizer("bairro")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.status, maxWidth: w.status, minWidth: w.status }}
              onClick={() => toggleSort("status")}
            >
              Status{arrow("status")}
              {resizer("status")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words leading-tight align-middle bg-gray-100 px-2 py-2"
              style={{ width: w.acionamento, maxWidth: w.acionamento, minWidth: w.acionamento }}
              onClick={() => toggleSort("prioridade")}
            >
              Acionamento{arrow("prioridade")}
              {resizer("acionamento")}
            </th>
            <th
              className="sticky top-0 align-bottom leading-tight z-20 cursor-pointer select-none whitespace-normal break-words bg-gray-100 px-1 py-2 text-right"
              style={{ width: w.chuva, maxWidth: w.chuva, minWidth: w.chuva }}
              onClick={() => toggleSort("ultima_chuva_mm")}
            >
              Últ. chuva{arrow("ultima_chuva_mm")}
              {resizer("chuva")}
            </th>
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
            const online = s.status_estacao === "ativa";
            const desconhecido = s.status_estacao === "desconhecido";
            const bgFundo = s.tocando ? "#fee2e2" : !online && !desconhecido ? "#f3f4f6" : "#ffffff";
            return (
              <tr
                key={s.id}
                className={`border-b border-gray-100 ${s.tocando ? "animate-pulse" : ""}`}
                title={s.descricao || undefined}
              >
                <td
                  className="sticky z-10 whitespace-normal break-words leading-tight align-middle px-2 py-1 font-medium text-gray-900 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, width: w.estacao, maxWidth: w.estacao, minWidth: w.estacao, backgroundColor: bgFundo }}
                >
                  {s.name}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1 text-gray-600"
                  style={{ width: w.municipio, maxWidth: w.municipio, minWidth: w.municipio, backgroundColor: bgFundo }}
                >
                  {s.municipality || "—"}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1 text-gray-500"
                  style={{ width: w.redec, maxWidth: w.redec, minWidth: w.redec, backgroundColor: bgFundo }}
                >
                  {s.redec || "—"}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1 text-gray-500"
                  style={{ width: w.bairro, maxWidth: w.bairro, minWidth: w.bairro, backgroundColor: bgFundo }}
                >
                  {[s.bairro, s.rua].filter(Boolean).join(" — ") || "—"}
                </td>
                <td className="whitespace-normal break-words leading-tight px-2 py-1" style={{ backgroundColor: bgFundo }}>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      online
                        ? "bg-emerald-100 text-emerald-700"
                        : desconhecido
                          ? "bg-gray-100 text-gray-500"
                          : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        online ? "bg-emerald-600" : desconhecido ? "bg-gray-400" : "bg-gray-500"
                      }`}
                    />
                    {online ? "Online" : desconhecido ? "Desconhecido" : "Offline"}
                  </span>
                </td>
                <td className="whitespace-normal break-words leading-tight px-2 py-1" style={{ backgroundColor: bgFundo }}>
                  {s.tocando ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                      🔊 TOCANDO
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Normal</span>
                  )}
                  {s.tocando && s.tocando_desde && (
                    <div className="mt-0.5 text-[10px] text-gray-500">desde {formatTimestamp(s.tocando_desde)}</div>
                  )}
                </td>
                <td
                  className="whitespace-nowrap px-1.5 py-1 text-right text-gray-700"
                  style={{ backgroundColor: bgFundo }}
                >
                  {s.tem_pluviometro ? formatMm(s.ultima_chuva_mm) : <span className="text-gray-300">n/d</span>}
                </td>
                <td className="whitespace-normal break-words leading-tight px-2 py-1 text-gray-500" style={{ backgroundColor: bgFundo }}>
                  {formatTimestamp(s.updated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma sirene encontrada com os filtros atuais.</div>
      )}
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        Status vem do próprio portal de sirenes da CEMADEN-RJ (GridLab), lido junto com as
        leituras a cada sincronização — não é uma checagem em tempo real feita por este painel.
        &ldquo;Últ. chuva&rdquo; só existe pras sirenes com pluviômetro acoplado (usado pra
        parametrizar o acionamento automático dela). Clique em qualquer cabeçalho pra ordenar.
      </div>
      <div className="sticky left-0 border-t border-gray-100 p-2 text-xs text-gray-400">
        Arraste a borda direita de um cabeçalho para ajustar a largura da coluna (duplo clique restaura).{" "}
        <button type="button" onClick={resetAll} className="underline hover:text-gray-600">
          Restaurar larguras
        </button>
      </div>
    </div>
  );
});

export default SirenesTable;
