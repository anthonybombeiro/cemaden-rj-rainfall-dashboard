"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

import ColumnResizer from "@/components/ColumnResizer";
import { CampoClicavel } from "@/components/EstacaoCellLinks";
import { TableExportHandle } from "@/components/tableExportHandle";
import {
  getChuva1hFaixa,
  getChuva24hNivel,
  getDelayFaixaSalvar,
  getDelayStatus,
  normalizeMunicipioName,
  RedeSource,
  RedeStation,
} from "@/lib/api";
import { downloadCsv } from "@/lib/csvExport";
import { useColumnWidths } from "@/lib/useColumnWidths";

// Tabela individual por rede (03-07/10/2026). Mesmo desenho da tabela "CEMADEN Nacional":
// valores OFICIAIS da fonte, linhas pela chuva de 1 h (maior primeiro), cores de chuva do
// painel, atraso sinalizado (🕒) e hora da atualização + código por último. A configuração
// por fonte (`CONFIG`) decide quais colunas existem: redes de uma só cidade (Niterói, Macaé,
// Alerta Rio) não repetem Município/REDEC; as colunas "Calc" (nosso cálculo, para conferir)
// ficam DEPOIS de todos os dados recebidos.

type Coluna = {
  key: string;
  label: string;
  titulo: string;
  get: (s: RedeStation) => number | null | undefined;
  /** "mm" = chuva (1 casa); "num" = outra grandeza (1 casa); "ctl" = coluna de controle (nosso cálculo), esmaecida. */
  tipo: "mm" | "num" | "ctl";
};

const nosso = (j: string) => (s: RedeStation) => s.nosso[j];
const oficial = (j: string) => (s: RedeStation) => s.oficial[j];

const T = { key: "temp", label: "T °C", titulo: "Temperatura do ar (última leitura)", get: (s: RedeStation) => s.atual.temp, tipo: "num" as const };
const UR = { key: "umid", label: "UR %", titulo: "Umidade relativa (última leitura)", get: (s: RedeStation) => s.atual.umid, tipo: "num" as const };
const VENTO = {
  key: "vento",
  label: "Vento",
  titulo: "Vento médio em km/h (última leitura)",
  get: (s: RedeStation) => (s.atual.vento_ms == null ? null : s.atual.vento_ms * 3.6),
  tipo: "num" as const,
};
const RAJADA = {
  key: "rajada",
  label: "Rajada",
  titulo: "Rajada em km/h (última leitura)",
  get: (s: RedeStation) => (s.atual.rajada_ms == null ? null : s.atual.rajada_ms * 3.6),
  tipo: "num" as const,
};
const PRESSAO = {
  key: "pressao",
  label: "P hPa",
  titulo: "Pressão (ao nível do mar quando a fonte informa; senão absoluta)",
  get: (s: RedeStation) => s.atual.pressao_nm ?? s.atual.pressao,
  tipo: "num" as const,
};

const NIVEL = { key: "nivel", label: "Nível m", titulo: "Nível do rio em metros (última leitura; só estações com régua)", get: (s: RedeStation) => s.atual.nivel, tipo: "num" as const };
const ORVALHO = { key: "orvalho", label: "Td °C", titulo: "Ponto de orvalho (última leitura)", get: (s: RedeStation) => s.atual.orvalho, tipo: "num" as const };
const TMAX_H = { key: "tmax", label: "Tmáx", titulo: "Temperatura máxima da hora (INMET informa extremos por hora, não do dia)", get: (s: RedeStation) => s.atual.tmax, tipo: "num" as const };
const TMIN_H = { key: "tmin", label: "Tmín", titulo: "Temperatura mínima da hora (INMET informa extremos por hora, não do dia)", get: (s: RedeStation) => s.atual.tmin, tipo: "num" as const };
const RAD = { key: "rad", label: "Rad W/m²", titulo: "Radiação solar (última leitura)", get: (s: RedeStation) => s.atual.rad, tipo: "num" as const };

const JANELAS_NOSSAS = ["1", "3", "6", "12", "24", "48", "72", "96"];

const ctl = (j: string): Coluna => ({
  key: `c${j}`,
  label: `Calc ${j}h`,
  titulo: `Controle: nosso cálculo (soma do que gravamos) — ${j} h`,
  get: nosso(j),
  tipo: "ctl",
});
const oficialH = (j: string, titulo?: string): Coluna => ({
  key: `o${j}`,
  label: `${j}h`,
  titulo: titulo ?? `Acumulado OFICIAL da fonte — últimas ${j} h`,
  get: oficial(j),
  tipo: "mm",
});
const oficialM = (min: string): Coluna => ({
  key: `om${min}`,
  label: `${min}min`,
  titulo: `Acumulado OFICIAL da fonte — últimos ${min} minutos`,
  get: oficial(`m${min.padStart(2, "0")}`), // chaves reais: m05, m10, m15, m30
  tipo: "mm",
});
const oficialMes: Coluna = { key: "omes", label: "Mês", titulo: "Acumulado OFICIAL do mês corrente", get: oficial("mes"), tipo: "mm" };
const nossasJanelas = (titulo: (j: string) => string): Coluna[] =>
  JANELAS_NOSSAS.map<Coluna>((j) => ({ key: `n${j}`, label: `${j}h`, titulo: titulo(j), get: nosso(j), tipo: "mm" }));

type Situacao = { rotulo: string; titulo: string; texto: (s: RedeStation) => { texto: string; cor?: string } };

type Config = {
  nome: string;
  /** Coluna Município (só para redes que cobrem várias cidades). */
  municipio: boolean;
  /** Coluna REDEC (idem). */
  redec: boolean;
  /** Coluna "Localização" (região informada pela fonte) no lugar da REDEC. */
  localizacao?: (s: RedeStation) => string;
  chuva: Coluna[];
  meteo: Coluna[];
  /** Coluna de direção do vento com bússola (igual à tabela Ventos). */
  direcao: boolean;
  situacao?: Situacao;
  /** Colunas de controle (nosso cálculo), depois de TODOS os dados recebidos. */
  calc: Coluna[];
  /** Ordenação inicial (padrão: chuva de 1 h, maior primeiro); fontes sem chuva ordenam por nome. */
  ordemPadrao?: "name";
  coluna1h: (s: RedeStation) => number | null | undefined;
  coluna24h: (s: RedeStation) => number | null | undefined;
  nota: string;
};

const CONFIG: Record<RedeSource, Config> = {
  cemaden_rj_sirenes: {
    nome: "CEMADEN-RJ (pluviômetros das sirenes)",
    municipio: true,
    redec: true,
    chuva: [
      { key: "om15", label: "15min", titulo: "Acumulado OFICIAL do portal — últimos 15 min", get: oficial("m15"), tipo: "mm" },
      oficialH("1"),
      oficialH("4"),
      oficialH("12"),
      oficialH("24"),
      oficialH("48"),
      oficialH("72"),
      oficialH("96"),
      { key: "omes", label: "1 mês", titulo: "Acumulado OFICIAL do portal — último mês", get: oficial("mes"), tipo: "mm" },
    ],
    meteo: [],
    direcao: false,
    calc: [ctl("1"), ctl("24"), ctl("96")],
    coluna1h: oficial("1"),
    coluna24h: oficial("24"),
    nota:
      "CEMADEN-RJ (85 pluviômetros instalados nas sirenes): 15 min, 1 h, 4 h, 12 h, 24 h, 48 h, 72 h, 96 h e 1 mês são os acumulados OFICIAIS da página pública do portal de sirenes (atualizada a cada ~3 min); “Calc” (cinza, itálico) é o nosso cálculo (soma dos baldes gravados), para conferir. Esta rede não mede temperatura, vento nem umidade.",
  },
  inea: {
    nome: "INEA (Alerta de Cheias)",
    municipio: true,
    redec: true,
    chuva: [
      oficialH("1"),
      oficialH("4"),
      oficialH("24"),
      oficialH("96"),
      { key: "om720", label: "30d", titulo: "Acumulado OFICIAL da fonte — últimos 30 dias", get: oficial("720"), tipo: "mm" },
    ],
    meteo: [NIVEL],
    direcao: false,
    situacao: {
      rotulo: "Tipo",
      titulo: "Tipo de estação no INEA: Plu = só chuva; Plu/Flu = chuva e nível de rio",
      texto: (s) => ({ texto: String(s.extra.tipo_inea ?? "—") }),
    },
    calc: [ctl("1"), ctl("24"), ctl("96")],
    coluna1h: oficial("1"),
    coluna24h: oficial("24"),
    nota:
      "INEA (Alerta de Cheias): 1h, 4h, 24h, 96h e 30d são os acumulados OFICIAIS do XML da rede; “Calc” (cinza, itálico) é o nosso cálculo, para conferir — em 06/10/2026 o nosso 96 h ficava em média 17,8 mm abaixo do oficial (a fonte inclui dados que chegam atrasados e que não vemos), por isso a tabela de Precipitação passou a exibir o valor oficial. Nível (m) existe só nas estações Plu/Flu.",
  },
  ecowitt_paracambi: {
    nome: "Paracambi (Defesa Civil, Ecowitt)",
    municipio: false,
    redec: false,
    chuva: [
      { key: "o1", label: "1h", titulo: "Chuva da última hora — OFICIAL da estação (1_hour)", get: oficial("1"), tipo: "mm" },
      { key: "ohoje", label: "Hoje", titulo: "Chuva do dia — OFICIAL da estação (daily, desde 00h)", get: oficial("hoje"), tipo: "mm" },
      { key: "oevento", label: "Evento", titulo: "Chuva do evento em andamento — OFICIAL da estação (event)", get: oficial("evento"), tipo: "mm" },
      { key: "osemana", label: "Sem.", titulo: "Chuva da semana — OFICIAL da estação (weekly)", get: oficial("semana"), tipo: "mm" },
      { key: "omes", label: "Mês", titulo: "Chuva do mês — OFICIAL da estação (monthly)", get: oficial("mes"), tipo: "mm" },
      { key: "oano", label: "Ano", titulo: "Chuva do ano — OFICIAL da estação (yearly)", get: oficial("ano"), tipo: "mm" },
      { key: "taxa", label: "mm/h", titulo: "Taxa de chuva instantânea da estação (rain_rate)", get: oficial("taxa"), tipo: "num" },
    ],
    meteo: [T, UR, VENTO, RAJADA, PRESSAO, ORVALHO, RAD],
    direcao: true,
    calc: [ctl("1"), ctl("24"), { key: "chj", label: "Calc Hoje", titulo: "Controle: nosso cálculo do dia (soma dos baldes de hoje) — deve bater com “Hoje”", get: nosso("hoje"), tipo: "ctl" }],
    coluna1h: oficial("1"),
    coluna24h: nosso("24"),
    nota:
      "Ecowitt (Defesa Civil de Paracambi, 2 estações): as colunas de chuva são os totais OFICIAIS da estação (1 h, dia, evento, semana, mês, ano e taxa); “Calc” (cinza, itálico) é o nosso cálculo para conferir. A estação BNH de Cima tem a coordenada corrigida manualmente (o cadastro na Ecowitt está errado).",
  },
  inmet: {
    nome: "INMET",
    municipio: true,
    redec: true,
    chuva: [
      ...nossasJanelas((j) => `Acumulado nas últimas ${j} h (soma das chuvas horárias do INMET que gravamos)`),
      { key: "nhoje", label: "Hoje", titulo: "Acumulado desde 00h (soma das chuvas horárias gravadas)", get: nosso("hoje"), tipo: "mm" },
    ],
    meteo: [T, TMAX_H, TMIN_H, UR, VENTO, RAJADA, PRESSAO, RAD],
    direcao: true,
    calc: [],
    coluna1h: nosso("1"),
    coluna24h: nosso("24"),
    nota:
      "INMET (estações automáticas): publicam 1 observação por hora; a chuva é o total de cada hora e os acumulados são a soma das horas que gravamos (a fonte não entrega acumulados prontos). Tmáx/Tmín são extremos da hora, não do dia. Estações sem sensor mostram “—”.",
  },
  redemet: {
    nome: "REDEMET (aeroportos)",
    municipio: true,
    redec: true,
    chuva: [],
    meteo: [T, ORVALHO, VENTO, PRESSAO],
    direcao: true,
    calc: [],
    ordemPadrao: "name",
    coluna1h: () => null,
    coluna24h: () => null,
    nota:
      "REDEMET (METAR/SPECI dos aeroportos do RJ): observação horária de temperatura, ponto de orvalho, vento, direção e pressão (QNH). O METAR não informa chuva acumulada, então esta tabela não tem colunas de chuva nem cor de linha. Código = ICAO do aeroporto.",
  },
  niteroi: {
    nome: "Niterói (Defesa Civil)",
    municipio: false,
    redec: false,
    chuva: [
      oficialM("5"),
      oficialM("10"),
      oficialM("15"),
      oficialM("30"),
      oficialH("1"),
      oficialH("6"),
      oficialH("12"),
      oficialH("24"),
      oficialH("36"),
      oficialH("48"),
      oficialH("72"),
      oficialH("96"),
      oficialH("168", "Acumulado OFICIAL da fonte — últimas 168 h (7 dias)"),
      { key: "om720", label: "30d", titulo: "Acumulado OFICIAL da fonte — últimas 720 h (30 dias)", get: oficial("720"), tipo: "mm" },
      oficialMes,
    ],
    meteo: [],
    direcao: false,
    situacao: {
      rotulo: "Fonte",
      titulo: "Indicador de atraso informado pela própria fonte (is_delay)",
      texto: (s) => (s.extra.atrasada_fonte ? { texto: "atraso", cor: "#b91c1c" } : { texto: "ok", cor: "#15803d" }),
    },
    calc: [ctl("1"), ctl("24"), ctl("96")],
    coluna1h: oficial("1"),
    coluna24h: oficial("24"),
    nota:
      "Niterói (Defesa Civil/Alerta Nit, Tecal): as colunas de chuva são os acumulados OFICIAIS da fonte; “Calc” (cinza, itálico) é o nosso cálculo, para conferir (gravamos o balde de 5 min a cada 5 min). “Fonte” mostra o indicador de atraso da própria rede.",
  },
  alerta_rio: {
    nome: "Alerta Rio",
    municipio: false,
    redec: false,
    localizacao: (s) => String(s.extra.localizacao ?? "—"),
    chuva: [
      oficialM("5"),
      oficialM("10"),
      oficialM("15"),
      oficialM("30"),
      oficialH("1"),
      oficialH("2"),
      oficialH("3"),
      oficialH("4"),
      oficialH("6"),
      oficialH("12"),
      oficialH("24"),
      oficialH("96"),
      oficialMes,
      {
        key: "otx15",
        label: "TX-15",
        titulo:
          "TX-15 (como no portal do Alerta Rio): TAXA de chuva em mm/h estimada pelos últimos 15 minutos — é o acumulado de 15 min × 4. Ex.: 6,8 mm em 15 min = 27,2 mm/h.",
        get: (s) => s.oficial.tx15 ?? (s.oficial.m15 == null ? null : s.oficial.m15 * 4),
        tipo: "mm",
      },
    ],
    meteo: [T, UR, VENTO, PRESSAO],
    direcao: true,
    calc: [ctl("1"), ctl("24"), ctl("96")],
    coluna1h: oficial("1"),
    coluna24h: oficial("24"),
    nota:
      "Alerta Rio (Prefeitura do Rio/GeoRio): colunas iguais às do portal oficial (5 min a Mês e TX-15); “Localização” é a região informada pelo portal. “TX-15” = taxa de chuva em mm/h estimada pelos últimos 15 minutos (acumulado de 15 min × 4). “—” = o portal informa ND (sem dado). Temperatura, umidade, vento, direção e pressão existem só nas estações meteorológicas; o feed não traz rajada. “Calc” (cinza, itálico) é o nosso cálculo (balde de 5 min a cada 5 min). O feed publica com ~5-10 min de atraso; valores -99,99 (estação sem dado) são descartados.",
  },
  macae_ufrj: {
    nome: "Macaé (UFRJ)",
    municipio: false,
    redec: false,
    chuva: [
      { key: "o1", label: "1h", titulo: "Acumulado OFICIAL do portal da rede — última 1 h", get: oficial("1"), tipo: "mm" },
      { key: "o24", label: "24h", titulo: "Acumulado OFICIAL do portal — últimas 24 h", get: oficial("24"), tipo: "mm" },
      { key: "o96", label: "96h", titulo: "Acumulado OFICIAL do portal — últimas 96 h", get: oficial("96"), tipo: "mm" },
    ],
    meteo: [T, UR, VENTO, RAJADA, PRESSAO],
    direcao: true,
    situacao: {
      rotulo: "Status",
      titulo: "Situação informada pelo portal (online/offline)",
      texto: (s) => (s.extra.online ? { texto: "online", cor: "#15803d" } : { texto: "offline", cor: "#b91c1c" }),
    },
    calc: [ctl("1"), ctl("24"), ctl("96")],
    coluna1h: oficial("1"),
    coluna24h: oficial("24"),
    nota:
      "Macaé (UFRJ/Defesa Civil): 1h, 24h e 96h são os acumulados OFICIAIS do portal da rede; as colunas “Calc” (cinza, itálico) são o nosso cálculo, para conferir. A chuva é gravada minuto a minuto a partir do histórico do portal (basculador de 0,34 mm). Estações offline mostram a última leitura que o portal tem.",
  },
  plugfield: {
    nome: "Plugfield",
    municipio: true,
    redec: true,
    chuva: [
      ...nossasJanelas((j) => `Acumulado nas últimas ${j} h (soma dos baldes gravados; confere com o total do dia oficial)`),
      { key: "ohoje", label: "Hoje", titulo: "Chuva do dia OFICIAL da estação (rainDay, desde 00h)", get: oficial("hoje"), tipo: "mm" },
      { key: "omes", label: "Mês", titulo: "Chuva do mês OFICIAL da estação (rainMonth)", get: oficial("mes"), tipo: "mm" },
      { key: "oano", label: "Ano", titulo: "Chuva do ano OFICIAL da estação (rainYear)", get: oficial("ano"), tipo: "mm" },
    ],
    meteo: [T, UR, VENTO, RAJADA, PRESSAO],
    direcao: true,
    situacao: {
      rotulo: "Bat.",
      titulo: "Bateria da estação (%)",
      texto: (s) => {
        const b = s.extra.bateria_pct;
        return typeof b === "number" ? { texto: `${Math.round(b)}%`, cor: b < 20 ? "#b91c1c" : undefined } : { texto: "—" };
      },
    },
    calc: [{ key: "chj", label: "Calc Hoje", titulo: "Controle: nosso cálculo do dia (soma dos baldes de hoje) — deve bater com “Hoje”", get: nosso("hoje"), tipo: "ctl" }],
    coluna1h: nosso("1"),
    coluna24h: nosso("24"),
    nota:
      "Plugfield (Defesas Civis): 1h a 96h são calculadas somando o que gravamos a cada coleta; “Hoje”, “Mês” e “Ano” são os totais OFICIAIS da estação e “Calc Hoje” (cinza, itálico) é o nosso total do dia, para conferir. Estações atrasadas ficam sinalizadas em 🕒. Bat. = bateria da estação.",
  },
  wunderground: {
    nome: "Wunderground",
    municipio: true,
    redec: true,
    chuva: [
      ...nossasJanelas((j) => `Acumulado nas últimas ${j} h (soma dos baldes gravados)`),
      { key: "ohoje", label: "Hoje", titulo: "Chuva do dia OFICIAL da estação (precipTotal, desde 00h)", get: oficial("hoje"), tipo: "mm" },
      { key: "taxa", label: "mm/h", titulo: "Taxa de chuva instantânea informada pela estação (precipRate)", get: oficial("taxa"), tipo: "num" },
    ],
    meteo: [T, UR, VENTO, RAJADA, PRESSAO],
    direcao: true,
    situacao: {
      rotulo: "QC",
      titulo: "Controle de qualidade do Weather Company (qcStatus): ✓ aprovado, ✗ reprovado, — não avaliado",
      texto: (s) => {
        const q = s.extra.qc_status;
        if (q === 1) return { texto: "✓", cor: "#15803d" };
        if (q === 0) return { texto: "✗", cor: "#b91c1c" };
        return { texto: "—" };
      },
    },
    calc: [{ key: "chj", label: "Calc Hoje", titulo: "Controle: nosso cálculo do dia (soma dos baldes de hoje) — deve bater com “Hoje”", get: nosso("hoje"), tipo: "ctl" }],
    coluna1h: nosso("1"),
    coluna24h: nosso("24"),
    nota:
      "Wunderground (estações pessoais, sem calibração): 1h a 96h são calculadas somando o que gravamos; “Hoje” é o total oficial da estação (precipTotal) e “Calc Hoje” (cinza, itálico) é o nosso, para conferir. QC = controle de qualidade do Weather Company (✓ aprovado, — não avaliado). Redes pessoais não são calibradas: use com cautela.",
  },
};

const PONTOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
function pontoCardeal(graus: number): string {
  return PONTOS[Math.round(graus / 45) % 8];
}

function Bussola({ graus }: { graus: number }) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} className="mr-1 inline-block shrink-0 align-middle">
      <circle cx={12} cy={12} r={10} fill="none" stroke="#9ca3af" strokeWidth={1.5} />
      <g transform={`rotate(${graus} 12 12)`}>
        <path d="M12 4 L15 13 L12 11 L9 13 Z" fill="#0369a1" />
      </g>
    </svg>
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return (Math.round(v * 10) / 10).toFixed(1);
}

const COLUNAS_TEXTO = new Set(["name", "municipality", "redec", "localizacao", "updated", "codigo", "situacao"]);

const W_DESKTOP: Record<string, number> = {
  estacao: 210, municipio: 130, num: 54, dir: 92, situacao: 70, redec: 120, localizacao: 150, atualizado: 150, codigo: 100,
};
const W_MOBILE: Record<string, number> = {
  estacao: 130, municipio: 100, num: 50, dir: 84, situacao: 62, redec: 110, localizacao: 120, atualizado: 120, codigo: 90,
};

const RedeTable = forwardRef<
  TableExportHandle,
  {
    source: RedeSource;
    stations: RedeStation[];
    municipioRedecMap?: Record<string, string>;
    onOpenStation: (id: number) => void;
  }
>(function RedeTable({ source, stations, municipioRedecMap = {}, onOpenStation }, ref) {
  const cfg = CONFIG[source];
  const { widths: w, setWidth, resetWidth, resetAll } = useColumnWidths(`larguras-rede-${source}-v2`, W_DESKTOP, W_MOBILE);
  // Ordem: dados recebidos (chuva, meteorologia) → direção → situação → colunas Calc.
  const dados = useMemo(() => [...cfg.chuva, ...cfg.meteo], [cfg]);
  const todas = useMemo(() => [...dados, ...cfg.calc], [dados, cfg]);
  const nDados = dados.length;
  const get1h = cfg.coluna1h;
  const get24h = cfg.coluna24h;

  const [sortKey, setSortKey] = useState<string>(cfg.ordemPadrao ?? "__1h");
  const [sortAsc, setSortAsc] = useState(cfg.ordemPadrao === "name");
  const redecOf = (municipality: string) => municipioRedecMap[normalizeMunicipioName(municipality)] ?? "";

  const sorted = useMemo(() => {
    const copy = [...stations];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "municipality") cmp = a.municipality.localeCompare(b.municipality);
      else if (sortKey === "redec") cmp = redecOf(a.municipality).localeCompare(redecOf(b.municipality));
      else if (sortKey === "localizacao") cmp = (cfg.localizacao?.(a) ?? "").localeCompare(cfg.localizacao?.(b) ?? "");
      else if (sortKey === "updated") cmp = (a.referencia ?? "").localeCompare(b.referencia ?? "");
      else if (sortKey === "codigo") cmp = (a.codigo || "").localeCompare(b.codigo || "", undefined, { numeric: true });
      else if (sortKey === "situacao") cmp = (cfg.situacao?.texto(a).texto ?? "").localeCompare(cfg.situacao?.texto(b).texto ?? "");
      else {
        const g = sortKey === "__1h" ? get1h : sortKey === "dir" ? (s: RedeStation) => s.atual.dir : todas.find((c) => c.key === sortKey)?.get;
        const va = g?.(a);
        const vb = g?.(b);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        cmp = va - vb;
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [stations, sortKey, sortAsc, municipioRedecMap, todas, get1h, cfg]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(COLUNAS_TEXTO.has(key));
    }
  };
  const arrow = (key: string) => (key === sortKey ? (sortAsc ? " ▲" : " ▼") : "");
  const resizer = (k: string) => (
    <ColumnResizer width={w[k]} onChange={(px) => setWidth(k, px)} onReset={() => resetWidth(k)} />
  );

  const exportar = () => {
    const headers = [
      "Estação",
      ...(cfg.municipio ? ["Município"] : []),
      ...dados.map((c) => c.label),
      ...(cfg.direcao ? ["Direção (°)", "Direção"] : []),
      ...(cfg.situacao ? [cfg.situacao.rotulo] : []),
      ...cfg.calc.map((c) => c.label),
      ...(cfg.redec ? ["REDEC"] : []),
      ...(cfg.localizacao ? ["Localização"] : []),
      "Atualizado em",
      "Qualidade",
      "Código",
    ];
    const rows = sorted.map((s) => [
      s.name,
      ...(cfg.municipio ? [s.municipality || ""] : []),
      ...dados.map((c) => c.get(s) ?? ""),
      ...(cfg.direcao ? [s.atual.dir ?? "", s.atual.dir == null ? "" : pontoCardeal(s.atual.dir)] : []),
      ...(cfg.situacao ? [cfg.situacao.texto(s).texto] : []),
      ...cfg.calc.map((c) => c.get(s) ?? ""),
      ...(cfg.redec ? [redecOf(s.municipality)] : []),
      ...(cfg.localizacao ? [cfg.localizacao(s)] : []),
      formatTimestamp(s.referencia),
      s.qualidade ?? "",
      s.codigo || "",
    ]);
    downloadCsv(`${source}-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };
  useImperativeHandle(ref, () => ({ exportar }));

  const thBase =
    "sticky top-0 align-bottom z-20 cursor-pointer select-none whitespace-normal break-words leading-tight bg-gray-100 py-2";
  const totalW =
    w.estacao +
    (cfg.municipio ? w.municipio : 0) +
    todas.length * w.num +
    (cfg.direcao ? w.dir : 0) +
    (cfg.situacao ? w.situacao : 0) +
    (cfg.redec ? w.redec : 0) +
    (cfg.localizacao ? w.localizacao : 0) +
    w.atualizado +
    w.codigo;

  return (
    <div className="h-full w-full overflow-auto bg-white">
      <table
        className="border-collapse text-xs sm:text-sm [&_td]:border [&_td]:border-gray-200 [&_th]:border [&_th]:border-gray-300"
        style={{ tableLayout: "fixed", width: totalW }}
      >
        <colgroup>
          <col style={{ width: w.estacao }} />
          {cfg.municipio && <col style={{ width: w.municipio }} />}
          {dados.map((c) => (
            <col key={c.key} style={{ width: w.num }} />
          ))}
          {cfg.direcao && <col style={{ width: w.dir }} />}
          {cfg.situacao && <col style={{ width: w.situacao }} />}
          {cfg.calc.map((c) => (
            <col key={c.key} style={{ width: w.num }} />
          ))}
          {cfg.redec && <col style={{ width: w.redec }} />}
          {cfg.localizacao && <col style={{ width: w.localizacao }} />}
          <col style={{ width: w.atualizado }} />
          <col style={{ width: w.codigo }} />
        </colgroup>
        <thead className="text-left uppercase tracking-wide text-gray-600">
          <tr>
            <th
              className={`${thBase} z-30 px-2 shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]`}
              style={{ left: 0 }}
              onClick={() => toggleSort("name")}
            >
              Estação{arrow("name")}
              {resizer("estacao")}
            </th>
            {cfg.municipio && (
              <th className={`${thBase} px-2`} onClick={() => toggleSort("municipality")}>
                Município{arrow("municipality")}
                {resizer("municipio")}
              </th>
            )}
            {dados.map((c, i) => (
              <th
                key={c.key}
                className={`${thBase} px-1 text-right`}
                onClick={() => toggleSort(c.key)}
                title={c.titulo}
              >
                {c.label}
                {arrow(c.key)}
                {i === nDados - 1 && !cfg.direcao && !cfg.situacao && cfg.calc.length === 0 && resizer("num")}
              </th>
            ))}
            {cfg.direcao && (
              <th className={`${thBase} px-1`} onClick={() => toggleSort("dir")} title="Direção do vento (última leitura): bússola, graus e ponto cardeal">
                Dir.{arrow("dir")}
                {resizer("dir")}
              </th>
            )}
            {cfg.situacao && (
              <th className={`${thBase} px-1`} onClick={() => toggleSort("situacao")} title={cfg.situacao.titulo}>
                {cfg.situacao.rotulo}
                {arrow("situacao")}
                {resizer("situacao")}
              </th>
            )}
            {cfg.calc.map((c, i) => (
              <th
                key={c.key}
                className={`${thBase} px-1 text-right text-gray-400`}
                onClick={() => toggleSort(c.key)}
                title={c.titulo}
              >
                {c.label}
                {arrow(c.key)}
                {i === cfg.calc.length - 1 && resizer("num")}
              </th>
            ))}
            {cfg.redec && (
              <th className={`${thBase} px-2`} onClick={() => toggleSort("redec")}>
                REDEC{arrow("redec")}
                {resizer("redec")}
              </th>
            )}
            {cfg.localizacao && (
              <th className={`${thBase} px-2`} onClick={() => toggleSort("localizacao")} title="Região informada pelo portal da fonte">
                Localização{arrow("localizacao")}
                {resizer("localizacao")}
              </th>
            )}
            <th className={`${thBase} px-2`} onClick={() => toggleSort("updated")}>
              Atualizado em{arrow("updated")}
              {resizer("atualizado")}
            </th>
            <th className={`${thBase} px-2`} onClick={() => toggleSort("codigo")}>
              Código{arrow("codigo")}
              {resizer("codigo")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const atraso = getDelayStatus(s.referencia);
            const faixaAtraso = getDelayFaixaSalvar(s.referencia);
            const mostraRelogio = faixaAtraso.faixa !== "ok" && faixaAtraso.faixa !== "sem";
            const faixa1h = getChuva1hFaixa(get1h(s) ?? null, atraso.atrasado);
            const bg = faixa1h?.bg ?? "#ffffff";
            const cor = faixa1h?.text;
            const nivel = getChuva24hNivel(get24h(s) ?? null);
            const sit = cfg.situacao?.texto(s);
            const dir = s.atual.dir;
            const marcado = s.qualidade === "invalido" || s.qualidade === "suspeito";
            const celula = (c: Coluna) => {
              const v = c.get(s);
              const principal24 = c.get === get24h && c.tipo === "mm";
              return (
                <td
                  key={c.key}
                  className="whitespace-nowrap px-1.5 py-1 text-right"
                  style={{
                    backgroundColor: bg,
                    color: c.tipo === "ctl" ? (cor ?? "#9ca3af") : (cor ?? "#1f2937"),
                    fontStyle: c.tipo === "ctl" ? "italic" : undefined,
                  }}
                >
                  {principal24 ? (
                    <span className="inline-flex items-center justify-end gap-1">
                      {nivel && (
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: nivel.color }} title={nivel.label} />
                      )}
                      {fmt(v)}
                    </span>
                  ) : (
                    fmt(v)
                  )}
                </td>
              );
            };
            return (
              <tr key={s.id} className="border-b border-gray-100" title={faixa1h?.label}>
                <td
                  className="sticky z-10 whitespace-normal break-words leading-tight align-middle px-2 py-1 font-medium shadow-[2px_0_3px_-1px_rgba(0,0,0,0.15)]"
                  style={{ left: 0, backgroundColor: bg, color: cor ?? "#111827" }}
                  title={s.name}
                >
                  <CampoClicavel
                    id={s.id}
                    valor={s.name}
                    onOpenStation={onOpenStation}
                    className="text-left underline-offset-2 hover:underline"
                    title="Ver histórico desta estação"
                  />
                  {marcado && (
                    <span
                      className="ml-1"
                      title={`Leitura de chuva ${s.qualidade === "invalido" ? "inválida" : "suspeita"} (últimas 24 h): ${s.qualidade_motivo}`}
                    >
                      ⚠
                    </span>
                  )}
                </td>
                {cfg.municipio && (
                  <td
                    className="whitespace-normal break-words leading-tight align-middle px-2 py-1"
                    style={{ backgroundColor: bg, color: cor ?? "#4b5563" }}
                  >
                    <CampoClicavel id={s.id} valor={s.municipality || "—"} onOpenStation={onOpenStation} />
                  </td>
                )}
                {dados.map(celula)}
                {cfg.direcao && (
                  <td className="whitespace-nowrap px-1.5 py-1" style={{ backgroundColor: bg, color: cor ?? "#1f2937" }}>
                    {dir == null ? (
                      "—"
                    ) : (
                      <span title={`${Math.round(dir)}° (${pontoCardeal(dir)})`}>
                        <Bussola graus={dir} />
                        {Math.round(dir)}° {pontoCardeal(dir)}
                      </span>
                    )}
                  </td>
                )}
                {cfg.situacao && sit && (
                  <td
                    className="whitespace-nowrap px-1.5 py-1 text-center font-semibold"
                    style={{ backgroundColor: bg, color: sit.cor ?? cor ?? "#374151" }}
                  >
                    {sit.texto}
                  </td>
                )}
                {cfg.calc.map(celula)}
                {cfg.redec && (
                  <td
                    className="whitespace-normal break-words leading-tight align-middle px-2 py-1"
                    style={{ backgroundColor: bg, color: cor ?? "#6b7280" }}
                  >
                    {redecOf(s.municipality) || "—"}
                  </td>
                )}
                {cfg.localizacao && (
                  <td
                    className="whitespace-normal break-words leading-tight align-middle px-2 py-1"
                    style={{ backgroundColor: bg, color: cor ?? "#4b5563" }}
                  >
                    {cfg.localizacao(s)}
                  </td>
                )}
                <td
                  className="whitespace-normal break-words leading-tight px-2 py-1"
                  style={{
                    backgroundColor: bg,
                    color: mostraRelogio ? faixaAtraso.color : (cor ?? faixaAtraso.color),
                    fontWeight: mostraRelogio ? 700 : undefined,
                  }}
                  title={faixaAtraso.label}
                >
                  {mostraRelogio && <span className="mr-1">🕒</span>}
                  {formatTimestamp(s.referencia)}
                </td>
                <td
                  className="whitespace-nowrap px-2 py-1 font-mono text-[11px]"
                  style={{ backgroundColor: bg, color: cor ?? "#374151" }}
                >
                  {s.codigo || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-400">Nenhuma estação de {cfg.nome} encontrada.</div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500 sm:text-[11px]">
        <span>Fundo da linha por chuva na última 1h:</span>
        {[
          { bg: "#BEBEBE", label: "Atrasada" },
          { bg: "#63B8FF", label: "Fraca" },
          { bg: "#FFFF66", label: "Moderada" },
          { bg: "#FFA600", label: "Forte" },
          { bg: "#CC0000", label: "Muito Forte" },
        ].map((f) => (
          <span key={f.label} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ backgroundColor: f.bg }} />
            {f.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 bg-white px-3 py-2 text-[10px] text-gray-500 sm:text-[11px]">
        <span>Hora da atualização (🕒 = dado atrasado):</span>
        {[
          { c: "#1e3a8a", l: "mais de 4 h e menos de 120 h" },
          { c: "#808000", l: "mais de 120 h e menos de 30 dias" },
          { c: "#7e22ce", l: "mais de 30 dias" },
          { c: "#dc2626", l: "data/hora no futuro" },
        ].map((f) => (
          <span key={f.l} className="flex items-center gap-1 font-semibold" style={{ color: f.c }}>
            🕒 <span className="font-normal text-gray-500">{f.l}</span>
          </span>
        ))}
        <span>⚠ = leitura de chuva suspeita/inválida nas últimas 24 h.</span>
      </div>
      <div className="border-t border-gray-100 p-2 text-xs text-gray-400">{cfg.nota} Clique em qualquer cabeçalho para ordenar.</div>
      <div className="sticky left-0 border-t border-gray-100 p-2 text-xs text-gray-400">
        Arraste a borda direita de um cabeçalho para ajustar a largura da coluna (duplo clique restaura).{" "}
        <button type="button" onClick={resetAll} className="underline hover:text-gray-600">
          Restaurar larguras
        </button>
      </div>
    </div>
  );
});

export default RedeTable;
