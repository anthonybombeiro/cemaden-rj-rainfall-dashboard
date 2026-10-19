"use client";

import { Pause, Play, StepBack, StepForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchQuadrosVime, fetchRodadasVime, ModeloVime, QuadroVime } from "@/lib/inmet";
import {
  areaDaFonte,
  ehInmet,
  faixaFonte,
  FONTES,
  fonteDe,
  FonteId,
  REGIOES,
  RegiaoId,
  Rodada,
  rodadasCptec,
  rodadasMarinha,
  rotuloValidade,
  TEMAS,
  urlQuadro,
  Variante,
} from "@/lib/previsaoNumerica";

const HORA = 3600000;
const PASSO_MS = 3 * HORA;
const MS_ANIMACAO = 900;
const campo = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";

type Info = { iniMs: number; fimMs: number } | null;

/** Cache em memória das séries do VIME (cada uma pesa ~4 MB). */
const cacheVime = new Map<string, QuadroVime[]>();

function fontesDaVariante(v: Variante): FonteId[] {
  return FONTES.map((f) => f.id).filter((id) => v.produtos[id]);
}

/** Escolhe as fontes dos quadros: mantém as atuais que existem na variante e completa com as de maior prioridade
 * (as do INMET só entram se não houver outra, porque cada série pesa ~4 MB). */
function ajustarFontes(v: Variante, atuais: FonteId[]): FonteId[] {
  const disp = fontesDaVariante(v);
  const leves = disp.filter((f) => !ehInmet(f));
  const ordem = [...leves, ...disp.filter((f) => ehInmet(f))];
  const out: FonteId[] = [];
  for (const f of atuais) if (disp.includes(f) && !out.includes(f)) out.push(f);
  for (const f of ordem) if (out.length < 4 && !out.includes(f)) out.push(f);
  while (out.length < 4) out.push(ordem[0]);
  return out.slice(0, 4);
}

// ---------------------------------------------------------------- um quadro
function Quadro({
  idx,
  fonte,
  variante,
  regiao,
  vt,
  disponiveis,
  onFonte,
  onInfo,
}: {
  idx: number;
  fonte: FonteId;
  variante: Variante;
  regiao: RegiaoId;
  vt: number | null;
  disponiveis: FonteId[];
  onFonte: (f: FonteId) => void;
  onInfo: (idx: number, info: Info) => void;
}) {
  const produto = variante.produtos[fonte] as string;
  const { area, rotulo: rotuloArea, aviso } = areaDaFonte(fonte, produto, regiao);
  const inmet = ehInmet(fonte);
  const [rodadas, setRodadas] = useState<Rodada[]>([]);
  const [rodadaId, setRodadaId] = useState<string | null>(null);
  const [quadros, setQuadros] = useState<QuadroVime[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState<Record<string, number>>({});

  // rodadas disponíveis
  useEffect(() => {
    let cancelado = false;
    Promise.resolve().then(async () => {
      if (cancelado) return;
      setCarregando(true);
      setMsg(null);
      setRodadas([]);
      try {
        let lista: Rodada[];
        if (inmet) {
          const l = await fetchRodadasVime(fonte === "cosmo7" ? "COSMO7" : "COSMO2P8", area, produto);
          lista = l.slice(0, 6).map((r) => {
            const [d, h] = r.sigla.split("H");
            const [a, m, dd] = d.split("-").map(Number);
            const runMs = Date.UTC(a, m - 1, dd, Number(h.split(":")[0]));
            return { id: r.sigla, rotulo: r.nome, runMs };
          });
        } else if (fonte === "marinha" || fonte === "marinha-ondas" || fonte === "marinha-oceano") {
          lista = rodadasMarinha(Date.now());
        } else {
          lista = await rodadasCptec(fonte);
        }
        if (cancelado) return;
        setRodadas(lista);
        setRodadaId(lista[0]?.id ?? null);
        if (!lista.length) setMsg("Nenhuma rodada disponível.");
        if (!inmet) setCarregando(false);
      } catch {
        if (!cancelado) {
          setMsg("Fonte indisponível no momento.");
          setCarregando(false);
        }
      }
    });
    return () => {
      cancelado = true;
    };
  }, [fonte, area, produto, inmet]);

  const rodada = rodadas.find((r) => r.id === rodadaId) ?? null;

  // séries do INMET (VIME): todos os quadros de uma vez
  useEffect(() => {
    if (!inmet || !rodada) return;
    const modelo: ModeloVime = fonte === "cosmo7" ? "COSMO7" : "COSMO2P8";
    const chave = `${modelo}|${area}|${produto}|${rodada.id}`;
    const pronto = cacheVime.get(chave);
    let cancelado = false;
    if (pronto) {
      Promise.resolve().then(() => {
        if (cancelado) return;
        setQuadros(pronto);
        setCarregando(false);
      });
      return () => {
        cancelado = true;
      };
    }
    Promise.resolve().then(() => !cancelado && setCarregando(true));
    fetchQuadrosVime(modelo, area, produto, rodada.id)
      .then((q) => {
        if (cancelado) return;
        const ord = [...q].sort((a, b) => a.validade - b.validade);
        cacheVime.set(chave, ord);
        setQuadros(ord);
        if (!ord.length) setMsg("Sem quadros para esta combinação.");
      })
      .catch(() => !cancelado && setMsg("Não foi possível carregar a série do INMET."))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [inmet, fonte, area, produto, rodada]);

  // faixa de validades que este quadro cobre
  const info: Info = useMemo(() => {
    if (!rodada) return null;
    if (inmet) {
      if (!quadros.length) return null;
      return { iniMs: rodada.runMs + quadros[0].validade * HORA, fimMs: rodada.runMs + quadros[quadros.length - 1].validade * HORA };
    }
    const f = faixaFonte(fonte, rodada);
    return { iniMs: f.iniMs, fimMs: f.fimMs };
  }, [rodada, inmet, quadros, fonte]);
  const iniMs = info?.iniMs;
  const fimMs = info?.fimMs;
  useEffect(() => {
    onInfo(idx, iniMs !== undefined && fimMs !== undefined ? { iniMs, fimMs } : null);
    return () => onInfo(idx, null);
  }, [idx, iniMs, fimMs, onInfo]);

  // imagem da validade atual
  let src: string | null = null;
  let aproximado = false;
  if (vt !== null && rodada) {
    if (inmet) {
      const h = (vt - rodada.runMs) / HORA;
      const exato = quadros.find((q) => q.validade === h);
      const antes = [...quadros].reverse().find((q) => q.validade <= h);
      const q = exato ?? antes;
      if (q && (exato || h - q.validade < 6)) {
        src = q.base64;
        aproximado = !exato;
      }
    } else {
      src = urlQuadro(fonte, produto, area, rodada, vt);
    }
  }

  // pré-carrega os próximos quadros (só fontes de imagem por endereço)
  useEffect(() => {
    if (inmet || !rodada || vt === null) return;
    for (let k = 1; k <= 2; k++) {
      const u = urlQuadro(fonte, produto, area, rodada, vt + k * PASSO_MS);
      if (u) {
        const i = new Image();
        i.src = u;
      }
    }
  }, [inmet, fonte, produto, area, rodada, vt]);

  const chaveFalha = src ?? "";
  // os servidores do CPTEC devolvem 503 de forma intermitente: até 3 novas tentativas com pausa crescente
  const n503 = tentativa[chaveFalha] ?? 0;
  const srcTentativa = src && !inmet && n503 > 0 ? `${src}${src.includes("?") ? "&" : "?"}retry=${n503}` : src;
  const aoFalhar = () => {
    if (inmet || n503 >= 3) {
      setFalhou(chaveFalha);
      return;
    }
    window.setTimeout(() => setTentativa((t) => ({ ...t, [chaveFalha]: (t[chaveFalha] ?? 0) + 1 })), 700 * (n503 + 1));
  };
  const nomeFonte = fonteDe(fonte);
  return (
    <figure className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
      <figcaption className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 p-2 text-xs">
        <select aria-label={`Fonte do quadro ${idx + 1}`} value={fonte} onChange={(e) => onFonte(e.target.value as FonteId)} className={`${campo} !py-1 text-xs font-semibold`}>
          {(["CPTEC", "Marinha", "INMET"] as const).map((g) => (
            <optgroup key={g} label={g}>
              {disponiveis
                .filter((f) => fonteDe(f).grupo === g)
                .map((f) => (
                  <option key={f} value={f}>
                    {fonteDe(f).rotulo}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <select aria-label="Rodada" value={rodadaId ?? ""} onChange={(e) => setRodadaId(e.target.value)} className={`${campo} !py-1 text-xs`} disabled={!rodadas.length}>
          {rodadas.map((r) => (
            <option key={r.id} value={r.id}>
              Rodada {r.rotulo}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-gray-500">
          {nomeFonte.grupo} · {rotuloArea}
        </span>
        {aviso && <span className="text-[11px] text-amber-700">{aviso}</span>}
        {src && !inmet && (
          <a href={src} target="_blank" rel="noopener noreferrer" className="ml-auto text-[11px] text-blue-600 hover:underline">
            abrir
          </a>
        )}
      </figcaption>
      <div className="flex min-h-[12rem] items-center justify-center p-1">
        {carregando ? (
          <p className="p-6 text-center text-sm text-gray-400">{inmet ? "Carregando série do INMET (até ~4 MB)…" : "Carregando…"}</p>
        ) : msg ? (
          <p className="p-6 text-center text-sm text-gray-500">{msg}</p>
        ) : !src ? (
          <p className="p-6 text-center text-sm text-gray-500">
            Sem quadro para esta hora nesta rodada
            {info && <span className="block text-[11px] text-gray-400">cobre de {rotuloValidade(info.iniMs)} a {rotuloValidade(info.fimMs)}</span>}
          </p>
        ) : falhou === chaveFalha ? (
          <p className="p-6 text-center text-sm text-gray-500">Imagem indisponível nesta fonte/horário.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${src.slice(0, 200)}#${n503}`} src={srcTentativa ?? src} alt={`${nomeFonte.rotulo} — ${variante.rotulo}`} className="h-auto w-full object-contain" onError={aoFalhar} />
        )}
      </div>
      {aproximado && <p className="px-2 pb-1 text-[11px] text-amber-700">Quadro mais próximo anterior (esta fonte não tem exatamente esta hora).</p>}
    </figure>
  );
}

// ---------------------------------------------------------------- painel
/** Sub-aba "Previsão numérica": modelos da Marinha, INMET e CPTEC por tema, com 1 a 4 quadros alinhados pela validade. */
export default function PrevisaoNumericaPanel() {
  const [temaId, setTemaId] = useState("vento");
  const tema = TEMAS.find((t) => t.id === temaId) ?? TEMAS[0];
  const [varId, setVarId] = useState(tema.variantes[0].id);
  const variante = tema.variantes.find((v) => v.id === varId) ?? tema.variantes[0];
  const [regiao, setRegiao] = useState<RegiaoId>("sud");
  const [n, setN] = useState(2);
  const [fontes, setFontes] = useState<FonteId[]>(() => ajustarFontes(TEMAS[0].variantes[0], []));
  const [infos, setInfos] = useState<Record<number, Info>>({});
  const [agora] = useState(() => Date.now());
  const [vtPref, setVtPref] = useState<number | null>(null);
  const [tocando, setTocando] = useState(false);

  const trocarTema = (id: string) => {
    const t = TEMAS.find((x) => x.id === id) ?? TEMAS[0];
    setTemaId(t.id);
    setVarId(t.variantes[0].id);
    setFontes((f) => ajustarFontes(t.variantes[0], f));
  };
  const trocarVariante = (id: string) => {
    const v = tema.variantes.find((x) => x.id === id) ?? tema.variantes[0];
    setVarId(v.id);
    setFontes((f) => ajustarFontes(v, f));
  };
  const disponiveis = fontesDaVariante(variante);
  const fontesAtivas = fontes.slice(0, n).map((f) => (disponiveis.includes(f) ? f : disponiveis[0]));

  const onInfo = useMemo(
    () => (idx: number, info: Info) =>
      setInfos((prev) => {
        const a = prev[idx];
        if ((a === null || a === undefined) && (info === null || info === undefined)) return prev;
        if (a && info && a.iniMs === info.iniMs && a.fimMs === info.fimMs) return prev;
        return { ...prev, [idx]: info };
      }),
    [],
  );

  // linha do tempo comum (de 3 em 3 h) às rodadas dos quadros visíveis
  const { grade, sobreposto } = useMemo(() => {
    const ativos = Array.from({ length: n }, (_, i) => infos[i]).filter((x): x is { iniMs: number; fimMs: number } => !!x);
    if (!ativos.length) return { grade: [] as number[], sobreposto: true };
    let ini = Math.max(...ativos.map((a) => a.iniMs));
    let fim = Math.min(...ativos.map((a) => a.fimMs));
    let ok = true;
    if (ini > fim) {
      ok = false;
      ini = Math.min(...ativos.map((a) => a.iniMs));
      fim = Math.max(...ativos.map((a) => a.fimMs));
    }
    const g: number[] = [];
    for (let t = Math.ceil(ini / PASSO_MS) * PASSO_MS; t <= fim; t += PASSO_MS) g.push(t);
    return { grade: g, sobreposto: ok };
  }, [infos, n]);

  // validade atual = a escolhida pelo usuário (ou a mais próxima de "agora") presa à grade
  const vt = useMemo(() => {
    if (!grade.length) return null;
    const alvo = vtPref ?? agora;
    return grade.reduce((melhor, t) => (Math.abs(t - alvo) < Math.abs(melhor - alvo) ? t : melhor), grade[0]);
  }, [grade, vtPref, agora]);
  const iVt = vt === null ? 0 : grade.indexOf(vt);

  const ir = (delta: number) => {
    if (!grade.length) return;
    const i = Math.min(Math.max(iVt + delta, 0), grade.length - 1);
    setVtPref(grade[i]);
  };

  // animação
  useEffect(() => {
    if (!tocando || grade.length < 2) return;
    const t = setInterval(() => {
      setVtPref((p) => {
        const atual = p ?? agora;
        const i = grade.findIndex((g) => g >= atual);
        return grade[(i + 1) % grade.length];
      });
    }, MS_ANIMACAO);
    return () => clearInterval(t);
  }, [tocando, grade, agora]);

  // setas do teclado
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && ["INPUT", "SELECT", "TEXTAREA"].includes(alvo.tagName) && (alvo as HTMLInputElement).type !== "range") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setTocando(false);
        ir(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setTocando(false);
        ir(1);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  const colunas = n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-1 md:grid-cols-2" : n === 3 ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-2";
  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Previsão numérica</span>
        <span className="text-xs text-gray-500"> · CPTEC, Marinha e INMET lado a lado, na mesma hora de validade</span>
      </h2>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm">
        <select aria-label="Tema" value={temaId} onChange={(e) => trocarTema(e.target.value)} className={campo}>
          {TEMAS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <select aria-label="Produto" value={varId} onChange={(e) => trocarVariante(e.target.value)} className={`${campo} max-w-[15rem] sm:max-w-none`}>
          {tema.variantes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
            </option>
          ))}
        </select>
        <select aria-label="Região" value={regiao} onChange={(e) => setRegiao(e.target.value as RegiaoId)} className={campo}>
          {REGIOES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rotulo}
            </option>
          ))}
        </select>
        <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Quadros">
          {[1, 2, 3, 4].map((k) => (
            <button key={k} type="button" onClick={() => setN(k)} className={`px-2.5 py-1.5 font-medium ${n === k ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`} title={`${k} quadro${k > 1 ? "s" : ""}`}>
              {k}
            </button>
          ))}
        </div>
        <span className="hidden text-xs text-gray-400 lg:inline">← → mudam a hora</span>
      </div>

      {/* controle de tempo único (fica visível ao rolar os quadros) */}
      <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white/95 p-2 text-xs shadow-sm backdrop-blur">
        <button type="button" aria-label="Hora anterior" onClick={() => { setTocando(false); ir(-1); }} disabled={iVt <= 0} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40">
          <StepBack size={15} />
        </button>
        <button
          type="button"
          onClick={() => setTocando((t) => !t)}
          disabled={grade.length < 2}
          className={`flex items-center gap-1 rounded px-2 py-1.5 font-medium disabled:opacity-40 ${tocando ? "bg-red-600 text-white hover:bg-red-700" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        >
          {tocando ? <Pause size={14} /> : <Play size={14} />}
          {tocando ? "Parar" : "Animar"}
        </button>
        <button type="button" aria-label="Próxima hora" onClick={() => { setTocando(false); ir(1); }} disabled={iVt >= grade.length - 1} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40">
          <StepForward size={15} />
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(grade.length - 1, 0)}
          value={iVt}
          onChange={(e) => {
            setTocando(false);
            setVtPref(grade[Number(e.target.value)]);
          }}
          className="min-w-0 flex-1"
          aria-label="Hora de validade"
          disabled={!grade.length}
        />
        <span className="w-28 shrink-0 text-right font-semibold text-gray-800">{vt !== null ? rotuloValidade(vt) : "—"}</span>
      </div>
      {!sobreposto && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-800">As rodadas escolhidas não têm horas em comum. Escolha rodadas mais próximas nos quadros.</p>}

      <div className={`grid gap-2 ${colunas}`}>
        {fontesAtivas.map((f, i) => (
          <Quadro
            key={`${i}-${f}-${varId}`}
            idx={i}
            fonte={f}
            variante={variante}
            regiao={regiao}
            vt={vt}
            disponiveis={disponiveis}
            onFonte={(nova) => setFontes((atual) => atual.map((x, k) => (k === i ? nova : x)))}
            onInfo={onInfo}
          />
        ))}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        Fontes: CPTEC/INPE (MONAN, WRF, BRAMS, BAM, Wwatch), Marinha do Brasil — SMM/CHM (ICON-LAM, ondas, HYCOM) e INMET (COSMO, VIME). A data das rodadas da Marinha é inferida pelo horário de
        publicação das pastas. As séries do INMET (~4 MB cada) só carregam quando escolhidas. Para sondagem e instabilidade observada veja a aba Sondagem.
      </p>
    </div>
  );
}
