"use client";

import { ChevronLeft, ChevronRight, Droplets, Sunrise, Sunset, Wind } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import PrevisaoForm from "@/components/PrevisaoForm";
import { fetchDataUltimaPrevisao, fetchPrevisoes, Previsao, REDECS } from "@/lib/api";
import { EMOJI_POR_ICONE, iconeSrc } from "@/lib/meteorologia";

function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function somaDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function dataExtenso(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function IconeTempo({ icone }: { icone: string }) {
  const [semImagem, setSemImagem] = useState(false);
  if (!icone) return null;
  if (semImagem) return <span className="text-4xl leading-none">{EMOJI_POR_ICONE[icone] ?? "🌡️"}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconeSrc(icone)}
      alt=""
      className="h-12 w-12 object-contain"
      onError={() => setSemImagem(true)}
    />
  );
}

function PrevisaoCard({ regiao, previsao }: { regiao: string; previsao?: Previsao }) {
  if (!previsao) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">{regiao}</h3>
        <p className="mt-3 text-sm text-gray-400">Sem previsão para esta data.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 border-t-4 border-t-sedec-600 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">{regiao}</h3>
        <IconeTempo icone={previsao.icone} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-red-50 py-1.5">
          <div className="text-[11px] text-gray-500">Máxima</div>
          <div className="text-xl font-semibold text-red-600">{previsao.temperatura_maxima}°C</div>
        </div>
        <div className="rounded bg-blue-50 py-1.5">
          <div className="text-[11px] text-gray-500">Mínima</div>
          <div className="text-xl font-semibold text-blue-600">{previsao.temperatura_minima}°C</div>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 text-sm text-gray-700">
        <div className="flex items-center gap-2">
          <Droplets size={15} className="shrink-0 text-sky-600" />
          <dt className="sr-only">Umidade</dt>
          <dd>
            Umidade {previsao.umidade_minima}% – {previsao.umidade_maxima}%
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Wind size={15} className="shrink-0 text-orange-500" />
          <dt className="sr-only">Vento</dt>
          <dd>
            {previsao.vento_velocidade}
            {previsao.vento_direcao ? ` · ${previsao.vento_direcao}` : ""}
          </dd>
        </div>
        {(previsao.nascer_sol || previsao.por_sol) && (
          <div className="flex items-center gap-3 text-gray-600">
            <span className="flex items-center gap-1">
              <Sunrise size={15} className="text-amber-500" /> {previsao.nascer_sol || "—"}
            </span>
            <span className="flex items-center gap-1">
              <Sunset size={15} className="text-amber-700" /> {previsao.por_sol || "—"}
            </span>
          </div>
        )}
      </dl>

      {previsao.comentario && <p className="mt-3 text-xs leading-relaxed text-gray-600">{previsao.comentario}</p>}
    </div>
  );
}

function PrevisaoDiaria() {
  const [data, setData] = useState<string | null>(null);
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDataUltimaPrevisao()
      .then((d) => {
        if (!cancelled) setData(d ?? hojeISO());
      })
      .catch(() => {
        if (!cancelled) setData(hojeISO());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const carregar = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      setPrevisoes(await fetchPrevisoes(d));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar previsões.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (data) void carregar(data);
  }, [data, carregar]);

  const porRegiao = useMemo(() => new Map(previsoes.map((p) => [p.regiao, p])), [previsoes]);
  const atualizadoEm = useMemo(() => {
    const ts = previsoes.map((p) => p.atualizado_em).sort();
    return ts.length ? new Date(ts[ts.length - 1]).toLocaleString("pt-BR") : null;
  }, [previsoes]);

  if (!data) return <div className="p-6 text-center text-sm text-gray-400">Carregando previsão…</div>;

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-bold text-gray-800">Previsão do tempo por região</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setData(somaDias(data, -1))}
            className="rounded border border-gray-300 bg-white p-1.5 text-gray-700 hover:bg-gray-100"
            aria-label="Dia anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900"
          />
          <button
            type="button"
            onClick={() => setData(somaDias(data, 1))}
            className="rounded border border-gray-300 bg-white p-1.5 text-gray-700 hover:bg-gray-100"
            aria-label="Próximo dia"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => setData(hojeISO())}
            className="ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            Hoje
          </button>
        </div>
        <span className="text-sm text-gray-600">{dataExtenso(data)}</span>
        {atualizadoEm && <span className="ml-auto text-xs text-gray-500">Atualizado em {atualizadoEm}</span>}
      </div>

      {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {REDECS.map((r) => (
            <PrevisaoCard key={r} regiao={r} previsao={porRegiao.get(r)} />
          ))}
        </div>
      )}
    </div>
  );
}

const SUBABAS = [
  { key: "previsao", label: "Previsão" },
  { key: "cadastro", label: "Cadastro" },
] as const;

export default function MeteorologiaPanel() {
  const [sub, setSub] = useState<(typeof SUBABAS)[number]["key"]>("previsao");
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-gray-200 bg-white px-3 py-1.5">
        {SUBABAS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              sub === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{sub === "previsao" ? <PrevisaoDiaria /> : <PrevisaoForm />}</div>
    </div>
  );
}
