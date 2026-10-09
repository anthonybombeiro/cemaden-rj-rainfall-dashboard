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
  PrecipitacaoStation,
  READING_TYPE_LABELS,
  SOURCE_COLORS,
  SOURCE_LABELS,
  SireneStation,
  STATION_TYPE_LABELS,
  Station,
  normalizeMunicipioName,
} from "@/lib/api";
import { computeBBox, GeoJsonFeatureCollection } from "@/lib/geo";
import { ModoMapa } from "@/lib/mapaModos";
import {
  CamadaChuva,
  CamadaSirenes,
  CamadaVento,
  ConteudoLegendaModo,
  contagemModo,
  SeletorModoMapa,
} from "@/components/MapaBolhas";

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
function LegendaFlutuante({ sourcesPresentes, modo }: { sourcesPresentes: string[]; modo: ModoMapa }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="absolute bottom-3 right-3 z-[1000] max-w-[calc(100vw-1.5rem)]">
      {aberta && (
        <div className="mb-2 max-h-[60vh] w-56 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-xs shadow-lg sm:w-64">
          {modo !== "redes" && <ConteudoLegendaModo modo={modo} />}
          {modo === "redes" && <p className="mb-2 font-semibold text-gray-700">Estações por rede</p>}
          <ul className={`space-y-1.5 ${modo !== "redes" ? "hidden" : ""}`}>
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
type TipoSatelite = "truecolor" | "dsat_realcada" | "dsat_ch13" | "dsat_ch02" | "realcada" | "ir" | "vis";
const eDsat = (t: TipoSatelite) => t === "truecolor" || t.startsWith("dsat_");
type TipoRadar =
  | "maxcappi"
  | "10km"
  | "07km"
  | "05km"
  | "03km"
  | "st-maxcappi"
  | "st-10km"
  | "st-07km"
  | "st-05km"
  | "st-03km"
  | "niteroi"
  | "inea-mosaic"
  | "inea-gua"
  | "inea-mac"
  | "inea-mdn"
  | "inea-sumare";

interface ConfigCamada {
  tipo: CamadaImagem;
  tipoSatelite: TipoSatelite;
  tipoRadar: TipoRadar;
  animacao: boolean;
  mostrarEstacoes: boolean;
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

// A API-REDEMET só gera imagem nova a cada ~10-15min (satélite) / ~5min
// (radar) — pedido do usuário (02/10/2026): reconsultar a cada 3min era
// desperdício de requisição sem ganho real (a maioria vinha batendo no
// mesmo quadro). 10min cobre a cadência real; quem quiser algo mais fresco
// na hora usa o botão "atualizar agora" ao lado do play/pause.
const INTERVALO_ATUALIZACAO_CAMADA_MS = 10 * 60 * 1000;
// 500ms piscava a cada troca de quadro (ImageOverlay remontando no DOM a
// cada frame) — 1.2s dá tempo do PNG (até ~1,3MB) carregar antes de trocar
// de novo, e fica num ritmo visualmente mais lento/legível.
const INTERVALO_FRAME_ANIMACAO_MS = 1200;

// Radar próprio da Prefeitura de Niterói (radar.niteroi.rj.gov.br) —
// pedido do usuário (02/10/2026). API pública sem autenticação, achada
// inspecionando o bundle JS do site oficial (sem doc publicada). Chamada
// DIRETO do navegador (não pelo nosso backend): o CORS da API permite
// (`fetch` cross-origin funciona, testado), mas o nosso servidor
// (hospedagem compartilhada) não consegue abrir conexão de saída pra essa
// porta não-padrão (3337) — tentativa via backend voltava 502. IDs fixos
// porque só existe 1 radar e 1 tipo de produto público (MAXDISPLAY).
const NITEROI_RADAR_API_BASE = "https://radar.niteroi.rj.gov.br:3337";
const NITEROI_RADAR_ID = "b35bf5fe-a016-4516-81bb-681088e72ce7";
const NITEROI_RADAR_TYPE_ID = "a57c0a09-e9f0-461c-84b9-65ea856cc90c"; // MAXDISPLAY
// Bounds fixos do radar (raio 100km a partir de Niterói, devolvidos por
// `GET /radars`) — formato Leaflet [[lat_min, lon_min], [lat_max, lon_max]].
const NITEROI_RADAR_BOUNDS: [[number, number], [number, number]] = [
  [-23.828487624961028, -44.063540906953534],
  [-22.029734127406552, -42.11079267870416],
];

interface NiteroiRadarProduto {
  datetime: string;
  images: { path: string }[];
}

/** Busca os produtos de radar de Niterói e devolve no mesmo formato que o
 * backend já devolve pra REDEMET (`{frames}` quando animado, `{image_url,
 * timestamp}` quando não) — assim o resto do hook trata as duas fontes sem
 * precisar saber de onde vieram. */
async function buscarRadarNiteroi(numFrames: number) {
  const params = new URLSearchParams({
    type_id: NITEROI_RADAR_TYPE_ID,
    cutoff_datetime: String(Date.now()),
    amount: String(numFrames),
  });
  const produtos: NiteroiRadarProduto[] = await fetch(
    `${NITEROI_RADAR_API_BASE}/radars/${NITEROI_RADAR_ID}/products?${params}`,
  ).then((r) => r.json());

  // A API devolve do mais recente pro mais antigo — inverte pra ficar igual
  // ao padrão já usado pro satélite/radar da REDEMET (mais antigo primeiro).
  const frames: AnimacaoFrame[] = [...produtos]
    .reverse()
    .filter((p) => p.images && p.images.length > 0)
    .map((p) => ({
      data: new Date(Number(p.datetime)).toISOString().slice(0, 19).replace("T", " "),
      path: `${NITEROI_RADAR_API_BASE}${p.images[0].path}`,
    }));

  if (numFrames > 1) {
    return { tipo: "niteroi", frames, bounds: NITEROI_RADAR_BOUNDS, total_frames: frames.length };
  }
  const ultimo = frames[frames.length - 1];
  return { tipo: "niteroi", timestamp: ultimo?.data, image_url: ultimo?.path, bounds: NITEROI_RADAR_BOUNDS };
}

/** Busca (e reconsulta periodicamente) a imagem de satélite/radar
 * selecionada com suporte a animação — estado fica aqui, em vez de dentro
 * do `<ImageOverlay>`, porque tanto o overlay no mapa quanto o seletor
 * flutuante precisam do mesmo dado. */
function useCamadaMeteorologica(
  config: ConfigCamada,
  isPlaying: boolean = true,
): { imagem: ImageryLayer | null; animacao: AnimacaoState | null; atualizando: boolean; erro: boolean; atualizarAgora: () => void } {
  const [imagem, setImagem] = useState<ImageryLayer | null>(null);
  const [animacao, setAnimacao] = useState<AnimacaoState | null>(null);
  const [frameAtual, setFrameAtual] = useState(0);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(false);
  // Incrementado pelo botão "atualizar agora" (item 4 do pedido do usuário:
  // além da atualização automática, dar um jeito de forçar na hora) — como
  // entra nas deps do efeito de busca, qualquer mudança reexecuta `buscar`
  // imediatamente sem esperar o próximo tick do setInterval.
  const [forcarAtualizacaoEm, setForcarAtualizacaoEm] = useState(0);

  // Limpa o quadro/animação anterior IMEDIATAMENTE ao trocar satélite↔radar
  // (ou de tipo de satélite/radar) — pedido do usuário (02/10/2026): trocar
  // de satélite pra radar quebrava a página. Causa raiz: sem isso, a
  // animação antiga (do tipo anterior) continuava rodando seu próprio
  // intervalo e sobrescrevendo `imagem` por cima da troca de tipo até a
  // nova busca terminar, deixando o `<ImageOverlay>` remontando com dados
  // de fontes misturadas enquanto o Leaflet ainda processava a remoção da
  // camada antiga — essa corrida que derrubava o layer do Leaflet.
  useEffect(() => {
    setImagem(null);
    setAnimacao(null);
    setFrameAtual(0);
    setErro(false);
  }, [config.tipo, config.tipoSatelite, config.tipoRadar]);

  useEffect(() => {
    if (config.tipo === "nenhuma") {
      return;
    }

    let cancelado = false;
    const buscar = () => {
      setAtualizando(true);
      // Niterói é buscado DIRETO do navegador (ver `buscarRadarNiteroi`),
      // não pelo nosso backend — o resto é `fetch` pro nosso `/api/imagery/`
      // de sempre. Uniformiza os dois em `Promise<any>` já com o JSON
      // resolvido, pra cair no mesmo `.then(data => ...)` abaixo.
      const promessa: Promise<ImageryLayer | { frames: AnimacaoFrame[]; bounds: unknown; tipo: string; total_frames: number }> =
        config.tipo === "satelite"
          ? eDsat(config.tipoSatelite)
            ? // DSAT/CPTEC (GOES-19): quadros de ~4 MB, animação limitada a 6 (1 h)
              fetch(`/api/imagery/dsat/?tipo=${config.tipoSatelite}${config.animacao ? "&anima=6" : ""}`).then((r) => r.json())
            : fetch(`/api/imagery/satelite/?tipo=${config.tipoSatelite}${config.animacao ? "&anima=15" : ""}`).then((r) => r.json())
          : config.tipoRadar === "niteroi"
            ? // Radar próprio de Niterói: histórico real de 15 quadros (5min
              // cada), diferente do limite de 8 da REDEMET.
              buscarRadarNiteroi(config.animacao ? 15 : 1)
            : config.tipoRadar.startsWith("inea-")
              ? // Radar Tool do INEA (mosaico + Guaratiba/Macaé/Mendanha/
                // Sumaré) — passa pelo NOSSO backend (CORS bloqueia
                // `frames.php` direto do navegador, testado); o código
                // depois do "inea-" é o `tipo` que o backend espera.
                fetch(
                  `/api/imagery/radar-inea/?tipo=${config.tipoRadar.replace("inea-", "")}${config.animacao ? "&anima=15" : ""}`,
                ).then((r) => r.json())
              : // Radar REDEMET só tem histórico real pra 8 quadros no site
                // oficial (slider 0-7, confirmado em redemet.decea.mil.br em
                // 02/10/2026 — o satélite vai até 14, ou seja, 15 quadros).
                // Pedir 15 pro radar só fazia a REDEMET repetir o último
                // quadro disponível pra completar a conta.
                fetch(
                  // "st-<corte>" = radar de Santa Teresa (area=st); sem prefixo = Pico do Couto (area=pc)
                  `/api/imagery/radar/?tipo=${config.tipoRadar.replace("st-", "")}&area=${config.tipoRadar.startsWith("st-") ? "st" : "pc"}${config.animacao ? "&anima=8" : ""}`,
                ).then((r) => r.json());

      promessa
        .then((data: any) => {
          if (cancelado) return;
          // Resposta de erro do backend ({detail}) ou sem imagem: mostra "sem imagem" em vez de
          // ficar em "Carregando…" para sempre.
          if (!data || (!data.image_url && !(Array.isArray(data.frames) && data.frames.length > 0))) {
            setImagem(null);
            setAnimacao(null);
            setErro(true);
            return;
          }
          setErro(false);

          if (config.animacao && data.frames && Array.isArray(data.frames) && data.frames.length > 0) {
            // A REDEMET completa o pedido de N quadros repetindo o último
            // disponível quando não há histórico suficiente ainda (comum
            // pro radar, que só acumula ~20min de quadros novos por vez) —
            // sem isso a animação "trava" visualmente nos últimos quadros
            // repetidos. Remove repetições consecutivas (preserva a ordem).
            const framesArray: AnimacaoFrame[] = data.frames.filter(
              (f: AnimacaoFrame, i: number, arr: AnimacaoFrame[]) => i === 0 || f.path !== arr[i - 1].path,
            );
            setAnimacao({
              frames: framesArray,
              frameAtual: framesArray.length - 1,
              isPlaying: true,
            });
            // Mostrar o quadro mais recente como padrão (não o mais antigo).
            const ultimoFrame = framesArray[framesArray.length - 1];
            if (ultimoFrame && data.bounds) {
              setImagem({
                tipo: data.tipo,
                image_url: ultimoFrame.path,
                timestamp: ultimoFrame.data,
                bounds: data.bounds,
              });
            }
            setFrameAtual(framesArray.length - 1);
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
            setErro(true);
          }
        })
        .finally(() => {
          if (!cancelado) setAtualizando(false);
        });
    };

    buscar();
    const id = setInterval(buscar, INTERVALO_ATUALIZACAO_CAMADA_MS);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [config.tipo, config.tipoSatelite, config.tipoRadar, config.animacao, forcarAtualizacaoEm]);

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
    if (!animacao || animacao.frames.length === 0) return;
    const frame = animacao.frames[frameAtual];
    if (!frame) return;
    setImagem((prev) =>
      prev
        ? {
            ...prev,
            image_url: frame.path,
            timestamp: frame.data,
          }
        : null,
    );
  }, [frameAtual, animacao]);

  return {
    imagem,
    animacao: animacao ? { ...animacao, frameAtual, isPlaying } : null,
    atualizando,
    erro,
    atualizarAgora: () => setForcarAtualizacaoEm((v) => v + 1),
  };
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
  // `key` fixo (por tipo) em vez de `imagem.image_url` — chavear pela URL
  // forçava o React a desmontar e remontar o `<ImageOverlay>` do zero a
  // CADA quadro da animação (o Leaflet larga a imagem antiga e cria outra
  // do nada), o que piscava a tela e, combinado com a troca de tipo, podia
  // derrubar o layer no meio do processo (item 2/6 do pedido do usuário,
  // 02/10/2026). Mantendo a mesma instância, o react-leaflet só chama
  // `setUrl`/`setBounds` na camada já existente — troca suave, sem piscar,
  // e só remonta de verdade quando a fonte muda de fato (satélite↔radar).
  return <ImageOverlay key={imagem.tipo} url={imagem.image_url} bounds={imagem.bounds} opacity={eDsat(imagem.tipo as TipoSatelite) ? 0.8 : 0.55} zIndex={400} />;
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
  atualizando,
  erro,
  onAtualizarAgora,
}: {
  config: ConfigCamada;
  onConfigChange: (c: ConfigCamada) => void;
  timestamp: string | null;
  animacao: AnimacaoState | null;
  onPlayPause?: (play: boolean) => void;
  atualizando: boolean;
  erro: boolean;
  onAtualizarAgora: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [tipoAbertoSatelite, setTipoAbertoSatelite] = useState(false);
  const [tipoAbertoRadar, setTipoAbertoRadar] = useState(false);

  const opcoes: { valor: CamadaImagem; label: string }[] = [
    { valor: "nenhuma", label: "Nenhuma" },
    { valor: "satelite", label: "Satélite" },
    { valor: "radar", label: "Radar" },
  ];

  const tiposSatelite: { valor: TipoSatelite; label: string }[] = [
    { valor: "truecolor", label: "Cor verdadeira — True Color (DSAT/INPE)" },
    { valor: "dsat_realcada", label: "IR realçado (DSAT/INPE)" },
    { valor: "dsat_ch13", label: "IR canal 13 (DSAT/INPE)" },
    { valor: "dsat_ch02", label: "Visível canal 02 (DSAT/INPE)" },
    { valor: "realcada", label: "Realçada (REDEMET)" },
    { valor: "ir", label: "Infravermelho (REDEMET)" },
    { valor: "vis", label: "Visível (REDEMET)" },
  ];

  const tiposRadar: { valor: TipoRadar; label: string }[] = [
    { valor: "maxcappi", label: "MAXCAPPI (Pico do Couto)" },
    { valor: "10km", label: "CAPPI 10km (Pico do Couto)" },
    { valor: "07km", label: "CAPPI 7km (Pico do Couto)" },
    { valor: "05km", label: "CAPPI 5km (Pico do Couto)" },
    { valor: "03km", label: "CAPPI 3km (Pico do Couto)" },
    // Radar de Santa Teresa (REDEMET, area=st; raio 400 km, cobre norte/noroeste do RJ) — pedido 09/10/2026.
    { valor: "st-maxcappi", label: "MAXCAPPI (Santa Teresa)" },
    { valor: "st-10km", label: "CAPPI 10km (Santa Teresa)" },
    { valor: "st-07km", label: "CAPPI 7km (Santa Teresa)" },
    { valor: "st-05km", label: "CAPPI 5km (Santa Teresa)" },
    { valor: "st-03km", label: "CAPPI 3km (Santa Teresa)" },
    // Radar próprio da Prefeitura de Niterói (radar.niteroi.rj.gov.br) —
    // pedido do usuário (02/10/2026). Atualiza a cada 5min (contra ~20min
    // do MAXCAPPI) e cobre raio de 100km a partir de Niterói — menor área
    // que o MAXCAPPI (400km), mas cobre o RJ todo na prática.
    { valor: "niteroi", label: "Niterói (local, 5min)" },
    // Radar Tool do INEA (radartool.inea.rj.gov.br) — pedido do usuário
    // (02/10/2026): re-hospeda os radares de Guaratiba/Macaé/Mendanha/
    // Sumaré (os 2 últimos também cobrem o pedido de Alerta Rio, cujo site
    // próprio tem proteção anti-robô que bloqueia acesso automatizado) e
    // ainda tem um mosaico combinando os 6 radares do estado.
    { valor: "inea-mosaic", label: "INEA — Mosaico (todos os radares)" },
    { valor: "inea-gua", label: "INEA — Guaratiba" },
    { valor: "inea-mac", label: "INEA — Macaé" },
    { valor: "inea-mdn", label: "INEA — Mendanha" },
    { valor: "inea-sumare", label: "INEA — Sumaré" },
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
                onClick={() => {
                  onConfigChange({ ...config, tipo: o.valor });
                  setTipoAbertoSatelite(false);
                  setTipoAbertoRadar(false);
                }}
                className={`rounded px-2 py-1 font-medium text-xs ${
                  config.tipo === o.valor ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Dropdown de tipo para Satélite */}
          {config.tipo === "satelite" && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setTipoAbertoSatelite(!tipoAbertoSatelite)}
                className="w-full text-left px-2 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 font-medium text-xs text-gray-700 flex items-center justify-between"
              >
                {tiposSatelite.find((t) => t.valor === config.tipoSatelite)?.label || "Selecionar"}
                <span className={`transform transition-transform ${tipoAbertoSatelite ? "rotate-180" : ""}`}>▾</span>
              </button>
              {tipoAbertoSatelite && (
                <div className="mt-1 border border-gray-200 rounded bg-white shadow">
                  {tiposSatelite.map((t) => (
                    <button
                      key={t.valor}
                      type="button"
                      onClick={() => {
                        onConfigChange({ ...config, tipoSatelite: t.valor });
                        setTipoAbertoSatelite(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs ${
                        config.tipoSatelite === t.valor
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dropdown de tipo para Radar */}
          {config.tipo === "radar" && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setTipoAbertoRadar(!tipoAbertoRadar)}
                className="w-full text-left px-2 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 font-medium text-xs text-gray-700 flex items-center justify-between"
              >
                {tiposRadar.find((t) => t.valor === config.tipoRadar)?.label || "Selecionar"}
                <span className={`transform transition-transform ${tipoAbertoRadar ? "rotate-180" : ""}`}>▾</span>
              </button>
              {tipoAbertoRadar && (
                <div className="mt-1 border border-gray-200 rounded bg-white shadow">
                  {tiposRadar.map((t) => (
                    <button
                      key={t.valor}
                      type="button"
                      onClick={() => {
                        onConfigChange({ ...config, tipoRadar: t.valor });
                        setTipoAbertoRadar(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs ${
                        config.tipoRadar === t.valor
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Animação com player play/pause + atualizar agora — botão de
              atualizar é só o ícone (mesmo tamanho do play/pause), colado
              ao lado dele, pra não aumentar a altura do painel (pedido do
              usuário, 02/10/2026). */}
          {config.tipo !== "nenhuma" && (
            <div className="mb-3 pb-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.animacao}
                    onChange={(e) => onConfigChange({ ...config, animacao: e.target.checked })}
                    className="w-3 h-3"
                  />
                  <span className="font-medium text-gray-600">Animar histórico</span>
                </label>
                <button
                  type="button"
                  onClick={onAtualizarAgora}
                  disabled={atualizando}
                  title="Atualizar imagens agora"
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className={atualizando ? "animate-spin inline-block" : "inline-block"}>⟳</span>
                </button>
              </div>
              {config.animacao && animacao && animacao.frames.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayPause?.(!animacao.isPlaying)}
                    className="px-2.5 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-medium text-xs flex-shrink-0"
                    title={animacao.isPlaying ? "Pausar" : "Reproduzir"}
                  >
                    {animacao.isPlaying ? "⏸" : "▶"}
                  </button>
                  <div className="flex-1 bg-gray-200 rounded h-2 relative">
                    <div
                      className="bg-blue-600 h-full rounded transition-all"
                      style={{ width: `${((animacao.frameAtual + 1) / animacao.frames.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-600 text-xs whitespace-nowrap">
                    {animacao.frameAtual + 1}/{animacao.frames.length}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Info timestamp — fonte muda conforme a camada: Niterói e INEA
              têm radar próprio, o resto (satélite e demais radares) vem
              da REDEMET/DECEA. */}
          {config.tipo !== "nenhuma" && (
            <p className="text-[11px] text-gray-400">
              {timestamp
                ? `${formatTimestamp(isoUtcFromRedemetTimestamp(timestamp))} · ${
                    config.tipo === "radar" && config.tipoRadar === "niteroi"
                      ? "Niterói"
                      : config.tipo === "radar" && config.tipoRadar.startsWith("inea-")
                        ? "INEA"
                        : config.tipo === "satelite" && eDsat(config.tipoSatelite)
                          ? "DSAT/CPTEC-INPE (GOES-19)"
                          : "REDEMET"
                  }`
                : erro
                  ? "Sem imagem disponível agora (a fonte não respondeu ou ainda não publicou). Tente atualizar."
                  : "Carregando…"}
            </p>
          )}

          {/* Camada das estações — separada da camada de imagem; item 5 do
              pedido do usuário (02/10/2026): estava sem referência dentro
              do painel de imagem e sem efeito real no mapa. */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="mb-2 font-semibold text-gray-700">Camada das estações</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.mostrarEstacoes}
                onChange={(e) => onConfigChange({ ...config, mostrarEstacoes: e.target.checked })}
                className="w-3 h-3"
              />
              <span className="font-medium text-gray-600">Mostrar estações no mapa</span>
            </label>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50"
      >
        {aberto ? "Ocultar" : "Opções"}
      </button>
    </div>
  );
}

export default function MapView({
  stations,
  activeAlertEvents = [],
  redecFilter = [],
  municipalityFilter = [],
  modo = "redes",
  onModoChange,
  precipitacao = [],
  sirenes = [],
  carregandoModo = false,
  onOpenStation,
}: {
  /** Modo de visualização das bolinhas (botão "Estações", 08/10/2026). */
  modo?: ModoMapa;
  onModoChange?: (m: ModoMapa) => void;
  /** Estações com chuva acumulada (1 h/24 h, já com o valor oficial) — modos "Chuva em 1 h/24 h". */
  precipitacao?: PrecipitacaoStation[];
  /** Sirenes (tocando/não tocando) — modo "Sirenes". */
  sirenes?: SireneStation[];
  carregandoModo?: boolean;
  onOpenStation?: (id: number) => void;
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
    tipoSatelite: "truecolor",
    tipoRadar: "maxcappi",
    animacao: false,
    mostrarEstacoes: true,
  });
  const [animacaoPlaying, setAnimacaoPlaying] = useState(true);

  const {
    imagem: imagemAtual,
    animacao,
    atualizando,
    erro: erroCamada,
    atualizarAgora,
  } = useCamadaMeteorologica(config, animacaoPlaying);

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
      {config.mostrarEstacoes && modo === "sirenes" && <CamadaSirenes sirenes={sirenes} onOpenStation={onOpenStation} />}
      {config.mostrarEstacoes && modo === "chuva1h" && <CamadaChuva janela="1h" estacoes={precipitacao} onOpenStation={onOpenStation} />}
      {config.mostrarEstacoes && modo === "chuva24h" && <CamadaChuva janela="24h" estacoes={precipitacao} onOpenStation={onOpenStation} />}
      {config.mostrarEstacoes && modo === "vento" && <CamadaVento estacoes={stations} onOpenStation={onOpenStation} />}
      {config.mostrarEstacoes && modo === "redes" && stations.map((station) => {
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
      <LegendaFlutuante sourcesPresentes={sourcesPresentes} modo={modo} />
      {onModoChange && (
        <SeletorModoMapa
          modo={modo}
          onModoChange={onModoChange}
          carregando={carregandoModo}
          contagem={carregandoModo ? null : contagemModo(modo, { estacoes: stations, precipitacao, sirenes })}
        />
      )}
      <SeletorCamadaMeteorologica
        config={config}
        onConfigChange={setConfig}
        timestamp={imagemAtual?.timestamp ?? null}
        animacao={config.animacao ? animacao : null}
        onPlayPause={setAnimacaoPlaying}
        atualizando={atualizando}
        erro={erroCamada}
        onAtualizarAgora={atualizarAgora}
      />
    </MapContainer>
  );
}
