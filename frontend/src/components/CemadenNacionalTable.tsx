"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import ColumnResizer from "@/components/ColumnResizer";
import { CampoClicavel } from "@/components/EstacaoCellLinks";
import { TableExportHandle } from "@/components/tableExportHandle";
import {
  CemadenNacionalStation,
  getChuva1hFaixa,
  getChuva24hNivel,
  getDelayFaixaSalvar,
  getDelayStatus,
  normalizeMunicipioName,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";
import { useColumnWidths } from "@/lib/useColumnWidths";

// Tabela "CEMADEN Nacional" (pedido de 03/10/2026): espelha a tabela da Rede
// Salvar — acumulados OFICIAIS da fonte, linhas ordenadas pela chuva de 1 h
// (maior primeiro), sem as colunas Rede e UF; REDEC e hora da atualização
// depois dos dados e o código da estação por último.

const JANELAS = ["1", "3", "6", "12", "24", "48", "72", "96"] as const;

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
  return (Math.round(value * 10) / 10).toFixed(1);
}

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "updated", "codigo"]);

const W_DESKTOP: Record<string, number> = { estacao: 210, municipio: 140, janela: 56, redec: 130, atualizado: 150, codigo: 110 };
const W_MOBILE: Record<string, number> = { estacao: 130, municipio: 110, janela: 52, redec: 120, atualizado: 120, codigo: 100 };

const CemadenNacionalTable = forwardRef<
  TableExportHandle,
  {
    stations: CemadenNacionalStation[];
    municipioRedecMap?: Record<string, string>;
    onOpenStation: (id: number) => void;
  }
>(function CemadenNacionalTable({ stations, municipioRedecMap = {}, onOpenStation }, ref) {
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths("larguras-cemaden-nacional-v1", W_DESKTOP, W_MOBILE);
  // Padrão pedido: chuva de 1 h, da maior para a menor.
  const [sortKey, setSortKey] = useState<string>("1");
  const [sortAsc, setSortAsc] = useState(false);
  const redecOf = (municipality: string) => municipioRedecMap[normalizeMunicipioName(municipality)] ?? "";
  const nomeCompleto = (s: CemadenNacionalStation) => (s.tipo_cemaden ? `${s.name} [${s.tipo_cemaden}]` : s.name);

  const sorted = useMemo(() => {
    const copy = [...stations];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "municipality") cmp = a.municipality.localeCompare(b.municipality);
      else if (sortKey === "redec") cmp = redecOf(a.municipality).localeCompare(redecOf(b.municipality));
      else if (sortKey === "updated") cmp = (a.referencia ?? "").localeCompare(b.referencia ?? "");
      else if (sortKey === "codigo") cmp = (a.codigo || "").localeCompare(b.codigo || "");
      else {
        const va = sortKey === "ultimo" ? a.ultimo_mm : a.oficial[sortKey];
        const vb = sortKey === "ultimo" ? b.ultimo_mm : b.oficial[sortKey];
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
      "Tipo",
      "Município",
      "Últ. (mm)",
      ...JANELAS.map((j) => `${j}h (mm)`),
      "REDEC",
      "Atualizado em",
      "Qualidade",
      "Código",
    ];
    const rows = sorted.map((s) => [
      s.name,
      s.tipo_cemaden,
      s.municipality || "",
      s.ultimo_mm ?? "",
      ...JANELAS.map((j) => s.oficial[j] ?? ""),
      redecOf(s.municipality),
      formatTimestamp(s.referencia),
      s.qualidade ?? "",
      s.codigo || "",
    ]);
    downloadCsv(`cemaden-nacional-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };
  useImperativeHandle(ref, () => ({ exportar }));

  const thBase =
    "sticky top-0 align-bottom z-20 cursor-pointer select-none whitespace-normal break-words leading-tight bg-gray-100 py-2";
  const totalW = w.estacao + w.municipio + (JANELAS.length + 1) * w.janela + w.redec + w.atualizado + w.codigo;

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table
        className="border-collapse text-xs sm:text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-300"
        style={{ tableLayout: "fixed", width: totalW }}
      >
        <colgroup>
          <col style={{ width: w.estacao }} />
          <col style={{ width: w.municipio }} />
          <col style={{ width: w.janela }} />
          {JANELAS.map((j) => (
            <col key={j} style={{ width: w.janela }} />
          ))}
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
            <th
              className={`${thBase} px-1 text-right`}
              onClick={() => toggleSort("ultimo")}
              title="Última leitura (10 min) informada pela estação"
            >
              Últ.{arrow("ultimo")}
            </th>
            {JANELAS.map((j) => (
              <th
                key={j}
                className={`${thBase} px-1 text-right`}
                onClick={() => toggleSort(j)}
                title={`Acumulado oficial nas últimas ${j} h (valor da própria fonte)`}
              >
                {j}h{arrow(j)}
                {j === "96" && resizer("janela")}
              </th>
            ))}
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
            const faixa1h = getChuva1hFaixa(s.oficial["1"], atraso.atrasado);
            const bg = faixa1h?.bg ?? "#ffffff";
            const cor = faixa1h?.text;
            const nivel = getChuva24hNivel(s.oficial["24"]);
            const invalido = s.qualidade === "invalido";
            const suspeito = s.qualidade === "suspeito";
            return (
              <tr key={s.id} className="border-b border-gray-100" title={faixa1h?.label}>
                <td
                  className="sticky z-10 whitespace-normal break-words leading-tight align-middle px-2 py-1 font-medium shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, backgroundColor: bg, color: cor ?? "#111827" }}
                  title={nomeCompleto(s)}
                >
                  <CampoClicavel
                    id={s.id}
                    valor={nomeCompleto(s)}
                    onOpenStation={onOpenStation}
                    className="text-left underline-offset-2 hover:underline"
                    title="Ver histórico desta estação"
                  />
                </td>
                <td
                  className="whitespace-normal break-words leading-tight align-middle px-2 py-1"
                  style={{ backgroundColor: bg, color: cor ?? "#4b5563" }}
                >
                  <CampoClicavel id={s.id} valor={s.municipality || "—"} onOpenStation={onOpenStation} />
                </td>
                <td
                  className="whitespace-nowrap px-1.5 py-1 text-right"
                  style={{ backgroundColor: bg, color: cor ?? "#1f2937" }}
                  title={
                    invalido || suspeito
                      ? `Leitura ${invalido ? "inválida" : "suspeita"}: ${s.qualidade_motivo}`
                      : undefined
                  }
                >
                  <span className={invalido ? "line-through" : undefined}>
                    {(invalido || suspeito) && <span className="mr-0.5">⚠</span>}
                    {formatMm(s.ultimo_mm)}
                  </span>
                </td>
                {JANELAS.map((j) => (
                  <td
                    key={j}
                    className="whitespace-nowrap px-1.5 py-1 text-right"
                    style={{ backgroundColor: bg, color: cor ?? "#1f2937" }}
                  >
                    {j === "24" ? (
                      <span className="inline-flex items-center justify-end gap-1">
                        {nivel && (
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: nivel.color }}
                            title={nivel.label}
                          />
                        )}
                        {formatMm(s.oficial[j])}
                      </span>
                    ) : (
                      formatMm(s.oficial[j])
                    )}
                  </td>
                ))}
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
                  {s.codigo || (s.idestacao != null ? `id ${s.idestacao}` : "—")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma estação do CEMADEN Nacional encontrada.</div>
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
        <span>⚠ = leitura suspeita/inválida (barrada na qualificação).</span>
      </div>
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        Valores <strong>oficiais</strong> do CEMADEN Nacional (acumulados calculados pela própria fonte, os mesmos da
        Rede Salvar), ordenados pela chuva de 1 h. Estações [A/B] pluviométricas, [H] hidrológicas e [G] geotécnicas
        (H e G também medem chuva). A fonte não informa o nível do rio nem a umidade do solo neste serviço. O código
        da estação é preenchido aos poucos (consulta ao mapa do CEMADEN a cada coleta). Clique em qualquer cabeçalho
        para ordenar.
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

export default CemadenNacionalTable;
