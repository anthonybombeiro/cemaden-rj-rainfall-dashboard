"use client";

/** Mostradores em SVG puro (sem lib de gráfico) pros cards "ao vivo" da
 * página /estacao — pedido do usuário (2026-09-28, inspirado no dashboard
 * do Wunderground): o ponteiro/preenchimento se move de acordo com a
 * LEITURA atual, dentro de uma faixa fixa por tipo de dado. Mesma técnica
 * de SVG do HistoryChart.tsx, sem depender de biblioteca externa. */

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function fracao(valor: number, min: number, max: number): number {
  return clamp((valor - min) / (max - min), 0, 1);
}

function Card({
  titulo,
  children,
  rodape,
}: {
  titulo: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{titulo}</h3>
      {/* Sem `flex-1`/`justify-center` aqui: num grid de cards a mesma altura
          da linha "estica" o card (align-items:stretch padrão do CSS grid) —
          centralizar o conteúdo nesse espaço extra empurrava o SVG por cima
          do rodapé em telas estreitas (2 colunas). O espaço sobrando fica
          embaixo, sem risco de sobreposição. */}
      <div className="mt-1 flex w-full flex-col items-center">{children}</div>
      {rodape && <div className="mt-1 w-full text-center text-[11px] text-gray-500">{rodape}</div>}
    </div>
  );
}

/** Arco de 180° com gradiente de cor (frio→quente) e um ponteiro/ponto na
 * posição da leitura — usado pra temperatura. */
export function TemperaturaGauge({ valor, sensacao, min = -5, max = 45 }: { valor: number; sensacao?: number; min?: number; max?: number }) {
  const R = 42;
  const CX = 50;
  const CY = 50;
  const ang = Math.PI - fracao(valor, min, max) * Math.PI; // 180°(esq/frio) -> 0°(dir/quente)
  const px = CX + R * Math.cos(ang);
  const py = CY - R * Math.sin(ang);
  const id = "tempGrad";
  return (
    <Card titulo="Temperatura" rodape={sensacao !== undefined ? `Sensação ${sensacao.toFixed(1)}°` : undefined}>
      <div className="relative w-full max-w-[160px]">
        <svg viewBox="0 0 100 62" className="w-full">
          <defs>
            <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="50%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
          <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} stroke={`url(#${id})`} strokeWidth={8} fill="none" strokeLinecap="round" />
          <circle cx={px} cy={py} r={5} fill="white" stroke="#111827" strokeWidth={2} />
        </svg>
        <span className="absolute inset-x-0 bottom-1 text-center text-2xl font-bold text-gray-900">{valor.toFixed(1)}°C</span>
      </div>
    </Card>
  );
}

/** Anel preenchido proporcionalmente — usado pra umidade (0-100%, escala
 * fixa e natural). */
export function UmidadeGauge({ valor, orvalho }: { valor: number; orvalho?: number }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const f = fracao(valor, 0, 100);
  return (
    <Card titulo="Umidade" rodape={orvalho !== undefined ? `Orvalho ${orvalho.toFixed(1)}°` : undefined}>
      <div className="relative w-full max-w-[120px]">
        <svg viewBox="0 0 100 100" className="w-full -rotate-90">
          <circle cx={50} cy={50} r={R} stroke="#e5e7eb" strokeWidth={10} fill="none" />
          <circle
            cx={50}
            cy={50}
            r={R}
            stroke="#0ea5e9"
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - f)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-900">{Math.round(valor)}%</span>
      </div>
    </Card>
  );
}

/** Bússola com seta apontando a direção do vento — comprimento/opacidade
 * da seta não representam nada (só a direção importa), velocidade e
 * rajada vêm como texto embaixo, igual ao card do Wunderground. */
export function VentoGauge({
  direcaoGraus,
  velocidadeKmh,
  rajadaKmh,
}: {
  direcaoGraus?: number;
  velocidadeKmh: number;
  rajadaKmh?: number;
}) {
  const pontos = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const ponto = direcaoGraus !== undefined ? pontos[Math.round(direcaoGraus / 45) % 8] : null;
  return (
    <Card titulo="Vento" rodape={rajadaKmh !== undefined ? `Rajada ${rajadaKmh.toFixed(1)} km/h` : undefined}>
      <svg viewBox="0 0 100 100" className="w-full max-w-[120px]">
        <circle cx={50} cy={50} r={42} stroke="#e5e7eb" strokeWidth={2} fill="none" />
        {[0, 90, 180, 270].map((a) => (
          <text
            key={a}
            x={50 + 34 * Math.sin((a * Math.PI) / 180)}
            y={50 - 34 * Math.cos((a * Math.PI) / 180) + 3}
            textAnchor="middle"
            className="fill-gray-400 text-[9px] font-medium"
          >
            {["N", "L", "S", "O"][a / 90]}
          </text>
        ))}
        {direcaoGraus !== undefined && (
          <g transform={`rotate(${direcaoGraus} 50 50)`}>
            <path d="M50 14 L58 46 L50 38 L42 46 Z" fill="#0369a1" />
          </g>
        )}
      </svg>
      <span className="-mt-2 text-2xl font-bold text-gray-900">
        {velocidadeKmh.toFixed(1)} <span className="text-sm font-normal text-gray-500">km/h</span>
      </span>
      {ponto && <span className="text-xs text-gray-500">{ponto}</span>}
    </Card>
  );
}

/** Mostrador tipo manômetro (arco quase completo) — usado pra pressão. */
export function PressaoGauge({ valor, min = 970, max = 1040 }: { valor: number; min?: number; max?: number }) {
  const R = 42;
  const CX = 50;
  const CY = 55;
  const inicio = 200; // graus, ponteiro varre de 200° a -20° (arco de 220°)
  const fim = -20;
  const ang = ((inicio - fracao(valor, min, max) * (inicio - fim)) * Math.PI) / 180;
  const px = CX + (R - 8) * Math.cos(ang);
  const py = CY - (R - 8) * Math.sin(ang);
  const arco = (a0: number, a1: number) => {
    const p0 = [CX + R * Math.cos((a0 * Math.PI) / 180), CY - R * Math.sin((a0 * Math.PI) / 180)];
    const p1 = [CX + R * Math.cos((a1 * Math.PI) / 180), CY - R * Math.sin((a1 * Math.PI) / 180)];
    return `M ${p0[0]} ${p0[1]} A ${R} ${R} 0 0 0 ${p1[0]} ${p1[1]}`;
  };
  return (
    <Card titulo="Pressão">
      <svg viewBox="0 0 100 68" className="w-full max-w-[150px]">
        <path d={arco(inicio, fim)} stroke="#e5e7eb" strokeWidth={7} fill="none" strokeLinecap="round" />
        <line x1={CX} y1={CY} x2={px} y2={py} stroke="#111827" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={3} fill="#111827" />
      </svg>
      <span className="-mt-1 text-2xl font-bold text-gray-900">{valor.toFixed(1)}</span>
      <span className="text-xs text-gray-500">hPa</span>
    </Card>
  );
}

/** Triângulo com faixas de cor do índice UV oficial (0-2 verde, 3-5
 * amarelo, 6-7 laranja, 8-10 vermelho, 11+ roxo) e um marcador na leitura. */
export function UvGauge({ valor }: { valor: number }) {
  const FAIXAS: [number, number, string][] = [
    [0, 2, "#22c55e"],
    [3, 5, "#eab308"],
    [6, 7, "#f97316"],
    [8, 10, "#ef4444"],
    [11, 14, "#a855f7"],
  ];
  const max = 14;
  const larguraTotal = 96;
  let x = 2;
  const f = fracao(valor, 0, max);
  return (
    <Card titulo="Índice UV">
      <svg viewBox="0 0 100 40" className="w-full max-w-[140px]">
        {FAIXAS.map(([a, b, cor]) => {
          const w = ((b - a + 1) / max) * larguraTotal;
          const rect = (
            <rect key={a} x={x} y={14} width={w} height={10} fill={cor} rx={2} />
          );
          x += w;
          return rect;
        })}
        <polygon points={`${2 + f * larguraTotal - 5},8 ${2 + f * larguraTotal + 5},8 ${2 + f * larguraTotal},16`} fill="#111827" />
      </svg>
      <span className="mt-1 text-2xl font-bold text-gray-900">{valor.toFixed(0)}</span>
      <span className="text-xs text-gray-500">
        {valor <= 2 ? "Baixo" : valor <= 5 ? "Moderado" : valor <= 7 ? "Alto" : valor <= 10 ? "Muito alto" : "Extremo"}
      </span>
    </Card>
  );
}

/** Círculo com brilho proporcional — usado pra radiação solar. */
export function RadiacaoGauge({ valor, max = 1200 }: { valor: number; max?: number }) {
  const f = fracao(valor, 0, max);
  const raio = 14 + f * 26;
  return (
    <Card titulo="Radiação">
      <svg viewBox="0 0 100 80" className="w-full max-w-[140px]">
        <circle cx={50} cy={40} r={40} fill="#fef3c7" opacity={0.4} />
        <circle cx={50} cy={40} r={raio} fill="#f59e0b" opacity={0.5 + f * 0.5} />
      </svg>
      <span className="-mt-8 text-2xl font-bold text-gray-900">{Math.round(valor)}</span>
      <span className="text-xs text-gray-500">W/m²</span>
    </Card>
  );
}

/** Cilindro parcialmente preenchido — usado pra chuva (leitura mais
 * recente, não acumulado; os acumulados de 4h/24h/7d ficam nos gráficos
 * abaixo, ver AccumulationChart). */
export function ChuvaGauge({ valor, max = 20 }: { valor: number; max?: number }) {
  const f = fracao(valor, 0, max);
  const altoTotal = 50;
  const altoPreenchido = f * altoTotal;
  return (
    <Card titulo="Chuva (últ. leitura)">
      <svg viewBox="0 0 60 70" className="w-full max-w-[90px]">
        <rect x={15} y={10} width={30} height={altoTotal} rx={4} fill="none" stroke="#94a3b8" strokeWidth={2} />
        <rect
          x={16}
          y={10 + (altoTotal - altoPreenchido)}
          width={28}
          height={Math.max(altoPreenchido - 1, 0)}
          rx={2}
          fill="#38bdf8"
        />
      </svg>
      <span className="-mt-2 text-2xl font-bold text-gray-900">{valor.toFixed(1)}</span>
      <span className="text-xs text-gray-500">mm</span>
    </Card>
  );
}

/** Card simples (sem gauge dedicado) — usado pra nível de rio/maré, que
 * não têm uma faixa "natural" fixa pra desenhar um mostrador com sentido. */
export function NumeroGrandeCard({ titulo, valor, unidade }: { titulo: string; valor: number; unidade: string }) {
  return (
    <Card titulo={titulo}>
      <span className="text-3xl font-bold text-gray-900">{valor.toFixed(2)}</span>
      <span className="text-xs text-gray-500">{unidade}</span>
    </Card>
  );
}
