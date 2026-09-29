"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import ColumnResizer from "@/components/ColumnResizer";
import { TableExportHandle } from "@/components/tableExportHandle";
import { GatilhoStatus, SireneStation } from "@/lib/api";
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
  return `${(Math.round(value * 10) / 10).toFixed(1)}`;
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

/** Ordem de severidade pra ordenar pelas colunas GI-GIV: acionado (realidade)
 * > obrigatório > condicionado > nada atingido > "--" (município sem gestão
 * de gatilho, sempre por último). */
function rankGatilho(s: GatilhoStatus, definido: boolean): number {
  if (!definido) return -1;
  if (s === "acionado") return 3;
  if (s === "obrigatorio") return 2;
  if (s === "condicionado") return 1;
  return 0;
}

const COLUNAS_TEXTO = new Set([
  "name", "municipality", "redec", "bairro", "tipo_sirene", "ref_nome", "risco_sirene", "updated",
]);

// Larguras padrão (px), ajustáveis arrastando a borda direita do cabeçalho (lembradas no
// navegador). Em telas < 640px os padrões são menores. Texto quebra em várias linhas.
const W_DESKTOP: Record<string, number> = {
  estacao: 170, municipio: 120, status: 96, toque: 130,
  h1: 60, h24: 60, h96: 60, d30: 64,
  gi: 48, gii: 48, giii: 48, giv: 48,
  tipo: 78, ref: 150, risco: 88, redec: 110, bairro: 170, atualizado: 130,
};
const W_MOBILE: Record<string, number> = {
  estacao: 120, municipio: 110, status: 92, toque: 120,
  h1: 56, h24: 56, h96: 56, d30: 58,
  gi: 44, gii: 44, giii: 44, giv: 44,
  tipo: 72, ref: 130, risco: 80, redec: 100, bairro: 130, atualizado: 110,
};

const ORDEM_COLUNAS = [
  "estacao", "municipio", "status", "toque", "h1", "h24", "h96", "d30",
  "gi", "gii", "giii", "giv", "tipo", "ref", "risco", "redec", "bairro", "atualizado",
] as const;

const ACAO_ESTILO: Record<string, string> = {
  aviso: "bg-amber-500 text-gray-900",
  teste: "bg-sky-600 text-white",
  mobilizacao: "bg-red-600 text-white",
  outro: "bg-purple-700 text-white",
  normal: "bg-gray-200 text-gray-600",
};
const ACAO_ROTULO: Record<string, string> = {
  aviso: "Aviso de Chuva",
  teste: "Teste de Manutenção",
  mobilizacao: "Mobilização",
  outro: "Outro / a confirmar",
};

// Cores dos gatilhos GI-GIV — definidas pelo usuário (2026-09-29):
// condicionado=amarelo, obrigatório=laranja, acionado=vermelho (realidade,
// sobrepõe o cálculo). Bolinha cinza clara = gatilho definido pro
// município mas não atingido; "--" = município fora da gestão de gatilhos.
const GATILHO_COR: Record<Exclude<GatilhoStatus, null>, string> = {
  condicionado: "#eab308",
  obrigatorio: "#f97316",
  acionado: "#dc2626",
};
const GATILHO_ROTULO: Record<Exclude<GatilhoStatus, null>, string> = {
  condicionado: "Condicionado (perto do gatilho, ±5%)",
  obrigatorio: "Obrigatório (gatilho superado em 10%+)",
  acionado: "Acionado (sirene já está tocando)",
};

const TIPO_ROTULO: Record<string, string> = {
  EAA: "Simples (EAA)",
  "EAA+P": "Com pluviômetro (EAA+P)",
  "EAA+H": "Com estação hidrológica (EAA+H)",
  "EAA+M": "Com estação meteorológica (EAA+M)",
};
const RISCO_ROTULO: Record<string, string> = {
  geo: "Geológico",
  hidro: "Hidrológico",
  geo_hidro: "Geológico + Hidrológico",
};

function GatilhoCelula({ status, definido, gatilho }: { status: GatilhoStatus; definido: boolean; gatilho: string }) {
  if (!definido) {
    return (
      <span className="text-gray-300" title={`${gatilho}: município sem gestão de gatilho definida`}>
        --
      </span>
    );
  }
  if (!status) {
    return <span className="inline-block h-3 w-3 rounded-full bg-gray-200" title={`${gatilho}: gatilho não atingido`} />;
  }
  return (
    <span
      className="inline-block h-3 w-3 rounded-full"
      style={{ backgroundColor: GATILHO_COR[status] }}
      title={`${gatilho}: ${GATILHO_ROTULO[status]}`}
    />
  );
}

const SirenesTable = forwardRef<TableExportHandle, { stations: SireneStation[] }>(function SirenesTable(
  { stations },
  ref,
) {
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths("larguras-sirenes-v2", W_DESKTOP, W_MOBILE);
  const [sortKey, setSortKey] = useState<string>("prioridade");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...stations];
    const numSort = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return -1;
      if (b == null) return 1;
      return a - b;
    };
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "prioridade") cmp = prioridade(a) - prioridade(b);
      else if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "municipality") cmp = a.municipality.localeCompare(b.municipality);
      else if (sortKey === "redec") cmp = a.redec.localeCompare(b.redec);
      else if (sortKey === "bairro") cmp = a.bairro.localeCompare(b.bairro);
      else if (sortKey === "status") cmp = a.status_estacao.localeCompare(b.status_estacao);
      else if (sortKey === "tipo_sirene") cmp = (a.tipo_sirene ?? "").localeCompare(b.tipo_sirene ?? "");
      else if (sortKey === "ref_nome") cmp = (a.ref_nome ?? "").localeCompare(b.ref_nome ?? "");
      else if (sortKey === "risco_sirene") cmp = (a.risco_sirene ?? "").localeCompare(b.risco_sirene ?? "");
      else if (sortKey === "chuva_1h_mm") cmp = numSort(a.chuva_1h_mm, b.chuva_1h_mm);
      else if (sortKey === "chuva_24h_mm") cmp = numSort(a.chuva_24h_mm, b.chuva_24h_mm);
      else if (sortKey === "chuva_96h_mm") cmp = numSort(a.chuva_96h_mm, b.chuva_96h_mm);
      else if (sortKey === "chuva_30d_mm") cmp = numSort(a.chuva_30d_mm, b.chuva_30d_mm);
      else if (sortKey === "GI" || sortKey === "GII" || sortKey === "GIII" || sortKey === "GIV") {
        cmp =
          rankGatilho(a.gatilhos[sortKey], a.gatilho_definido) - rankGatilho(b.gatilhos[sortKey], b.gatilho_definido);
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
      "Estação", "Município", "Status", "Toque",
      "1h (mm)", "24h (mm)", "96h (mm)", "30d (mm)",
      "GI", "GII", "GIII", "GIV",
      "Tipo", "REF", "Risco", "REDEC", "Bairro", "Endereço", "Atualizado em",
    ];
    const rows = sorted.map((s) => [
      s.name,
      s.municipality || "",
      s.status_estacao === "ativa" ? "Online" : s.status_estacao === "inativa" ? "Offline" : "Desconhecido",
      s.tocando ? "TOCANDO" : "Normal",
      s.chuva_1h_mm ?? "",
      s.chuva_24h_mm ?? "",
      s.chuva_96h_mm ?? "",
      s.chuva_30d_mm ?? "",
      s.gatilho_definido ? (s.gatilhos.GI ?? "normal") : "--",
      s.gatilho_definido ? (s.gatilhos.GII ?? "normal") : "--",
      s.gatilho_definido ? (s.gatilhos.GIII ?? "normal") : "--",
      s.gatilho_definido ? (s.gatilhos.GIV ?? "normal") : "--",
      s.tipo_sirene ? (TIPO_ROTULO[s.tipo_sirene] ?? s.tipo_sirene) : "",
      s.ref_nome ?? "",
      s.risco_sirene ? (RISCO_ROTULO[s.risco_sirene] ?? s.risco_sirene) : "",
      s.redec || "",
      s.bairro || "",
      [s.rua, s.numero].filter(Boolean).join(", "),
      formatTimestamp(s.updated_at),
    ]);
    downloadCsv(`cemaden-rj-sirenes-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  useImperativeHandle(ref, () => ({ exportar }));

  const larguraTotal = ORDEM_COLUNAS.reduce((soma, k) => soma + w[k], 0);
  // Grade completa (pedido do usuário, referência: tela de sirenes do CBMERJ) —
  // border em toda célula, não só border-bottom como as outras tabelas.
  const th = "sticky top-0 border border-gray-300 bg-gray-100 px-1.5 py-1.5 align-middle whitespace-normal break-words leading-tight";
  const thOrdenavel = `${th} z-20 cursor-pointer select-none`;
  const td = "border border-gray-200 px-1.5 py-1 align-middle";

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table className="border-collapse text-xs sm:text-sm" style={{ tableLayout: "fixed", width: larguraTotal }}>
        <colgroup>
          {ORDEM_COLUNAS.map((k) => (
            <col key={k} style={{ width: w[k] }} />
          ))}
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          {/* Cabeçalho agrupado em 2 linhas (pedido do usuário, referência: tela
              de sirenes do CBMERJ) — Dados Pluviométricos (1h/24h/96h/30d) e
              Critérios de Acionamento (GI-GIV) ganham um título de grupo na
              linha de cima; as demais colunas usam rowSpan=2. */}
          <tr>
            <th
              className={`${th} left-0 z-30 cursor-pointer select-none shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]`}
              rowSpan={2}
              style={{ width: w.estacao }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
              {resizer("estacao")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.municipio }} onClick={() => toggleSort("municipality")}>
              Município{arrow("municipality")}
              {resizer("municipio")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.status }} onClick={() => toggleSort("status")}>
              Status{arrow("status")}
              {resizer("status")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.toque }} onClick={() => toggleSort("prioridade")}>
              Toque{arrow("prioridade")}
              {resizer("toque")}
            </th>
            <th className={`${th} z-20 text-center`} colSpan={4}>
              Dados Pluviométricos (mm)
            </th>
            <th className={`${th} z-20 text-center`} colSpan={4}>
              Critérios de Acionamento
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.tipo }} onClick={() => toggleSort("tipo_sirene")}>
              Tipo{arrow("tipo_sirene")}
              {resizer("tipo")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.ref }} onClick={() => toggleSort("ref_nome")}>
              REF{arrow("ref_nome")}
              {resizer("ref")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.risco }} onClick={() => toggleSort("risco_sirene")}>
              Risco{arrow("risco_sirene")}
              {resizer("risco")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.redec }} onClick={() => toggleSort("redec")}>
              REDEC{arrow("redec")}
              {resizer("redec")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.bairro }} onClick={() => toggleSort("bairro")}>
              Bairro / Endereço{arrow("bairro")}
              {resizer("bairro")}
            </th>
            <th className={thOrdenavel} rowSpan={2} style={{ width: w.atualizado }} onClick={() => toggleSort("updated")}>
              Atualizado em{arrow("updated")}
              {resizer("atualizado")}
            </th>
          </tr>
          <tr>
            <th className={`${thOrdenavel} text-right`} style={{ width: w.h1 }} onClick={() => toggleSort("chuva_1h_mm")}>
              1 h{arrow("chuva_1h_mm")}
              {resizer("h1")}
            </th>
            <th className={`${thOrdenavel} text-right`} style={{ width: w.h24 }} onClick={() => toggleSort("chuva_24h_mm")}>
              24 h{arrow("chuva_24h_mm")}
              {resizer("h24")}
            </th>
            <th className={`${thOrdenavel} text-right`} style={{ width: w.h96 }} onClick={() => toggleSort("chuva_96h_mm")}>
              96 h{arrow("chuva_96h_mm")}
              {resizer("h96")}
            </th>
            <th className={`${thOrdenavel} text-right`} style={{ width: w.d30 }} onClick={() => toggleSort("chuva_30d_mm")}>
              30 d{arrow("chuva_30d_mm")}
              {resizer("d30")}
            </th>
            <th className={`${thOrdenavel} text-center`} style={{ width: w.gi }} onClick={() => toggleSort("GI")} title="Gatilho I (só 1h)">
              GI{arrow("GI")}
              {resizer("gi")}
            </th>
            <th className={`${thOrdenavel} text-center`} style={{ width: w.gii }} onClick={() => toggleSort("GII")} title="Gatilho II (1h + 24h)">
              GII{arrow("GII")}
              {resizer("gii")}
            </th>
            <th className={`${thOrdenavel} text-center`} style={{ width: w.giii }} onClick={() => toggleSort("GIII")} title="Gatilho III (1h + 96h)">
              GIII{arrow("GIII")}
              {resizer("giii")}
            </th>
            <th className={`${thOrdenavel} text-center`} style={{ width: w.giv }} onClick={() => toggleSort("GIV")} title="Gatilho IV (1h + 30 dias)">
              GIV{arrow("GIV")}
              {resizer("giv")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const online = s.status_estacao === "ativa";
            const desconhecido = s.status_estacao === "desconhecido";
            const bgFundo = s.tocando ? "#fee2e2" : !online && !desconhecido ? "#f3f4f6" : "#ffffff";
            return (
              <tr key={s.id} className={s.tocando ? "animate-pulse" : ""} title={s.descricao || undefined}>
                <td
                  className={`${td} sticky left-0 z-10 font-medium text-gray-900 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]`}
                  style={{ backgroundColor: bgFundo }}
                >
                  {s.name}
                </td>
                <td className={`${td} text-gray-600`} style={{ backgroundColor: bgFundo }}>
                  {s.municipality || "—"}
                </td>
                <td className={td} style={{ backgroundColor: bgFundo }}>
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
                <td className={td} style={{ backgroundColor: bgFundo }}>
                  {s.tocando ? (
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold ${
                        ACAO_ESTILO[s.acao_categoria ?? "outro"]
                      }`}
                      title={s.acao_codigo != null ? `Código de acionamento ${s.acao_codigo}` : undefined}
                    >
                      🔊 {s.acao_nome ?? "TOCANDO"}
                    </span>
                  ) : (
                    <span
                      className="text-xs text-gray-400"
                      title={
                        s.ultimo_acionamento_nome && s.ultimo_acionamento_fim
                          ? `Último acionamento: ${s.ultimo_acionamento_nome}, encerrado em ${formatTimestamp(s.ultimo_acionamento_fim)} (retorno à normalidade)`
                          : "Sem acionamento ativo (retorno à normalidade)"
                      }
                    >
                      Normal
                    </span>
                  )}
                  {s.tocando && s.tocando_desde && (
                    <div className="mt-0.5 text-[10px] text-gray-500">desde {formatTimestamp(s.tocando_desde)}</div>
                  )}
                </td>
                <td className={`${td} text-right text-gray-700`} style={{ backgroundColor: bgFundo }}>
                  {formatMm(s.chuva_1h_mm)}
                </td>
                <td className={`${td} text-right text-gray-700`} style={{ backgroundColor: bgFundo }}>
                  {formatMm(s.chuva_24h_mm)}
                </td>
                <td className={`${td} text-right text-gray-700`} style={{ backgroundColor: bgFundo }}>
                  {formatMm(s.chuva_96h_mm)}
                </td>
                <td className={`${td} text-right text-gray-700`} style={{ backgroundColor: bgFundo }}>
                  {formatMm(s.chuva_30d_mm)}
                </td>
                <td className={`${td} text-center`} style={{ backgroundColor: bgFundo }}>
                  <GatilhoCelula status={s.gatilhos.GI} definido={s.gatilho_definido} gatilho="Gatilho I" />
                </td>
                <td className={`${td} text-center`} style={{ backgroundColor: bgFundo }}>
                  <GatilhoCelula status={s.gatilhos.GII} definido={s.gatilho_definido} gatilho="Gatilho II" />
                </td>
                <td className={`${td} text-center`} style={{ backgroundColor: bgFundo }}>
                  <GatilhoCelula status={s.gatilhos.GIII} definido={s.gatilho_definido} gatilho="Gatilho III" />
                </td>
                <td className={`${td} text-center`} style={{ backgroundColor: bgFundo }}>
                  <GatilhoCelula status={s.gatilhos.GIV} definido={s.gatilho_definido} gatilho="Gatilho IV" />
                </td>
                <td className={`${td} text-gray-600`} style={{ backgroundColor: bgFundo }} title={s.tipo_sirene ? TIPO_ROTULO[s.tipo_sirene] : undefined}>
                  {s.tipo_sirene || "—"}
                </td>
                <td className={`${td} text-gray-600`} style={{ backgroundColor: bgFundo }}>
                  {s.ref_nome ?? (s.tem_pluviometro ? "(própria)" : "—")}
                </td>
                <td className={`${td} text-gray-600`} style={{ backgroundColor: bgFundo }}>
                  {s.risco_sirene ? (RISCO_ROTULO[s.risco_sirene] ?? s.risco_sirene) : "—"}
                </td>
                <td className={`${td} text-gray-500`} style={{ backgroundColor: bgFundo }}>
                  {s.redec || "—"}
                </td>
                <td className={`${td} text-gray-500`} style={{ backgroundColor: bgFundo }}>
                  {[s.bairro, s.rua].filter(Boolean).join(" — ") || "—"}
                </td>
                <td className={`${td} text-gray-500`} style={{ backgroundColor: bgFundo }}>
                  {formatTimestamp(s.updated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="sticky left-0 flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500 sm:text-[11px]">
        <span>Toque:</span>
        {(["aviso", "teste", "mobilizacao", "outro"] as const).map((k) => (
          <span key={k} className={`rounded-full px-2 py-0.5 font-bold ${ACAO_ESTILO[k]}`}>
            {ACAO_ROTULO[k]}
          </span>
        ))}
        <span className="text-gray-400">Normal = retorno à normalidade</span>
        <span className="ml-3">Gatilhos:</span>
        {(["condicionado", "obrigatorio", "acionado"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: GATILHO_COR[k] }} />
            {GATILHO_ROTULO[k]}
          </span>
        ))}
      </div>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma sirene encontrada com os filtros atuais.</div>
      )}
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">
        Status vem do próprio portal de sirenes da CEMADEN-RJ (GridLab), lido junto com as leituras a cada
        sincronização. &ldquo;1h/24h/96h/30d&rdquo; usam a chuva da própria sirene (quando tem pluviômetro) ou da
        estação REF (referência mais próxima, dentro de 2km, editável no Admin). Gatilhos GI-GIV são INDEPENDENTES
        entre si (podem disparar vários ao mesmo tempo, ou nenhum) — GI usa só a chuva de 1h; GII/GIII/GIV exigem
        1h + a janela mais longa da coluna SIMULTANEAMENTE. &ldquo;--&rdquo; nos gatilhos = município fora dos 13
        que têm gatilho definido pela Defesa Civil. &ldquo;Acionado&rdquo; (vermelho) reflete a REALIDADE — a
        sirene já está tocando, segundo o portal — não é mais um cálculo. Clique em qualquer cabeçalho pra
        ordenar; em celular, arraste a tabela horizontalmente pra ver todas as colunas.
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
