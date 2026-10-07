"use client";

import L from "leaflet";
import { useMemo, useState } from "react";
import { CircleMarker, Marker, Popup, useMapEvents } from "react-leaflet";

import {
  getChuva1hFaixa,
  getChuva24hNivel,
  getDelayStatus,
  PrecipitacaoStation,
  SireneStation,
  SOURCE_LABELS,
  Station,
} from "@/lib/api";
import { ModoMapa, MODOS_MAPA } from "@/lib/mapaModos";
import {
  COR_ACAO,
  COR_DESCONHECIDO,
  COR_OFFLINE,
  COR_ONLINE,
  ROTULO_ACAO,
} from "@/lib/sirenesEstilo";
import { estaAtrasadoVento, FAIXA_ATRASADA, FAIXAS_RAJADA, faixaDaRajada, HORAS_ATRASO_VENTO } from "@/lib/ventoFaixas";

// Modos de visualização das bolinhas do mapa (botão "Estações", 08/10/2026): sirenes (tocando ×
// não tocando) e chuva 1 h / chuva 24 h / rajada de vento com o VALOR dentro da bolinha, usando as
// MESMAS faixas e cores das tabelas (Precipitação, Ventos, Sirenes).

const COR_SEM_CHUVA = "#4ade80"; // verde: estação em dia sem chuva
const TEXTO_SEM_CHUVA = "#14532d";
const COR_ATRASADA = "#BEBEBE";

function fmtHora(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

const iconCache = new Map<string, L.DivIcon>();
/** Bolinha numerada (DivIcon): `tam` px, fundo/cor do texto e rótulo. */
function iconeBolha(bg: string, texto: string, rotulo: string, tam: number): L.DivIcon {
  const chave = `${bg}|${texto}|${rotulo}|${tam}`;
  let ic = iconCache.get(chave);
  if (!ic) {
    const fonte = rotulo.length >= 4 ? Math.round(tam * 0.3) : rotulo.length === 3 ? Math.round(tam * 0.36) : Math.round(tam * 0.4);
    ic = L.divIcon({
      className: "",
      html: `<div class="mapa-bolha" style="width:${tam}px;height:${tam}px;background:${bg};color:${texto};font-size:${fonte}px">${rotulo}</div>`,
      iconSize: [tam, tam],
      iconAnchor: [tam / 2, tam / 2],
      popupAnchor: [0, -tam / 2],
    });
    iconCache.set(chave, ic);
  }
  return ic;
}

function useTamanho(): number {
  const [zoom, setZoom] = useState(8);
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  return zoom >= 11 ? 36 : zoom >= 9 ? 30 : 24;
}

function BotaoHistorico({ id, onOpenStation }: { id: number; onOpenStation?: (id: number) => void }) {
  if (!onOpenStation) return null;
  return (
    <button
      type="button"
      onClick={() => onOpenStation(id)}
      className="mt-1 rounded border border-sky-300 px-2 py-0.5 text-xs font-medium text-sky-700 hover:bg-sky-50"
    >
      Ver histórico da estação
    </button>
  );
}

// --------------------------------------------------------------------------- chuva 1 h / 24 h
function rotuloMm(mm: number | null): string {
  if (mm == null) return "–";
  if (mm >= 100) return String(Math.round(mm));
  if (mm < 0.05) return "0";
  return (Math.round(mm * 10) / 10).toFixed(1);
}

export function corChuva(janela: "1h" | "24h", mm: number | null, atrasado: boolean): { bg: string; texto: string; faixa: string } {
  if (atrasado) return { bg: COR_ATRASADA, texto: "#1f2937", faixa: "Atrasada" };
  if (janela === "1h") {
    const f = getChuva1hFaixa(mm, false);
    return f ? { bg: f.bg, texto: f.text, faixa: f.label } : { bg: COR_SEM_CHUVA, texto: TEXTO_SEM_CHUVA, faixa: "Sem chuva" };
  }
  const n = getChuva24hNivel(mm);
  if (!n) return { bg: COR_SEM_CHUVA, texto: TEXTO_SEM_CHUVA, faixa: "Abaixo de 10 mm em 24 h" };
  return { bg: n.color, texto: n.color === "#eab308" ? "#1f2937" : "#ffffff", faixa: n.label };
}

export function CamadaChuva({
  janela,
  estacoes,
  onOpenStation,
}: {
  janela: "1h" | "24h";
  estacoes: PrecipitacaoStation[];
  onOpenStation?: (id: number) => void;
}) {
  const tam = useTamanho();
  const itens = useMemo(
    () =>
      estacoes
        .map((s) => {
          const mm = janela === "1h" ? s.acumulado_1h_mm : s.acumulado_24h_mm;
          const atrasado = getDelayStatus(s.updated_at).atrasado;
          if (mm == null && !atrasado) return null; // sem dado de chuva nessa janela e em dia: não há o que mostrar
          return { s, mm, atrasado, cor: corChuva(janela, mm, atrasado) };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => (a.mm ?? -1) - (b.mm ?? -1)), // as maiores ficam por cima
    [estacoes, janela],
  );
  return (
    <>
      {itens.map(({ s, mm, atrasado, cor }) => (
        <Marker
          key={`${s.source}-${s.id}`}
          position={[s.latitude, s.longitude]}
          icon={iconeBolha(cor.bg, cor.texto, rotuloMm(mm), tam)}
          zIndexOffset={Math.round((mm ?? 0) * 10)}
        >
          <Popup>
            <div className="space-y-0.5 text-sm">
              <p className="font-semibold">{s.name}</p>
              <p className="text-gray-600">{s.municipality || "Município não informado"}</p>
              <p className="text-xs uppercase tracking-wide text-gray-400">Fonte: {SOURCE_LABELS[s.source] ?? s.source}</p>
              <p>
                Chuva {janela === "1h" ? "1 h" : "24 h"}: <strong>{mm == null ? "sem dado" : `${rotuloMm(mm)} mm`}</strong>
                {" · "}
                <span className="text-gray-500">{cor.faixa}</span>
              </p>
              <p className="text-xs text-gray-500">
                {janela === "1h" ? `24 h: ${rotuloMm(s.acumulado_24h_mm)} mm` : `1 h: ${rotuloMm(s.acumulado_1h_mm)} mm`}
                {s.acumulados_oficiais ? " · valor oficial da fonte" : ""}
              </p>
              <p className="text-xs text-gray-500">
                Atualizado: {fmtHora(s.updated_at)}
                {atrasado ? " (atrasada)" : ""}
              </p>
              <BotaoHistorico id={s.id} onOpenStation={onOpenStation} />
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

// --------------------------------------------------------------------------- vento (rajada)
export function CamadaVento({ estacoes, onOpenStation }: { estacoes: Station[]; onOpenStation?: (id: number) => void }) {
  const tam = useTamanho();
  const itens = useMemo(
    () =>
      estacoes
        .map((s) => {
          const r = s.latest_readings.find((x) => x.reading_type === "vento_rajada_ms");
          if (!r) return null; // só as fontes/estações que informam rajada
          const kmh = r.value * 3.6;
          const atrasado = estaAtrasadoVento(r.timestamp);
          const faixa = faixaDaRajada(kmh, atrasado);
          const vento = s.latest_readings.find((x) => x.reading_type === "vento_ms");
          const dir = s.latest_readings.find((x) => x.reading_type === "vento_dir_graus");
          return { s, kmh, atrasado, faixa, ts: r.timestamp, ventoKmh: vento ? vento.value * 3.6 : null, dir: dir?.value ?? null };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => a.kmh - b.kmh),
    [estacoes],
  );
  return (
    <>
      {itens.map(({ s, kmh, atrasado, faixa, ts, ventoKmh, dir }) => (
        <Marker
          key={`${s.source}-${s.id}`}
          position={[s.latitude, s.longitude]}
          icon={iconeBolha(faixa?.bg ?? FAIXA_ATRASADA.bg, faixa?.text ?? FAIXA_ATRASADA.text, String(Math.round(kmh)), tam)}
          zIndexOffset={Math.round(kmh * 10)}
        >
          <Popup>
            <div className="space-y-0.5 text-sm">
              <p className="font-semibold">{s.name}</p>
              <p className="text-gray-600">{s.municipality || "Município não informado"}</p>
              <p className="text-xs uppercase tracking-wide text-gray-400">Fonte: {SOURCE_LABELS[s.source] ?? s.source}</p>
              <p>
                Rajada: <strong>{(Math.round(kmh * 10) / 10).toFixed(1)} km/h</strong> · <span className="text-gray-500">{faixa?.label}</span>
              </p>
              {ventoKmh != null && <p className="text-xs text-gray-500">Vento médio: {(Math.round(ventoKmh * 10) / 10).toFixed(1)} km/h</p>}
              {dir != null && <p className="text-xs text-gray-500">Direção: {Math.round(dir)}°</p>}
              <p className="text-xs text-gray-500">
                Atualizado: {fmtHora(ts)}
                {atrasado ? " (atrasada)" : ""}
              </p>
              <BotaoHistorico id={s.id} onOpenStation={onOpenStation} />
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

// --------------------------------------------------------------------------- sirenes
export function CamadaSirenes({ sirenes, onOpenStation }: { sirenes: SireneStation[]; onOpenStation?: (id: number) => void }) {
  const ordenadas = useMemo(() => [...sirenes].sort((a, b) => Number(a.tocando) - Number(b.tocando)), [sirenes]);
  return (
    <>
      {ordenadas.map((s) => {
        const online = s.status_estacao === "ativa";
        const desconhecido = s.status_estacao === "desconhecido";
        const cor = s.tocando ? (COR_ACAO[s.acao_categoria ?? "outro"] ?? COR_ACAO.outro) : online ? COR_ONLINE : desconhecido ? COR_DESCONHECIDO : COR_OFFLINE;
        return (
          <CircleMarker
            key={s.id}
            center={[s.latitude, s.longitude]}
            radius={s.tocando ? 13 : 7}
            pathOptions={{
              color: s.tocando ? "#7f1d1d" : "#ffffff",
              fillColor: cor,
              fillOpacity: s.tocando ? 0.95 : 0.9,
              weight: s.tocando ? 3 : 1.5,
              className: s.tocando ? "sirene-tocando" : undefined,
            }}
          >
            <Popup>
              <div className="space-y-0.5 text-sm">
                {s.tocando ? (
                  <p className="rounded px-2 py-1 text-center font-bold text-white" style={{ backgroundColor: cor }}>
                    🔊 {s.acao_nome ?? "TOCANDO"}
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-gray-500">Normal (não está tocando)</p>
                )}
                <p className="font-semibold">{s.name}</p>
                <p className="text-gray-600">
                  {s.municipality || "—"}
                  {s.bairro ? ` · ${s.bairro}` : ""}
                </p>
                <p className="text-xs text-gray-500">
                  Estação: {online ? "online" : desconhecido ? "desconhecida" : "offline"}
                  {s.tocando && s.tocando_desde ? ` · tocando desde ${fmtHora(s.tocando_desde)}` : ""}
                </p>
                {s.tem_pluviometro && (
                  <p className="text-xs text-gray-500">
                    Chuva 1 h: {s.chuva_1h_mm == null ? "—" : `${s.chuva_1h_mm.toFixed(1)} mm`} · 24 h: {s.chuva_24h_mm == null ? "—" : `${s.chuva_24h_mm.toFixed(1)} mm`}
                  </p>
                )}
                <BotaoHistorico id={s.id} onOpenStation={onOpenStation} />
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

// --------------------------------------------------------------------------- botão "Estações" (canto superior esquerdo)
export function SeletorModoMapa({
  modo,
  onModoChange,
  carregando,
  contagem,
}: {
  modo: ModoMapa;
  onModoChange: (m: ModoMapa) => void;
  carregando: boolean;
  contagem: number | null;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = MODOS_MAPA.find((m) => m.key === modo) ?? MODOS_MAPA[0];
  return (
    // left-14: logo à direita do controle de zoom do Leaflet (canto superior esquerdo)
    <div className="absolute z-[1000]" style={{ left: 56, top: 12, maxWidth: "calc(100vw - 4.5rem)" }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50"
      >
        <span className="inline-block h-3 w-3 rounded-full bg-sky-500" />
        Estações
        <span className="hidden text-xs font-normal text-gray-500 sm:inline">· {atual.label.replace("Todas as estações (por rede)", "por rede")}</span>
        <span className="text-xs text-gray-400">{aberto ? "▴" : "▾"}</span>
      </button>
      {aberto && (
        <div className="mt-1 w-72 max-w-full rounded-md border border-gray-200 bg-white p-1.5 text-sm shadow-lg">
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Visualização das bolinhas</p>
          {MODOS_MAPA.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                onModoChange(m.key);
                setAberto(false);
              }}
              className={`block w-full rounded px-2 py-1.5 text-left hover:bg-gray-50 ${m.key === modo ? "bg-sky-50 ring-1 ring-sky-300" : ""}`}
            >
              <span className="font-medium text-gray-800">{m.key === modo ? "● " : "○ "}{m.label}</span>
              <span className="block text-[11px] leading-snug text-gray-500">{m.descricao}</span>
            </button>
          ))}
        </div>
      )}
      {!aberto && (carregando || contagem != null) && (
        <p className="mt-1 inline-block rounded bg-white/90 px-2 py-0.5 text-[11px] text-gray-600 shadow">
          {carregando ? "Carregando dados…" : `${contagem} estações nesta visualização`}
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- legenda do modo
export function ConteudoLegendaModo({ modo }: { modo: Exclude<ModoMapa, "redes"> }) {
  const bolinha = (bg: string, texto?: string) => (
    <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: bg, color: texto }} />
  );
  if (modo === "sirenes") {
    return (
      <div className="space-y-1.5">
        <p className="mb-1 font-semibold text-gray-700">Sirenes</p>
        {(["mobilizacao", "aviso", "teste", "outro"] as const).map((k) => (
          <div key={k} className="flex items-center gap-2">
            {bolinha(COR_ACAO[k])}
            <span className="text-gray-700">Tocando — {ROTULO_ACAO[k]}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-gray-100 pt-1.5">{bolinha(COR_ONLINE)}<span className="text-gray-700">Normal (online, não toca)</span></div>
        <div className="flex items-center gap-2">{bolinha(COR_OFFLINE)}<span className="text-gray-700">Offline</span></div>
        <div className="flex items-center gap-2">{bolinha(COR_DESCONHECIDO)}<span className="text-gray-700">Desconhecido</span></div>
      </div>
    );
  }
  if (modo === "vento") {
    return (
      <div className="space-y-1.5">
        <p className="mb-1 font-semibold text-gray-700">Rajada de vento (km/h)</p>
        {FAIXAS_RAJADA.map((f, i) => {
          const sup = i === 0 ? null : FAIXAS_RAJADA[i - 1].min;
          const faixa = sup == null ? `≥ ${f.min}` : i === FAIXAS_RAJADA.length - 1 ? `< ${sup}` : `${f.min}–${(sup - 0.1).toFixed(1)}`;
          return (
            <div key={f.faixa.label} className="flex items-center gap-2">
              {bolinha(f.faixa.bg)}
              <span className="text-gray-700">{f.faixa.label} {faixa} km/h</span>
            </div>
          );
        })}
        <div className="flex items-center gap-2">{bolinha(FAIXA_ATRASADA.bg)}<span className="text-gray-700">Atrasada (&gt; {HORAS_ATRASO_VENTO} h sem atualizar)</span></div>
        <p className="border-t border-gray-100 pt-1.5 text-[11px] text-gray-400">Só estações que informam rajada.</p>
      </div>
    );
  }
  const um = modo === "chuva1h";
  return (
    <div className="space-y-1.5">
      <p className="mb-1 font-semibold text-gray-700">Chuva em {um ? "1 h" : "24 h"} (mm)</p>
      <div className="flex items-center gap-2">{bolinha(COR_SEM_CHUVA)}<span className="text-gray-700">{um ? "Sem chuva (< 0,2 mm)" : "Abaixo de 10 mm"}</span></div>
      {um ? (
        <>
          <div className="flex items-center gap-2">{bolinha("#63B8FF")}<span className="text-gray-700">Fraca 0,2–5 mm/h</span></div>
          <div className="flex items-center gap-2">{bolinha("#FFFF66")}<span className="text-gray-700">Moderada 5,1–25 mm/h</span></div>
          <div className="flex items-center gap-2">{bolinha("#FFA600")}<span className="text-gray-700">Forte 25,1–50 mm/h</span></div>
          <div className="flex items-center gap-2">{bolinha("#CC0000")}<span className="text-gray-700">Muito forte &gt; 50 mm/h</span></div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">{bolinha("#eab308")}<span className="text-gray-700">10–30 mm</span></div>
          <div className="flex items-center gap-2">{bolinha("#f97316")}<span className="text-gray-700">30–70 mm</span></div>
          <div className="flex items-center gap-2">{bolinha("#dc2626")}<span className="text-gray-700">&gt; 70 mm</span></div>
        </>
      )}
      <div className="flex items-center gap-2">{bolinha(COR_ATRASADA)}<span className="text-gray-700">Atrasada (&gt; 1 h sem atualizar)</span></div>
      <p className="border-t border-gray-100 pt-1.5 text-[11px] text-gray-400">
        Valor oficial da fonte quando ela informa (CEMADEN, Alerta Rio, Niterói, INEA, Macaé, Paracambi); nas demais, soma das leituras.
      </p>
    </div>
  );
}

/** Quantas bolinhas o modo atual desenha (texto "N estações nesta visualização"). */
export function contagemModo(
  modo: ModoMapa,
  dados: { estacoes: Station[]; precipitacao: PrecipitacaoStation[]; sirenes: SireneStation[] },
): number {
  if (modo === "sirenes") return dados.sirenes.length;
  if (modo === "vento") return dados.estacoes.filter((s) => s.latest_readings.some((r) => r.reading_type === "vento_rajada_ms")).length;
  if (modo === "chuva1h" || modo === "chuva24h") {
    return dados.precipitacao.filter((s) => {
      const mm = modo === "chuva1h" ? s.acumulado_1h_mm : s.acumulado_24h_mm;
      return mm != null || getDelayStatus(s.updated_at).atrasado;
    }).length;
  }
  return dados.estacoes.length;
}
