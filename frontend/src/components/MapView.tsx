"use client";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, ImageOverlay, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import {
  AlertEvent,
  fetchRadarImagery,
  fetchSateliteImagery,
  ImageryLayer,
  READING_TYPE_LABELS,
  SOURCE_COLORS,
  SOURCE_LABELS,
  STATION_TYPE_LABELS,
  Station,
  normalizeMunicipioName,
} from "@/lib/api";
import { computeBBox, GeoJsonFeatureCollection } from "@/lib/geo";

const RJ_CENTER: [number, number] = [-22.25, -42.6];

// Cor das linhas de divisão — pedido do usuário (2026-09-27): "boa cor e
// espessura". Azul forte/sólido pras REDECs (divisão mais ampla, usada
// como padrão de visualização/foco do mapa) e cinza fino pros municípios
// (divisão mais fina, some visualmente quando dá zoom out no estado
// inteiro, sem brigar com a cor das REDECs nem com as estações).
const REDEC_LINE = { color: "#1d4ed8", weight: 2.5, opacity: 0.9, fillOpacity: 0, interactive: false };
const MUNICIPIO_LINE = { color: "#64748b", weight: 1, opacity: 0.6, fillOpacity: 0, interactive: false };

function bboxToLatLngBounds(fc: GeoJsonFeatureCollection): L.LatLngBounds {
  const b = computeBBox(fc);
  return L.latLngBounds([b.minLat, b.minLon], [b.maxLat, b.maxLon]);
}

/** Sem estado visual próprio — só cuida do foco (pan/zoom) do mapa Leaflet a
 * partir dos limites das REDECs/municípios, porque isso só dá pra fazer de
 * dentro de um filho de <MapContainer> (useMap() exige o contexto do mapa). */
function MapaFocusController({
  redecGeo,
  municipioGeo,
  redecFilter,
  municipalityFilter,
}: {
  redecGeo: GeoJsonFeatureCollection | null;
  municipioGeo: GeoJsonFeatureCollection | null;
  redecFilter: string[];
  municipalityFilter: string[];
}) {
  const map = useMap();

  // Pedido do usuário (item 1): abrir a aba Mapa com foco na divisão das
  // REDECs (== extensão do estado inteiro, já que as 11 REDECs cobrem o RJ
  // todo) em vez do center/zoom fixo chutado. Item 2/4: trocar o foco
  // quando o filtro de REDEC/Município muda. Município é mais específico
  // que REDEC — se os dois estiverem preenchidos, vence o de município.
  // Os dois filtros vazios de novo = volta pro estado inteiro (mesmo
  // comportamento do foco inicial, sem duplicar lógica).
  useEffect(() => {
    if (municipalityFilter.length > 0 && municipioGeo) {
      const chaves = new Set(municipalityFilter.map(normalizeMunicipioName));
      const selecionados = municipioGeo.features.filter((f) => chaves.has(f.properties.nomeNormalizado));
      if (selecionados.length > 0) {
        const bounds = bboxToLatLngBounds({ type: "FeatureCollection", features: selecionados });
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [32, 32], maxZoom: 13 });
          return;
        }
      }
    }
    if (redecFilter.length > 0 && redecGeo) {
      const nomes = new Set(redecFilter);
      const selecionadas = redecGeo.features.filter((f) => nomes.has(f.properties.redec));
      if (selecionadas.length > 0) {
        const bounds = bboxToLatLngBounds({ type: "FeatureCollection", features: selecionadas });
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [24, 24] });
          return;
        }
      }
    }
    if (redecGeo) {
      const bounds = bboxToLatLngBounds(redecGeo);
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [16, 16] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redecGeo, municipioGeo, redecFilter, municipalityFilter]);

  return null;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

// Guardamos vento em m/s (SI) no banco; exibimos em km/h a pedido do usuário.
const WIND_READING_TYPES = new Set(["vento_ms", "vento_rajada_ms"]);

function formatReadingValue(readingType: string, value: number): number {
  const emKmh = WIND_READING_TYPES.has(readingType) ? value * 3.6 : value;
  return Math.round(emKmh * 10) / 10;
}

/** Botão flutuante com a legenda de cor por fonte/rede — pedido do usuário
 * (item 5), mesmo padrão visual do botão "Filtros" já existente no mapa
 * (Dashboard.tsx), só que no canto oposto pra não brigar com ele. */
function LegendaFlutuante({ sourcesPresentes }: { sourcesPresentes: string[] }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="absolute bottom-3 right-3 z-[1000] max-w-[calc(100vw-1.5rem)]">
      {aberta && (
        <div className="mb-2 max-h-[60vh] w-56 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-xs shadow-lg sm:w-64">
          <p className="mb-2 font-semibold text-gray-700">Estações por rede</p>
          <ul className="space-y-1.5">
            {sourcesPresentes.map((slug) => (
              <li key={slug} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: SOURCE_COLORS[slug] ?? "#6b7280" }}
                />
                <span className="text-gray-700">{SOURCE_LABELS[slug] ?? slug}</span>
              </li>
            ))}
            <li className="flex items-center gap-2 border-t border-gray-100 pt-1.5">
              <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 bg-red-600" />
              <span className="font-medium text-gray-700">Sirene tocando agora</span>
            </li>
          </ul>
          <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
            Linhas: <span className="font-medium" style={{ color: REDEC_LINE.color }}>azul</span> = REDEC,{" "}
            <span className="font-medium" style={{ color: MUNICIPIO_LINE.color }}>cinza</span> = município.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50"
      >
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ background: "conic-gradient(from 0deg, #817C13, #0047F6, #A91D3A, #FF6500, #007261, #dc2626)" }}
        />
        {aberta ? "Ocultar legenda" : "Legenda"}
      </button>
    </div>
  );
}

type CamadaImagem = "nenhuma" | "satelite" | "radar";
type TipoSatelite = "realcada" | "ir" | "vis";
type TipoRadar = "maxcappi" | "10km" | "07km" | "05km" | "03km";

interface ConfigCamada {
  tipo: CamadaImagem;
  tipoSatelite: TipoSatelite;
  tipoRadar: TipoRadar;
  animacao: boolean;
}

interface AnimacaoFrame {
  data: string;
  path: string;
}

interface AnimacaoState {
  frames: AnimacaoFrame[];
  frameAtual: number;
  isPlaying: boolean;
}

// A API-REDEMET atualiza essas imagens a cada ~10min (satélite) / poucos
// minutos (radar); o backend já cacheia por 5min (ver
// backend/api/redemet_imagery_views.py), então reconsultar a cada 3min
// daqui (menor que o TTL do cache) garante que pegamos a imagem nova
// pouco depois dela ficar disponível, sem bater direto na API-REDEMET a
// cada maré de usuários abrindo o mapa.
const INTERVALO_ATUALIZACAO_CAMADA_MS = 3 * 60 * 1000;
const INTERVALO_FRAME_ANIMACAO_MS = 500; // 500ms entre frames

/** Busca (e reconsulta periodicamente) a imagem de satélite/radar
 * selecionada com suporte a animação — estado fica aqui, em vez de dentro
 * do `<ImageOverlay>`, porque tanto o overlay no mapa quanto o seletor
 * flutuante precisam do mesmo dado. */
function useCamadaMeteorologica(config: ConfigCamada, isPlaying: boolean = true): { imagem: ImageryLayer | null; animacao: AnimacaoState | null } {
  const [imagem, setImagem] = useState<ImageryLayer | null>(null);
  const [animacao, setAnimacao] = useState<AnimacaoState | null>(null);
  const [frameAtual, setFrameAtual] = useState(0);

  useEffect(() => {
    if (config.tipo === "nenhuma") {
      setImagem(null);
      setAnimacao(null);
      return;
    }

    let cancelado = false;
    const buscar = () => {
      const promessa =
        config.tipo === "satelite"
          ? fetch(`/api/imagery/satelite/?tipo=${config.tipoSatelite}${config.animacao ? "&anima=15" : ""}`)
          : fetch(`/api/imagery/radar/?tipo=${config.tipoRadar}&area=pc${config.animacao ? "&anima=15" : ""}`);

      promessa
        .then((r) => r.json())
        .then((data) => {
          if (cancelado) return;

          if (config.animacao && data.data && data.data[config.tipo === "satelite" ? "satelite" : "radar"]) {
            const frames = data.data[config.tipo === "satelite" ? "satelite" : "radar"];
            const framesArray = Array.isArray(frames[0]) ? frames[0] : frames; // radar agrupa em array de arrays
            setAnimacao({
              frames: framesArray,
              frameAtual: 0,
              isPlaying: true,
            });
            // Mostrar a imagem mais recente também no overlay sem animação
            const ultimoFrame = framesArray[framesArray.length - 1];
            setImagem({
              ...data,
              image_url: ultimoFrame.path,
              timestamp: ultimoFrame.data,
            });
            setFrameAtual(0);
          } else {
            // Sem animação: exibição simples
            setImagem(data);
            setAnimacao(null);
          }
        })
        .catch(() => {
          if (!cancelado) {
            setImagem(null);
            setAnimacao(null);
          }
        });
    };

    buscar();
    const id = setInterval(buscar, INTERVALO_ATUALIZACAO_CAMADA_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [config.tipo, config.tipoSatelite, config.tipoRadar, config.animacao]);

  // Player de animação
  useEffect(() => {
    if (!animacao || !isPlaying || animacao.frames.length === 0) return;

    const id = setInterval(() => {
      setFrameAtual((prev) => (prev + 1) % animacao.frames.length);
    }, INTERVALO_FRAME_ANIMACAO_MS);

    return () => clearInterval(id);
  }, [animacao, isPlaying, animacao?.frames.length]);

  // Atualizar imagem exibida durante animação
  useEffect(() => {
    if (animacao && animacao.frames.length > 0) {
      const frame = animacao.frames[frameAtual];
      setImagem((prev) =>
        prev
          ? {
              ...prev,
              image_url: frame.path,
              timestamp: frame.data,
            }
          : null,
      );
    }
  }, [frameAtual, animacao]);

  return { imagem, animacao: animacao ? { ...animacao, frameAtual, isPlaying } : null };
}

/** A REDEMET devolve o timestamp como "AAAA-MM-DD HH:MM:SS" em UTC, sem
 * indicação de fuso (confirmado comparando com o horário real no teste de
 * 02/10/2026) — sem o "Z", `new Date(...)` interpretaria como hora local
 * do navegador, errando o horário exibido. */
function isoUtcFromRedemetTimestamp(timestamp: string): string {
  return `${timestamp.replace(" ", "T")}Z`;
}

/** Camada opcional de satélite (REDEMET/DECEA) ou radar meteorológico —
 * pedido do usuário (01/10/2026): mostrar imagem de satélite/radar no
 * mapa, do jeito que a maioria dos painéis de monitoramento faz. A
 * REDEMET devolve a imagem (PNG, servida direto por um host estático
 * público, sem precisar da nossa chave) e os limites geográficos dela —
 * `ImageOverlay` do Leaflet desenha a imagem exatamente nesses limites,
 * sem precisar calcular nada aqui. */
function CamadaMeteorologica({ imagem }: { imagem: ImageryLayer | null }) {
  if (!imagem || !imagem.bounds) return null;
  return <ImageOverlay key={imagem.image_url} url={imagem.image_url} bounds={imagem.bounds} opacity={0.55} zIndex={400} />;
}

/** Botão flutuante pra alternar a camada de satélite/radar. Canto inferior
 * esquerdo — os outros 3 cantos já têm controle fixo: topo esquerdo é o
 * zoom nativo do Leaflet, topo direito é o painel "Filtros" do
 * Dashboard.tsx (vem ABERTO por padrão, confirmado visualmente — colidia
 * com este seletor quando os dois tentavam ocupar o mesmo canto), e
 * inferior direito já é a `LegendaFlutuante`. Recolhido por padrão (mesmo
 * padrão de botão único que a `LegendaFlutuante` já usa) pra ocupar pouco
 * espaço quando a camada está desligada (caso mais comum). */
function SeletorCamadaMeteorologica({
  config,
  onConfigChange,
  timestamp,
  animacao,
  onPlayPause,
}: {
  config: ConfigCamada;
  onConfigChange: (c: ConfigCamada) => void;
  timestamp: string | null;
  animacao: AnimacaoState | null;
  onPlayPause?: (play: boolean) => void;
}) {
  const [aberto, setAberto] = useState(config.tipo !== "nenhuma");

  const opcoes: { valor: CamadaImagem; label: string }[] = [
    { valor: "nenhuma", label: "Nenhuma" },
    { valor: "satelite", label: "Satélite" },
    { valor: "radar", label: "Radar" },
  ];

  const tiposSatelite: { valor: TipoSatelite; label: string }[] = [
    { valor: "realcada", label: "Realçada" },
    { valor: "ir", label: "Infravermelho" },
    { valor: "vis", label: "Visível" },
  ];

  const tiposRadar: { valor: TipoRadar; label: string }[] = [
    { valor: "maxcappi", label: "MAXCAPPI (composição)" },
    { valor: "10km", label: "CAPPI 10km" },
    { valor: "07km", label: "CAPPI 7km" },
    { valor: "05km", label: "CAPPI 5km" },
    { valor: "03km", label: "CAPPI 3km" },
  ];

  return (
    <div className="absolute bottom-3 left-3 z-[1000] max-w-[calc(100vw-1.5rem)]">
      {aberto && (
        <div className="mb-2 w-72 max-h-[60vh] overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-xs shadow-lg">
          <p className="mb-2 font-semibold text-gray-700">Camada de imagem</p>

          {/* Seleção principal: Nenhuma / Satélite / Radar */}
          <div className="flex gap-1 mb-3">
            {opcoes.map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => onConfigChange({ ...config, tipo: o.valor })}
                className={`rounded px-2 py-1 font-medium text-xs ${
                  config.tipo === o.valor ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Seleção de tipo (satélite/radar) */}
          {config.tipo === "satelite" && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <p className="mb-1.5 font-medium text-gray-600">Tipo de satélite:</p>
              <div className="flex flex-col gap-1">
                {tiposSatelite.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => onConfigChange({ ...config, tipoSatelite: t.valor })}
                    className={`text-left px-2 py-1 rounded text-xs ${
                      config.tipoSatelite === t.valor
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {config.tipo === "radar" && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <p className="mb-1.5 font-medium text-gray-600">Tipo de radar:</p>
              <div className="flex flex-col gap-1">
                {tiposRadar.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => onConfigChange({ ...config, tipoRadar: t.valor })}
                    className={`text-left px-2 py-1 rounded text-xs ${
                      config.tipoRadar === t.valor
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Toggle de animação */}
          {config.tipo !== "nenhuma" && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.animacao}
                  onChange={(e) => onConfigChange({ ...config, animacao: e.target.checked })}
                  className="w-3 h-3"
                />
                <span className="font-medium text-gray-600">Animar histórico (15 quadros)</span>
              </label>
              {animacao && animacao.frames.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayPause?.(!animacao.isPlaying)}
                    className="px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium text-xs"
                  >
                    {animacao.isPlaying ? "⏸" : "▶"}
                  </button>
                  <div className="flex-1 bg-gray-200 rounded h-2 relative">
                    <div
                      className="bg-blue-600 h-full rounded"
                      style={{ width: `${((animacao.frameAtual + 1) / animacao.frames.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-600">
                    {animacao.frameAtual + 1}/{animacao.frames.length}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Info timestamp */}
          {config.tipo !== "nenhuma" && (
            <p className="border-t border-gray-100 pt-2 text-[11px] text-gray-400">
              {timestamp ? `Fonte: REDEMET · ${formatTimestamp(isoUtcFromRedemetTimestamp(timestamp))}` : "Carregando…"}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50"
      >
        {aberto ? "Ocultar" : config.tipo === "nenhuma" ? "Satélite/Radar" : `Camada: ${config.tipo === "satelite" ? "Satélite" : "Radar"}`}
      </button>
    </div>
  );
}

export default function MapView({
  stations,
  activeAlertEvents = [],
  redecFilter = [],
  municipalityFilter = [],
}: {
  stations: Station[];
  /** Sirenes tocando agora (AlertEvent sem resolved_at) — cruzado com
   * `station.id` pra destacar no mapa. Opcional: quem não passa (outras
   * telas que reusam o MapView) simplesmente não vê o destaque. */
  activeAlertEvents?: AlertEvent[];
  /** Filtros ativos (Dashboard.tsx) — só usados pra focar o mapa na
   * divisão selecionada (item 2/4 do pedido do usuário); a filtragem em
   * si das estações já acontece antes, em `stations`. */
  redecFilter?: string[];
  municipalityFilter?: string[];
}) {
  const estacoesTocandoIds = new Set(activeAlertEvents.map((e) => e.station));

  const [config, setConfig] = useState<ConfigCamada>({
    tipo: "nenhuma",
    tipoSatelite: "realcada",
    tipoRadar: "maxcappi",
    animacao: false,
  });
  const [animacaoPlaying, setAnimacaoPlaying] = useState(true);

  const { imagem: imagemAtual, animacao } = useCamadaMeteorologica(config, animacaoPlaying);

  const [redecGeo, setRedecGeo] = useState<GeoJsonFeatureCollection | null>(null);
  const [municipioGeo, setMunicipioGeo] = useState<GeoJsonFeatureCollection | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/redecs.geojson")
      .then((r) => r.json())
      .then((d: GeoJsonFeatureCollection) => {
        if (!cancelado) setRedecGeo(d);
      })
      .catch(() => {});
    fetch("/rj_municipios.geojson")
      .then((r) => r.json())
      .then((d: GeoJsonFeatureCollection) => {
        if (!cancelado) setMunicipioGeo(d);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const sourcesPresentes = useMemo(
    () => Array.from(new Set(stations.map((s) => s.source))).sort(),
    [stations],
  );

  return (
    <MapContainer center={RJ_CENTER} zoom={8} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CamadaMeteorologica imagem={imagemAtual} />
      {/* Divisões administrativas (pedido do usuário, 2026-09-27): municípios
          primeiro (mais fino, fica por baixo) e REDECs por cima (mais
          grosso) — nenhuma das duas intercepta clique (`interactive:
          false`), só a estação embaixo é clicável. */}
      {municipioGeo && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <GeoJSON key="municipios" data={municipioGeo as any} style={() => MUNICIPIO_LINE} />
      )}
      {redecGeo && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <GeoJSON key="redecs" data={redecGeo as any} style={() => REDEC_LINE} />
      )}
      <MapaFocusController
        redecGeo={redecGeo}
        municipioGeo={municipioGeo}
        redecFilter={redecFilter}
        municipalityFilter={municipalityFilter}
      />
      {stations.map((station) => {
        const tocando = estacoesTocandoIds.has(station.id);
        const cor = SOURCE_COLORS[station.source] ?? "#6b7280";
        return (
          <CircleMarker
            key={`${station.source}-${station.id}`}
            center={[station.latitude, station.longitude]}
            radius={tocando ? 12 : 7}
            pathOptions={{
              color: tocando ? "#dc2626" : cor,
              fillColor: tocando ? "#dc2626" : cor,
              fillOpacity: tocando ? 0.9 : 0.85,
              weight: tocando ? 3 : 2,
              className: tocando ? "sirene-tocando" : undefined,
            }}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                {tocando && (
                  <p className="rounded bg-red-600 px-2 py-1 text-center font-bold text-white">
                    🔊 SIRENE TOCANDO AGORA
                  </p>
                )}
                <p className="font-semibold">{station.name}</p>
                <p className="text-gray-600">
                  {station.municipality || "Município não informado"} ·{" "}
                  {STATION_TYPE_LABELS[station.station_type] ?? station.station_type}
                </p>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Fonte: {SOURCE_LABELS[station.source] ?? station.source} · código {station.external_id}
                </p>
                {station.latest_readings.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {station.latest_readings.map((r) => (
                      <li key={r.reading_type}>
                        <span className="font-medium">
                          {READING_TYPE_LABELS[r.reading_type] ?? r.reading_type}:
                        </span>{" "}
                        {formatReadingValue(r.reading_type, r.value)}{" "}
                        <span className="text-gray-400">({formatTimestamp(r.timestamp)})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-gray-400">Sem leituras recentes.</p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      <LegendaFlutuante sourcesPresentes={sourcesPresentes} />
      <SeletorCamadaMeteorologica
        config={config}
        onConfigChange={setConfig}
        timestamp={imagemAtual?.timestamp ?? null}
        animacao={config.animacao ? animacao : null}
        onPlayPause={setAnimacaoPlaying}
      />
    </MapContainer>
  );
}
