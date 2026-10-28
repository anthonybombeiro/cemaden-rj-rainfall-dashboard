"use client";

import { Activity, ChartLine, ChevronLeft, ChevronRight, ClipboardList, CloudSun, CloudSunRain, Droplets, Layers, Map as MapIcon, Sunrise, Sunset, Thermometer, TriangleAlert, Waves, Wind } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import CartasSinoticasPanel from "@/components/CartasSinoticasPanel";
import ClimaPanel from "@/components/ClimaPanel";
import MaresPanel from "@/components/MaresPanel";
import MeteogramasPanel from "@/components/MeteogramasPanel";
import PrevisaoNumericaPanel from "@/components/PrevisaoNumericaPanel";
import PrevisaoForm from "@/components/PrevisaoForm";
import PrevisaoInmetPanel from "@/components/PrevisaoInmetPanel";
import SondagemPanel from "@/components/SondagemPanel";
import { CartaoTextoGeral } from "@/components/PrevisaoMapaCorpo";
import { AvisoMauTempo, fetchAvisosMauTempo, fetchDataUltimaPrevisao, fetchPrevisoes, fetchTextoGeralPrevisao, Previsao, REDECS } from "@/lib/api";
import { formatarDataHoraLocalIso, humanizarDescricao } from "@/lib/avisosMauTempo";
import { AvisoInmet, fetchAvisosInmetRJ } from "@/lib/inmet";
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

      <div className="mt-2 text-xs font-semibold text-gray-600">Temperatura:</div>
      <div className="mt-1 grid grid-cols-2 gap-2 text-center">
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
            <span className="font-medium">Umidade</span> entre {previsao.umidade_minima}% e {previsao.umidade_maxima}%
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Wind size={15} className="shrink-0 text-orange-500" />
          <dt className="sr-only">Vento</dt>
          <dd>
            <span className="font-medium">Vento</span> {previsao.vento_velocidade}
            {previsao.vento_direcao && (
              <>
                {" "}
                <span className="font-medium">Direção</span> {previsao.vento_direcao}
              </>
            )}
          </dd>
        </div>
        {(previsao.nascer_sol || previsao.por_sol) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700">
            <span className="flex items-center gap-1">
              <Sunrise size={15} className="text-amber-500" /> <span className="font-medium">Nascer</span>{" "}
              {previsao.nascer_sol || "—"}
            </span>
            <span className="flex items-center gap-1">
              <Sunset size={15} className="text-amber-700" /> <span className="font-medium">Pôr</span>{" "}
              {previsao.por_sol || "—"}
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
  const [textoGeral, setTextoGeral] = useState("");
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
      const [p, t] = await Promise.all([fetchPrevisoes(d), fetchTextoGeralPrevisao(d).catch(() => null)]);
      setPrevisoes(p);
      setTextoGeral(t?.texto_geral ?? "");
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
        <>
          {/* Cartão principal do dia: o texto geral do estado vem antes das REDECs */}
          <CartaoTextoGeral texto={textoGeral} variante="tela" lembrete={previsoes.length > 0} className="mb-3" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {REDECS.map((r) => (
              <PrevisaoCard key={r} regiao={r} previsao={porRegiao.get(r)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Rótulo amigável do tipo (vem da fonte em CAIXA ALTA, ex: "VENTO FORTE") —
// mesma lógica de "frase case" da descrição, só que pro título do card.
function tipoLegivel(tipo: string): string {
  const minusculo = tipo.toLowerCase();
  return minusculo.charAt(0).toUpperCase() + minusculo.slice(1);
}

// Leaflet precisa de `window` — sem SSR.
const AvisosMapa = dynamic(() => import("@/components/AvisosMapa"), {
  ssr: false,
  loading: () => <div className="flex h-80 items-center justify-center text-sm text-gray-400">Carregando mapa…</div>,
});

const AREA_LABEL: Record<string, string> = {
  CHARLIE: "Área Charlie",
  DELTA: "Área Delta",
};

function AvisoMauTempoCard({ aviso }: { aviso: AvisoMauTempo }) {
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 border-t-4 border-t-sedec-600 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">{tipoLegivel(aviso.tipo)}</h3>
        <Waves size={22} className="shrink-0 text-sedec-600" />
      </div>
      <span className="mt-1 w-fit rounded-full bg-sedec-50 px-2 py-0.5 text-[11px] font-semibold text-sedec-700">
        {AREA_LABEL[aviso.area] ?? aviso.area} · Atinge o litoral do RJ
      </span>

      <p className="mt-3 text-sm leading-relaxed text-gray-700">{humanizarDescricao(aviso.descricao, aviso.emitido_em)}</p>

      <dl className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
        <div className="flex justify-between gap-2">
          <dt>Emitido em</dt>
          <dd className="font-medium text-gray-700">{formatarDataHoraLocalIso(aviso.emitido_em)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Válido até</dt>
          <dd className="font-medium text-gray-700">{formatarDataHoraLocalIso(aviso.valido_ate)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Boletim</dt>
          <dd>NR {aviso.numero_externo}</dd>
        </div>
      </dl>
    </div>
  );
}

function AvisosMauTempoPainel() {
  const [avisos, setAvisos] = useState<AvisoMauTempo[]>([]);
  const [avisosInmet, setAvisosInmet] = useState<AvisoInmet[]>([]);
  const [erroInmet, setErroInmet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAvisosInmetRJ()
      .then(setAvisosInmet)
      .catch(() => setErroInmet(true));
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetchAvisosMauTempo()
      .then((r) => {
        if (!cancelado) setAvisos(r);
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : "Erro ao carregar avisos de mau tempo.");
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-gray-800">Avisos de mau tempo</h2>
        <span className="text-xs text-gray-500">INMET (avisos meteorológicos para municípios do RJ) e Marinha (mau tempo no mar, até 100 km da costa)</span>
      </div>

      {error && <div className="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{error}</div>}

      {erroInmet && <div className="mb-3 rounded bg-amber-50 p-2 text-sm text-amber-800">Avisos do INMET indisponíveis no momento.</div>}

      {loading ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando…</div>
      ) : (
        <>
          {(avisos.some((a) => a.geojson) || avisosInmet.some((a) => a.poligono)) && (
            <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
              <AvisosMapa avisos={avisos} avisosInmet={avisosInmet} />
            </div>
          )}

          <h3 className="mb-2 text-sm font-bold text-gray-700">INMET — avisos meteorológicos para o RJ</h3>
          {avisosInmet.length === 0 ? (
            <p className="mb-4 rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">Nenhum aviso do INMET ativo ou previsto para municípios do RJ.</p>
          ) : (
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {avisosInmet.map((a) => (
                <AvisoInmetCard key={`${a.id_aviso}-${a.previsto}`} aviso={a} />
              ))}
            </div>
          )}

          <h3 className="mb-2 text-sm font-bold text-gray-700">Marinha — mau tempo no mar (litoral do RJ)</h3>
          {avisos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
              <Waves size={28} className="text-gray-300" />
              <p className="text-sm text-gray-500">Nenhum aviso de mau tempo da Marinha ativo no momento para o litoral do RJ.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {avisos.map((a) => (
                <AvisoMauTempoCard key={a.id} aviso={a} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AvisoInmetCard({ aviso }: { aviso: AvisoInmet }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm" style={{ borderTop: `4px solid ${aviso.aviso_cor}` }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">{aviso.descricao}</h3>
        <TriangleAlert size={22} className="shrink-0" style={{ color: aviso.aviso_cor }} />
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">INMET · {aviso.severidade}</span>
        {aviso.previsto && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Previsto</span>}
      </div>
      {aviso.riscos.map((r) => (
        <p key={r} className="mt-3 text-sm leading-relaxed text-gray-700">
          {r}
        </p>
      ))}
      <dl className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-500">
        <div className="flex justify-between gap-2">
          <dt>Início</dt>
          <dd className="font-medium text-gray-700">{aviso.inicio}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Fim</dt>
          <dd className="font-medium text-gray-700">{aviso.fim}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Municípios do RJ</dt>
          <dd className="font-medium text-gray-700">{aviso.municipios.length}</dd>
        </div>
      </dl>
      <button type="button" onClick={() => setAberto((v) => !v)} className="mt-2 self-start text-xs font-medium text-blue-600 hover:underline">
        {aberto ? "Ocultar instruções e municípios" : "Ver instruções e municípios"}
      </button>
      {aberto && (
        <div className="mt-2 space-y-2 text-xs text-gray-600">
          {aviso.instrucoes.length > 0 && (
            <div>
              <b>Instruções:</b>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {aviso.instrucoes.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          <p>
            <b>Municípios:</b> {aviso.municipios.join(", ") || "—"}
          </p>
        </div>
      )}
    </div>
  );
}

const SUBABAS = [
  { key: "previsao", label: "Previsão CEMADEN-RJ", Icone: CloudSun },
  { key: "previsaoinmet", label: "Previsão INMET", Icone: CloudSunRain },
  { key: "avisos", label: "Avisos de mau tempo", Icone: TriangleAlert },
  { key: "cartas", label: "Cartas sinóticas", Icone: MapIcon },
  { key: "modelos", label: "Previsão numérica", Icone: Layers },
  { key: "meteogramas", label: "Meteogramas", Icone: ChartLine },
  { key: "sondagem", label: "Sondagem", Icone: Activity },
  { key: "mares", label: "Marés", Icone: Waves },
  { key: "clima", label: "Clima", Icone: Thermometer },
  { key: "cadastro", label: "Cadastro", Icone: ClipboardList },
] as const;

/** `abrirCadastro`: data (AAAA-MM-DD) para abrir direto o Cadastro da previsão naquele dia (aviso das 15 h 30 de "amanhã sem previsão"). */
export default function MeteorologiaPanel({ abrirCadastro = null }: { abrirCadastro?: string | null }) {
  const [sub, setSub] = useState<(typeof SUBABAS)[number]["key"]>(abrirCadastro ? "cadastro" : "previsao");
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-1.5 sm:px-3 [scrollbar-width:none]">
        {SUBABAS.map(({ key, label, Icone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSub(key)}
            title={label}
            aria-label={label}
            className={`flex items-center justify-center gap-1.5 rounded-full px-1.5 py-1.5 text-sm font-medium max-sm:flex-1 sm:px-3 ${
              sub === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Icone size={18} className="shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {sub === "previsao" ? <PrevisaoDiaria /> : sub === "previsaoinmet" ? <PrevisaoInmetPanel /> : sub === "clima" ? <ClimaPanel /> : sub === "avisos" ? <AvisosMauTempoPainel /> : sub === "cartas" ? (
          <CartasSinoticasPanel />
        ) : sub === "modelos" ? (
          <PrevisaoNumericaPanel />
        ) : sub === "meteogramas" ? (
          <MeteogramasPanel />
        ) : sub === "sondagem" ? (
          <SondagemPanel />
        ) : sub === "mares" ? (
          <MaresPanel />
        ) : (
          <PrevisaoForm dataInicial={abrirCadastro ?? undefined} />
        )}
      </div>
    </div>
  );
}
