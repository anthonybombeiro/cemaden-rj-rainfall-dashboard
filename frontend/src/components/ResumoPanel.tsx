"use client";

import { Clipboard, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchResumo24h, Resumo24h, ResumoItem, ResumoMunicipio, ResumoRegiao } from "@/lib/api";
import { FAIXAS_RAJADA } from "@/lib/ventoFaixas";

/** Aba "Resumo 24 h" (07/10/2026): acontecimentos do dia, Top 10, previsão × observado por região e
 * cidades com chuva/rajada. Dados de `GET /api/resumo/` (regras em docs/resumo-24h.md). */

type Sub = "resumo" | "top10" | "previsao" | "cidades";
const SUBS: { key: Sub; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "top10", label: "Top 10" },
  { key: "previsao", label: "Previsão × Observado" },
  { key: "cidades", label: "Cidades" },
];

const COR_CHUVA: Record<string, { bg: string; text: string }> = {
  Fraca: { bg: "#63B8FF", text: "#0f172a" },
  Moderada: { bg: "#FFFF66", text: "#0f172a" },
  Forte: { bg: "#FFA600", text: "#0f172a" },
  "Muito forte": { bg: "#CC0000", text: "#ffffff" },
};
const COR_RAJADA: Record<string, { bg: string; text: string }> = Object.fromEntries(
  FAIXAS_RAJADA.map((f) => [f.faixa.label, { bg: f.faixa.bg, text: f.faixa.text }]),
);
const NOME_FONTE: Record<string, string> = {
  alerta_rio: "Alerta Rio", niteroi: "Niterói", inea: "INEA", inmet: "INMET", redemet: "REDEMET",
  cemaden_mctic: "CEMADEN Nacional", cemaden_rj_sirenes: "CEMADEN-RJ", plugfield: "Plugfield",
  macae_ufrj: "Macaé", wunderground: "Wunderground", ecowitt_paracambi: "Paracambi",
};

function Chip({ rotulo, cores }: { rotulo: string | null; cores: Record<string, { bg: string; text: string }> }) {
  if (!rotulo) return <span className="text-gray-400">—</span>;
  const c = cores[rotulo] ?? { bg: "#e5e7eb", text: "#111827" };
  return (
    <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: c.bg, color: c.text }}>
      {rotulo}
    </span>
  );
}

const fmt = (v: number | null | undefined, casas = 1) => (v == null ? "—" : v.toFixed(casas).replace(".", ","));

function Veredito({ v }: { v?: string | null }) {
  if (!v) return <span className="text-gray-400">—</span>;
  const ok = v.startsWith("Confere") || v.startsWith("Acertou");
  const atencao = v.startsWith("Atenção");
  const cls = ok ? "bg-emerald-100 text-emerald-800" : atencao ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{v}</span>;
}

function Cartao({ titulo, valor, detalhe, destaque }: { titulo: string; valor: string; detalhe?: string; destaque?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className="mt-1 text-xl font-bold" style={destaque ? { color: destaque } : undefined}>
        {valor}
      </div>
      {detalhe && <div className="mt-0.5 truncate text-xs text-gray-600">{detalhe}</div>}
    </div>
  );
}

function TopLista({
  titulo, itens, unidade, onOpenStation,
}: { titulo: string; itens: ResumoItem[]; unidade: string; onOpenStation?: (id: number) => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-xs text-gray-500">Sem dados no período.</p>
      ) : (
        <ol className="space-y-1">
          {itens.map((i, n) => (
            <li key={i.id} className="flex items-baseline gap-2 text-xs">
              <span className="w-4 shrink-0 text-right text-gray-400">{n + 1}</span>
              <button
                type="button"
                onClick={() => onOpenStation?.(i.id)}
                className="min-w-0 flex-1 truncate text-left hover:underline"
                title={`${i.name} — ${i.municipio} (${NOME_FONTE[i.fonte] ?? i.fonte})`}
              >
                <span className="font-medium">{i.name}</span>
                <span className="text-gray-500"> · {i.municipio} · {NOME_FONTE[i.fonte] ?? i.fonte}</span>
              </button>
              <span className="shrink-0 font-bold tabular-nums">
                {fmt(i.valor)} {unidade}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function textoResumo(r: Resumo24h, rotuloPeriodo: string): string {
  const s = r.resumo;
  const linha = (t: string, i: ResumoItem | null, un: string) => (i ? `${t}: ${fmt(i.valor)} ${un} — ${i.name} (${i.municipio})` : null);
  const top = (t: string, itens: ResumoItem[], un: string) =>
    itens.length ? `\n${t}\n` + itens.map((i, n) => `${n + 1}. ${i.name} (${i.municipio}) — ${fmt(i.valor)} ${un}`).join("\n") : "";
  return [
    `RESUMO CEMADEN-RJ — ${rotuloPeriodo}`,
    `Estações com chuva: ${s.estacoes_com_chuva} | Municípios com chuva: ${s.municipios_com_chuva}`,
    linha("Maior chuva", s.maior_chuva, "mm"),
    linha("Maior Tmáx", s.maior_tmax, "°C"),
    linha("Menor Tmín", s.menor_tmin, "°C"),
    linha("Maior rajada", s.maior_rajada, "km/h"),
    `Sirenes acionadas: ${s.sirenes_acionadas} (tocando agora: ${s.sirenes_tocando_agora})`,
    top("TOP 10 CHUVA", r.top10.chuva, "mm"),
    top("TOP 10 TEMPERATURA MÁXIMA", r.top10.tmax, "°C"),
    top("TOP 10 TEMPERATURA MÍNIMA", r.top10.tmin, "°C"),
    top("TOP 10 RAJADA DE VENTO", r.top10.rajada, "km/h"),
  ]
    .filter((x) => x !== null && x !== "")
    .join("\n");
}

export default function ResumoPanel({ onOpenStation }: { onOpenStation?: (id: number) => void }) {
  const [dia, setDia] = useState(""); // "" = últimas 24 h
  const [dados, setDados] = useState<Resumo24h | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sub, setSub] = useState<Sub>("resumo");
  const [copiado, setCopiado] = useState(false);
  const [filtroCidade, setFiltroCidade] = useState<"chuva" | "vento" | "todas">("chuva");

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro("");
    fetchResumo24h(dia || undefined)
      .then(setDados)
      .catch(() => setErro("Não foi possível carregar o resumo agora."))
      .finally(() => setCarregando(false));
  }, [dia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const rotuloPeriodo = useMemo(() => {
    if (!dados) return "";
    if (dados.modo === "rolling") return "últimas 24 h";
    const [a, m, d] = dados.dia.split("-");
    return dados.modo === "hoje" ? `hoje (${d}/${m}/${a}, até agora)` : `${d}/${m}/${a}`;
  }, [dados]);

  const cidades = useMemo(() => {
    const lista = dados?.municipios ?? [];
    if (filtroCidade === "chuva") return lista.filter((m) => m.chuva_classe);
    if (filtroCidade === "vento") {
      return lista
        .filter((m) => m.rajada_classe && m.rajada_classe !== "Fraca")
        .sort((a, b) => (b.rajada_max_kmh ?? 0) - (a.rajada_max_kmh ?? 0));
    }
    return lista;
  }, [dados, filtroCidade]);

  const copiar = async () => {
    if (!dados) return;
    try {
      await navigator.clipboard.writeText(textoResumo(dados, rotuloPeriodo));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem permissão da área de transferência */
    }
  };

  const s = dados?.resumo;
  const acontecimentos = useMemo(() => {
    if (!dados || !s) return [] as string[];
    const l: string[] = [];
    if (s.maior_chuva) l.push(`Maior chuva: ${fmt(s.maior_chuva.valor)} mm em ${s.maior_chuva.name} (${s.maior_chuva.municipio}).`);
    l.push(`${s.municipios_com_chuva} município(s) com chuva e ${s.estacoes_com_chuva} estação(ões) com chuva registrada.`);
    const mc = s.municipios_por_classe_chuva;
    const partes = ["Muito forte", "Forte", "Moderada", "Fraca"].filter((c) => mc[c]).map((c) => `${mc[c]} ${c.toLowerCase()}`);
    if (partes.length) l.push(`Intensidade da chuva por município: ${partes.join(", ")}.`);
    if (s.maior_rajada) l.push(`Maior rajada: ${fmt(s.maior_rajada.valor)} km/h em ${s.maior_rajada.name} (${s.maior_rajada.municipio}).`);
    const mr = s.municipios_rajada_moderada_ou_mais;
    const pr = ["Muito forte", "Forte", "Moderada"].filter((c) => mr[c]).map((c) => `${mr[c]} ${c.toLowerCase()}`);
    if (pr.length) l.push(`Municípios com rajada moderada ou mais: ${pr.join(", ")}.`);
    if (s.maior_tmax) l.push(`Maior temperatura: ${fmt(s.maior_tmax.valor)} °C em ${s.maior_tmax.name} (${s.maior_tmax.municipio}).`);
    if (s.menor_tmin) l.push(`Menor temperatura: ${fmt(s.menor_tmin.valor)} °C em ${s.menor_tmin.name} (${s.menor_tmin.municipio}).`);
    l.push(
      s.sirenes_acionadas
        ? `${s.sirenes_acionadas} sirene(s) acionada(s) no período${s.sirenes_tocando_agora ? `, ${s.sirenes_tocando_agora} tocando agora` : ""}.`
        : "Nenhuma sirene acionada no período.",
    );
    return l;
  }, [dados, s]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-gray-50 p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold">Resumo — {rotuloPeriodo || "…"}</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setDia("")}
            className={`rounded-full border px-3 py-1 font-medium ${dia === "" ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white"}`}
          >
            Últimas 24 h
          </button>
          <label className="flex items-center gap-1">
            Dia
            <input
              type="date"
              value={dia}
              max={new Date().toLocaleDateString("sv-SE")}
              onChange={(e) => setDia(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1"
            />
          </label>
          <button type="button" onClick={carregar} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1">
            <RefreshCw size={12} className={carregando ? "animate-spin" : ""} /> Atualizar
          </button>
          <button type="button" onClick={copiar} disabled={!dados} className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1">
            <Clipboard size={12} /> {copiado ? "Copiado!" : "Copiar resumo"}
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {SUBS.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setSub(x.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${sub === x.key ? "bg-blue-600 text-white" : "bg-white text-gray-700 shadow-sm"}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!dados && carregando && <p className="text-sm text-gray-500">Carregando…</p>}

      {dados && s && sub === "resumo" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Cartao titulo="Municípios com chuva" valor={String(s.municipios_com_chuva)} detalhe={`${s.estacoes_com_chuva} estações com chuva`} />
            <Cartao
              titulo="Maior chuva"
              valor={s.maior_chuva ? `${fmt(s.maior_chuva.valor)} mm` : "—"}
              detalhe={s.maior_chuva ? `${s.maior_chuva.name} · ${s.maior_chuva.municipio}` : undefined}
              destaque="#1d4ed8"
            />
            <Cartao
              titulo="Maior rajada"
              valor={s.maior_rajada ? `${fmt(s.maior_rajada.valor)} km/h` : "—"}
              detalhe={s.maior_rajada ? `${s.maior_rajada.name} · ${s.maior_rajada.municipio}` : undefined}
              destaque="#7e22ce"
            />
            <Cartao
              titulo="Sirenes acionadas"
              valor={String(s.sirenes_acionadas)}
              detalhe={s.sirenes_tocando_agora ? `${s.sirenes_tocando_agora} tocando agora` : "nenhuma tocando agora"}
              destaque={s.sirenes_acionadas ? "#dc2626" : undefined}
            />
            <Cartao
              titulo="Maior Tmáx"
              valor={s.maior_tmax ? `${fmt(s.maior_tmax.valor)} °C` : "—"}
              detalhe={s.maior_tmax ? `${s.maior_tmax.name} · ${s.maior_tmax.municipio}` : undefined}
              destaque="#c2410c"
            />
            <Cartao
              titulo="Menor Tmín"
              valor={s.menor_tmin ? `${fmt(s.menor_tmin.valor)} °C` : "—"}
              detalhe={s.menor_tmin ? `${s.menor_tmin.name} · ${s.menor_tmin.municipio}` : undefined}
              destaque="#0369a1"
            />
            <Cartao titulo="Estações com dado" valor={String(s.estacoes_com_dado)} detalhe="chuva, temperatura ou vento" />
            <Cartao titulo="Outros alertas" valor={String(s.outros_alertas)} detalhe="regras do painel no período" />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold">Principais acontecimentos</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {acontecimentos.map((t) => (
                <li key={t}>{t}</li>
              ))}
              {s.acionamentos_por_municipio.length > 0 && (
                <li>Sirenes por município: {s.acionamentos_por_municipio.map(([m, n]) => `${m} (${n})`).join(", ")}.</li>
              )}
              {Object.entries(s.riscos_altos).map(([tipo, v]) => (
                <li key={tipo}>
                  Risco {tipo} em vigor: {v.muito_alto} “muito alto” e {v.alto} “alto”.
                </li>
              ))}
              {s.avisos_marinha.map((a) => (
                <li key={a.area + a.tipo}>Aviso da Marinha ({a.area}): {a.tipo}.</li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-gray-500">
            Chuva: soma dos baldes (valor oficial da fonte quando existe); “últimas 24 h” e “hoje” usam a mesma conta da tabela Precipitação.
            Temperatura e rajada: extremos das leituras no período, descartando valores fora da faixa física.
          </p>
        </div>
      )}

      {dados && sub === "top10" && (
        <div className="grid gap-3 md:grid-cols-2">
          <TopLista titulo="🌧️ Precipitação (mm)" itens={dados.top10.chuva} unidade="mm" onOpenStation={onOpenStation} />
          <TopLista titulo="💨 Rajada de vento (km/h)" itens={dados.top10.rajada} unidade="km/h" onOpenStation={onOpenStation} />
          <TopLista titulo="🌡️ Temperatura máxima (°C)" itens={dados.top10.tmax} unidade="°C" onOpenStation={onOpenStation} />
          <TopLista titulo="❄️ Temperatura mínima (°C)" itens={dados.top10.tmin} unidade="°C" onOpenStation={onOpenStation} />
        </div>
      )}

      {dados && sub === "previsao" && <PrevisaoObservado regioes={dados.regioes} rotulo={rotuloPeriodo} />}

      {dados && sub === "cidades" && (
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ["chuva", "Cidades com chuva"],
                ["vento", "Rajada moderada a muito forte"],
                ["todas", "Todas com dados"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFiltroCidade(k)}
                className={`rounded-full border px-3 py-1 font-medium ${filtroCidade === k ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white"}`}
              >
                {l}
              </button>
            ))}
            <span className="self-center text-gray-500">{cidades.length} município(s)</span>
          </div>
          <TabelaCidades cidades={cidades} />
          <p className="mt-2 text-[11px] text-gray-500">
            Intensidade da chuva no município (maior valor entre as estações): Fraca 0,2–10 mm · Moderada 10–30 · Forte 30–70 · Muito forte ≥ 70 mm no período.
            Rajada: Fraca &lt; 18,6 km/h · Moderada 18,6–52 · Forte 52–76 · Muito forte ≥ 76 (mesmas faixas da tabela Ventos).
          </p>
        </div>
      )}
    </div>
  );
}

function TabelaCidades({ cidades }: { cidades: ResumoMunicipio[] }) {
  return (
    <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="bg-gray-100 text-left text-[11px] uppercase text-gray-600">
          <tr>
            <th className="px-2 py-1.5">Município</th>
            <th className="px-2 py-1.5">REDEC</th>
            <th className="px-2 py-1.5 text-right">Chuva máx (mm)</th>
            <th className="px-2 py-1.5">Intensidade</th>
            <th className="px-2 py-1.5 text-right">Estações c/ chuva</th>
            <th className="px-2 py-1.5 text-right">Rajada máx (km/h)</th>
            <th className="px-2 py-1.5">Rajada</th>
            <th className="px-2 py-1.5 text-right">Tmáx</th>
            <th className="px-2 py-1.5 text-right">Tmín</th>
          </tr>
        </thead>
        <tbody>
          {cidades.map((m) => (
            <tr key={m.municipio} className="border-t border-gray-100">
              <td className="px-2 py-1 font-medium" title={m.chuva_estacao ? `Maior chuva em ${m.chuva_estacao}` : ""}>{m.municipio}</td>
              <td className="px-2 py-1 text-gray-600">{m.regiao || "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums">{fmt(m.chuva_max_mm)}</td>
              <td className="px-2 py-1"><Chip rotulo={m.chuva_classe} cores={COR_CHUVA} /></td>
              <td className="px-2 py-1 text-right tabular-nums">{m.estacoes_com_chuva}/{m.estacoes}</td>
              <td className="px-2 py-1 text-right tabular-nums" title={m.rajada_estacao ? `Em ${m.rajada_estacao}` : ""}>{fmt(m.rajada_max_kmh)}</td>
              <td className="px-2 py-1"><Chip rotulo={m.rajada_classe} cores={COR_RAJADA} /></td>
              <td className="px-2 py-1 text-right tabular-nums">{fmt(m.tmax)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{fmt(m.tmin)}</td>
            </tr>
          ))}
          {cidades.length === 0 && (
            <tr>
              <td colSpan={9} className="px-2 py-4 text-center text-gray-500">Nenhum município nesta seleção.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PrevisaoObservado({ regioes, rotulo }: { regioes: ResumoRegiao[]; rotulo: string }) {
  const comPrev = regioes.filter((r) => r.previsao).length;
  return (
    <div>
      <p className="mb-2 text-xs text-gray-600">
        Previsão lançada para o dia × o que os sensores registraram ({rotulo}). {comPrev}/{regioes.length} regiões têm previsão cadastrada.
        Temperatura: “Confere” até 2 °C de diferença, “Atenção” até 4 °C. Chuva: “choveu” = ao menos uma estação com ≥ 1 mm.
        Vento: classe do vento médio máximo (Fraco &lt; 20 km/h, Moderado 20–40, Forte &gt; 40) contra a classe prevista.
      </p>
      <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="bg-gray-100 text-left text-[11px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1.5">Região</th>
              <th className="px-2 py-1.5 text-right">Tmáx prev.</th>
              <th className="px-2 py-1.5 text-right">Tmáx obs.</th>
              <th className="px-2 py-1.5">Tmáx</th>
              <th className="px-2 py-1.5 text-right">Tmín prev.</th>
              <th className="px-2 py-1.5 text-right">Tmín obs.</th>
              <th className="px-2 py-1.5">Tmín</th>
              <th className="px-2 py-1.5">Chuva prev.</th>
              <th className="px-2 py-1.5 text-right">Chuva obs. (mm)</th>
              <th className="px-2 py-1.5">Chuva</th>
              <th className="px-2 py-1.5">Vento prev.</th>
              <th className="px-2 py-1.5 text-right">Vento obs. (km/h)</th>
              <th className="px-2 py-1.5">Vento</th>
            </tr>
          </thead>
          <tbody>
            {regioes.map((r) => {
              const o = r.observado;
              const p = r.previsao;
              return (
                <tr key={r.regiao} className="border-t border-gray-100 align-top">
                  <td className="px-2 py-1 font-medium" title={r.municipios_com_chuva.length ? `Com chuva: ${r.municipios_com_chuva.join(", ")}` : ""}>
                    {r.regiao}
                    <div className="text-[10px] font-normal text-gray-500">{o.estacoes} estações</div>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{p ? p.tmax : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums" title={`Mediana das estações: ${fmt(o.tmax_mediana)}`}>
                    {fmt(o.tmax)}
                    {r.veredito.tmax_dif != null && <div className="text-[10px] text-gray-500">{r.veredito.tmax_dif > 0 ? "+" : ""}{fmt(r.veredito.tmax_dif)}</div>}
                  </td>
                  <td className="px-2 py-1"><Veredito v={r.veredito.tmax} /></td>
                  <td className="px-2 py-1 text-right tabular-nums">{p ? p.tmin : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums" title={`Mediana das estações: ${fmt(o.tmin_mediana)}`}>
                    {fmt(o.tmin)}
                    {r.veredito.tmin_dif != null && <div className="text-[10px] text-gray-500">{r.veredito.tmin_dif > 0 ? "+" : ""}{fmt(r.veredito.tmin_dif)}</div>}
                  </td>
                  <td className="px-2 py-1"><Veredito v={r.veredito.tmin} /></td>
                  <td className="px-2 py-1">{p ? (p.preve_chuva ? "Chuva" : "Sem chuva") : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {fmt(o.chuva_max_mm)}
                    <div className="text-[10px] text-gray-500">{o.estacoes_com_chuva} est. c/ chuva</div>
                  </td>
                  <td className="px-2 py-1"><Veredito v={r.veredito.chuva} /></td>
                  <td className="px-2 py-1">{p ? p.vento : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums" title={`Rajada máxima: ${fmt(o.rajada_max_kmh)} km/h`}>
                    {fmt(o.vento_max_kmh)}
                    {o.vento_classe && <div className="text-[10px] text-gray-500">{o.vento_classe}</div>}
                  </td>
                  <td className="px-2 py-1"><Veredito v={r.veredito.vento} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
