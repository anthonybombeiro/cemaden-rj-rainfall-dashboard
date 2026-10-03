"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import ColumnResizer from "@/components/ColumnResizer";
import { CampoClicavel } from "@/components/EstacaoCellLinks";
import { TableExportHandle } from "@/components/tableExportHandle";
import {
  getChuva1hFaixa,
  getChuva24hNivel,
  getDelayFaixaSalvar,
  getDelayStatus,
  normalizeMunicipioName,
  RedeSource,
  RedeStation,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";
import { useColumnWidths } from "@/lib/useColumnWidths";

// Tabela individual por rede (03/10/2026) — Plugfield, Macaé (UFRJ) e
// Wunderground. Mesmo desenho da tabela "CEMADEN Nacional": valores OFICIAIS da
// fonte, linhas pela chuva de 1 h (maior primeiro), cores de chuva do painel,
// atraso sinalizado (🕒), REDEC, hora da atualização e código por último.

type Coluna = {
  key: string;
  label: string;
  titulo: string;
  get: (s: RedeStation) => number | null | undefined;
  /** "mm" = chuva (1 casa); "num" = outra grandeza (1 casa); "ctl" = coluna de controle (nosso cálculo), esmaecida. */
  tipo: "mm" | "num" | "ctl";
};

const nosso = (j: string) => (s: RedeStation) => s.nosso[j];
const oficial = (j: string) => (s: RedeStation) => s.oficial[j];

const METEO: Coluna[] = [
  { key: "temp", label: "T °C", titulo: "Temperatura do ar (última leitura)", get: (s) => s.atual.temp, tipo: "num" },
  { key: "umid", label: "UR %", titulo: "Umidade relativa (última leitura)", get: (s) => s.atual.umid, tipo: "num" },
  {
    key: "vento",
    label: "Vento",
    titulo: "Vento médio em km/h (última leitura)",
    get: (s) => (s.atual.vento_ms == null ? null : s.atual.vento_ms * 3.6),
    tipo: "num",
  },
  {
    key: "rajada",
    label: "Rajada",
    titulo: "Rajada em km/h (última leitura)",
    get: (s) => (s.atual.rajada_ms == null ? null : s.atual.rajada_ms * 3.6),
    tipo: "num",
  },
  {
    key: "pressao",
    label: "P hPa",
    titulo: "Pressão (ao nível do mar quando a fonte informa; senão absoluta)",
    get: (s) => s.atual.pressao_nm ?? s.atual.pressao,
    tipo: "num",
  },
];

const JANELAS_NOSSAS = ["1", "3", "6", "12", "24", "48", "72", "96"];

const COLUNAS_CHUVA: Record<RedeSource, Coluna[]> = {
  macae_ufrj: [
    { key: "o1", label: "1h", titulo: "Acumulado OFICIAL do portal da rede — última 1 h", get: oficial("1"), tipo: "mm" },
    { key: "o24", label: "24h", titulo: "Acumulado OFICIAL do portal — últimas 24 h", get: oficial("24"), tipo: "mm" },
    { key: "o96", label: "96h", titulo: "Acumulado OFICIAL do portal — últimas 96 h", get: oficial("96"), tipo: "mm" },
    { key: "n1", label: "Calc 1h", titulo: "Controle: nosso cálculo (soma do que gravamos) — 1 h", get: nosso("1"), tipo: "ctl" },
    { key: "n24", label: "Calc 24h", titulo: "Controle: nosso cálculo — 24 h", get: nosso("24"), tipo: "ctl" },
    { key: "n96", label: "Calc 96h", titulo: "Controle: nosso cálculo — 96 h", get: nosso("96"), tipo: "ctl" },
  ],
  plugfield: [
    ...JANELAS_NOSSAS.map<Coluna>((j) => ({
      key: `n${j}`,
      label: `${j}h`,
      titulo: `Acumulado nas últimas ${j} h (soma dos baldes gravados; confere com o total do dia oficial)`,
      get: nosso(j),
      tipo: "mm",
    })),
    { key: "ohoje", label: "Hoje", titulo: "Chuva do dia OFICIAL da estação (rainDay, desde 00h)", get: oficial("hoje"), tipo: "mm" },
    { key: "omes", label: "Mês", titulo: "Chuva do mês OFICIAL da estação (rainMonth)", get: oficial("mes"), tipo: "mm" },
    { key: "oano", label: "Ano", titulo: "Chuva do ano OFICIAL da estação (rainYear)", get: oficial("ano"), tipo: "mm" },
  ],
  wunderground: [
    ...JANELAS_NOSSAS.map<Coluna>((j) => ({
      key: `n${j}`,
      label: `${j}h`,
      titulo: `Acumulado nas últimas ${j} h (soma dos baldes gravados)`,
      get: nosso(j),
      tipo: "mm",
    })),
    { key: "ohoje", label: "Hoje", titulo: "Chuva do dia OFICIAL da estação (precipTotal, desde 00h)", get: oficial("hoje"), tipo: "mm" },
    { key: "ctl_hoje", label: "Calc Hoje", titulo: "Controle: nosso cálculo do dia", get: nosso("hoje"), tipo: "ctl" },
    { key: "taxa", label: "mm/h", titulo: "Taxa de chuva instantânea informada pela estação (precipRate)", get: oficial("taxa"), tipo: "num" },
  ],
};

const COLUNA_1H: Record<RedeSource, (s: RedeStation) => number | null | undefined> = {
  macae_ufrj: oficial("1"),
  plugfield: nosso("1"),
  wunderground: nosso("1"),
};
const COLUNA_24H: Record<RedeSource, (s: RedeStation) => number | null | undefined> = {
  macae_ufrj: oficial("24"),
  plugfield: nosso("24"),
  wunderground: nosso("24"),
};

const TITULO_SITUACAO: Record<RedeSource, string> = {
  macae_ufrj: "Situação informada pelo portal (online/offline)",
  plugfield: "Bateria da estação (%)",
  wunderground: "Controle de qualidade do Weather Company (qcStatus): ✓ aprovado, ✗ reprovado, — não avaliado",
};

function situacaoTexto(source: RedeSource, s: RedeStation): { texto: string; cor?: string } {
  if (source === "macae_ufrj") {
    return s.extra.online ? { texto: "online", cor: "#15803d" } : { texto: "offline", cor: "#b91c1c" };
  }
  if (source === "plugfield") {
    const b = s.extra.bateria_pct;
    return typeof b === "number" ? { texto: `${Math.round(b)}%`, cor: b < 20 ? "#b91c1c" : undefined } : { texto: "—" };
  }
  const q = s.extra.qc_status;
  if (q === 1) return { texto: "✓", cor: "#15803d" };
  if (q === 0) return { texto: "✗", cor: "#b91c1c" };
  return { texto: "—" };
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return (Math.round(v * 10) / 10).toFixed(1);
}

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "updated", "codigo", "situacao"]);

const W_DESKTOP: Record<string, number> = { estacao: 210, municipio: 130, num: 54, situacao: 70, redec: 120, atualizado: 150, codigo: 100 };
const W_MOBILE: Record<string, number> = { estacao: 130, municipio: 100, num: 50, situacao: 62, redec: 110, atualizado: 120, codigo: 90 };

const NOME_FONTE: Record<RedeSource, string> = {
  macae_ufrj: "Macaé (UFRJ)",
  plugfield: "Plugfield",
  wunderground: "Wunderground",
};

const RedeTable = forwardRef<
  TableExportHandle,
  {
    source: RedeSource;
    stations: RedeStation[];
    municipioRedecMap?: Record<string, string>;
    onOpenStation: (id: number) => void;
  }
>(function RedeTable({ source, stations, municipioRedecMap = {}, onOpenStation }, ref) {
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths(`larguras-rede-${source}-v1`, W_DESKTOP, W_MOBILE);
  const colunas = useMemo(() => [...COLUNAS_CHUVA[source], ...METEO], [source]);
  const get1h = COLUNA_1H[source];
  const get24h = COLUNA_24H[source];

  const [sortKey, setSortKey] = useState<string>("__1h");
  const [sortAsc, setSortAsc] = useState(false);
  const redecOf = (municipality: string) => municipioRedecMap[normalizeMunicipioName(municipality)] ?? "";

  const sorted = useMemo(() => {
    const copy = [...stations];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "municipality") cmp = a.municipality.localeCompare(b.municipality);
      else if (sortKey === "redec") cmp = redecOf(a.municipality).localeCompare(redecOf(b.municipality));
      else if (sortKey === "updated") cmp = (a.referencia ?? "").localeCompare(b.referencia ?? "");
      else if (sortKey === "codigo") cmp = (a.codigo || "").localeCompare(b.codigo || "");
      else if (sortKey === "situacao") cmp = situacaoTexto(source, a).texto.localeCompare(situacaoTexto(source, b).texto);
      else {
        const g = sortKey === "__1h" ? get1h : colunas.find((c) => c.key === sortKey)?.get;
        const va = g?.(a);
        const vb = g?.(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        cmp = va - vb;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [stations, sortKey, sortAsc, municipioRedecMap, colunas, get1h, source]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
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
      ...colunas.map((c) => c.label),
      "Situação",
      "REDEC",
      "Atualizado em",
      "Qualidade",
      "Código",
    ];
    const rows = sorted.map((s) => [
      s.name,
      s.municipality || "",
      ...colunas.map((c) => c.get(s) ?? ""),
      situacaoTexto(source, s).texto,
      redecOf(s.municipality),
      formatTimestamp(s.referencia),
      s.qualidade ?? "",
      s.codigo || "",
    ]);
    downloadCsv(`${source}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };
  useImperativeHandle(ref, () => ({ exportar }));

  const thBase =
    "sticky top-0 align-bottom z-20 cursor-pointer select-none whitespace-normal break-words leading-tight bg-gray-100 py-2";
  const totalW = w.estacao + w.municipio + colunas.length * w.num + w.situacao + w.redec + w.atualizado + w.codigo;

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table
        className="border-collapse text-xs sm:text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-300"
        style={{ tableLayout: "fixed", width: totalW }}
      >
        <colgroup>
          <col style={{ width: w.estacao }} />
          <col style={{ width: w.municipio }} />
          {colunas.map((c) => (
            <col key={c.key} style={{ width: w.num }} />
          ))}
          <col style={{ width: w.situacao }} />
          <col style={{ width: w.redec }} />
          <col style={{ width: w.atualizado }} />
          <col style={{ width: w.codigo }} />
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          <tr>
            <th
              className={`${thBase} z-30 px-2 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]`}
              style={{ left: 0 }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
              {resizer("estacao")}
            </th>
            <th className={`${thBase} px-2`} onClick={() => toggleSort("municipality")}>
              Município{arrow("municipality")}
              {resizer("municipio")}
            </th>
            {colunas.map((c, i) => (
              <th
                key={c.key}
                className={`${thBase} px-1 text-right ${c.tipo === "ctl" ? "text-gray-400" : ""}`}
                onClick={() => toggleSort(c.key)}
                title={c.titulo}
              >
                {c.label}
                {arrow(c.key)}
                {i === colunas.length - 1 && resizer("num")}
              </th>
            ))}
            <th className={`${thBase} px-1`} onClick={() => toggleSort("situacao")} title={TITULO_SITUACAO[source]}>
              {source === "macae_ufrj" ? "Status" : source === "plugfield" ? "Bat." : "QC"}
              {arrow("situacao")}
              {resizer("situacao")}
            </th>
            <th className={`${thBase} px-2`} onClick={() => toggleSort("redec")}>
              REDEC{arrow("redec")}
              {resizer("redec")}
            </th>
            <th className={`${thBase} px-2`} onClick={() => toggleSort("updated")}>
              Atualizado em{arrow("updated")}
              {resizer("atualizado")}
            </th>
            <th className={`${thBase} px-2`} onClick={() => toggleSort("codigo")}>
              Código{arrow("codigo")}
              {resizer("codigo")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const atraso = getDelayStatus(s.referencia);
            const faixaAtraso = getDelayFaixaSalvar(s.referencia);
            const mostraRelogio = faixaAtraso.faixa !== "ok" && faixaAtraso.faixa !== "sem";
            const faixa1h = getChuva1hFaixa(get1h(s) ?? null, atraso.atrasado);
            const bg = faixa1h?.bg ?? "#ffffff";
            const cor = faixa1h?.text;
            const nivel = getChuva24hNivel(get24h(s) ?? null);
            const sit = situacaoTexto(source, s);
            const marcado = s.qualidade === "invalido" || s.qualidade === "suspeito";
            return (
              <tr key={s.id} className="border-b border-gray-100" title={faixa1h?.label}>
                <td
                  className="sticky z-10 whitespace-normal break-words leading-tight align-middle px-2 py-1 font-medium shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, backgroundColor: bg, color: cor ?? "#111827" }}
                  title={s.name}
                >
                  <CampoClicavel
                    id={s.id}
                    valor={s.name}
                    onOpenStation={onOpenStation}
                    className="text-left underline-offset-2 hover:underline"
                    title="Ver histórico desta estação"
                  />
                  {marcado && (
                    <span
                      className="ml-1"
                      title={`Leitura de chuva ${s.qualidade === "invalido" ? "inválida" : "suspeita"} (últimas 24 h): ${s.qualidade_motivo}`}
                    >
                      ⚠
                    </span>
                  )}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1"
                  style={{ backgroundColor: bg, color: cor ?? "#4b5563" }}
                >
                  <CampoClicavel id={s.id} valor={s.municipality || "—"} onOpenStation={onOpenStation} />
                </td>
                {colunas.map((c) => {
                  const v = c.get(s);
                  const ehPrincipal24 = c.key === "o24" || (c.key === "n24" && source !== "macae_ufrj");
                  return (
                    <td
                      key={c.key}
                      className="whitespace-nowrap px-1.5 py-1 text-right"
                      style={{
                        backgroundColor: bg,
                        color: c.tipo === "ctl" ? (cor ?? "#9ca3af") : (cor ?? "#1f2937"),
                        fontStyle: c.tipo === "ctl" ? "italic" : undefined,
                      }}
                    >
                      {ehPrincipal24 ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          {nivel && (
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: nivel.color }}
                              title={nivel.label}
                            />
                          )}
                          {fmt(v)}
                        </span>
                      ) : (
                        fmt(v)
                      )}
                    </td>
                  );
                })}
                <td
                  className="whitespace-nowrap px-1.5 py-1 text-center font-semibold"
                  style={{ backgroundColor: bg, color: sit.cor ?? cor ?? "#374151" }}
                >
                  {sit.texto}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1"
                  style={{ backgroundColor: bg, color: cor ?? "#6b7280" }}
                >
                  {redecOf(s.municipality) || "—"}
                </td>
                <td
                  className="whitespace-normal break-words leading-tight px-2 py-1"
                  style={{
                    backgroundColor: bg,
                    color: mostraRelogio ? faixaAtraso.color : (cor ?? faixaAtraso.color),
                    fontWeight: mostraRelogio ? 700 : undefined,
                  }}
                  title={faixaAtraso.label}
                >
                  {mostraRelogio && <span className="mr-1">🕒</span>}
                  {formatTimestamp(s.referencia)}
                </td>
                <td
                  className="whitespace-nowrap px-2 py-1 font-mono text-[11px]"
                  style={{ backgroundColor: bg, color: cor ?? "#374151" }}
                >
                  {s.codigo || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma estação de {NOME_FONTE[source]} encontrada.</div>
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
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500 sm:text-[11px]">
        <span>Hora da atualização (🕒 = dado atrasado):</span>
        {[
          { c: "#1e3a8a", l: "mais de 4 h e menos de 120 h" },
          { c: "#808000", l: "mais de 120 h e menos de 30 dias" },
          { c: "#7e22ce", l: "mais de 30 dias" },
          { c: "#dc2626", l: "data/hora no futuro" },
        ].map((f) => (
          <span key={f.l} className="flex items-center gap-1 font-semibold" style={{ color: f.c }}>
            🕒 <span className="font-normal text-gray-500">{f.l}</span>
          </span>
        ))}
        <span>⚠ = leitura de chuva suspeita/inválida nas últimas 24 h.</span>
      </div>
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        {source === "macae_ufrj" &&
          "Macaé (UFRJ/Defesa Civil): 1h, 24h e 96h são os acumulados OFICIAIS do portal da rede; as colunas “Calc” (cinza, itálico) são o nosso cálculo, para conferir. A chuva é gravada minuto a minuto a partir do histórico do portal (basculador de 0,34 mm). Estações offline mostram a última leitura que o portal tem."}
        {source === "plugfield" &&
          "Plugfield (Defesas Civis): 1h a 96h são calculadas somando o que gravamos a cada coleta; “Hoje”, “Mês” e “Ano” são os totais OFICIAIS da estação (a soma do dia confere com “Hoje”). Estações atrasadas ficam sinalizadas em 🕒. Bat. = bateria da estação."}
        {source === "wunderground" &&
          "Wunderground (estações pessoais, sem calibração): 1h a 96h são calculadas somando o que gravamos; “Hoje” é o total oficial da estação (precipTotal) e “Calc Hoje” é o nosso. QC = controle de qualidade do Weather Company (✓ aprovado, — não avaliado). Redes pessoais não são calibradas: use com cautela."}{" "}
        Clique em qualquer cabeçalho para ordenar.
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

export default RedeTable;
