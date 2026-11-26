"use client";

import L from "leaflet";
import { Download, Droplets } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON } from "react-leaflet";

import { fetchMapaCalorChuva, MapaCalorChuva, MapaCalorParams, nomeFonte, normalizeMunicipioName } from "@/lib/api";
import { GeoJsonFeatureCollection } from "@/lib/geo";

// Camada "Mapa de calor da chuva" da aba Mapa (24–25/11/2026): chuva acumulada por município (mediana das estações válidas) e por REDEC.
// Período: últimos 7/15/30 dias, mês cheio ou data específica; redes escolhidas; descarta as estações que não representam o período (fora do ar, sem retorno,
// atrasadas) e, opcionalmente, os valores espúrios. Os critérios estão em backend/core/mapa_calor_chuva.py. Renderiza DENTRO do MapContainer.

export const FAIXAS_CALOR = [
  { ate: 25, cor: "#f7fbff", rot: "0–25" },
  { ate: 50, cor: "#e1effa", rot: "25–50" },
  { ate: 75, cor: "#c6dbef", rot: "50–75" },
  { ate: 100, cor: "#9ecae1", rot: "75–100" },
  { ate: 125, cor: "#6baed6", rot: "100–125" },
  { ate: 150, cor: "#4292c6", rot: "125–150" },
  { ate: 200, cor: "#2171b5", rot: "150–200" },
  { ate: 250, cor: "#08519c", rot: "200–250" },
  { ate: 300, cor: "#6a3d9a", rot: "250–300" },
  { ate: Infinity, cor: "#4a1486", rot: "≥ 300" },
];
// Para 7 e 15 dias (e dia/semana) as faixas de 30 dias seriam quase todas claras: a escala acompanha o tamanho do período.
const corDe = (mm: number, escala: number) => FAIXAS_CALOR.find((f) => mm < f.ate * escala)?.cor ?? FAIXAS_CALOR[FAIXAS_CALOR.length - 1].cor;
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 });
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const ontem = () => new Date(Date.now() - 27 * 3600_000).toISOString().slice(0, 10);
const mesAtual = () => hoje().slice(0, 7);
const REDEC_NOME: Record<number, string> = { 1: "Capital", 2: "Baixada Fluminense", 3: "Metropolitana", 4: "Costa Verde", 5: "Sul I", 6: "Sul II", 7: "Serrana I", 8: "Serrana II", 9: "Baixada Litorânea", 10: "Norte", 11: "Noroeste" };

type Tipo = "dias" | "mes" | "data";

export default function CamadaCalorChuva({ municipioGeo }: { municipioGeo: GeoJsonFeatureCollection | null }) {
  const [tipo, setTipo] = useState<Tipo>("dias");
  const [dias, setDias] = useState<7 | 15 | 30>(30);
  const [mes, setMes] = useState(mesAtual());
  const [ini, setIni] = useState(ontem());
  const [fim, setFim] = useState("");
  const [fontesSel, setFontesSel] = useState<string[] | null>(null); // null = padrão (todas menos Wunderground)
  const [espurios, setEspurios] = useState(true);
  const [dados, setDados] = useState<MapaCalorChuva | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(() => typeof window !== "undefined" && window.innerWidth >= 640);
  const [verDescartadas, setVerDescartadas] = useState(false);
  const raizRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (raizRef.current) {
      L.DomEvent.disableScrollPropagation(raizRef.current);
      L.DomEvent.disableClickPropagation(raizRef.current);
    }
  }, [aberto]);

  const params = useMemo<MapaCalorParams>(
    () => ({
      ...(tipo === "dias" ? { dias } : tipo === "mes" ? { mes } : { ini, ...(fim ? { fim } : {}) }),
      ...(fontesSel ? { fontes: fontesSel } : {}),
      espurios,
    }),
    [tipo, dias, mes, ini, fim, fontesSel, espurios],
  );
  const paramsOk = tipo === "dias" || (tipo === "mes" ? /^\d{4}-\d{2}$/.test(mes) : /^\d{4}-\d{2}-\d{2}$/.test(ini));

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!paramsOk) return;
    let cancelado = false;
    setCarregando(true);
    const t = setTimeout(() => {
      fetchMapaCalorChuva(params)
        .then((d) => { if (!cancelado) { setDados(d); setErro(null); } })
        .catch((e) => { if (!cancelado) setErro(e instanceof Error ? e.message : "Erro ao carregar"); })
        .finally(() => { if (!cancelado) setCarregando(false); });
    }, 350);
    return () => { cancelado = true; clearTimeout(t); };
  }, [params, paramsOk]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Faixas proporcionais ao período (as de 30 dias valem para 30; 7 dias → escala 7/30 etc., com piso para não ficar tudo azul-escuro em 1 dia)
  const escala = dados ? Math.max(0.1, Math.min(3, dados.dias / 30)) : 1;
  const porMunicipio = useMemo(() => {
    const m = new Map<string, MapaCalorChuva["municipios"][number]>();
    for (const x of dados?.municipios ?? []) m.set(normalizeMunicipioName(x.municipio), x);
    return m;
  }, [dados]);

  const fontesAtivas = (slug: string, padrao: boolean) => (fontesSel ? fontesSel.includes(slug) : padrao);
  const alternarFonte = (slug: string) => {
    if (!dados) return;
    const atual = fontesSel ?? dados.fontes_disponiveis.filter((f) => f.padrao).map((f) => f.slug);
    const novo = atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug];
    setFontesSel(novo.length ? novo : atual); // pelo menos uma rede
  };

  const baixarCsv = () => {
    if (!dados) return;
    const linhas = [["Estação", "Município", "Rede", "Acumulado no período (mm)", "Motivo"]].concat(
      dados.descartadas.map((d) => [d.name, d.municipio || "(sem município)", nomeFonte(d.fonte), d.total == null ? "" : String(d.total).replace(".", ","), d.descartada]),
    );
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `estacoes-descartadas-${dados.inicio.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pill = (ativo: boolean) => `rounded-full px-2.5 py-0.5 text-xs font-semibold ${ativo ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`;

  return (
    <>
      {municipioGeo && dados && (
        <GeoJSON
          // key muda a cada resultado: o Leaflet não reestiliza sozinho
          key={`calor-${dados.gerado_em}-${dados.inicio}-${dados.fontes_usadas.join(",")}-${dados.espurios}`}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data={municipioGeo as any}
          style={(f) => {
            const m = porMunicipio.get(String(f?.properties?.nomeNormalizado ?? ""));
            return m
              ? { color: "#ffffff", weight: 0.8, fillColor: corDe(m.mediana_mm, escala), fillOpacity: 0.78 }
              : { color: "#9ca3af", weight: 0.8, fillColor: "#d1d5db", fillOpacity: 0.45, dashArray: "3 3" };
          }}
          onEachFeature={(f, layer) => {
            const nome = String(f.properties?.nome ?? "");
            const m = porMunicipio.get(String(f.properties?.nomeNormalizado ?? ""));
            layer.bindTooltip(
              m
                ? `<b>${nome}</b><br/>${fmt(m.mediana_mm)} mm (mediana) · ${m.n} estaç${m.n === 1 ? "ão" : "ões"}`
                : `<b>${nome}</b><br/>sem estação válida no período`,
              { sticky: true },
            );
            if (m) {
              layer.bindPopup(
                `<div style="font-size:13px"><b>${nome}</b> · REDEC ${m.redec ?? "—"}<br/>Mediana: <b>${fmt(m.mediana_mm)} mm</b><br/>Média: ${fmt(m.media_mm)} mm · mín. ${fmt(m.min_mm)} · máx. ${fmt(m.max_mm)}<br/>${m.n} estaç${m.n === 1 ? "ão válida" : "ões válidas"}${m.n === 1 ? " (indicação, não média)" : ""}</div>`,
              );
            }
          }}
        />
      )}
      <div ref={raizRef} className="absolute bottom-3 right-3 z-[1000] max-w-[calc(100vw-1.5rem)]">
        {aberto && (
          <div className="mb-2 max-h-[72vh] w-[19.5rem] max-w-full overflow-y-auto overscroll-contain rounded-md border border-gray-200 bg-white p-3 text-xs shadow-lg sm:w-80">
            <p className="mb-2 text-sm font-bold text-gray-800">Mapa de calor da chuva</p>

            <div className="mb-2 flex gap-1" role="group" aria-label="Tipo de período">
              {([["dias", "Últimos dias"], ["mes", "Mês cheio"], ["data", "Data"]] as const).map(([k, r]) => (
                <button key={k} type="button" onClick={() => setTipo(k)} className={pill(tipo === k)}>{r}</button>
              ))}
            </div>
            {tipo === "dias" && (
              <div className="mb-2 flex gap-1">
                {([7, 15, 30] as const).map((n) => (
                  <button key={n} type="button" onClick={() => setDias(n)} className={pill(dias === n)}>{n} dias</button>
                ))}
              </div>
            )}
            {tipo === "mes" && (
              <label className="mb-2 flex items-center gap-2 text-gray-600">
                Mês
                <input type="month" value={mes} max={mesAtual()} onChange={(e) => setMes(e.target.value)} className="rounded border border-gray-300 px-1.5 py-0.5" />
              </label>
            )}
            {tipo === "data" && (
              <div className="mb-2 space-y-1 text-gray-600">
                <label className="flex items-center gap-2">De <input type="date" value={ini} max={hoje()} onChange={(e) => setIni(e.target.value)} className="rounded border border-gray-300 px-1.5 py-0.5" /></label>
                <label className="flex items-center gap-2">Até <input type="date" value={fim} min={ini} max={hoje()} onChange={(e) => setFim(e.target.value)} className="rounded border border-gray-300 px-1.5 py-0.5" /> <span className="text-[10px] text-gray-400">(vazio = só o dia)</span></label>
              </div>
            )}

            <p className="mb-1 mt-2 font-semibold text-gray-700">Redes usadas como referência</p>
            <div className="mb-2 grid grid-cols-2 gap-x-2 gap-y-0.5">
              {(dados?.fontes_disponiveis ?? []).map((f) => (
                <label key={f.slug} className="flex items-center gap-1 text-gray-700">
                  <input type="checkbox" checked={fontesAtivas(f.slug, f.padrao)} onChange={() => alternarFonte(f.slug)} />
                  <span className="truncate" title={`${nomeFonte(f.slug)} · ${f.estacoes} estações com leitura no período`}>{nomeFonte(f.slug)} <span className="text-gray-400">({f.estacoes})</span></span>
                </label>
              ))}
              {!dados && <span className="col-span-2 text-gray-400">Carregando redes…</span>}
            </div>
            <label className="mb-2 flex items-start gap-1.5 text-gray-700">
              <input type="checkbox" className="mt-0.5" checked={espurios} onChange={(e) => setEspurios(e.target.checked)} />
              <span>Descartar valores espúrios <span className="text-gray-400">(leituras impossíveis e estações isoladas muito diferentes das vizinhas)</span></span>
            </label>

            {erro && <p className="mb-2 rounded bg-red-50 p-2 text-red-600">Não foi possível gerar o mapa ({erro}).</p>}
            {dados && (
              <div className="mb-2 rounded bg-gray-50 p-2 text-gray-600">
                <p className="font-semibold text-gray-800">{dados.rotulo.charAt(0).toUpperCase() + dados.rotulo.slice(1)}{carregando ? " · atualizando…" : ""}</p>
                <p>{dados.estacoes_usadas} de {dados.estacoes_total} estações usadas · {dados.estacoes_total - dados.estacoes_usadas} descartadas</p>
                <p className="text-[11px] text-gray-400">Fora do ar, sem retorno de dados, com muitas falhas ou atrasadas no período saem automaticamente.</p>
                <div className="mt-1 flex gap-2">
                  <button type="button" onClick={() => setVerDescartadas((v) => !v)} className="font-semibold text-blue-700 hover:underline">{verDescartadas ? "Ocultar descartadas" : "Ver descartadas"}</button>
                  <button type="button" onClick={baixarCsv} className="flex items-center gap-0.5 font-semibold text-blue-700 hover:underline"><Download size={11} /> CSV</button>
                </div>
              </div>
            )}
            {!dados && !erro && <p className="mb-2 text-gray-500">Calculando…</p>}
            {verDescartadas && dados && (
              <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto rounded border border-gray-100 p-1.5">
                {dados.descartadas.map((d) => (
                  <li key={d.id} className="leading-snug">
                    <b>{d.name}</b> <span className="text-gray-500">· {d.municipio || "sem município"} · {nomeFonte(d.fonte)}{d.total != null ? ` · ${fmt(d.total)} mm` : ""}</span>
                    <br /><span className="text-[11px] text-gray-400">{d.descartada}</span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mb-1 font-semibold text-gray-700">Acumulado no período (mm)</p>
            <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
              {FAIXAS_CALOR.map((f, i) => {
                const lim = (v: number) => fmt(Math.round(v * escala));
                const rot = i === 0 ? `0–${lim(f.ate)}` : f.ate === Infinity ? `≥ ${lim(FAIXAS_CALOR[i - 1].ate)}` : `${lim(FAIXAS_CALOR[i - 1].ate)}–${lim(f.ate)}`;
                return (
                  <span key={f.rot} className="flex items-center gap-1.5 text-gray-700">
                    <span className="inline-block h-3 w-4 rounded-sm border border-black/10" style={{ backgroundColor: f.cor }} /> {rot}
                  </span>
                );
              })}
              <span className="flex items-center gap-1.5 text-gray-500"><span className="inline-block h-3 w-4 rounded-sm border border-dashed border-gray-400 bg-gray-300/60" /> sem estação válida</span>
            </div>

            {dados && dados.redecs.length > 0 && (
              <>
                <p className="mb-1 mt-2 font-semibold text-gray-700">Mediana por REDEC</p>
                <ul className="space-y-0.5">
                  {[...dados.redecs].sort((a, b) => b.mediana_mm - a.mediana_mm).map((r) => (
                    <li key={r.redec} className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: corDe(r.mediana_mm, escala) }} />
                      <span className="flex-1 truncate text-gray-700">{r.redec} · {REDEC_NOME[r.redec] ?? r.regiao}</span>
                      <b className="tabular-nums text-gray-900">{fmt(r.mediana_mm)}</b>
                      <span className="w-10 text-right tabular-nums text-gray-400">{r.n} est.</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-2 border-t border-gray-100 pt-1.5 text-[11px] text-gray-400">Cada município = mediana das estações válidas. Municípios com 1 estação são indicação, não média. Horário de Brasília.</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-md hover:bg-gray-50"
        >
          <Droplets size={14} className="text-blue-600" />
          Chuva acumulada
          {dados && <span className="hidden text-xs font-normal text-gray-500 sm:inline">· {dados.rotulo}</span>}
          {carregando && <span className="text-xs text-gray-400">…</span>}
          <span className="text-xs text-gray-400">{aberto ? "▾" : "▴"}</span>
        </button>
      </div>
    </>
  );
}
