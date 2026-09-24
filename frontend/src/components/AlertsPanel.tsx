"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchRiskAlerts,
  normalizeMunicipioName,
  RISK_ALERT_TIPO_LABELS,
  RISK_LEVEL_COLORS,
  RISK_LEVEL_LABELS,
  RiskAlert,
  RiskAlertTipo,
  RiskLevel,
} from "@/lib/api";
import RiskChoroplethMap, { Selecao } from "@/components/RiskChoroplethMap";

const TIPOS: RiskAlertTipo[] = ["hidrologico", "geologico", "meteorologico", "incendio"];
const NIVEIS: RiskLevel[] = ["muito_baixo", "baixo", "moderado", "alto", "muito_alto"];

/** A partir de qual nível um card PRÓPRIO (separado) precisa existir pra
 * essa REDEC — pedido do usuário (2026-09-24): antes a gente "empurrava"
 * o card inteiro da REDEC pro MAIOR risco visto entre os municípios,
 * escondendo que outros municípios da mesma REDEC estavam num nível mais
 * baixo (mas ainda relevante) — ex: card mostrava "SERRANA I: Alto" com
 * "Petrópolis, São José do Vale do Rio Preto, Teresópolis" juntos, quando
 * na verdade só Petrópolis estava em Alto e os outros dois em Moderado.
 * Agora cada nível qualificante vira um card SEPARADO pra aquela REDEC. */
const DESTAQUE_MUNICIPIO_A_PARTIR_DE: Partial<Record<RiskAlertTipo, RiskLevel[]>> = {
  hidrologico: ["alto", "muito_alto"],
  geologico: ["moderado", "alto", "muito_alto"],
};

/** Preto ou branco conforme o fundo, pra manter o texto legível em qualquer
 * cor da escala (BAIXO é amarelo puro — texto branco fica ilegível nele). */
function textColorFor(bg: string): string {
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

type CardRedec = {
  id: string;
  redec: string;
  risco: RiskLevel;
  municipios: string[];
  atualizado: string | null;
};

function RedecGrid({
  alerts,
  municipioAlerts,
  tipo,
  selecao,
}: {
  alerts: RiskAlert[];
  municipioAlerts: RiskAlert[];
  tipo: RiskAlertTipo;
  /** Busca ativa (pedido do usuário: "integrar as buscas" — selecionar um
   * município/REDEC filtra os cards também, não só o mapa/tabela). */
  selecao: Selecao;
}) {
  const temGranularidadeMunicipal = tipo === "geologico" || tipo === "hidrologico";
  const niveisDestaque = DESTAQUE_MUNICIPIO_A_PARTIR_DE[tipo];

  // Município exatamente em cada nível, agrupado por REDEC — só pros tipos
  // com granularidade municipal (geológico/hidrológico).
  const municipiosPorRedecNivel = useMemo(() => {
    const mapa = new Map<string, Map<RiskLevel, string[]>>();
    if (!temGranularidadeMunicipal) return mapa;
    for (const m of municipioAlerts) {
      if (!mapa.has(m.redec)) mapa.set(m.redec, new Map());
      const porNivel = mapa.get(m.redec)!;
      const lista = porNivel.get(m.risco) ?? [];
      lista.push(m.municipio);
      porNivel.set(m.risco, lista);
    }
    for (const porNivel of mapa.values()) {
      for (const lista of porNivel.values()) lista.sort((a, b) => a.localeCompare(b));
    }
    return mapa;
  }, [municipioAlerts, temGranularidadeMunicipal]);

  // Um card por REDEC normalmente — MAS um card POR NÍVEL qualificante
  // (moderado+ geológico / alto+ hidrológico) sempre que 1+ município
  // daquela REDEC atingir esse nível, em vez de só "empurrar" pro maior.
  const cards = useMemo<CardRedec[]>(() => {
    const resultado: CardRedec[] = [];
    for (const a of alerts) {
      const atualizado = a.atualizado_em ?? a.criado_em;
      const porNivel = municipiosPorRedecNivel.get(a.redec);
      const niveisQualificantes = new Set<RiskLevel>();
      if (niveisDestaque?.includes(a.risco)) niveisQualificantes.add(a.risco);
      if (porNivel) {
        for (const nivel of porNivel.keys()) {
          if (niveisDestaque?.includes(nivel)) niveisQualificantes.add(nivel);
        }
      }
      if (niveisQualificantes.size === 0) {
        resultado.push({ id: `${a.id}`, redec: a.redec, risco: a.risco, municipios: [], atualizado });
      } else {
        for (const nivel of niveisQualificantes) {
          resultado.push({
            id: `${a.id}-${nivel}`,
            redec: a.redec,
            risco: nivel,
            municipios: porNivel?.get(nivel) ?? [],
            atualizado,
          });
        }
      }
    }
    return resultado;
  }, [alerts, municipiosPorRedecNivel, niveisDestaque]);

  // Filtro pela busca compartilhada (pedido do usuário) — REDEC selecionada
  // mostra só os cards dela; município selecionado mostra só o(s) card(s)
  // da REDEC a que ele pertence (é a granularidade que os cards têm).
  const filtrados = useMemo(() => {
    if (!selecao) return cards;
    if (selecao.tipo === "redec") return cards.filter((c) => c.redec === selecao.valor);
    const redecDoMunicipio = municipioAlerts.find((m) => m.municipio === selecao.valor)?.redec;
    return redecDoMunicipio ? cards.filter((c) => c.redec === redecDoMunicipio) : cards;
  }, [cards, selecao, municipioAlerts]);

  const sorted = useMemo(
    () =>
      [...filtrados].sort(
        (a, b) => NIVEIS.indexOf(b.risco) - NIVEIS.indexOf(a.risco) || a.redec.localeCompare(b.redec),
      ),
    [filtrados],
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {sorted.map((c) => {
        const bg = RISK_LEVEL_COLORS[c.risco];
        return (
          <div key={c.id} className="rounded-lg border border-gray-200 p-3 shadow-sm" style={{ backgroundColor: bg }}>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: textColorFor(bg) }}>
              {c.redec}
            </div>
            <div className="mt-1 text-lg font-bold" style={{ color: textColorFor(bg) }}>
              {RISK_LEVEL_LABELS[c.risco]}
            </div>
            {c.municipios.length > 0 && (
              <div className="mt-1 text-[11px] leading-snug opacity-90" style={{ color: textColorFor(bg) }}>
                {c.municipios.join(", ")}
              </div>
            )}
            <div className="mt-1 text-[11px] opacity-80" style={{ color: textColorFor(bg) }}>
              Atualizado: {formatTimestamp(c.atualizado)}
            </div>
          </div>
        );
      })}
      {sorted.length === 0 && (
        <div className="col-span-full p-6 text-center text-sm text-gray-400">Sem dados para essa camada ainda.</div>
      )}
    </div>
  );
}

function MunicipioTable({ alerts, emptyMessage }: { alerts: RiskAlert[]; emptyMessage?: string }) {
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...alerts];
    copy.sort((a, b) => {
      const cmp = NIVEIS.indexOf(a.risco) - NIVEIS.indexOf(b.risco) || a.municipio.localeCompare(b.municipio);
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [alerts, sortAsc]);

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Por município ({alerts.length})</h3>
      <div className="max-h-80 overflow-auto rounded border border-gray-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-100 text-left text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">Município</th>
              <th className="whitespace-nowrap px-3 py-2">REDEC</th>
              <th
                className="cursor-pointer select-none whitespace-nowrap px-3 py-2"
                onClick={() => setSortAsc((v) => !v)}
              >
                Risco{sortAsc ? " ▲" : " ▼"}
              </th>
              <th className="whitespace-nowrap px-3 py-2">Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const bg = RISK_LEVEL_COLORS[a.risco];
              return (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium text-gray-900">{a.municipio}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{a.redec}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span
                      className="rounded px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: bg, color: textColorFor(bg) }}
                    >
                      {RISK_LEVEL_LABELS[a.risco]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">
                    {formatTimestamp(a.atualizado_em ?? a.criado_em)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400">
            {alerts.length === 0 && emptyMessage ? emptyMessage : "Nenhum município encontrado para essa busca."}
          </div>
        )}
      </div>
    </div>
  );
}

// Recarrega sozinho enquanto a aba fica aberta — sem isso, quem deixasse o
// painel aberto numa TV/monitor de operação ficaria vendo dado cada vez
// mais velho, já que a página só busca de novo se o operador recarregar
// manualmente.
const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;

export default function AlertsPanel() {
  const [tipo, setTipo] = useState<RiskAlertTipo>("geologico");
  const [redecAlerts, setRedecAlerts] = useState<RiskAlert[]>([]);
  const [municipioAlerts, setMunicipioAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  // Busca ÚNICA (pedido do usuário, 2026-09-24: "integrar as buscas") —
  // uma seleção só, compartilhada entre cards/mapa/tabela, em vez do mapa
  // ter sua própria busca e a tabela ter outra separada e desconectada.
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Selecao>(null);
  const limparBusca = () => {
    setSelecao(null);
    setBusca("");
  };

  // Município→REDEC não muda entre abas — busca 1x (via geológico, que
  // sempre tem os 92) e reusa pra colorir o mapa de meteorológico/incêndio
  // (que só têm dado por REDEC) por município.
  const [municipioRedecMap, setMunicipioRedecMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    fetchRiskAlerts("geologico", "municipio")
      .then((data) => {
        if (cancelled) return;
        const mapa: Record<string, string> = {};
        for (const a of data) mapa[normalizeMunicipioName(a.municipio)] = a.redec;
        setMunicipioRedecMap(mapa);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Geológico e hidrológico têm granularidade municipal na fonte (os 92,
  // confirmado ao vivo pros dois); meteorológico/incêndio só têm por REDEC.
  const temGranularidadeMunicipal = tipo === "geologico" || tipo === "hidrologico";

  const [atualizandoManual, setAtualizandoManual] = useState(false);
  // Evita setState depois que o componente desmontou (ex: trocou de aba no
  // meio de uma busca) — checado dentro de carregar(), não no efeito, pra
  // funcionar igual tanto na busca automática quanto na manual (botão).
  // IMPORTANTE: resetado pra `false` dentro do PRÓPRIO efeito de busca
  // (não só declarado 1x aqui) — sem isso, o StrictMode do React em dev
  // (monta→desmonta→remonta 1x de propósito, só em desenvolvimento) deixa
  // esse ref preso em `true` pra sempre depois do primeiro ciclo simulado,
  // e a página trava em "Carregando alertas…" (visto só em `next dev`,
  // não acontece no build de produção).
  const desmontadoRef = useRef(false);

  // useCallback pra poder chamar isso tanto sozinho (efeito abaixo) quanto
  // sob demanda (botão "Atualizar agora") sem duplicar a lógica de busca.
  const carregar = useCallback(
    (mostrarLoading: boolean) => {
      if (mostrarLoading) setLoading(true);
      setError(null);
      return Promise.all([
        fetchRiskAlerts(tipo, "redec"),
        temGranularidadeMunicipal ? fetchRiskAlerts(tipo, "municipio") : Promise.resolve([]),
      ])
        .then(([redec, municipio]) => {
          if (desmontadoRef.current) return;
          setRedecAlerts(redec);
          setMunicipioAlerts(municipio);
          setAtualizadoEm(new Date());
        })
        .catch((err) => {
          if (!desmontadoRef.current) setError(err instanceof Error ? err.message : "Erro desconhecido");
        })
        .finally(() => {
          if (!desmontadoRef.current && mostrarLoading) setLoading(false);
        });
    },
    [tipo, temGranularidadeMunicipal],
  );

  useEffect(() => {
    desmontadoRef.current = false;
    carregar(true);
    const intervalo = setInterval(() => carregar(false), INTERVALO_ATUALIZACAO_MS);
    return () => {
      desmontadoRef.current = true;
      clearInterval(intervalo);
    };
  }, [carregar]);

  const atualizarAgora = () => {
    setAtualizandoManual(true);
    carregar(false).finally(() => setAtualizandoManual(false));
  };

  // Tabela filtrada pela mesma busca compartilhada — município selecionado
  // mostra só ele; REDEC selecionada mostra todos os municípios dela.
  const municipioAlertsFiltrados = useMemo(() => {
    if (!selecao) return municipioAlerts;
    if (selecao.tipo === "municipio") return municipioAlerts.filter((m) => m.municipio === selecao.valor);
    return municipioAlerts.filter((m) => m.redec === selecao.valor);
  }, [municipioAlerts, selecao]);

  return (
    <div className="h-full w-full overflow-auto bg-white p-4">
      <div className="mb-4 flex flex-wrap gap-2">
        {TIPOS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tipo === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {RISK_ALERT_TIPO_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        {/* Busca única, acima de cards/mapa/tabela — pedido do usuário
            (2026-09-24): renomeada de "Mapa por Município", filtra os três
            juntos até clicar em Limpar. Autocomplete próprio (não reusa o
            de dentro de RiskChoroplethMap, que agora fica com hideSearchUI). */}
        <BuscaUnificada
          busca={busca}
          setBusca={setBusca}
          selecao={selecao}
          setSelecao={setSelecao}
          onLimpar={limparBusca}
          redecs={Array.from(new Set(redecAlerts.map((a) => a.redec))).sort((a, b) => a.localeCompare(b))}
          municipios={Array.from(new Set(municipioAlerts.map((a) => a.municipio))).sort((a, b) => a.localeCompare(b))}
        />
        <div className="flex items-center gap-2">
          {atualizadoEm && (
            <span title="A página busca de novo sozinha a cada 5 minutos">
              Painel atualizado às {atualizadoEm.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </span>
          )}
          <button
            type="button"
            onClick={atualizarAgora}
            disabled={atualizandoManual}
            className="rounded border border-gray-300 px-2 py-1 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title="Buscar os alertas de novo agora, sem esperar os 5 minutos"
          >
            {atualizandoManual ? "Atualizando…" : "↻ Atualizar agora"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded bg-red-50 p-2 text-xs text-red-600">
          Não foi possível carregar alertas ({error}).
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando alertas…</div>
      ) : (
        <>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Por REDEC (regional de Defesa Civil)</h3>
          <RedecGrid alerts={redecAlerts} municipioAlerts={municipioAlerts} tipo={tipo} selecao={selecao} />
          <RiskChoroplethMap
            tipo={tipo}
            redecAlerts={redecAlerts}
            municipioAlerts={municipioAlerts}
            municipioRedecMap={municipioRedecMap}
            selecao={selecao}
            onSelecaoChange={setSelecao}
            busca={busca}
            onBuscaChange={setBusca}
            hideSearchUI
          />
          {/* Legenda saiu do topo da página (pedido do usuário, 2026-09-24)
              e foi pro meio, entre o mapa e a tabela de município — texto
              "(padrão Defesa Civil-RJ)" suprimido. */}
          <div className="my-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span>Legenda:</span>
            {NIVEIS.map((n) => (
              <span key={n} className="flex items-center gap-1">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-black/10"
                  style={{ backgroundColor: RISK_LEVEL_COLORS[n] }}
                />
                {RISK_LEVEL_LABELS[n]}
              </span>
            ))}
          </div>
          {temGranularidadeMunicipal && (
            <MunicipioTable
              alerts={municipioAlertsFiltrados}
              emptyMessage={
                tipo === "hidrologico"
                  ? "Sem dado de município no momento — a fonte oficial desse dado específico é instável e às vezes não responde. Tente recarregar em alguns minutos."
                  : undefined
              }
            />
          )}
        </>
      )}

      <p className="mt-4 border-t border-gray-100 pt-2 text-xs text-gray-400">
        Fonte: Defesa Civil-RJ (CEMADEN-RJ/SEDEC), via API de integração do painel oficial. Classificação de risco
        emitida pela própria Defesa Civil — este painel só espelha o dado, não substitui os canais oficiais de
        alerta.
      </p>
    </div>
  );
}

/** Busca única acima de cards/mapa/tabela (pedido do usuário, 2026-09-24:
 * "integrar as buscas") — mesmo padrão visual de autocomplete que já
 * existia dentro do mapa, só que vivendo aqui em cima pra poder filtrar
 * os três ao mesmo tempo. */
function BuscaUnificada({
  busca,
  setBusca,
  selecao,
  setSelecao,
  onLimpar,
  redecs,
  municipios,
}: {
  busca: string;
  setBusca: (v: string) => void;
  selecao: Selecao;
  setSelecao: (s: Selecao) => void;
  onLimpar: () => void;
  redecs: string[];
  municipios: string[];
}) {
  const opcoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [];
    const todas = [
      ...redecs.map((valor) => ({ tipo: "redec" as const, valor })),
      ...municipios.map((valor) => ({ tipo: "municipio" as const, valor })),
    ];
    return todas.filter((o) => o.valor.toLowerCase().includes(termo)).slice(0, 12);
  }, [busca, redecs, municipios]);

  return (
    <div className="relative flex-1">
      <label className="mb-1 block text-xs font-medium text-gray-500">Mapa por Região/Município</label>
      <div className="flex max-w-xs gap-2">
        <input
          type="text"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            if (selecao) setSelecao(null);
          }}
          placeholder="Buscar município ou regional…"
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
        />
        {(selecao || busca) && (
          <button
            type="button"
            onClick={onLimpar}
            className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
          >
            Limpar
          </button>
        )}
      </div>
      {busca && !selecao && opcoes.length > 0 && (
        <ul className="absolute z-10 mt-1 max-w-xs overflow-auto rounded border border-gray-200 bg-white text-xs shadow-md" style={{ width: "20rem", maxHeight: "14rem" }}>
          {opcoes.map((op) => (
            <li key={`${op.tipo}-${op.valor}`}>
              <button
                type="button"
                onClick={() => {
                  setSelecao(op);
                  setBusca(op.valor);
                }}
                className="flex w-full items-center justify-between px-2 py-1.5 text-left hover:bg-gray-50"
              >
                <span>{op.valor}</span>
                <span className="text-[10px] uppercase text-gray-400">
                  {op.tipo === "redec" ? "Regional" : "Município"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
