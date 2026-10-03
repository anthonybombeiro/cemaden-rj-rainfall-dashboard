"use client";

import { AlertTriangle, Bell, BellOff, BookOpen, CloudSun, Database, Filter, LogOut, Map, Siren, User, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import AlertsPanel from "@/components/AlertsPanel";
import DataTable, { METEOROLOGICAL_READING_TYPES } from "@/components/DataTable";
import FilterToggleBar from "@/components/FilterToggleBar";
import ContatosMap from "@/components/ContatosMap";
import Footer from "@/components/Footer";
import HidrologicaTable from "@/components/HidrologicaTable";
import MeteorologiaPanel from "@/components/MeteorologiaPanel";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import CemadenNacionalTable from "@/components/CemadenNacionalTable";
import PrecipitationTable from "@/components/PrecipitationTable";
import Profile from "@/components/Profile";
import SirenesTable from "@/components/SirenesTable";
import ShareModal from "@/components/ShareModal";
import StationHistoryPanel from "@/components/StationHistoryPanel";
import { TableExportHandle } from "@/components/tableExportHandle";
import { ShareData } from "@/lib/shareExport";
import VentosTable from "@/components/VentosTable";
import {
  AlertEvent,
  AuthUser,
  fetchActiveAlertEvents,
  fetchHidrologicas,
  fetchMunicipioRedecMap,
  fetchCemadenNacional,
  fetchPrecipitacao,
  fetchSirenes,
  fetchSirenesStatus,
  fetchStations,
  refreshRedemet,
  refreshSirenes,
  SirenesStatus,
  HidrologicaStation,
  normalizeMunicipioName,
  CemadenNacionalStation,
  PrecipitacaoStation,
  REDECS,
  SireneStation,
  SOURCE_LABELS,
  STATION_TYPE_LABELS,
  Station,
} from "@/lib/api";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-gray-400">Carregando mapa…</div>
  ),
});

// "Riscos" deixou de ser aba própria (pedido do usuário, 2026-09-24: a
// "Visão Geral" dos 4 mapas agora mora DENTRO de "Alertas Ativos", como a
// 1ª das 5 sub-abas — ver AlertsPanel.tsx).
// Reagrupamento dos menus principais (pedido do usuário, 2026-09-29):
// Precipitação/Meteorológicos/Hidrológicos/Ventos viraram sub-abas de
// "Dados" (mesmo padrão de sub-aba que "Mapa" já tinha com
// Estações/Contatos) — 5 itens principais cabem bem tanto no menu
// horizontal do desktop quanto numa barra inferior fixa no celular/tablet.
type ViewMode = "mapa" | "meteorologia" | "dados" | "sirenes" | "alertas";
type DadosSub = "precipitacao" | "cemaden" | "meteorologico" | "hidrologico" | "ventos";

const VIEW_MODES: { key: ViewMode; label: string; Icone: typeof Map }[] = [
  { key: "mapa", label: "Mapa", Icone: Map },
  { key: "meteorologia", label: "Meteorologia", Icone: CloudSun },
  { key: "dados", label: "Dados", Icone: Database },
  { key: "sirenes", label: "Sirenes", Icone: Siren },
  { key: "alertas", label: "Alertas", Icone: AlertTriangle },
];

const DADOS_SUBS: { key: DadosSub; label: string }[] = [
  { key: "precipitacao", label: "Precipitação" },
  { key: "cemaden", label: "CEMADEN Nacional" },
  { key: "meteorologico", label: "Meteorológicos" },
  { key: "hidrologico", label: "Hidrológicos" },
  { key: "ventos", label: "Ventos" },
];

const TITULO_TOOLTIP =
  "Agregação de estações públicas (INMET, CEMADEN nacional, Alerta Rio/GeoRio, Wunderground, COR/Escritório de " +
  "Dados Rio) para apoio à decisão. Não substitui os canais oficiais de emissão de alerta da Defesa Civil.";

export default function Dashboard({
  user,
  onLogout,
  onUserUpdated,
}: {
  user: AuthUser;
  onLogout: () => void;
  onUserUpdated: (user: AuthUser) => void;
}) {
  const [showProfile, setShowProfile] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Refs pra chamar "exportar()" de dentro de cada tabela a partir do
  // botão único que agora vive na barra de filtro flutuante (pedido do
  // usuário, 2026-09-23: "Exportar CSV" saiu de dentro de cada tabela pra
  // economizar altura — ver FilterToggleBar.tsx/tableExportHandle.ts).
  const precipitacaoTableRef = useRef<TableExportHandle>(null);
  const cemadenTableRef = useRef<TableExportHandle>(null);
  const meteorologicoTableRef = useRef<TableExportHandle>(null);
  const hidrologicoTableRef = useRef<TableExportHandle>(null);
  const ventosTableRef = useRef<TableExportHandle>(null);
  const sirenesTableRef = useRef<TableExportHandle>(null);

  // Painel de histórico de estação IN-APP (pedido do usuário, 2026-09-29):
  // clicar numa estação nas tabelas não navega mais pra rota separada —
  // só abre esse painel por cima do conteúdo da aba atual, mantendo
  // cabeçalho/menu/filtros exatamente como estavam. `null` = fechado.
  const [painelEstacaoId, setPainelEstacaoId] = useState<number | null>(null);
  // Modal "Compartilhar" (pedido do usuário, 2026-09-29: resumo pronto pra
  // Telegram/WhatsApp) — cada tabela monta seu próprio ShareData curado e
  // chama isso; o modal em si é genérico (ver ShareModal.tsx).
  const [shareData, setShareData] = useState<ShareData | null>(null);

  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Multi-seleção (2026-09-23, pedido do usuário: antes eram `<select>` de
  // escolha única — lista vazia = "todos", igual ao "Todos"/"Todas" de antes.
  const [municipalityFilter, setMunicipalityFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [redecFilter, setRedecFilter] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("mapa");
  const [dadosSub, setDadosSub] = useState<DadosSub>("precipitacao");
  // Painel de filtros flutuante sobre o mapa — pedido do usuário: no mapa o
  // filtro precisa ficar sobre o mapa (não empurrando layout), escondível
  // por um botão que funcione em mouse (desktop) e touch (celular/tablet).
  const [mapFiltersOpen, setMapFiltersOpen] = useState(false);
  // Sub-abas da aba Mapa (pedido do usuário, 2026-09-24): "Estações" (mapa
  // antigo) e "Contatos" (mapa de REDECs com contatos de prefeitos/gestores).
  const [mapaSub, setMapaSub] = useState<"estacoes" | "contatos">("estacoes");

  // Município → REDEC — hoje só existia do lado dos alertas (AlertsPanel);
  // busca 1x aqui e reusa pra agregar/filtrar Precipitação e Dados
  // Meteorológicos por REDEC também (pedido do usuário).
  const [municipioRedecMap, setMunicipioRedecMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    fetchMunicipioRedecMap()
      .then((mapa) => {
        if (!cancelled) setMunicipioRedecMap(mapa);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const redecOf = (municipality: string): string =>
    municipioRedecMap[normalizeMunicipioName(municipality)] ?? "";

  const [precipitacao, setPrecipitacao] = useState<PrecipitacaoStation[]>([]);
  const [precipitacaoLoading, setPrecipitacaoLoading] = useState(false);
  const [precipitacaoError, setPrecipitacaoError] = useState<string | null>(null);
  const [precipitacaoLoaded, setPrecipitacaoLoaded] = useState(false);

  // Aba "CEMADEN Nacional" (03/10/2026): acumulados oficiais da fonte.
  const [cemadenNac, setCemadenNac] = useState<CemadenNacionalStation[]>([]);
  const [cemadenNacLoading, setCemadenNacLoading] = useState(false);
  const [cemadenNacError, setCemadenNacError] = useState<string | null>(null);
  const [cemadenNacLoaded, setCemadenNacLoaded] = useState(false);

  // Aba dedicada de estações HIDROLÓGICAS (nível de rio) — pedido do
  // usuário (2026-09-23): nível primeiro, chuva depois, mesmos filtros
  // globais das outras abas (Município/Tipo/Fonte/REDEC).
  const [hidrologicas, setHidrologicas] = useState<HidrologicaStation[]>([]);
  const [hidrologicasLoading, setHidrologicasLoading] = useState(false);
  const [hidrologicasError, setHidrologicasError] = useState<string | null>(null);
  const [hidrologicasLoaded, setHidrologicasLoaded] = useState(false);

  // Aba dedicada só das sirenes (pedido do usuário, 2026-09-23: "consulta
  // por estações" igual ao portal do CBMERJ) — filtros próprios (Município/
  // REDEC vêm direto do cadastro da sirene, não da tabela de risco
  // geológico; Status/Acionamento não existem em mais nenhuma outra aba).
  const [sirenes, setSirenes] = useState<SireneStation[]>([]);
  const [sirenesLoading, setSirenesLoading] = useState(false);
  const [sirenesError, setSirenesError] = useState<string | null>(null);
  const [sirenesLoaded, setSirenesLoaded] = useState(false);
  const [sirenesMunicipioFilter, setSirenesMunicipioFilter] = useState<string[]>([]);
  const [sirenesRedecFilter, setSirenesRedecFilter] = useState<string[]>([]);
  const [sirenesStatusFilter, setSirenesStatusFilter] = useState<string[]>([]);
  const [sirenesAcionamentoFilter, setSirenesAcionamentoFilter] = useState<string[]>([]);

  const [activeAlertEvents, setActiveAlertEvents] = useState<AlertEvent[]>([]);

  // "Ativar push" (pedido do usuário, 2026-09-23, mesmo botão do header do
  // SIGPLAN-SEDEC) — implementação real com a Notification API do próprio
  // navegador (sem infraestrutura de push server): pede permissão 1x, e a
  // partir daí toda vez que uma sirene NOVA aparece tocando (comparando com
  // a leitura anterior do polling de 1min abaixo) dispara uma notificação
  // desktop, mesmo com o painel em outra aba/minimizado.
  const [pushEnabled, setPushEnabled] = useState(false);
  const idsTocandoAnteriores = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushEnabled(Notification.permission === "granted");
    }
  }, []);
  const handleTogglePush = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      setPushEnabled((v) => !v);
      return;
    }
    const permissao = await Notification.requestPermission();
    setPushEnabled(permissao === "granted");
  };

  // Sirene tocando é dado de segurança em tempo real, não meteorológico
  // passivo — busca de novo sozinho a cada 1 minuto (bem mais frequente
  // que o resto do painel, que hoje só busca 1x ao carregar), em
  // qualquer aba, pra não depender do operador estar olhando o mapa no
  // momento exato do acionamento.
  useEffect(() => {
    let cancelled = false;
    const carregar = () => {
      fetchActiveAlertEvents()
        .then((data) => {
          if (cancelled) return;
          setActiveAlertEvents(data);
          if (pushEnabled && typeof window !== "undefined" && "Notification" in window) {
            const idsAtuais = new Set(data.map((e) => e.id));
            const novos = data.filter((e) => !idsTocandoAnteriores.current.has(e.id));
            if (novos.length > 0 && idsTocandoAnteriores.current.size > 0) {
              new Notification("🔊 Sirene tocando — CEMADEN-RJ", {
                body: novos.map((e) => e.station_name).join(", "),
              });
            }
            idsTocandoAnteriores.current = idsAtuais;
          }
        })
        .catch(() => {
          // Falha aqui não deve quebrar o resto do painel — só fica sem
          // o destaque de sirene até a próxima tentativa.
        });
    };
    carregar();
    const intervalo = setInterval(carregar, 60_000);
    return () => {
      cancelled = true;
      clearInterval(intervalo);
    };
  }, [pushEnabled]);

  const reloadStations = () => fetchStations().then(setStations).catch(() => {});

  // Segurança do toque de sirene (pedido do usuário, 03/10/2026: "NUNCA podem
  // falhar — salva vidas"). (1) O painel aberto pede um sync de sirenes a cada
  // 2 min como REFORÇO do cron do cPanel (que roda a cada 15 min); o servidor
  // limita a frequência real. (2) Consulta a idade do último sync a cada 1 min
  // e, se estiver velha (ou o servidor não responder), mostra alerta
  // vermelho — senão "0 sirenes tocando" seria um falso "tudo normal".
  const [sirenesStatus, setSirenesStatus] = useState<SirenesStatus | null>(null);
  const [sirenesStatusErro, setSirenesStatusErro] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const consultar = () =>
      fetchSirenesStatus()
        .then((s) => {
          if (cancelled) return;
          setSirenesStatus(s);
          setSirenesStatusErro(false);
        })
        .catch(() => {
          if (!cancelled) setSirenesStatusErro(true);
        });
    const reforcar = () => {
      refreshSirenes()
        .catch(() => {})
        .finally(() => {
          if (!cancelled) consultar();
        });
    };
    reforcar();
    const idConsulta = setInterval(consultar, 60_000);
    const idReforco = setInterval(reforcar, 120_000);
    return () => {
      cancelled = true;
      clearInterval(idConsulta);
      clearInterval(idReforco);
    };
  }, []);

  // Sem Cron Job pra REDEMET no cPanel (o usuário não consegue adicionar), o
  // próprio painel aberto dispara a ingestão a cada 15min — METAR sai de
  // hora em hora, então é mais que suficiente — e recarrega as estações.
  useEffect(() => {
    let cancelled = false;
    const atualizar = () =>
      refreshRedemet()
        .then(() => {
          if (!cancelled) reloadStations();
        })
        .catch(() => {});
    atualizar();
    const intervalo = setInterval(atualizar, 15 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStations()
      .then((data) => {
        if (!cancelled) setStations(data);
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
  }, []);

  // Busca sob demanda (só quando a aba é aberta pela 1ª vez) — o cálculo de
  // acumulados no backend varre até 96h de leituras, então evita fazer isso
  // toda vez que o painel carrega se o operador nunca abrir essa aba.
  useEffect(() => {
    if (viewMode !== "dados" || dadosSub !== "precipitacao" || precipitacaoLoaded) return;
    let cancelled = false;
    setPrecipitacaoLoading(true);
    fetchPrecipitacao()
      .then((data) => {
        if (!cancelled) {
          setPrecipitacao(data);
          setPrecipitacaoLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setPrecipitacaoError(err instanceof Error ? err.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!cancelled) setPrecipitacaoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, dadosSub, precipitacaoLoaded]);

  useEffect(() => {
    if (viewMode !== "dados" || dadosSub !== "cemaden" || cemadenNacLoaded) return;
    let cancelled = false;
    setCemadenNacLoading(true);
    fetchCemadenNacional()
      .then((data) => {
        if (!cancelled) {
          setCemadenNac(data);
          setCemadenNacLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setCemadenNacError(err instanceof Error ? err.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!cancelled) setCemadenNacLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, dadosSub, cemadenNacLoaded]);

  useEffect(() => {
    if (viewMode !== "dados" || dadosSub !== "hidrologico" || hidrologicasLoaded) return;
    let cancelled = false;
    setHidrologicasLoading(true);
    fetchHidrologicas()
      .then((data) => {
        if (!cancelled) {
          setHidrologicas(data);
          setHidrologicasLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) setHidrologicasError(err instanceof Error ? err.message : "Erro desconhecido");
      })
      .finally(() => {
        if (!cancelled) setHidrologicasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viewMode, dadosSub, hidrologicasLoaded]);

  // Igual à Precipitação: busca sob demanda na 1ª vez que a aba é aberta.
  // Diferente dela, também refaz a cada 1min ENQUANTO a aba estiver aberta
  // (mesma cadência do banner de sirene tocando no topo) — status de
  // acionamento é dado de segurança em tempo real, não faz sentido essa
  // tela específica ficar parada até o operador trocar de aba e voltar.
  useEffect(() => {
    if (viewMode !== "sirenes") return;
    let cancelled = false;
    const carregar = (primeiraVez: boolean) => {
      if (primeiraVez) setSirenesLoading(true);
      fetchSirenes()
        .then((data) => {
          if (!cancelled) {
            setSirenes(data);
            setSirenesLoaded(true);
            setSirenesError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) setSirenesError(err instanceof Error ? err.message : "Erro desconhecido");
        })
        .finally(() => {
          if (!cancelled && primeiraVez) setSirenesLoading(false);
        });
    };
    carregar(!sirenesLoaded);
    const intervalo = setInterval(() => carregar(false), 60_000);
    return () => {
      cancelled = true;
      clearInterval(intervalo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const municipalities = useMemo(
    () => Array.from(new Set(stations.map((s) => s.municipality).filter(Boolean))).sort(),
    [stations],
  );

  const sources = useMemo(
    () => Array.from(new Set(stations.map((s) => s.source).filter(Boolean))).sort(),
    [stations],
  );

  const filteredStations = useMemo(
    () =>
      stations.filter(
        (s) =>
          (municipalityFilter.length === 0 || municipalityFilter.includes(s.municipality)) &&
          (typeFilter.length === 0 || typeFilter.includes(s.station_type)) &&
          (sourceFilter.length === 0 || sourceFilter.includes(s.source)) &&
          (redecFilter.length === 0 || redecFilter.includes(redecOf(s.municipality))),
      ),
    [stations, municipalityFilter, typeFilter, sourceFilter, redecFilter, municipioRedecMap],
  );

  const filteredPrecipitacao = useMemo(
    () =>
      precipitacao.filter(
        (s) =>
          (municipalityFilter.length === 0 || municipalityFilter.includes(s.municipality)) &&
          (typeFilter.length === 0 || typeFilter.includes(s.station_type)) &&
          (sourceFilter.length === 0 || sourceFilter.includes(s.source)) &&
          (redecFilter.length === 0 || redecFilter.includes(redecOf(s.municipality))),
      ),
    [precipitacao, municipalityFilter, typeFilter, sourceFilter, redecFilter, municipioRedecMap],
  );

  const filteredCemadenNac = useMemo(
    () =>
      cemadenNac.filter(
        (s) =>
          (municipalityFilter.length === 0 || municipalityFilter.includes(s.municipality)) &&
          (redecFilter.length === 0 || redecFilter.includes(redecOf(s.municipality))),
      ),
    [cemadenNac, municipalityFilter, redecFilter, municipioRedecMap],
  );

  const filteredHidrologicas = useMemo(
    () =>
      hidrologicas.filter(
        (s) =>
          (municipalityFilter.length === 0 || municipalityFilter.includes(s.municipality)) &&
          (typeFilter.length === 0 || typeFilter.includes(s.station_type)) &&
          (sourceFilter.length === 0 || sourceFilter.includes(s.source)) &&
          (redecFilter.length === 0 || redecFilter.includes(redecOf(s.municipality))),
      ),
    [hidrologicas, municipalityFilter, typeFilter, sourceFilter, redecFilter, municipioRedecMap],
  );

  const meteorologicalTypeSet = useMemo(() => new Set(METEOROLOGICAL_READING_TYPES), []);
  const meteorologicalStations = useMemo(
    () =>
      filteredStations.filter((s) => s.latest_readings.some((r) => meteorologicalTypeSet.has(r.reading_type))),
    [filteredStations, meteorologicalTypeSet],
  );

  // Município/REDEC das sirenes vêm do PRÓPRIO cadastro delas (raw_metadata
  // no backend), não do municipioRedecMap (que é baseado nos avisos
  // geológicos) — evita depender de duas fontes de verdade diferentes pra
  // essa aba, e a grafia bate exatamente com o que o portal de sirenes usa.
  const sirenesMunicipalities = useMemo(
    () => Array.from(new Set(sirenes.map((s) => s.municipality).filter(Boolean))).sort(),
    [sirenes],
  );
  const sirenesRedecs = useMemo(
    () => Array.from(new Set(sirenes.map((s) => s.redec).filter(Boolean))).sort(),
    [sirenes],
  );

  const filteredSirenes = useMemo(
    () =>
      sirenes.filter(
        (s) =>
          (sirenesMunicipioFilter.length === 0 || sirenesMunicipioFilter.includes(s.municipality)) &&
          (sirenesRedecFilter.length === 0 || sirenesRedecFilter.includes(s.redec)) &&
          (sirenesStatusFilter.length === 0 || sirenesStatusFilter.includes(s.status_estacao)) &&
          (sirenesAcionamentoFilter.length === 0 ||
            sirenesAcionamentoFilter.includes(s.tocando ? "tocando" : "normal")),
      ),
    [sirenes, sirenesMunicipioFilter, sirenesRedecFilter, sirenesStatusFilter, sirenesAcionamentoFilter],
  );

  // Resumo online/offline/tocando (mesma conta de antes, só que agora
  // calculada aqui pra alimentar o `extraSummary` da barra de filtro
  // flutuante em vez de morar dentro de SirenesTable).
  const sirenesOnline = useMemo(
    () => filteredSirenes.filter((s) => s.status_estacao === "ativa").length,
    [filteredSirenes],
  );
  const sirenesOffline = useMemo(
    () => filteredSirenes.filter((s) => s.status_estacao === "inativa").length,
    [filteredSirenes],
  );
  const sirenesTocando = useMemo(() => filteredSirenes.filter((s) => s.tocando).length, [filteredSirenes]);

  const sirenesFilterControls = (
    <>
      <MultiSelectFilter
        label="Município"
        options={sirenesMunicipalities.map((m) => ({ value: m, label: m }))}
        selected={sirenesMunicipioFilter}
        onChange={setSirenesMunicipioFilter}
      />
      <MultiSelectFilter
        label="REDEC"
        options={sirenesRedecs.map((r) => ({ value: r, label: r }))}
        selected={sirenesRedecFilter}
        onChange={setSirenesRedecFilter}
      />
      <MultiSelectFilter
        label="Status"
        options={[
          { value: "ativa", label: "Online" },
          { value: "inativa", label: "Offline" },
          { value: "desconhecido", label: "Desconhecido" },
        ]}
        selected={sirenesStatusFilter}
        onChange={setSirenesStatusFilter}
      />
      <MultiSelectFilter
        label="Acionamento"
        options={[
          { value: "tocando", label: "Tocando agora" },
          { value: "normal", label: "Normal" },
        ]}
        selected={sirenesAcionamentoFilter}
        onChange={setSirenesAcionamentoFilter}
      />
    </>
  );

  const sirenesFilterStatusText = sirenesLoading
    ? "Carregando sirenes…"
    : `${filteredSirenes.length} de ${sirenes.length} sirenes`;

  // Controles de filtro reusados nos dois layouts (barra acima da tabela nas
  // abas Precipitação/Dados Meteorológicos/Hidrológico; painel flutuante
  // sobre o mapa na aba Mapa) — pedido do usuário (2026-09-23): filtro
  // nunca mais ao lado da tabela, e escolha múltipla em vez de único valor.
  const filterControls = (
    <>
      <MultiSelectFilter
        label="Município"
        options={municipalities.map((m) => ({ value: m, label: m }))}
        selected={municipalityFilter}
        onChange={setMunicipalityFilter}
      />
      <MultiSelectFilter
        label="Tipo de estação"
        options={Object.entries(STATION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        selected={typeFilter}
        onChange={setTypeFilter}
      />
      <MultiSelectFilter
        label="Fonte"
        options={sources.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))}
        selected={sourceFilter}
        onChange={setSourceFilter}
      />
      <MultiSelectFilter
        label="REDEC"
        options={REDECS.map((r) => ({ value: r, label: r }))}
        selected={redecFilter}
        onChange={setRedecFilter}
      />
    </>
  );

  const ventosStationsCount = useMemo(
    () =>
      filteredStations.filter((s) =>
        s.latest_readings.some((r) => r.reading_type === "vento_ms" || r.reading_type === "vento_rajada_ms" || r.reading_type === "vento_dir_graus"),
      ).length,
    [filteredStations],
  );

  const filterStatusText =
    viewMode !== "dados"
      ? loading
        ? "Carregando estações…"
        : `${filteredStations.length} de ${stations.length} estações`
      : dadosSub === "precipitacao"
        ? precipitacaoLoading
          ? "Carregando precipitação…"
          : `${filteredPrecipitacao.length} estações pluviométricas`
        : dadosSub === "cemaden"
          ? cemadenNacLoading
            ? "Carregando CEMADEN Nacional…"
            : `${filteredCemadenNac.length} estações do CEMADEN Nacional`
        : dadosSub === "hidrologico"
          ? hidrologicasLoading
            ? "Carregando estações hidrológicas…"
            : `${filteredHidrologicas.length} estações hidrológicas`
          : dadosSub === "meteorologico"
            ? loading
              ? "Carregando estações…"
              : `${meteorologicalStations.length} estações meteorológicas`
            : loading
              ? "Carregando estações…"
              : `${ventosStationsCount} estações com dado de vento`;

  // "Atualizar agora" (item 10, pedido do usuário) — depois que o backend
  // termina de rodar TODAS as fontes, recarrega os dados da aba/sub-aba
  // atual (as outras recarregam sozinhas na próxima vez que forem abertas,
  // igual ao comportamento normal de "buscar sob demanda").
  const handleRefreshDone = () => {
    if (viewMode === "dados") {
      if (dadosSub === "precipitacao") fetchPrecipitacao().then(setPrecipitacao).catch(() => {});
      else if (dadosSub === "cemaden") fetchCemadenNacional().then(setCemadenNac).catch(() => {});
      else if (dadosSub === "meteorologico" || dadosSub === "ventos") reloadStations();
      else if (dadosSub === "hidrologico") fetchHidrologicas().then(setHidrologicas).catch(() => {});
    } else if (viewMode === "sirenes") fetchSirenes().then(setSirenes).catch(() => {});
  };

  if (showProfile) {
    return (
      <Profile
        user={user}
        onBack={() => setShowProfile(false)}
        onUserUpdated={(updated) => {
          onUserUpdated(updated);
        }}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Cabeçalho no mesmo esquema visual do SIGPLAN-SEDEC (pedido do
          usuário, 2026-09-23, inspecionado ao vivo em
          sigplan-sedec.vercel.app/dashboard): barra escura (gray-900),
          logo, título com tooltip (o texto de apoio que antes era um
          parágrafo visível vira `title` — aparece no hover depois de
          alguns segundos, comportamento nativo do navegador), botões de
          ação à direita (push/manual/perfil/sair) e uma 2ª fileira com as
          abas do painel. */}
      <header className="shrink-0 bg-gray-900 text-white shadow-lg">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo-cemadenrj.png" alt="CEMADEN-RJ" className="h-8 w-auto shrink-0" />
            <div className="min-w-0" title={TITULO_TOOLTIP}>
              <h1 className="truncate text-sm font-bold sm:text-base">Painel Integrado de Monitoramento</h1>
              <p className="truncate text-[11px] text-gray-400">CEMADEN-RJ / SEDEC</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={handleTogglePush}
              title="Ativar notificações do navegador quando uma sirene tocar"
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white"
            >
              {pushEnabled ? <Bell size={16} /> : <BellOff size={16} />}
              <span className="hidden sm:inline">{pushEnabled ? "Push ativo" : "Ativar push"}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              title="Manual de utilização"
              className="text-gray-300 hover:text-white"
            >
              <BookOpen size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              title="Meu Perfil"
              className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white"
            >
              <User size={16} />
              <span className="hidden sm:inline">{user.first_name || user.username}</span>
              <span className="rounded-full bg-orange-600 px-1.5 py-0.5 text-[10px] capitalize text-white">
                {user.role}
              </span>
            </button>
            <button type="button" onClick={onLogout} title="Sair" className="text-gray-300 hover:text-white">
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {(sirenesStatusErro || sirenesStatus?.obsoleto) && (
          <div className="bg-amber-500 px-4 py-1.5 text-sm font-bold text-black">
            ⚠ ATENÇÃO: o status das sirenes está DESATUALIZADO
            {sirenesStatus?.idade_s != null
              ? ` há ${Math.round(sirenesStatus.idade_s / 60)} min`
              : sirenesStatusErro
                ? " (sem resposta do servidor)"
                : ""}
            . O painel pode NÃO estar mostrando toques de sirene — confirme pelo portal do CBMERJ.
          </div>
        )}
        {activeAlertEvents.length > 0 && (
          <div className="animate-pulse bg-red-600 px-4 py-1.5 text-sm font-bold text-white">
            🔊 {activeAlertEvents.length === 1 ? "1 sirene tocando agora" : `${activeAlertEvents.length} sirenes tocando agora`}
            : {activeAlertEvents.map((e) => e.station_name).join(", ")}
          </div>
        )}
        {/* Menu horizontal — só desktop/tablet largo (pedido do usuário,
            2026-09-29: no celular/tablet estreito vira barra inferior fixa,
            ver <nav> logo após o </header>, mais parecido com app nativo). */}
        <nav className="hidden flex-wrap gap-1 border-t border-gray-800 px-3 py-1.5 md:!flex">
          {VIEW_MODES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setViewMode(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === key ? "bg-sedec-600 text-white" : "text-gray-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Barra inferior fixa — só celular/tablet (< md), estilo app nativo
          (ícone + rótulo curto), pedido do usuário 2026-09-29. O conteúdo
          principal ganha padding-bottom nesse breakpoint pra essa barra
          nunca cobrir nada (ver <div className="flex flex-1..."> abaixo). */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-800 bg-gray-900 pb-[env(safe-area-inset-bottom)] md:!hidden">
        {VIEW_MODES.map(({ key, label, Icone }) => (
          <button
            key={key}
            type="button"
            onClick={() => setViewMode(key)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              viewMode === key ? "text-white" : "text-gray-400"
            }`}
          >
            <Icone size={20} strokeWidth={viewMode === key ? 2.5 : 2} />
            {label}
          </button>
        ))}
      </nav>

      <div className="flex flex-1 flex-col overflow-hidden pb-14 md:!pb-0">
        {/* Barra de filtro flutuante (pedido do usuário, 2026-09-23: a barra
            antiga com os 4 filtros sempre abertos + Exportar CSV numa linha
            separada tomava quase metade da tela no celular — escolhida a
            opção "painel flutuante, igual ao Mapa": barra fina sempre
            visível com Filtros/Atualizar/contagem/Exportar, e só o GRUPO de
            filtros vira um painel que aparece por cima da tabela ao clicar
            em "Filtros"). Não aparece no Mapa (tem o próprio painel
            flutuante) nem em Alertas Ativos (não filtra por essas
            dimensões — tem os próprios filtros de REDEC/município). */}
        {viewMode === "dados" && (
          <FilterToggleBar
            filterControls={filterControls}
            statusText={filterStatusText}
            onRefreshDone={handleRefreshDone}
            onExport={() => {
              if (dadosSub === "precipitacao") precipitacaoTableRef.current?.exportar();
              else if (dadosSub === "cemaden") cemadenTableRef.current?.exportar();
              else if (dadosSub === "meteorologico") meteorologicoTableRef.current?.exportar();
              else if (dadosSub === "hidrologico") hidrologicoTableRef.current?.exportar();
              else if (dadosSub === "ventos") ventosTableRef.current?.exportar();
            }}
            onShare={dadosSub === "ventos" ? () => ventosTableRef.current?.compartilhar?.() : undefined}
            errors={
              <>
                {error && (
                  <div className="mt-2 w-full rounded bg-red-50 p-2 text-xs text-red-600">
                    Não foi possível carregar dados da API ({error}). Verifique se o backend está rodando.
                  </div>
                )}
                {precipitacaoError && (
                  <div className="mt-2 w-full rounded bg-red-50 p-2 text-xs text-red-600">
                    Não foi possível carregar precipitação ({precipitacaoError}).
                  </div>
                )}
                {cemadenNacError && (
                  <div className="mt-2 w-full rounded bg-red-50 p-2 text-xs text-red-600">
                    Não foi possível carregar o CEMADEN Nacional ({cemadenNacError}).
                  </div>
                )}
                {hidrologicasError && (
                  <div className="mt-2 w-full rounded bg-red-50 p-2 text-xs text-red-600">
                    Não foi possível carregar estações hidrológicas ({hidrologicasError}).
                  </div>
                )}
              </>
            }
          />
        )}
        {/* Filtros próprios da aba Sirenes (Município/REDEC/Status/
            Acionamento não existem nas outras abas) — mesmo padrão. */}
        {viewMode === "sirenes" && (
          <FilterToggleBar
            filterControls={sirenesFilterControls}
            statusText={sirenesFilterStatusText}
            onRefreshDone={handleRefreshDone}
            onExport={() => sirenesTableRef.current?.exportar()}
            onShare={() => sirenesTableRef.current?.compartilhar?.()}
            extraSummary={
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  {sirenesOnline} online
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
                  {sirenesOffline} offline
                </span>
                <span className="flex items-center gap-1 font-semibold text-red-600">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
                  {sirenesTocando} tocando agora
                </span>
              </div>
            }
            errors={
              sirenesError && (
                <div className="mt-2 w-full rounded bg-red-50 p-2 text-xs text-red-600">
                  Não foi possível carregar as sirenes ({sirenesError}).
                </div>
              )
            }
          />
        )}

        <main className="relative flex-1 overflow-hidden">
          {viewMode === "mapa" && (
            <div className="flex h-full w-full flex-col">
              <div className="flex shrink-0 gap-1 border-b border-gray-200 bg-white px-3 py-1.5">
                {([
                  ["estacoes", "Estações"],
                  ["contatos", "Contatos"],
                ] as const).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMapaSub(k)}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      mapaSub === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {mapaSub === "contatos" ? (
                <div className="min-h-0 flex-1">
                  <ContatosMap />
                </div>
              ) : (
                <div className="relative min-h-0 flex-1">
              <MapView
                stations={filteredStations}
                activeAlertEvents={activeAlertEvents}
                redecFilter={redecFilter}
                municipalityFilter={municipalityFilter}
              />
              {/* Painel de filtro flutuante sobre o mapa — pedido do usuário
                  (item 9): escondível por um botão de expansão/contração,
                  funciona em mouse e touch (onClick cobre os dois). Fica à
                  direita pra não brigar com o controle de zoom do Leaflet
                  (que fica no canto superior esquerdo). */}
              <div className="absolute right-3 top-3 z-[1000] max-w-[calc(100vw-1.5rem)]">
                <button
                  type="button"
                  onClick={() => setMapFiltersOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50"
                >
                  <Filter size={14} />
                  {mapFiltersOpen ? "Ocultar filtros" : "Filtros"}
                </button>
                {mapFiltersOpen && (
                  <div className="mt-2 flex max-w-xs flex-col gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-lg sm:max-w-sm sm:flex-row sm:flex-wrap">
                    {filterControls}
                    <div className="w-full text-xs text-gray-500">{filterStatusText}</div>
                    {error && <div className="w-full rounded bg-red-50 p-2 text-xs text-red-600">{error}</div>}
                  </div>
                )}
              </div>
                </div>
              )}
            </div>
          )}
          {viewMode === "dados" && (
            <div className="flex h-full w-full flex-col">
              <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 bg-white px-3 py-1.5">
                {DADOS_SUBS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDadosSub(key)}
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${
                      dadosSub === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                {dadosSub === "precipitacao" && (
                  <PrecipitationTable
                    ref={precipitacaoTableRef}
                    stations={filteredPrecipitacao}
                    municipioRedecMap={municipioRedecMap}
                    onOpenStation={setPainelEstacaoId}
                  />
                )}
                {dadosSub === "cemaden" && (
                  <CemadenNacionalTable
                    ref={cemadenTableRef}
                    stations={filteredCemadenNac}
                    municipioRedecMap={municipioRedecMap}
                    onOpenStation={setPainelEstacaoId}
                  />
                )}
                {dadosSub === "meteorologico" && (
                  <DataTable
                    ref={meteorologicoTableRef}
                    stations={filteredStations}
                    readingTypes={METEOROLOGICAL_READING_TYPES}
                    defaultSortKey="temperatura_c"
                    municipioRedecMap={municipioRedecMap}
                    onOpenStation={setPainelEstacaoId}
                  />
                )}
                {dadosSub === "hidrologico" && (
                  <HidrologicaTable
                    ref={hidrologicoTableRef}
                    stations={filteredHidrologicas}
                    municipioRedecMap={municipioRedecMap}
                    onOpenStation={setPainelEstacaoId}
                  />
                )}
                {dadosSub === "ventos" && (
                  <VentosTable
                    ref={ventosTableRef}
                    stations={filteredStations}
                    municipioRedecMap={municipioRedecMap}
                    onOpenStation={setPainelEstacaoId}
                    onShare={setShareData}
                  />
                )}
              </div>
            </div>
          )}
          {viewMode === "sirenes" && (
            <SirenesTable
              ref={sirenesTableRef}
              stations={filteredSirenes}
              onOpenStation={setPainelEstacaoId}
              onShare={setShareData}
            />
          )}
          {viewMode === "meteorologia" && <MeteorologiaPanel />}
          {viewMode === "alertas" && <AlertsPanel />}

          {/* Painel de histórico de estação IN-APP — por cima do conteúdo da
              aba atual (mesmo <main>), NÃO do cabeçalho/menu (pedido do
              usuário: cabeçalho e menu nunca somem). "Voltar" só fecha o
              painel (setPainelEstacaoId(null)) — nada é perdido, a aba e os
              filtros continuam exatamente como estavam. */}
          {painelEstacaoId !== null && (
            <div className="absolute inset-0 z-40 overflow-auto bg-gray-50">
              <StationHistoryPanel
                stationId={painelEstacaoId}
                topo={
                  <button
                    type="button"
                    onClick={() => setPainelEstacaoId(null)}
                    className="flex items-center gap-1.5 text-sm font-medium text-sedec-600 hover:underline"
                  >
                    <X size={16} /> Fechar e voltar ao painel
                  </button>
                }
              />
            </div>
          )}
        </main>
      </div>

      <Footer />

      {showManual && (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowManual(false)}
        >
          <div
            className="max-w-md rounded-xl bg-sedec-600 p-5 text-sm leading-relaxed text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-base font-bold">📖 Manual de utilização</h2>
            <p className="mb-2">
              <strong>Mapa</strong>: visão geral de todas as estações no estado, coloridas por fonte; sirenes
              tocando pulsam em vermelho.
            </p>
            <p className="mb-2">
              <strong>Precipitação</strong>: acumulado de chuva em ~20 janelas por estação, da mais recente até 1
              mês.
            </p>
            <p className="mb-2">
              <strong>Dados Meteorológicos</strong>: temperatura, umidade, vento e maré por estação.
            </p>
            <p className="mb-2">
              <strong>Hidrológico</strong>: nível de rio (atual/máx/mín 24h) e chuva das estações com esse sensor.
            </p>
            <p className="mb-2">
              <strong>Sirenes</strong>: status (online/offline) e acionamento em tempo real das 225 sirenes de
              alarme.
            </p>
            <p className="mb-4">
              Use <strong>Atualizar agora</strong> pra forçar a busca do dado mais recente sem esperar o próximo
              ciclo automático.
            </p>
            <button
              type="button"
              onClick={() => setShowManual(false)}
              className="text-sedec-200 underline underline-offset-2 hover:text-white"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {shareData && <ShareModal data={shareData} onClose={() => setShareData(null)} />}
    </div>
  );
}
