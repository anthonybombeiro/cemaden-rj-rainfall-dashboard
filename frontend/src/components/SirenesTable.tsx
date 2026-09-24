"use client";

import { useMemo, useState } from "react";

import { SireneStation } from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";

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
const W_ESTACAO = 160;
const W_MUNICIPIO = 120;
const W_REDEC = 90;
const W_BAIRRO = 150;
const W_STATUS = 100;
const W_ACIONAMENTO = 130;
const W_CHUVA = 80;
const W_ATUALIZADO = 150;

export default function SirenesTable({ stations }: { stations: SireneStation[] }) {
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

  const nOnline = stations.filter((s) => s.status_estacao === "ativa").length;
  const nOffline = stations.filter((s) => s.status_estacao === "inativa").length;
  const nTocando = stations.filter((s) => s.tocando).length;

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-white px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span className="font-semibold text-gray-800">{stations.length} sirenes</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
            {nOnline} online
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
            {nOffline} offline
          </span>
          <span className="flex items-center gap-1 font-semibold text-red-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
            {nTocando} tocando agora
          </span>
        </div>
        <button
          onClick={exportar}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          title="Exportar a tabela (com a ordenação atual) em CSV"
        >
          ⬇ Exportar CSV
        </button>
      </div>
      <table className="border-collapse text-xs sm:text-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: W_ESTACAO }} />
          <col style={{ width: W_MUNICIPIO }} />
          <col style={{ width: W_REDEC }} />
          <col style={{ width: W_BAIRRO }} />
          <col style={{ width: W_STATUS }} />
          <col style={{ width: W_ACIONAMENTO }} />
          <col style={{ width: W_CHUVA }} />
          <col style={{ width: W_ATUALIZADO }} />
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          <tr>
            <th
              className="sticky top-9 z-30 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
              style={{ left: 0, width: W_ESTACAO, maxWidth: W_ESTACAO, minWidth: W_ESTACAO }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_MUNICIPIO, maxWidth: W_MUNICIPIO, minWidth: W_MUNICIPIO }}
              onClick={() => toggleSort("municipality")}
            >
              Município{arrow("municipality")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_REDEC, maxWidth: W_REDEC, minWidth: W_REDEC }}
              onClick={() => toggleSort("redec")}
            >
              REDEC{arrow("redec")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_BAIRRO, maxWidth: W_BAIRRO, minWidth: W_BAIRRO }}
              onClick={() => toggleSort("bairro")}
            >
              Bairro / Endereço{arrow("bairro")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_STATUS, maxWidth: W_STATUS, minWidth: W_STATUS }}
              onClick={() => toggleSort("status")}
            >
              Status{arrow("status")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_ACIONAMENTO, maxWidth: W_ACIONAMENTO, minWidth: W_ACIONAMENTO }}
              onClick={() => toggleSort("prioridade")}
            >
              Acionamento{arrow("prioridade")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden whitespace-nowrap bg-gray-100 px-1 py-2 text-right"
              style={{ width: W_CHUVA, maxWidth: W_CHUVA, minWidth: W_CHUVA }}
              onClick={() => toggleSort("ultima_chuva_mm")}
            >
              Últ. chuva{arrow("ultima_chuva_mm")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_ATUALIZADO, maxWidth: W_ATUALIZADO, minWidth: W_ATUALIZADO }}
              onClick={() => toggleSort("updated")}
            >
              Atualizado em{arrow("updated")}
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
                  className="sticky overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1 font-medium text-gray-900 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, width: W_ESTACAO, maxWidth: W_ESTACAO, minWidth: W_ESTACAO, backgroundColor: bgFundo }}
                >
                  {s.name}
                </td>
                <td
                  className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1 text-gray-600"
                  style={{ width: W_MUNICIPIO, maxWidth: W_MUNICIPIO, minWidth: W_MUNICIPIO, backgroundColor: bgFundo }}
                >
                  {s.municipality || "—"}
                </td>
                <td
                  className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1 text-gray-500"
                  style={{ width: W_REDEC, maxWidth: W_REDEC, minWidth: W_REDEC, backgroundColor: bgFundo }}
                >
                  {s.redec || "—"}
                </td>
                <td
                  className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1 text-gray-500"
                  style={{ width: W_BAIRRO, maxWidth: W_BAIRRO, minWidth: W_BAIRRO, backgroundColor: bgFundo }}
                >
                  {[s.bairro, s.rua].filter(Boolean).join(" — ") || "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-1" style={{ backgroundColor: bgFundo }}>
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
                <td className="whitespace-nowrap px-2 py-1" style={{ backgroundColor: bgFundo }}>
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
                <td className="whitespace-nowrap px-2 py-1 text-gray-500" style={{ backgroundColor: bgFundo }}>
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
    </div>
  );
}
