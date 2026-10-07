"use client";

import { useMemo, useRef, useState } from "react";

import { COTA_ESTILOS, CotaClasse, DetalheEstacao, Reading } from "@/lib/api";

// Cotagrama (07/10/2026, pedido do usuário, referências: INEA "Cotagrama" e SGB/CPRM "SACE"):
// nível do rio em linha com área, LINHAS DAS COTAS (atenção, alerta, inundação, extrema) e a
// CHUVA em barras penduradas do topo (eixo da direita invertido). Passar o mouse/dedo mostra os
// detalhes do instante (nível, situação pela cota, chuva do intervalo e as cotas).

const WIDTH = 760;
const HEIGHT = 340;
const PAD_LEFT = 46;
const PAD_RIGHT = 44;
const PAD_TOP = 14;
const PAD_BOTTOM = 34;
const COR_NIVEL = "#2563eb";
const COR_CHUVA = "#1f2937";
const COR_COTAS = { atencao: "#eab308", alerta: "#f97316", inundacao: "#dc2626", extrema: "#f472b6" };

type Cota = NonNullable<DetalheEstacao["cota"]>;

const HORA = 3600_000;

function fmtHora(ms: number, curto = false): string {
  try {
    return new Date(ms).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      ...(curto ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    });
  } catch {
    return String(ms);
  }
}

function fmt(v: number, casas = 2): string {
  return (Math.round(v * 10 ** casas) / 10 ** casas).toString().replace(".", ",");
}

/** Passo "redondo" (1/2/5 × 10ⁿ) para os ticks. */
function passoBom(faixa: number, alvo: number): number {
  if (faixa <= 0) return 1;
  const bruto = faixa / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag;
}

export function classeDaCota(nivelCm: number, cota: Cota | null): CotaClasse {
  if (!cota || (cota.atencao_cm == null && cota.alerta_cm == null && cota.inundacao_cm == null)) return "sem_cota";
  if (cota.extrema_cm != null && nivelCm >= cota.extrema_cm) return "extrema";
  if (cota.inundacao_cm != null && nivelCm >= cota.inundacao_cm) return "transbordo";
  if (cota.alerta_cm != null && nivelCm >= cota.alerta_cm) return "alerta";
  if (cota.atencao_cm != null && nivelCm >= cota.atencao_cm) return "atencao";
  return "normal";
}

type Balde = { ini: number; mm: number };

/** Soma as leituras de chuva em baldes de tempo (15 min, 1 h ou 1 dia conforme o intervalo). */
function baldesDeChuva(chuva: Reading[], t0: number, t1: number): { baldes: Balde[]; passo: number } {
  const span = t1 - t0;
  const passo = span <= 36 * HORA ? 900_000 : span <= 8 * 24 * HORA ? HORA : 24 * HORA;
  const mapa = new Map<number, number>();
  for (const r of chuva) {
    if (r.value < 0) continue;
    const t = new Date(r.timestamp).getTime();
    if (t < t0 || t > t1) continue;
    const k = Math.floor(t / passo) * passo;
    mapa.set(k, (mapa.get(k) ?? 0) + r.value);
  }
  return { baldes: [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([ini, mm]) => ({ ini, mm })), passo };
}

export default function CotagramaChart({
  nivel,
  chuva,
  cota,
  estatico = false,
}: {
  /** Leituras de nível em METROS (mais recente primeiro, como a API devolve). */
  nivel: Reading[];
  /** Leituras de chuva da estação no mesmo período (pode ser vazio). */
  chuva: Reading[];
  cota: Cota | null;
  /** Modo imagem (compartilhar): sem interação. */
  estatico?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [escalaCompleta, setEscalaCompleta] = useState<boolean | null>(null);

  const asc = useMemo(() => [...nivel].reverse(), [nivel]);

  const g = useMemo(() => {
    if (asc.length === 0) return null;
    const tempos = asc.map((r) => new Date(r.timestamp).getTime());
    const t0 = Math.min(...tempos);
    const t1 = Math.max(...tempos);
    const nivMax = Math.max(...asc.map((r) => r.value));
    const cotasM = {
      atencao: cota?.atencao_cm != null ? cota.atencao_cm / 100 : null,
      alerta: cota?.alerta_cm != null ? cota.alerta_cm / 100 : null,
      inundacao: cota?.inundacao_cm != null ? cota.inundacao_cm / 100 : null,
      extrema: cota?.extrema_cm != null ? cota.extrema_cm / 100 : null,
    };
    // A escala "completa" vai até a maior das 3 cotas principais (a extrema, +20%, só aparece se couber).
    const maiorCota = Math.max(0, cotasM.atencao ?? 0, cotasM.alerta ?? 0, cotasM.inundacao ?? 0);
    // Escala: por padrão inclui as cotas quando elas não "achatam" o nível (como no INEA); o
    // usuário alterna. Sem escolha, decide por esta regra.
    const padraoCompleta = maiorCota > 0 && maiorCota <= 5 * Math.max(nivMax, 0.5);
    const completa = escalaCompleta ?? padraoCompleta;
    const topoBase = completa ? Math.max(nivMax, maiorCota) : Math.max(nivMax, cotasM.atencao ?? 0);
    const yMax = Math.max(topoBase * 1.1, 0.5);
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const x = (t: number) => (t1 === t0 ? PAD_LEFT + plotW / 2 : PAD_LEFT + ((t - t0) / (t1 - t0)) * plotW);
    const y = (v: number) => PAD_TOP + (1 - v / yMax) * plotH;
    const pontos = asc.map((r, i) => ({ x: x(tempos[i]), y: y(r.value), r, t: tempos[i] }));

    const { baldes, passo } = baldesDeChuva(chuva, t0, t1 + 1);
    const maxChuva = Math.max(0, ...baldes.map((b) => b.mm));
    const passoChuva = passoBom(Math.max(maxChuva, 1), 3);
    const topoChuva = Math.max(Math.ceil((maxChuva * 1.05) / passoChuva) * passoChuva, passoChuva);
    const alturaChuva = plotH * 0.45; // as barras ocupam até 45% da altura, penduradas do topo
    const yc = (mm: number) => (mm / topoChuva) * alturaChuva;

    const passoY = passoBom(yMax, 5);
    const ticksY: number[] = [];
    for (let v = 0; v <= yMax + 1e-9; v += passoY) ticksY.push(Math.round(v * 1000) / 1000);
    const ticksChuva: number[] = [];
    for (let v = 0; v <= topoChuva + 1e-9; v += passoChuva) ticksChuva.push(v);

    const nTicksX = 6;
    const ticksX = Array.from({ length: nTicksX + 1 }, (_, i) => t0 + ((t1 - t0) * i) / nTicksX);
    return { t0, t1, yMax, x, y, pontos, baldes, passo, topoChuva, yc, ticksY, ticksChuva, ticksX, cotasM, plotW, plotH, nivMax, completa, padraoCompleta, maiorCota };
  }, [asc, chuva, cota, escalaCompleta]);

  if (!g) return <div className="p-4 text-sm text-gray-400">Sem histórico de nível para este período.</div>;

  const caminho = g.pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${caminho} L${g.pontos[g.pontos.length - 1].x.toFixed(1)},${g.y(0).toFixed(1)} L${g.pontos[0].x.toFixed(1)},${g.y(0).toFixed(1)} Z`;
  const larguraBarra = Math.max(1.5, Math.min(18, (g.plotW / Math.max(1, (g.t1 - g.t0) / g.passo)) * 0.8));

  const aoMover = (e: React.PointerEvent<SVGSVGElement>) => {
    if (estatico || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let melhor = 0;
    let dist = Infinity;
    g.pontos.forEach((p, i) => {
      const d = Math.abs(p.x - relX);
      if (d < dist) {
        dist = d;
        melhor = i;
      }
    });
    setHover(melhor);
  };

  const h = hover != null ? g.pontos[hover] : null;
  let tip: React.ReactNode = null;
  if (h) {
    const cm = h.r.value * 100;
    const classe = classeDaCota(cm, cota);
    const est = COTA_ESTILOS[classe];
    const balde = g.baldes.find((b) => h.t >= b.ini && h.t < b.ini + g.passo);
    const acumAte = g.baldes.filter((b) => b.ini <= h.t).reduce((s, b) => s + b.mm, 0);
    const rotuloPasso = g.passo < HORA ? "15 min" : g.passo === HORA ? "1 h" : "1 dia";
    const lado = h.x > WIDTH * 0.62 ? "right" : "left";
    tip = (
      <div
        className="pointer-events-none absolute z-10 w-56 rounded-md border border-gray-200 bg-white/95 p-2 text-[11px] leading-snug text-gray-700 shadow-lg"
        style={{ top: 6, [lado === "left" ? "left" : "right"]: lado === "left" ? `${(h.x / WIDTH) * 100 + 2}%` : `${100 - (h.x / WIDTH) * 100 + 2}%` }}
      >
        <div className="font-bold text-gray-900">{fmtHora(h.t)}</div>
        <div className="mt-1">
          Nível: <strong className="text-gray-900">{fmt(h.r.value)} m</strong> ({Math.round(cm)} cm)
        </div>
        <div className="mt-0.5">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: est.bg, color: est.text }}>
            {est.label}
          </span>
        </div>
        {g.baldes.length > 0 && (
          <div className="mt-1">
            Chuva ({rotuloPasso}): <strong className="text-gray-900">{fmt(balde?.mm ?? 0, 1)} mm</strong>
            <br />
            Acumulada no período até aqui: <strong className="text-gray-900">{fmt(acumAte, 1)} mm</strong>
          </div>
        )}
        {cota && (
          <div className="mt-1 border-t border-gray-100 pt-1">
            {cota.atencao_cm != null && (
              <div style={{ color: cm >= cota.atencao_cm ? COR_COTAS.atencao : undefined }}>Cota de atenção: {Math.round(cota.atencao_cm)} cm</div>
            )}
            {cota.alerta_cm != null && (
              <div style={{ color: cm >= cota.alerta_cm ? COR_COTAS.alerta : undefined }}>Cota de alerta: {Math.round(cota.alerta_cm)} cm</div>
            )}
            {cota.inundacao_cm != null && (
              <div style={{ color: cm >= cota.inundacao_cm ? COR_COTAS.inundacao : undefined }}>Cota de inundação: {Math.round(cota.inundacao_cm)} cm</div>
            )}
          </div>
        )}
      </div>
    );
  }

  const linhasCota: { chave: keyof typeof COR_COTAS; rotulo: string; v: number | null; tracejada?: boolean }[] = [
    { chave: "atencao", rotulo: "Atenção", v: g.cotasM.atencao },
    { chave: "alerta", rotulo: "Alerta", v: g.cotasM.alerta },
    { chave: "inundacao", rotulo: "Inundação", v: g.cotasM.inundacao },
    { chave: "extrema", rotulo: "Extrema", v: g.cotasM.extrema, tracejada: true },
  ];

  return (
    <div className="w-full">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className={`w-full ${estatico ? "" : "touch-pan-y"}`}
          role="img"
          aria-label={`Cotagrama: nível do rio de ${fmt(Math.min(...asc.map((r) => r.value)))} a ${fmt(g.nivMax)} m, com cotas e chuva`}
          onPointerMove={aoMover}
          onPointerDown={aoMover}
          onPointerLeave={() => setHover(null)}
        >
          {g.ticksY.map((t) => (
            <g key={t}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={g.y(t)} y2={g.y(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={PAD_LEFT - 6} y={g.y(t)} textAnchor="end" dominantBaseline="middle" className="fill-blue-700 text-[10px]">
                {fmt(t, 1)}
              </text>
            </g>
          ))}
          <text x={10} y={PAD_TOP + g.plotH / 2} transform={`rotate(-90 10 ${PAD_TOP + g.plotH / 2})`} textAnchor="middle" className="fill-blue-700 text-[10px]">
            Nível do rio (m)
          </text>

          {/* eixo da direita: chuva (invertido, do topo para baixo) */}
          {g.baldes.length > 0 && (
            <>
              {g.ticksChuva.map((t) => (
                <text key={t} x={WIDTH - PAD_RIGHT + 6} y={PAD_TOP + g.yc(t)} dominantBaseline="middle" className="fill-gray-600 text-[10px]">
                  {fmt(t, 1)}
                </text>
              ))}
              <text
                x={WIDTH - 8}
                y={PAD_TOP + g.plotH * 0.22}
                transform={`rotate(90 ${WIDTH - 8} ${PAD_TOP + g.plotH * 0.22})`}
                textAnchor="middle"
                className="fill-gray-600 text-[10px]"
              >
                Chuva (mm)
              </text>
            </>
          )}

          {g.ticksX.map((t, i) => (
            <text key={i} x={g.x(t)} y={HEIGHT - 12} textAnchor={i === 0 ? "start" : i === g.ticksX.length - 1 ? "end" : "middle"} className="fill-gray-500 text-[10px]">
              {fmtHora(t, g.t1 - g.t0 <= 36 * HORA)}
            </text>
          ))}

          <path d={area} fill="#bfdbfe" fillOpacity={0.55} />

          {/* linhas das cotas */}
          {linhasCota.map(
            (c) =>
              c.v != null &&
              c.v <= g.yMax && (
                <g key={c.chave}>
                  <line
                    x1={PAD_LEFT}
                    x2={WIDTH - PAD_RIGHT}
                    y1={g.y(c.v)}
                    y2={g.y(c.v)}
                    stroke={COR_COTAS[c.chave]}
                    strokeWidth={2}
                    strokeDasharray={c.tracejada ? "6,4" : undefined}
                  />
                  <text x={WIDTH - PAD_RIGHT - 4} y={g.y(c.v) - 3} textAnchor="end" className="text-[9.5px] font-semibold" fill={COR_COTAS[c.chave]}>
                    {c.rotulo} {fmt(c.v)} m
                  </text>
                </g>
              ),
          )}

          {/* chuva em barras penduradas do topo */}
          {g.baldes.map((b) => {
            const cx = g.x(b.ini + g.passo / 2);
            return <rect key={b.ini} x={cx - larguraBarra / 2} y={PAD_TOP} width={larguraBarra} height={Math.max(g.yc(b.mm), b.mm > 0 ? 1 : 0)} fill={COR_CHUVA} />;
          })}

          <path d={caminho} fill="none" stroke={COR_NIVEL} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={g.pontos[g.pontos.length - 1].x} cy={g.pontos[g.pontos.length - 1].y} r={4} fill={COR_NIVEL} stroke="white" strokeWidth={2} />

          {h && (
            <>
              <line x1={h.x} x2={h.x} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="#6b7280" strokeWidth={1} strokeDasharray="3,3" />
              <circle cx={h.x} cy={h.y} r={4.5} fill={COR_NIVEL} stroke="white" strokeWidth={2} />
            </>
          )}
        </svg>
        {tip}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: COR_NIVEL }} /> Nível do rio
        </span>
        {g.baldes.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-1.5" style={{ backgroundColor: COR_CHUVA }} /> Chuva ({g.passo < HORA ? "15 min" : g.passo === HORA ? "1 h" : "1 dia"})
          </span>
        )}
        {linhasCota.map(
          (c) =>
            c.v != null &&
            c.v <= g.yMax && (
              <span key={c.chave} className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-4" style={{ backgroundColor: COR_COTAS[c.chave] }} /> Cota de {c.rotulo.toLowerCase()} ({fmt(c.v)} m)
              </span>
            ),
        )}
        {!estatico && g.maiorCota > 0 && (
          <button
            type="button"
            onClick={() => setEscalaCompleta(!g.completa)}
            className="ml-auto rounded border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50"
            title="Alterna entre a escala que inclui todas as cotas e a escala ajustada ao nível"
          >
            {g.completa ? "Ajustar escala ao nível" : "Mostrar todas as cotas"}
          </button>
        )}
        {!cota && <span className="text-gray-400">Estação sem cotas cadastradas.</span>}
      </div>
    </div>
  );
}
