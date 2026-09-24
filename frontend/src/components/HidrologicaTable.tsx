"use client";

import { useMemo, useState } from "react";

import {
  getChuva1hFaixa,
  getDelayStatus,
  HidrologicaStation,
  normalizeMunicipioName,
  SOURCE_COLORS,
  SOURCE_LABELS,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function formatMm(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(Math.round(value * 10) / 10).toFixed(1)}`;
}

function formatMetros(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(2);
}

/** Colunas de NÍVEL primeiro, chuva depois (pedido do usuário, 2026-09-23:
 * "apresente os dados de leitura de níveis de rio e depois as leituras
 * pluviométricas"). Nível não "acumula" como chuva — é uma leitura de
 * estado, por isso é atual/máximo/mínimo em vez de soma por janela. */
const COLUNAS_NIVEL: { key: keyof HidrologicaStation; label: string; titulo: string }[] = [
  { key: "nivel_atual_m", label: "Nível Atual", titulo: "Última leitura de nível do rio (m)" },
  { key: "nivel_max_24h_m", label: "Nível Máx 24h", titulo: "Maior nível registrado nas últimas 24h (m)" },
  { key: "nivel_min_24h_m", label: "Nível Mín 24h", titulo: "Menor nível registrado nas últimas 24h (m)" },
];

/** Mesmas ~20 janelas de chuva da tabela de Precipitação (pedido do
 * usuário: "para os demais campos e colunas usar o que já foi
 * pré-estabelecido na tabela precipitação") — ver PrecipitationTable.tsx. */
const JANELAS_CHUVA: { key: keyof HidrologicaStation; label: string; titulo: string }[] = [
  {
    key: "chuva_agora_mm",
    label: "Últ.",
    titulo:
      'Última leitura recebida da fonte, como ela mesma reporta — NÃO é uma janela fixa: cada fonte tem sua ' +
      'própria cadência (de 5min a 1h dependendo da rede).',
  },
  { key: "acumulado_5min_mm", label: "5min", titulo: "Acumulado nos últimos 5 minutos" },
  { key: "acumulado_10min_mm", label: "10min", titulo: "Acumulado nos últimos 10 minutos" },
  { key: "acumulado_15min_mm", label: "15min", titulo: "Acumulado nos últimos 15 minutos" },
  { key: "acumulado_30min_mm", label: "30min", titulo: "Acumulado nos últimos 30 minutos" },
  { key: "acumulado_1h_mm", label: "1h", titulo: "Acumulado na última 1 hora" },
  { key: "acumulado_2h_mm", label: "2h", titulo: "Acumulado nas últimas 2 horas" },
  { key: "acumulado_3h_mm", label: "3h", titulo: "Acumulado nas últimas 3 horas" },
  { key: "acumulado_4h_mm", label: "4h", titulo: "Acumulado nas últimas 4 horas" },
  { key: "acumulado_6h_mm", label: "6h", titulo: "Acumulado nas últimas 6 horas" },
  { key: "acumulado_12h_mm", label: "12h", titulo: "Acumulado nas últimas 12 horas" },
  { key: "acumulado_24h_mm", label: "24h", titulo: "Acumulado nas últimas 24 horas" },
  { key: "acumulado_36h_mm", label: "36h", titulo: "Acumulado nas últimas 36 horas" },
  { key: "acumulado_48h_mm", label: "48h", titulo: "Acumulado nas últimas 48 horas" },
  { key: "acumulado_72h_mm", label: "72h", titulo: "Acumulado nas últimas 72 horas" },
  { key: "acumulado_96h_mm", label: "96h", titulo: "Acumulado nas últimas 96 horas" },
  { key: "acumulado_168h_mm", label: "168h", titulo: "Acumulado nas últimas 168 horas (7 dias)" },
  { key: "acumulado_1mes_mm", label: "1 Mês", titulo: "Acumulado nos últimos 30 dias corridos (janela móvel)" },
  { key: "acumulado_hoje_mm", label: "Hoje", titulo: 'Acumulado calendário: desde 00h (hora local) até agora.' },
  { key: "acumulado_mes_mm", label: "No Mês", titulo: "Acumulado calendário: desde o dia 1 do mês corrente." },
  { key: "pico_mm", label: "Pico", titulo: "Maior leitura individual de chuva nas últimas 24h" },
];

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "source", "updated"]);

// Mesma decisão de sticky da tabela de Precipitação: só Estação fixa.
const W_REDEC = 100;
const W_MUNICIPIO = 140;
const W_ESTACAO = 140;
const W_NIVEL = 90;
const W_JANELA = 44;
const W_FONTE = 80;
const W_ATUALIZADO = 96;

export default function HidrologicaTable({
  stations,
  municipioRedecMap = {},
}: {
  stations: HidrologicaStation[];
  municipioRedecMap?: Record<string, string>;
}) {
  // Padrão: maior nível ATUAL primeiro — é o que mais importa pra decisão
  // operacional imediata numa tabela de monitoramento de cheias.
  const [sortKey, setSortKey] = useState<string>("nivel_atual_m");
  const [sortAsc, setSortAsc] = useState(false);
  const redecOf = (municipality: string) => municipioRedecMap[normalizeMunicipioName(municipality)] ?? "";

  const sorted = useMemo(() => {
    const copy = [...stations];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "municipality") cmp = a.municipality.localeCompare(b.municipality);
      else if (sortKey === "redec") cmp = redecOf(a.municipality).localeCompare(redecOf(b.municipality));
      else if (sortKey === "source") cmp = a.source.localeCompare(b.source);
      else if (sortKey === "updated") cmp = (a.updated_at ?? "").localeCompare(b.updated_at ?? "");
      else {
        const va = a[sortKey as keyof HidrologicaStation] as number | null;
        const vb = b[sortKey as keyof HidrologicaStation] as number | null;
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        cmp = va - vb;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [stations, sortKey, sortAsc, municipioRedecMap]);

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
      "REDEC",
      "Município",
      "Estação",
      ...COLUNAS_NIVEL.map((c) => `${c.label} (m)`),
      ...JANELAS_CHUVA.map((j) => `${j.label} (mm)`),
      "Fonte",
      "Atualizado em",
    ];
    const rows = sorted.map((s) => [
      redecOf(s.municipality),
      s.municipality || "",
      s.name,
      ...COLUNAS_NIVEL.map((c) => (s[c.key] as number | null) ?? ""),
      ...JANELAS_CHUVA.map((j) => (s[j.key] as number | null) ?? ""),
      SOURCE_LABELS[s.source] ?? s.source,
      formatTimestamp(s.updated_at),
    ]);
    downloadCsv(`cemaden-rj-hidrologicas-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <div className="sticky top-0 z-40 flex justify-end border-b border-gray-100 bg-white px-3 py-1.5">
        <button
          onClick={exportar}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          title="Exportar a tabela (com o filtro e a ordenação atuais) em CSV"
        >
          ⬇ Exportar CSV
        </button>
      </div>
      <table className="border-collapse text-xs sm:text-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: W_ESTACAO }} />
          <col style={{ width: W_REDEC }} />
          <col style={{ width: W_MUNICIPIO }} />
          {COLUNAS_NIVEL.map((c) => (
            <col key={c.key} style={{ width: W_NIVEL }} />
          ))}
          {JANELAS_CHUVA.map((j) => (
            <col key={j.key} style={{ width: W_JANELA }} />
          ))}
          <col style={{ width: W_FONTE }} />
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
              style={{ width: W_REDEC, maxWidth: W_REDEC, minWidth: W_REDEC }}
              onClick={() => toggleSort("redec")}
            >
              REDEC{arrow("redec")}
            </th>
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_MUNICIPIO, maxWidth: W_MUNICIPIO, minWidth: W_MUNICIPIO }}
              onClick={() => toggleSort("municipality")}
            >
              Município{arrow("municipality")}
            </th>
            {COLUNAS_NIVEL.map((c) => (
              <th
                key={c.key}
                className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden whitespace-nowrap bg-sedec-50 px-1 py-2 text-right"
                style={{ width: W_NIVEL, maxWidth: W_NIVEL, minWidth: W_NIVEL }}
                onClick={() => toggleSort(c.key)}
                title={c.titulo}
              >
                {c.label}
                {arrow(c.key)}
              </th>
            ))}
            {JANELAS_CHUVA.map((j) => (
              <th
                key={j.key}
                className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden whitespace-nowrap bg-gray-100 px-1 py-2 text-right"
                style={{ width: W_JANELA, maxWidth: W_JANELA, minWidth: W_JANELA }}
                onClick={() => toggleSort(j.key)}
                title={j.titulo}
              >
                {j.label}
                {arrow(j.key)}
              </th>
            ))}
            <th
              className="sticky top-9 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_FONTE, maxWidth: W_FONTE, minWidth: W_FONTE }}
              onClick={() => toggleSort("source")}
            >
              Fonte{arrow("source")}
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
            const atraso = getDelayStatus(s.updated_at);
            const faixa1h = getChuva1hFaixa(s.acumulado_1h_mm, atraso.atrasado);
            const bgFundo = faixa1h?.bg ?? "#ffffff";
            const corTexto = faixa1h?.text;
            return (
              <tr key={`${s.source}-${s.id}`} className="border-b border-gray-100" title={faixa1h?.label}>
                <td
                  className="sticky overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1 font-medium shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{
                    left: 0,
                    width: W_ESTACAO,
                    maxWidth: W_ESTACAO,
                    minWidth: W_ESTACAO,
                    backgroundColor: bgFundo,
                    color: corTexto ?? "#111827",
                  }}
                  title={s.name}
                >
                  {s.name}
                </td>
                <td
                  className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1"
                  style={{
                    width: W_REDEC,
                    maxWidth: W_REDEC,
                    minWidth: W_REDEC,
                    backgroundColor: bgFundo,
                    color: corTexto ?? "#6b7280",
                  }}
                >
                  {redecOf(s.municipality) || "—"}
                </td>
                <td
                  className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1"
                  style={{
                    width: W_MUNICIPIO,
                    maxWidth: W_MUNICIPIO,
                    minWidth: W_MUNICIPIO,
                    backgroundColor: bgFundo,
                    color: corTexto ?? "#4b5563",
                  }}
                >
                  {s.municipality || "—"}
                </td>
                {COLUNAS_NIVEL.map((c) => (
                  <td
                    key={c.key}
                    className="whitespace-nowrap bg-sedec-50/40 px-1.5 py-1 text-right font-medium"
                    style={{ color: corTexto ?? "#1f3864" }}
                  >
                    {formatMetros(s[c.key] as number | null)}
                  </td>
                ))}
                {JANELAS_CHUVA.map((j) => (
                  <td
                    key={j.key}
                    className="whitespace-nowrap px-1.5 py-1 text-right"
                    style={{ backgroundColor: bgFundo, color: corTexto ?? "#1f2937" }}
                  >
                    {formatMm(s[j.key] as number | null)}
                  </td>
                ))}
                <td
                  className="whitespace-nowrap px-2 py-1 font-semibold"
                  style={{ backgroundColor: bgFundo, color: faixa1h ? faixa1h.text : (SOURCE_COLORS[s.source] ?? "#374151") }}
                  title={s.source}
                >
                  {SOURCE_LABELS[s.source] ?? s.source}
                </td>
                <td
                  className="whitespace-nowrap px-2 py-1"
                  style={{ backgroundColor: bgFundo, color: faixa1h ? faixa1h.text : atraso.color }}
                  title={atraso.label}
                >
                  {formatTimestamp(s.updated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma estação hidrológica encontrada.</div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500 sm:text-[11px]">
        <span>Fundo da linha por chuva na última 1h:</span>
        {[
          { bg: "#BEBEBE", label: "Atrasada" },
          { bg: "#63B8FF", label: "Fraca" },
          { bg: "#FFFF66", label: "Moderada" },
          { bg: "#FFA600", label: "Forte" },
          { bg: "#CC0000", label: "Muito Forte" },
        ].map((f) => (
          <span key={f.label} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ backgroundColor: f.bg }} />
            {f.label}
          </span>
        ))}
      </div>
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        Nível de rio é uma leitura de ESTADO (metros), não uma taxa acumulável — por isso mostra Atual/Máx 24h/Mín
        24h em vez de somar janelas. As colunas de chuva à direita seguem exatamente a mesma lógica da tabela de
        Precipitação (ver lá pra detalhes de &ldquo;Últ.&rdquo;/&ldquo;Hoje&rdquo;/&ldquo;No Mês&rdquo;) — só
        aparecem preenchidas pras estações que também têm pluviômetro colocado. Só a coluna Estação fica fixa
        rolando a tabela pro lado. Clique em qualquer cabeçalho pra ordenar.
      </div>
    </div>
  );
}
