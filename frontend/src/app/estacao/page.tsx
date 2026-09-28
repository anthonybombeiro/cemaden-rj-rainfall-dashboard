"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import AccumulationChart from "@/components/AccumulationChart";
import { COLUMN_ORDER } from "@/components/DataTable";
import {
  ChuvaGauge,
  NumeroGrandeCard,
  PressaoGauge,
  RadiacaoGauge,
  TemperaturaGauge,
  UmidadeGauge,
  UvGauge,
  VentoGauge,
} from "@/components/Gauges";
import HistoryChart from "@/components/HistoryChart";
import {
  EstacaoProxima,
  fetchEstacoesProximas,
  fetchPrecipitacaoSerie,
  fetchStation,
  fetchStationReadings,
  PrecipitacaoSerie,
  READING_TYPE_LABELS,
  READING_TYPE_UNITS,
  Reading,
  STATION_TYPE_LABELS,
  Station,
} from "@/lib/api";

// Leaflet precisa de `window` — sem SSR, mesmo padrão do MapView em Dashboard.tsx.
const StationMiniMap = dynamic(() => import("@/components/StationMiniMap"), {
  ssr: false,
  loading: () => <div className="flex h-64 items-center justify-center text-sm text-gray-400 sm:h-72">Carregando mapa…</div>,
});

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function formatValue(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

// Vento é guardado em m/s (SI) no banco mas exibido em km/h no resto do
// painel (DataTable.tsx/MapView.tsx) — mesma conversão aqui.
const WIND_READING_TYPES = new Set(["vento_ms", "vento_rajada_ms"]);
const kmh = (ms: number) => ms * 3.6;

function paraExibicao(readings: Reading[], tipo: string): Reading[] {
  if (!WIND_READING_TYPES.has(tipo)) return readings;
  return readings.map((r) => ({ ...r, value: kmh(r.value) }));
}

const JANELAS_CHUVA: { key: "4h" | "24h" | "7d"; label: string }[] = [
  { key: "4h", label: "4 horas" },
  { key: "24h", label: "24 horas" },
  { key: "7d", label: "7 dias" },
];

/** Cards "ao vivo" — um gauge por tipo de leitura disponível, valores que
 * refletem a leitura mais recente (pedido do usuário, 2026-09-28: "os
 * cards visuais... se mexem de acordo com a leitura", inspirado no
 * dashboard do Wunderground). Vento junta velocidade+direção+rajada num
 * card só; temperatura/umidade mostram sensação/orvalho como legenda
 * quando a fonte informa. */
function CardsAoVivo({ station }: { station: Station }) {
  const valorDe = (tipo: string) => station.latest_readings.find((r) => r.reading_type === tipo)?.value;
  const temp = valorDe("temperatura_c");
  const umid = valorDe("umidade_pct");
  const ventoMs = valorDe("vento_ms");
  const direcao = valorDe("vento_dir_graus");
  const rajadaMs = valorDe("vento_rajada_ms");
  const pressao = valorDe("pressao_hpa") ?? valorDe("pressao_nm_hpa");
  const uv = valorDe("uv_indice");
  const radiacao = valorDe("radiacao_wm2");
  const chuva = valorDe("chuva_mm");
  const nivel = valorDe("nivel_m");
  const mare = valorDe("mare_m");
  const sensacao = valorDe("sensacao_termica_c");
  const orvalho = valorDe("ponto_orvalho_c");

  const cards: React.ReactNode[] = [];
  if (temp !== undefined) cards.push(<TemperaturaGauge key="temp" valor={temp} sensacao={sensacao} />);
  if (umid !== undefined) cards.push(<UmidadeGauge key="umid" valor={umid} orvalho={orvalho} />);
  if (ventoMs !== undefined)
    cards.push(
      <VentoGauge key="vento" velocidadeKmh={kmh(ventoMs)} direcaoGraus={direcao} rajadaKmh={rajadaMs !== undefined ? kmh(rajadaMs) : undefined} />,
    );
  if (pressao !== undefined) cards.push(<PressaoGauge key="pressao" valor={pressao} />);
  if (chuva !== undefined) cards.push(<ChuvaGauge key="chuva" valor={chuva} />);
  if (uv !== undefined) cards.push(<UvGauge key="uv" valor={uv} />);
  if (radiacao !== undefined) cards.push(<RadiacaoGauge key="radiacao" valor={radiacao} />);
  if (nivel !== undefined) cards.push(<NumeroGrandeCard key="nivel" titulo="Nível do rio" valor={nivel} unidade="m" />);
  if (mare !== undefined) cards.push(<NumeroGrandeCard key="mare" titulo="Maré" valor={mare} unidade="m" />);

  if (cards.length === 0) return null;
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{cards}</div>;
}

/** Os 3 gráficos fixos "Precipitação Acumulada em 4h/24h/7 dias", igual ao
 * Rede Salvar do CEMADEN nacional (pedido do usuário, 2026-09-28) — troca
 * de janela por abas, não pelo seletor de período genérico (esse é só
 * pras outras variáveis, ver `HistoricoPorPeriodo`). */
function PrecipitacaoAcumulada({ stationId }: { stationId: number }) {
  const [janela, setJanela] = useState<"4h" | "24h" | "7d">("24h");
  const [dados, setDados] = useState<PrecipitacaoSerie | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    setErro(null);
    fetchPrecipitacaoSerie(stationId, janela)
      .then((d) => {
        if (!cancelado) setDados(d);
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [stationId, janela]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-800">Precipitação acumulada</h2>
        <div className="flex gap-1">
          {JANELAS_CHUVA.map((j) => (
            <button
              key={j.key}
              type="button"
              onClick={() => setJanela(j.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                janela === j.key ? "bg-sedec-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {j.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="p-6 text-sm text-gray-400">Carregando…</div>
        ) : erro ? (
          <div className="p-4 text-sm text-red-600">Não foi possível carregar ({erro}).</div>
        ) : (
          <AccumulationChart serie={dados?.serie ?? []} janela={janela} totalMm={dados?.total_mm ?? 0} />
        )}
      </div>
    </section>
  );
}

type PeriodoKey = "dia" | "semana" | "mes" | "personalizado";
const PERIODOS: { key: PeriodoKey; label: string; dias?: number }[] = [
  { key: "dia", label: "Dia", dias: 1 },
  { key: "semana", label: "Semana", dias: 7 },
  { key: "mes", label: "Mês", dias: 30 },
  { key: "personalizado", label: "Personalizado" },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Histórico por tipo de leitura com seletor de período (Dia/Semana/Mês/
 * Personalizado) e alternância Gráfico/Tabela — pedido do usuário,
 * 2026-09-28 ("os demais dados... gráficos e tabela por período",
 * inspirado no dashboard do Wunderground). Cobre TODOS os tipos de
 * leitura da estação, inclusive chuva/nível (a seção de acumulado acima é
 * um complemento pra chuva, não substitui esta). */
function HistoricoPorPeriodo({ station }: { station: Station }) {
  const availableTypes = useMemo(() => {
    const present = new Set(station.latest_readings.map((r) => r.reading_type));
    return COLUMN_ORDER.filter((t) => !t.startsWith("x:") && present.has(t));
  }, [station]);

  const [activeType, setActiveType] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoKey>("dia");
  const [customSince, setCustomSince] = useState(isoDate(new Date(Date.now() - 7 * 86400000)));
  const [customUntil, setCustomUntil] = useState(isoDate(new Date()));
  const [visualizacao, setVisualizacao] = useState<"grafico" | "tabela">("grafico");

  const [history, setHistory] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (availableTypes.length === 0) return;
    setActiveType((atual) => (atual && availableTypes.includes(atual) ? atual : availableTypes[0]));
  }, [availableTypes]);

  useEffect(() => {
    if (!activeType) return;
    let cancelado = false;
    setLoading(true);
    setErro(null);
    const cfg = PERIODOS.find((p) => p.key === periodo);
    const opts =
      periodo === "personalizado"
        ? { since: new Date(`${customSince}T00:00:00-03:00`), until: new Date(`${customUntil}T23:59:59-03:00`) }
        : { since: new Date(Date.now() - (cfg?.dias ?? 1) * 86400000) };
    fetchStationReadings(station.id, activeType, opts)
      .then((data) => {
        if (!cancelado) setHistory(paraExibicao(data, activeType));
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [station.id, activeType, periodo, customSince, customUntil]);

  const resumo = useMemo(() => {
    if (history.length === 0) return null;
    const valores = history.map((r) => r.value);
    const alta = Math.max(...valores);
    const baixa = Math.min(...valores);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const total = activeType === "chuva_mm" ? valores.reduce((a, b) => a + b, 0) : null;
    return { alta, baixa, media, total };
  }, [history, activeType]);

  if (availableTypes.length === 0) return null;
  const unidade = activeType ? READING_TYPE_UNITS[activeType] : undefined;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-800">Histórico por período</h2>

      <div className="mt-3 flex flex-wrap gap-1 border-b border-gray-200">
        {availableTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveType(type)}
            className={`rounded-t px-3 py-1.5 text-sm font-medium ${
              activeType === type ? "border border-b-white bg-white text-sedec-600" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            {READING_TYPE_LABELS[type] ?? type}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriodo(p.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                periodo === p.key ? "bg-sedec-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
          {(["grafico", "tabela"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisualizacao(v)}
              className={`rounded px-3 py-1 text-xs font-medium capitalize ${
                visualizacao === v ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"
              }`}
            >
              {v === "grafico" ? "Gráfico" : "Tabela"}
            </button>
          ))}
        </div>
      </div>

      {periodo === "personalizado" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <label className="flex items-center gap-1">
            De
            <input
              type="date"
              value={customSince}
              max={customUntil}
              onChange={(e) => setCustomSince(e.target.value)}
              className="rounded border border-gray-300 px-1.5 py-0.5"
            />
          </label>
          <label className="flex items-center gap-1">
            Até
            <input
              type="date"
              value={customUntil}
              min={customSince}
              max={isoDate(new Date())}
              onChange={(e) => setCustomUntil(e.target.value)}
              className="rounded border border-gray-300 px-1.5 py-0.5"
            />
          </label>
        </div>
      )}

      {resumo && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <span>
            Alta: <strong className="text-gray-900">{formatValue(resumo.alta)}</strong> {unidade}
          </span>
          <span>
            Baixa: <strong className="text-gray-900">{formatValue(resumo.baixa)}</strong> {unidade}
          </span>
          <span>
            Média: <strong className="text-gray-900">{formatValue(resumo.media)}</strong> {unidade}
          </span>
          <span>
            Total: <strong className="text-gray-900">{resumo.total !== null ? `${formatValue(resumo.total)} ${unidade}` : "—"}</strong>
          </span>
        </div>
      )}

      <div className="mt-3">
        {loading ? (
          <div className="p-6 text-sm text-gray-400">Carregando histórico…</div>
        ) : erro ? (
          <div className="p-4 text-sm text-red-600">Não foi possível carregar o histórico ({erro}).</div>
        ) : visualizacao === "grafico" ? (
          <HistoryChart readings={history} unit={unidade} />
        ) : (
          <div className="max-h-96 overflow-auto rounded border border-gray-100">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-1.5">Data/hora</th>
                  <th className="px-3 py-1.5">Valor{unidade ? ` (${unidade})` : ""}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50">
                    <td className="whitespace-nowrap px-3 py-1 text-gray-600">{formatTimestamp(r.timestamp)}</td>
                    <td className="whitespace-nowrap px-3 py-1 text-gray-900">{formatValue(r.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && <div className="p-4 text-center text-sm text-gray-400">Sem leituras para este período.</div>}
          </div>
        )}
      </div>
    </section>
  );
}

function StationHistory({ stationId }: { stationId: number }) {
  const [station, setStation] = useState<Station | null>(null);
  const [proximas, setProximas] = useState<EstacaoProxima[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStation(stationId)
      .then((data) => {
        if (cancelled) return;
        setStation(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetchEstacoesProximas(stationId).then((d) => {
      if (!cancelled) setProximas(d);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stationId]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Carregando estação…</div>;
  }

  if (error || !station) {
    return (
      <div className="p-6 text-sm text-red-600">
        Não foi possível carregar a estação ({error ?? "não encontrada"}).
      </div>
    );
  }

  const temChuva = station.latest_readings.some((r) => r.reading_type === "chuva_mm");

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
      <Link href="/" className="text-sm text-sedec-600 hover:underline">
        ← Voltar ao painel
      </Link>

      <header className="border-b border-gray-200 pb-4">
        <h1 className="text-xl font-bold text-gray-900">{station.name}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Município</dt>
            <dd>{station.municipality || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Fonte</dt>
            <dd>{station.source}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Tipo</dt>
            <dd>{STATION_TYPE_LABELS[station.station_type] ?? station.station_type}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Status</dt>
            <dd className="capitalize">{station.status}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-400">Coordenadas</dt>
            <dd>
              {station.latitude.toFixed(5)}, {station.longitude.toFixed(5)}
            </dd>
          </div>
          {station.altitude_m !== null && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-400">Altitude</dt>
              <dd>{station.altitude_m} m</dd>
            </div>
          )}
        </dl>
      </header>

      <CardsAoVivo station={station} />

      <section className="rounded-lg border border-gray-200 bg-white p-3">
        <h2 className="mb-2 text-sm font-bold text-gray-800">Localização e estações próximas</h2>
        <StationMiniMap nome={station.name} latitude={station.latitude} longitude={station.longitude} proximas={proximas} />
      </section>

      {temChuva && <PrecipitacaoAcumulada stationId={station.id} />}

      <HistoricoPorPeriodo station={station} />
    </div>
  );
}

function EstacaoPageContent() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const stationId = idParam ? Number(idParam) : NaN;

  if (!idParam || Number.isNaN(stationId)) {
    return (
      <div className="p-6 text-sm text-red-600">
        Nenhuma estação informada. Volte ao{" "}
        <Link href="/" className="underline">
          painel
        </Link>{" "}
        e clique em uma estação na tabela de Dados Meteorológicos.
      </div>
    );
  }

  return <StationHistory stationId={stationId} />;
}

export default function EstacaoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-400">Carregando…</div>}>
      <EstacaoPageContent />
    </Suspense>
  );
}
