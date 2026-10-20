"use client";

import { Pause, Play, StepBack, StepForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { fetchParametrosVime, fetchQuadrosVime, fetchRodadasVime, AREA_PADRAO_VIME, AREAS_VIME, ModeloVime, Opcao as OpcaoInmet, QuadroVime } from "@/lib/inmet";
import {
  areaPadrao,
  areasDaFonte,
  ehInmet,
  faixaFonte,
  FONTES,
  fonteDe,
  FonteId,
  produtoPadrao,
  produtosDaFonte,
  Rodada,
  rodadasCptec,
  rodadasMarinha,
  rotuloValidade,
  urlQuadro,
} from "@/lib/previsaoNumerica";
import { useMedia } from "@/lib/useMedia";

const HORA = 3600000;
const MS_ANIMACAO = 900;
const MAX_QUADROS = 3;
const campo = "rounded border border-gray-300 bg-white px-2 py-1.5 text-sm";
const FONTES_INICIAIS: FonteId[] = ["monan", "marinha", "wrf"];

/** Cache em memória das séries do VIME (cada uma pesa ~4 MB). */
const cacheVime = new Map<string, QuadroVime[]>();
const modeloVime = (f: FonteId): ModeloVime => (f === "cosmo7" ? "COSMO7" : "COSMO2P8");

type Config = { fonte: FonteId; produto: string; area: string };
function configInicial(fonte: FonteId): Config {
  if (ehInmet(fonte)) return { fonte, produto: "", area: AREA_PADRAO_VIME[modeloVime(fonte)] };
  const lista = produtosDaFonte(fonte) ?? [];
  const produto = produtoPadrao(lista);
  return { fonte, produto, area: areaPadrao(fonte, areasDaFonte(fonte, lista.find((p) => p.id === produto))) };
}

// ---------------------------------------------------------------- um quadro (fonte, produto, área, rodada e hora próprios)
function Quadro({ idx, fonteInicial, sync, vtSync, onVtSync }: { idx: number; fonteInicial: FonteId; sync: boolean; vtSync: number | null; onVtSync: (vt: number) => void }) {
  const [cfg, setCfg] = useState<Config>(() => configInicial(fonteInicial));
  const { fonte, produto, area } = cfg;
  const inmet = ehInmet(fonte);
  const [paramsInmet, setParamsInmet] = useState<OpcaoInmet[]>([]);
  const [rodadas, setRodadas] = useState<Rodada[]>([]);
  const [rodadaId, setRodadaId] = useState<string | null>(null);
  const [quadros, setQuadros] = useState<QuadroVime[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState<Record<string, number>>({});
  const [vtLocal, setVtLocal] = useState<number | null>(null);
  const [tocando, setTocando] = useState(false);
  const [agora] = useState(() => Date.now());

  const listaProdutos = produtosDaFonte(fonte);
  const produtoCat = listaProdutos?.find((p) => p.id === produto);
  const areas: OpcaoInmet[] = inmet ? AREAS_VIME[modeloVime(fonte)].map((a) => ({ sigla: a.sigla, nome: a.nome })) : areasDaFonte(fonte, produtoCat).map((a) => ({ sigla: a.id, nome: a.rotulo }));

  const trocarFonte = (f: FonteId) => {
    setTocando(false);
    setFalhou(null);
    setCfg(configInicial(f));
  };
  const trocarProduto = (p: string) => {
    setTocando(false);
    setFalhou(null);
    setCfg((c) => {
      if (inmet) return { ...c, produto: p };
      const cat = listaProdutos?.find((x) => x.id === p);
      const ar = areasDaFonte(c.fonte, cat);
      return { ...c, produto: p, area: ar.some((a) => a.id === c.area) ? c.area : areaPadrao(c.fonte, ar) };
    });
  };
  const trocarArea = (a: string) => {
    setTocando(false);
    setFalhou(null);
    setCfg((c) => ({ ...c, area: a, produto: inmet ? "" : c.produto }));
  };

  // INMET: os produtos dependem da área
  useEffect(() => {
    if (!inmet) return;
    let cancelado = false;
    Promise.resolve().then(() => {
      if (cancelado) return;
      setCarregando(true);
      setMsg(null);
      setParamsInmet([]);
    });
    fetchParametrosVime(modeloVime(fonte), area)
      .then((l) => {
        if (cancelado) return;
        setParamsInmet(l);
        setCfg((c) => (c.fonte !== fonte || c.area !== area ? c : l.some((x) => x.sigla === c.produto) ? c : { ...c, produto: (l.find((x) => x.sigla === "Vento10m") ?? l[0])?.sigla ?? "" }));
        if (!l.length) {
          setMsg("Sem produtos nesta área.");
          setCarregando(false);
        }
      })
      .catch(() => {
        if (cancelado) return;
        setMsg("Não foi possível listar os produtos do INMET.");
        setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [inmet, fonte, area]);

  // rodadas disponíveis
  useEffect(() => {
    if (inmet && !produto) return;
    let cancelado = false;
    Promise.resolve().then(async () => {
      if (cancelado) return;
      setCarregando(true);
      setMsg(null);
      setRodadas([]);
      try {
        let lista: Rodada[];
        if (inmet) {
          const l = await fetchRodadasVime(modeloVime(fonte), area, produto);
          lista = l.slice(0, 6).map((r) => {
            const [d, h] = r.sigla.split("H");
            const [a, m, dd] = d.split("-").map(Number);
            return { id: r.sigla, rotulo: r.nome, runMs: Date.UTC(a, m - 1, dd, Number(h.split(":")[0])) };
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
    const modelo = modeloVime(fonte);
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

  // validades que este quadro tem (cada fonte tem o seu passo)
  const validades = useMemo(() => {
    if (!rodada) return [] as number[];
    if (inmet) return quadros.map((q) => rodada.runMs + q.validade * HORA);
    const f = faixaFonte(fonte, rodada);
    const out: number[] = [];
    for (let t = f.iniMs; t <= f.fimMs; t += f.passoH * HORA) out.push(t);
    return out;
  }, [rodada, inmet, quadros, fonte]);

  const alvo = (sync && vtSync !== null ? vtSync : vtLocal) ?? agora;
  const iVt = validades.length ? validades.reduce((m, t, i) => (Math.abs(t - alvo) < Math.abs(validades[m] - alvo) ? i : m), 0) : -1;
  const vt = iVt >= 0 ? validades[iVt] : null;
  const irPara = (i: number) => {
    const t = validades[Math.min(Math.max(i, 0), validades.length - 1)];
    if (t === undefined) return;
    setVtLocal(t);
    if (sync) onVtSync(t);
  };

  // animação própria do quadro (com a sincronia ligada, os outros acompanham)
  useEffect(() => {
    if (!tocando || validades.length < 2) return;
    const t = setInterval(() => {
      const atual = (sync && vtSync !== null ? vtSync : vtLocal) ?? agora;
      const i = validades.findIndex((v) => v > atual);
      const prox = validades[i < 0 ? 0 : i];
      setVtLocal(prox);
      if (sync) onVtSync(prox);
    }, MS_ANIMACAO);
    return () => clearInterval(t);
  }, [tocando, validades, sync, vtSync, vtLocal, agora, onVtSync]);

  // imagem da validade atual
  let src: string | null = null;
  if (vt !== null && rodada) {
    if (inmet) src = quadros.find((q) => rodada.runMs + q.validade * HORA === vt)?.base64 ?? null;
    else src = urlQuadro(fonte, produto, area, rodada, vt);
  }

  // pré-carrega os próximos quadros (só fontes de imagem por endereço)
  useEffect(() => {
    if (inmet || !rodada || iVt < 0) return;
    for (let k = 1; k <= 2; k++) {
      const t = validades[iVt + k];
      const u = t !== undefined ? urlQuadro(fonte, produto, area, rodada, t) : null;
      if (u) {
        const i = new Image();
        i.src = u;
      }
    }
  }, [inmet, fonte, produto, area, rodada, iVt, validades]);

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
  const rotuloProduto = inmet ? (paramsInmet.find((p) => p.sigla === produto)?.nome ?? produto) : (produtoCat?.rotulo ?? produto);
  const sel = `${campo} min-w-0 !py-1 text-xs`;

  return (
    <figure className="flex min-w-0 flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
      <figcaption className="grid grid-cols-2 gap-1.5 border-b border-gray-100 p-2 text-xs">
        <select aria-label={`Fonte do quadro ${idx + 1}`} value={fonte} onChange={(e) => trocarFonte(e.target.value as FonteId)} className={`${sel} font-semibold`}>
          {(["CPTEC", "Marinha", "INMET"] as const).map((g) => (
            <optgroup key={g} label={g}>
              {FONTES.filter((f) => f.grupo === g).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select aria-label="Rodada" value={rodadaId ?? ""} onChange={(e) => setRodadaId(e.target.value)} className={sel} disabled={!rodadas.length}>
          {rodadas.map((r) => (
            <option key={r.id} value={r.id}>
              Rodada {r.rotulo}
            </option>
          ))}
        </select>
        <select aria-label="Produto" value={produto} onChange={(e) => trocarProduto(e.target.value)} className={`${sel} col-span-2`} disabled={inmet ? !paramsInmet.length : false}>
          {inmet
            ? paramsInmet.map((p) => (
                <option key={p.sigla} value={p.sigla}>
                  {p.nome}
                </option>
              ))
            : (listaProdutos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
        </select>
        <select aria-label="Área" value={area} onChange={(e) => trocarArea(e.target.value)} className={sel}>
          {areas.map((a) => (
            <option key={a.sigla} value={a.sigla}>
              {a.nome}
            </option>
          ))}
        </select>
        <div className="flex items-center justify-end gap-2 text-[11px] text-gray-500">
          <span>{nomeFonte.grupo}</span>
          {src && !inmet && (
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              abrir
            </a>
          )}
        </div>
      </figcaption>

      <div className="flex min-h-[12rem] items-center justify-center p-1">
        {carregando ? (
          <p className="p-6 text-center text-sm text-gray-400">{inmet ? "Carregando série do INMET (até ~4 MB)…" : "Carregando…"}</p>
        ) : msg ? (
          <p className="p-6 text-center text-sm text-gray-500">{msg}</p>
        ) : !src ? (
          <p className="p-6 text-center text-sm text-gray-500">Sem quadro para esta hora nesta rodada.</p>
        ) : falhou === chaveFalha ? (
          <p className="p-6 text-center text-sm text-gray-500">Imagem indisponível nesta fonte/horário.</p>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${src.slice(0, 200)}#${n503}`} src={srcTentativa ?? src} alt={`${nomeFonte.rotulo} — ${rotuloProduto}`} className="h-auto max-h-[calc(100dvh-16rem)] w-full object-contain" onError={aoFalhar} />
        )}
      </div>

      {/* controle de hora deste quadro */}
      <div className="flex items-center gap-1.5 border-t border-gray-100 p-2 text-xs">
        <button type="button" aria-label="Hora anterior" onClick={() => { setTocando(false); irPara(iVt - 1); }} disabled={iVt <= 0} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40">
          <StepBack size={14} />
        </button>
        <button
          type="button"
          onClick={() => setTocando((t) => !t)}
          disabled={validades.length < 2}
          aria-label={tocando ? "Parar" : "Animar"}
          className={`rounded p-1.5 text-white disabled:opacity-40 ${tocando ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {tocando ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" aria-label="Próxima hora" onClick={() => { setTocando(false); irPara(iVt + 1); }} disabled={iVt < 0 || iVt >= validades.length - 1} className="rounded bg-gray-100 p-1.5 hover:bg-gray-200 disabled:opacity-40">
          <StepForward size={14} />
        </button>
        <input type="range" min={0} max={Math.max(validades.length - 1, 0)} value={Math.max(iVt, 0)} onChange={(e) => { setTocando(false); irPara(Number(e.target.value)); }} className="min-w-0 flex-1" aria-label="Hora de validade" disabled={validades.length < 2} />
        <span className="w-24 shrink-0 text-right font-semibold text-gray-800">{vt !== null ? rotuloValidade(vt) : "—"}</span>
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------- painel
/** Sub-aba "Previsão numérica": até 3 quadros, cada um com a SUA fonte, produto, área, rodada e hora (dá para comparar, por
 * exemplo, COSMO 2,8 km × COSMO 7 km, ou duas rodadas do mesmo modelo). "Sincronizar horas" faz os quadros andarem juntos. */
export default function PrevisaoNumericaPanel() {
  const [n, setN] = useState(2);
  const [ativo, setAtivo] = useState(0); // celular: um quadro por vez
  const [sync, setSync] = useState(false);
  const [vtSync, setVtSync] = useState<number | null>(null);
  const largo = useMedia("(min-width: 768px)");
  const colunas = n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  const nAtivo = Math.min(ativo, n - 1);

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Previsão numérica</span>
        <span className="text-xs text-gray-500"> · cada quadro escolhe a sua fonte, produto, área, rodada e hora</span>
      </h2>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Número de quadros">
          {Array.from({ length: MAX_QUADROS }, (_, i) => i + 1).map((k) => (
            <button key={k} type="button" onClick={() => setN(k)} className={`px-3 py-1.5 font-medium ${n === k ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`} title={`${k} quadro${k > 1 ? "s" : ""}`}>
              {k}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">quadro{n > 1 ? "s" : ""}</span>
        {n > 1 && (
          <label className="flex cursor-pointer items-center gap-1.5 rounded bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200">
            <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />
            Sincronizar horas
          </label>
        )}
      </div>

      {!largo && n > 1 && (
        <div className="mb-2 flex overflow-hidden rounded border border-gray-300" role="tablist" aria-label="Quadros">
          {Array.from({ length: n }, (_, i) => (
            <button key={i} type="button" role="tab" aria-selected={nAtivo === i} onClick={() => setAtivo(i)} className={`flex-1 px-2 py-1.5 text-sm font-medium ${nAtivo === i ? "bg-blue-600 text-white" : "bg-white text-gray-700"}`}>
              Quadro {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className={`grid gap-2 ${colunas}`}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className={!largo && i !== nAtivo ? "hidden" : ""}>
            <Quadro idx={i} fonteInicial={FONTES_INICIAIS[i]} sync={sync} vtSync={vtSync} onVtSync={setVtSync} />
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        Fontes: CPTEC/INPE (MONAN, WRF, BRAMS, BAM, Wwatch), Marinha do Brasil — SMM/CHM (ICON-LAM, ondas, HYCOM) e INMET (COSMO 2,8 km e 7 km, VIME). A data das rodadas da Marinha é inferida pelo horário de
        publicação das pastas. As séries do INMET (~4 MB cada) só carregam quando escolhidas. Para sondagem e instabilidade observada veja a aba Sondagem.
      </p>
    </div>
  );
}
