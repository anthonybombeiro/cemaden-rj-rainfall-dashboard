"use client";

import type { LatLngBoundsExpression, PathOptions } from "leaflet";
import { useEffect, useState } from "react";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { normalizeMunicipioName } from "@/lib/api";
import { COR_GRAVIDADE, corGravidade, INTENSIDADES, ItemRegiao, nomeRegiao } from "@/lib/informativo";
import { COR_PROBABILIDADE } from "@/lib/recomendacoes";

/** Mapa das REDECs coloridas pela chuva prevista do informativo vigente (mesmo padrão do mapa dos avisos de mau tempo).
 * Sem SSR (Leaflet precisa de `window`) — importar com `next/dynamic`. */

const BOUNDS: LatLngBoundsExpression = [[-23.5, -45.1], [-20.7, -40.9]];

/** Aviso meteorológico vigente no mapa: contorno laranja tracejado nas REDECs do aviso (sem região = todo o estado). */
export type AvisoNoMapa = { numero: number; ano: number; regioes: string[] };
/** Recomendação de alarme ativa no mapa: contorno do município na cor da probabilidade. */
export type RecomendacaoNoMapa = { municipio: string; numero: string; probabilidade: string; estagio: string };

export default function MapaVigente({ itens, avisos = [], recomendacoes = [] }: { itens: ItemRegiao[]; avisos?: AvisoNoMapa[]; recomendacoes?: RecomendacaoNoMapa[] }) {
  const [redecs, setRedecs] = useState<GeoJSON.FeatureCollection | null>(null);
  const [municipios, setMunicipios] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    let cancelado = false;
    fetch("/redecs.geojson").then((r) => r.json()).then((g) => { if (!cancelado) setRedecs(g); }).catch(() => undefined);
    return () => { cancelado = true; };
  }, []);
  useEffect(() => {
    if (!recomendacoes.length || municipios) return;
    let cancelado = false;
    fetch("/rj_municipios.geojson").then((r) => r.json()).then((g) => { if (!cancelado) setMunicipios(g); }).catch(() => undefined);
    return () => { cancelado = true; };
  }, [recomendacoes.length, municipios]);
  const avisoPorRegiao = new Map<string, string[]>(); // REDEC → números dos avisos
  const todoEstado = avisos.some((a) => a.regioes.length === 0);
  for (const a of avisos) for (const r of a.regioes) avisoPorRegiao.set(r, [...(avisoPorRegiao.get(r) ?? []), `${String(a.numero).padStart(2, "0")}/${a.ano}`]);
  const recPorMunicipio = new Map(recomendacoes.map((r) => [normalizeMunicipioName(r.municipio), r]));
  const por = new Map(itens.map((i) => [i.regiao, i]));
  return (
    <div className="relative">
      <MapContainer bounds={BOUNDS} className="h-72 w-full rounded-lg sm:h-96" scrollWheelZoom={false}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {redecs && (
          <GeoJSON
            key={itens.map((i) => `${i.regiao}${i.chuva_prevista}`).join("|")}
            data={redecs}
            style={(f) => {
              const it = por.get(String(f?.properties?.redec));
              const c = corGravidade(it?.chuva_prevista || it?.chuva_atual || "");
              return { color: "#334155", weight: 1.5, fillColor: c, fillOpacity: it?.chuva_prevista || it?.chuva_atual ? 0.55 : 0.12 } as PathOptions;
            }}
            onEachFeature={(f, layer) => {
              const it = por.get(String(f.properties?.redec));
              const rot = (c: string) => INTENSIDADES.find((i) => i.chave === c)?.rotulo ?? "—";
              layer.bindTooltip(`${nomeRegiao(String(f.properties?.redec))} · prevista: ${it?.chuva_prevista ? rot(it.chuva_prevista) : "sem informação"}${it?.raios ? " · raios" : ""}${it?.granizo ? " · granizo" : ""}`, { sticky: true });
            }}
          />
        )}
        {redecs && avisos.length > 0 && (
          <GeoJSON
            key={`aviso-${avisos.map((a) => a.numero).join(",")}`}
            data={redecs}
            filter={(f) => todoEstado || avisoPorRegiao.has(String(f.properties?.redec))}
            style={() => ({ color: "#ea580c", weight: 4, dashArray: "9 6", fill: false } as PathOptions)}
            onEachFeature={(f, layer) => {
              const nums = avisoPorRegiao.get(String(f.properties?.redec)) ?? avisos.filter((a) => a.regioes.length === 0).map((a) => `${String(a.numero).padStart(2, "0")}/${a.ano}`);
              layer.bindTooltip(`Aviso meteorológico nº ${nums.join(", ")} · ${nomeRegiao(String(f.properties?.redec))}`, { sticky: true });
            }}
          />
        )}
        {municipios && recomendacoes.length > 0 && (
          <GeoJSON
            key={`rec-${recomendacoes.map((r) => r.numero).join(",")}`}
            data={municipios}
            filter={(f) => recPorMunicipio.has(String(f.properties?.nomeNormalizado))}
            style={(f) => { const r = recPorMunicipio.get(String(f?.properties?.nomeNormalizado)); return { color: COR_PROBABILIDADE[r?.probabilidade ?? ""]?.barra ?? "#7c3aed", weight: 4, fillColor: COR_PROBABILIDADE[r?.probabilidade ?? ""]?.barra ?? "#7c3aed", fillOpacity: 0.25 } as PathOptions; }}
            onEachFeature={(f, layer) => {
              const r = recPorMunicipio.get(String(f.properties?.nomeNormalizado));
              if (r) layer.bindTooltip(`Recomendação nº ${r.numero} · ${String(f.properties?.nome)} · probabilidade ${r.probabilidade.toLowerCase()}${r.estagio ? ` · ${r.estagio.toLowerCase()}` : ""}`, { sticky: true });
            }}
          />
        )}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-white/90 px-2 py-1 text-[11px] shadow">
        {[["fraca", "Fraca"], ["moderada", "Moderada"], ["moderada_forte", "Forte"], ["moderada_muito_forte", "Muito forte"]].map(([k, r]) => (
          <span key={k} className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: corGravidade(k) }} />{r}</span>
        ))}
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_GRAVIDADE[0] }} />Sem informação</span>
        {avisos.length > 0 && <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-0 w-4" style={{ borderTop: "3px dashed #ea580c" }} />Aviso meteorológico</span>}
        {recomendacoes.length > 0 && <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ border: "2px solid #dc2626", background: "#fee2e2" }} />Recomendação de alarme</span>}
      </div>
    </div>
  );
}
