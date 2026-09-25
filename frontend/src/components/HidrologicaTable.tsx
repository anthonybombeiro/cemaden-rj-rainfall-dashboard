"use client";

import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import { TableExportHandle } from "@/components/tableExportHandle";
import {
  COTA_ESTILOS,
  CotaClasse,
  getChuva1hFaixa,
  getDelayStatus,
  HidrologicaStation,
  normalizeMunicipioName,
  SOURCE_COLORS,
  SOURCE_LABELS,
  TendenciaNivel,
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

const COLUNA_NIVEL = {
  key: "nivel_atual_m" as keyof HidrologicaStation,
  label: "Nível Atual",
  titulo: "Última leitura de nível do rio (m); cor do fundo = cota do rio (ver legenda)",
};

const TENDENCIA_ESTILO: Record<TendenciaNivel, { cor: string; titulo: string }> = {
  subindo: { cor: "#DC2626", titulo: "Subindo nas últimas 3 leituras" },
  estavel: { cor: "#6B7280", titulo: "Estável nas últimas 3 leituras" },
  descendo: { cor: "#16A34A", titulo: "Descendo nas últimas 3 leituras" },
};
const TENDENCIA_ORDEM: Record<string, number> = { subindo: 2, estavel: 1, descendo: 0 };

function SetaSituacao({ tendencia }: { tendencia: TendenciaNivel | null }) {
  if (!tendencia) return <span className="text-gray-400">—</span>;
  const { cor, titulo } = TENDENCIA_ESTILO[tendencia];
  const Icone = tendencia === "subindo" ? ArrowUp : tendencia === "descendo" ? ArrowDown : ArrowRight;
  return (
    <span title={titulo} aria-label={titulo} className="inline-flex justify-center" style={{ color: cor }}>
      <Icone size={18} strokeWidth={3} />
    </span>
  );
}

function cotaTitulo(s: HidrologicaStation): string {
  const c = s.cota;
  if (!c || (c.atencao_cm == null && c.alerta_cm == null && c.inundacao_cm == null)) {
    return "Sem cotas definidas para esta estação";
  }
  const f = (v: number | null) => (v == null ? "—" : `${Math.round(v)} cm`);
  return `Atenção ${f(c.atencao_cm)} · Alerta ${f(c.alerta_cm)} · Transbordo ${f(c.inundacao_cm)} · Extrema ${f(c.extrema_cm)}`;
}

/** Mesmas ~20 janelas de chuva da tabela de Precipitação (pedido do
 * usuário: "para os demais campos e colunas usar o que já foi
 * pré-estabelecido na tabela precipitação") — ver PrecipitationTable.tsx. */
const JANELAS_CHUVA: { key: keyof HidrologicaStation; label: string; titulo: string }[] = [
  { key: "acumulado_15min_mm", label: "15min", titulo: "Acumulado nos últimos 15 minutos" },
  { key: "acumulado_30min_mm", label: "30min", titulo: "Acumulado nos últimos 30 minutos" },
  { key: "acumulado_1h_mm", label: "1h", titulo: "Acumulado na última 1 hora" },
  { key: "acumulado_2h_mm", label: "2h", titulo: "Acumulado nas últimas 2 horas" },
  { key: "acumulado_3h_mm", label: "3h", titulo: "Acumulado nas últimas 3 horas" },
  { key: "acumulado_4h_mm", label: "4h", titulo: "Acumulado nas últimas 4 horas" },
  { key: "acumulado_6h_mm", label: "6h", titulo: "Acumulado nas últimas 6 horas" },
  { key: "acumulado_12h_mm", label: "12h", titulo: "Acumulado nas últimas 12 horas" },
  { key: "acumulado_24h_mm", label: "24h", titulo: "Acumulado nas últimas 24 horas" },
  { key: "acumulado_48h_mm", label: "48h", titulo: "Acumulado nas últimas 48 horas" },
  { key: "acumulado_96h_mm", label: "96h", titulo: "Acumulado nas últimas 96 horas" },
  { key: "acumulado_1mes_mm", label: "1 Mês", titulo: "Acumulado nos últimos 30 dias corridos (janela móvel)" },
  { key: "acumulado_mes_mm", label: "No Mês", titulo: "Acumulado calendário: desde o dia 1 do mês corrente." },
];

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "rio", "bacia", "source", "updated"]);

// Mesma decisão de sticky da tabela de Precipitação: só Estação fixa.
const W_REDEC = 100;
const W_MUNICIPIO = 140;
const W_ESTACAO = 140;
const W_RIO = 130;
const W_NIVEL = 106;
const W_SITUACAO = 88;
const W_BACIA = 200;
const W_JANELA = 44;
const W_FONTE = 80;
const W_ATUALIZADO = 96;

const HidrologicaTable = forwardRef<
  TableExportHandle,
  {
    stations: HidrologicaStation[];
    municipioRedecMap?: Record<string, string>;
  }
>(function HidrologicaTable({ stations, municipioRedecMap = {} }, ref) {
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
      else if (sortKey === "rio") cmp = (a.rio_monitorado || "").localeCompare(b.rio_monitorado || "");
      else if (sortKey === "bacia") cmp = `${a.bacia}${a.regiao_hidrografica}`.localeCompare(`${b.bacia}${b.regiao_hidrografica}`);
      else if (sortKey === "situacao") cmp = (TENDENCIA_ORDEM[a.tendencia ?? ""] ?? -1) - (TENDENCIA_ORDEM[b.tendencia ?? ""] ?? -1);
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
      "Rio Monitorado",
      "Nível Atual (m)",
      "Cota (classe)",
      "Situação",
      ...JANELAS_CHUVA.map((j) => `${j.label} (mm)`),
      "Bacia",
      "Região Hidrográfica",
      "Código ANA (plu)",
      "Código ANA (flu)",
      "Fonte",
      "Atualizado em",
    ];
    const rows = sorted.map((s) => [
      redecOf(s.municipality),
      s.municipality || "",
      s.name,
      s.rio_monitorado || "",
      s.nivel_atual_m ?? "",
      s.cota_classe ? COTA_ESTILOS[s.cota_classe].label : "",
      s.tendencia ? TENDENCIA_ESTILO[s.tendencia].titulo : "",
      ...JANELAS_CHUVA.map((j) => (s[j.key] as number | null) ?? ""),
      s.bacia || "",
      s.regiao_hidrografica || "",
      s.ana_codigo_plu || "",
      s.ana_codigo_flu || "",
      SOURCE_LABELS[s.source] ?? s.source,
      formatTimestamp(s.updated_at),
    ]);
    downloadCsv(`cemaden-rj-hidrologicas-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  // Botão "Exportar CSV" vive na barra de filtro flutuante fora desta
  // tabela (ver FilterToggleBar.tsx/Dashboard.tsx, pedido do usuário
  // 2026-09-23: economizar altura).
  useImperativeHandle(ref, () => ({ exportar }));

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table className="border-collapse text-xs sm:text-sm" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: W_ESTACAO }} />
          <col style={{ width: W_REDEC }} />
          <col style={{ width: W_MUNICIPIO }} />
          <col style={{ width: W_RIO }} />
          <col style={{ width: W_NIVEL }} />
          <col style={{ width: W_SITUACAO }} />
          {JANELAS_CHUVA.map((j) => (
            <col key={j.key} style={{ width: W_JANELA }} />
          ))}
          <col style={{ width: W_BACIA }} />
          <col style={{ width: W_FONTE }} />
          <col style={{ width: W_ATUALIZADO }} />
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          <tr>
            <th
              className="sticky top-0 z-30 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
              style={{ left: 0, width: W_ESTACAO, maxWidth: W_ESTACAO, minWidth: W_ESTACAO }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_REDEC, maxWidth: W_REDEC, minWidth: W_REDEC }}
              onClick={() => toggleSort("redec")}
            >
              REDEC{arrow("redec")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_MUNICIPIO, maxWidth: W_MUNICIPIO, minWidth: W_MUNICIPIO }}
              onClick={() => toggleSort("municipality")}
            >
              Município{arrow("municipality")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_RIO, maxWidth: W_RIO, minWidth: W_RIO }}
              onClick={() => toggleSort("rio")}
            >
              Rio Monitorado{arrow("rio")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden whitespace-nowrap bg-sedec-50 px-1 py-2 text-right"
              style={{ width: W_NIVEL, maxWidth: W_NIVEL, minWidth: W_NIVEL }}
              onClick={() => toggleSort(COLUNA_NIVEL.key as string)}
              title={COLUNA_NIVEL.titulo}
            >
              {COLUNA_NIVEL.label}
              {arrow(COLUNA_NIVEL.key as string)}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden whitespace-nowrap bg-sedec-50 px-1 py-2 text-center"
              style={{ width: W_SITUACAO, maxWidth: W_SITUACAO, minWidth: W_SITUACAO }}
              onClick={() => toggleSort("situacao")}
              title="Direção do nível do rio nas últimas 3 leituras"
            >
              Situação{arrow("situacao")}
            </th>
            {JANELAS_CHUVA.map((j) => (
              <th
                key={j.key}
                className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden whitespace-nowrap bg-gray-100 px-1 py-2 text-right"
                style={{ width: W_JANELA, maxWidth: W_JANELA, minWidth: W_JANELA }}
                onClick={() => toggleSort(j.key)}
                title={j.titulo}
              >
                {j.label}
                {arrow(j.key)}
              </th>
            ))}
            <th
              className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_BACIA, maxWidth: W_BACIA, minWidth: W_BACIA }}
              onClick={() => toggleSort("bacia")}
              title="Bacia e Região Hidrográfica"
            >
              Bacia / Região Hidrográfica{arrow("bacia")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap bg-gray-100 px-2 py-2"
              style={{ width: W_FONTE, maxWidth: W_FONTE, minWidth: W_FONTE }}
              onClick={() => toggleSort("source")}
            >
              Fonte{arrow("source")}
            </th>
            <th
              className="sticky top-0 z-20 cursor-pointer select-none whitespace-nowrap bg-gray-100 px-2 py-2"
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
            const cotaEstilo = s.cota_classe ? COTA_ESTILOS[s.cota_classe as CotaClasse] : undefined;
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
                <td
                  className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1"
                  style={{ backgroundColor: bgFundo, color: corTexto ?? "#4b5563" }}
                  title={s.rio_monitorado}
                >
                  {s.rio_monitorado || "—"}
                </td>
                <td
                  className="whitespace-nowrap px-1.5 py-1 text-right font-semibold"
                  style={{
                    backgroundColor: cotaEstilo?.bg ?? "#ffffff",
                    color: cotaEstilo?.text ?? "#1f3864",
                  }}
                  title={`${cotaEstilo ? cotaEstilo.label + " — " : ""}${cotaTitulo(s)}`}
                >
                  {formatMetros(s.nivel_atual_m)}
                </td>
                <td className="px-1 py-1 text-center" style={{ backgroundColor: bgFundo }}>
                  <SetaSituacao tendencia={s.tendencia} />
                </td>
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
                  className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-1"
                  style={{ backgroundColor: bgFundo, color: corTexto ?? "#4b5563" }}
                  title={[s.bacia, s.regiao_hidrografica].filter(Boolean).join(" — ")}
                >
                  {[s.bacia, s.regiao_hidrografica].filter(Boolean).join(" / ") || "—"}
                </td>
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
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500 sm:text-[11px]">
        <span>Cor da célula Nível Atual por cota do rio:</span>
        {(["normal", "atencao", "alerta", "transbordo", "extrema", "sem_cota"] as CotaClasse[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-sm border border-black/10"
              style={{ backgroundColor: COTA_ESTILOS[k].bg }}
            />
            {COTA_ESTILOS[k].label}
            {k === "extrema" ? " (20% acima do transbordo)" : ""}
          </span>
        ))}
        <span className="ml-2 flex items-center gap-1">
          Situação:
          <ArrowUp size={13} strokeWidth={3} style={{ color: TENDENCIA_ESTILO.subindo.cor }} /> subindo
          <ArrowRight size={13} strokeWidth={3} style={{ color: TENDENCIA_ESTILO.estavel.cor }} /> estável
          <ArrowDown size={13} strokeWidth={3} style={{ color: TENDENCIA_ESTILO.descendo.cor }} /> descendo (3 últimas
          leituras)
        </span>
      </div>
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        Nível de rio é uma leitura de ESTADO (metros), não uma taxa acumulável. As cotas (Atenção, Alerta,
        Transbordo) vêm da tabela de cotas hidrológicas (editável no Admin); Extrema = 20% acima do Transbordo;
        abaixo da Atenção é Cota Normal. As colunas de chuva seguem a lógica da tabela de Precipitação e só
        aparecem preenchidas pras estações que também têm pluviômetro. Só a coluna Estação fica fixa rolando a
        tabela pro lado. Clique em qualquer cabeçalho pra ordenar.
      </div>
    </div>
  );
});

export default HidrologicaTable;
