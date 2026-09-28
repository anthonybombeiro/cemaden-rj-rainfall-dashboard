"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { COLUMN_ORDER } from "@/components/DataTable";
import HistoryChart from "@/components/HistoryChart";
import {
  fetchStation,
  fetchStationReadings,
  READING_TYPE_LABELS,
  READING_TYPE_UNITS,
  Reading,
  STATION_TYPE_LABELS,
  Station,
} from "@/lib/api";

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

function StationHistory({ stationId }: { stationId: number }) {
  const [station, setStation] = useState<Station | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeType, setActiveType] = useState<string | null>(null);
  const [history, setHistory] = useState<Reading[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, [stationId]);

  const availableTypes = useMemo(() => {
    if (!station) return [];
    const present = new Set(station.latest_readings.map((r) => r.reading_type));
    return COLUMN_ORDER.filter((t) => present.has(t));
  }, [station]);

  useEffect(() => {
    if (availableTypes.length === 0) return;
    setActiveType((current) => (current && availableTypes.includes(current) ? current : availableTypes[0]));
  }, [availableTypes]);

  useEffect(() => {
    if (!activeType) return;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchStationReadings(stationId, activeType)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stationId, activeType]);

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/" className="text-sm text-blue-700 hover:underline">
        ← Voltar ao painel
      </Link>

      <header className="mt-3 border-b border-gray-200 pb-4">
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

      {availableTypes.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">Esta estação ainda não possui leituras registradas.</p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap gap-1 border-b border-gray-200">
            {availableTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={`rounded-t px-3 py-1.5 text-sm font-medium ${
                  activeType === type
                    ? "border border-b-white bg-white text-blue-700"
                    : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {READING_TYPE_LABELS[type] ?? type}
              </button>
            ))}
          </div>

          {activeType && (
            <section className="rounded-b border border-t-0 border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-800">{READING_TYPE_LABELS[activeType] ?? activeType}</h2>

              {historyLoading ? (
                <div className="p-6 text-sm text-gray-400">Carregando histórico…</div>
              ) : historyError ? (
                <div className="p-4 text-sm text-red-600">Não foi possível carregar o histórico ({historyError}).</div>
              ) : (
                <>
                  <div className="mt-3">
                    <HistoryChart readings={history} unit={READING_TYPE_UNITS[activeType]} />
                  </div>

                  <div className="mt-4 max-h-72 overflow-auto rounded border border-gray-100">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
                        <tr>
                          <th className="px-3 py-1.5">Data/hora</th>
                          <th className="px-3 py-1.5">Valor{READING_TYPE_UNITS[activeType] ? ` (${READING_TYPE_UNITS[activeType]})` : ""}</th>
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
                    {history.length === 0 && (
                      <div className="p-4 text-center text-sm text-gray-400">Sem leituras para este tipo.</div>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
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
