"use client";

import { useEffect, useMemo, useState } from "react";

import {
  CONTATOS_MUNICIPIOS,
  MUNICIPIOS_CONTATOS,
  MunicipioContato,
  REDEC_CONTATOS,
  REDEC_CONTATOS_CORES,
} from "@/lib/contatosData";
import { normalizeMunicipioName } from "@/lib/api";
import { computeBBox, geometryToPath, GeoJsonFeatureCollection, makeProjector } from "@/lib/geo";

const VIEW_W = 1000;
const VIEW_H = 720;

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

function TelList({ list }: { list: string[] }) {
  return (
    <>
      {list.map((t, i) => {
        const digits = t.replace(/\D/g, "");
        return (
          <div key={i}>
            {digits.length >= 8 ? (
              <a href={`tel:${digits}`} className="text-sedec-600 hover:underline">
                {t}
              </a>
            ) : (
              t
            )}
          </div>
        );
      })}
    </>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-gray-100 py-1.5 text-sm last:border-0 sm:grid-cols-[150px_1fr] sm:gap-2">
      <span className="font-semibold text-gray-500">{rotulo}</span>
      <span className="break-words text-gray-900">{children}</span>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-md border border-gray-200 border-t-4 border-t-orange-500 p-3">
      <h3 className="mb-1 text-sm font-bold text-gray-800">{titulo}</h3>
      {children}
    </div>
  );
}

function ContatoModal({ municipio, onClose }: { municipio: MunicipioContato; onClose: () => void }) {
  const redec = REDEC_CONTATOS.find((r) => r.id === municipio.redec)!;
  const dados = CONTATOS_MUNICIPIOS[municipio.nome];
  const p = dados?.p;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 px-3" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900">{municipio.nome}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-gray-900">
            &times;
          </button>
        </div>
        <div className="mt-3 space-y-1 rounded border-l-4 border-cyan-500 bg-gray-50 p-3 text-sm text-gray-800">
          <div>
            <strong>REDEC:</strong> {redec.numero} - {redec.nome}
          </div>
          <div>
            <strong>Sede:</strong> {redec.sede}
          </div>
          <div>
            <strong>Coordenador:</strong> {redec.coordenador.nome} ({redec.coordenador.posto})
          </div>
          <div>
            <strong>Status:</strong> {municipio.autonomo ? "Autônomo SMS IDAP" : "Não autônomo SMS IDAP"}
          </div>
        </div>

        <Bloco titulo="Prefeito">
          {p ? (
            <>
              <Linha rotulo="Nome">
                <strong>{p.n}</strong>
              </Linha>
              <Linha rotulo="Contatos">{p.t.length > 0 && <TelList list={p.t} />}</Linha>
              <Linha rotulo="Chefe de Gabinete">{p.cg}</Linha>
              <Linha rotulo="Contatos do Gabinete">{p.tg.length > 0 && <TelList list={p.tg} />}</Linha>
              <Linha rotulo="E-mail">
                {p.e.length > 0 &&
                  p.e.map((e) => (
                    <div key={e}>
                      <a href={`mailto:${e}`} className="text-sedec-600 hover:underline">
                        {e}
                      </a>
                    </div>
                  ))}
              </Linha>
              <Linha rotulo="Endereço">{p.a}</Linha>
            </>
          ) : (
            <div className="text-sm italic text-gray-500">Dados do prefeito não constam na planilha de origem.</div>
          )}
        </Bloco>

        {(dados?.g ?? []).map((g, i, arr) => (
          <Bloco key={i} titulo={`Gestor de Defesa Civil${arr.length > 1 ? ` (${i + 1})` : ""}`}>
            <Linha rotulo="Nome">
              <strong>{g.n}</strong>
            </Linha>
            <Linha rotulo="Cargo">{g.c}</Linha>
            <Linha rotulo="Contatos">{g.t.length > 0 && <TelList list={g.t} />}</Linha>
            <Linha rotulo="E-mail">
              {g.e.length > 0 &&
                g.e.map((e) => (
                  <div key={e}>
                    <a href={`mailto:${e}`} className="text-sedec-600 hover:underline">
                      {e}
                    </a>
                  </div>
                ))}
            </Linha>
            <Linha rotulo="Endereço">{g.a}</Linha>
          </Bloco>
        ))}
      </div>
    </div>
  );
}

export default function ContatosMap() {
  const [geo, setGeo] = useState<GeoJsonFeatureCollection | null>(null);
  const [selecionado, setSelecionado] = useState<MunicipioContato | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/rj_municipios.geojson")
      .then((r) => r.json())
      .then((d: GeoJsonFeatureCollection) => {
        if (!cancelled) setGeo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const porNome = useMemo(() => {
    const m = new Map<string, MunicipioContato>();
    for (const mun of MUNICIPIOS_CONTATOS) m.set(normalizeMunicipioName(mun.nome), mun);
    // Grafias diferentes entre a planilha de contatos e o GeoJSON.
    const aliases: [string, string][] = [
      ["CACHOEIRAS DE MACACU", "Cachoeira de Macacu"],
      ["LAJE DO MURIAE", "Laje de Muriaé"],
    ];
    for (const [geoNome, nome] of aliases) {
      const mun = MUNICIPIOS_CONTATOS.find((x) => x.nome === nome);
      if (mun) m.set(geoNome, mun);
    }
    return m;
  }, []);

  const project = useMemo(() => (geo ? makeProjector(computeBBox(geo), VIEW_W, VIEW_H, 10) : null), [geo]);

  const termo = busca.trim();
  const opcoes = useMemo(() => {
    if (!termo) return [];
    const t = normalizeMunicipioName(termo);
    return MUNICIPIOS_CONTATOS.filter((m) => normalizeMunicipioName(m.nome).includes(t)).slice(0, 8);
  }, [termo]);

  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Buscar município:</label>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite o nome…"
            className="w-48 rounded border border-gray-300 px-2 py-1 text-xs text-gray-900"
          />
          {opcoes.length > 0 && (
            <ul className="absolute left-0 top-full z-10 mt-1 w-64 overflow-auto rounded border border-gray-200 bg-white text-xs shadow-md">
              {opcoes.map((m) => (
                <li key={m.nome}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1.5 text-left hover:bg-gray-50"
                    onClick={() => {
                      setSelecionado(m);
                      setBusca("");
                    }}
                  >
                    {m.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="text-xs text-gray-500">Clique num município para ver os contatos.</span>
      </div>

      {!geo || !project ? (
        <div className="p-6 text-center text-sm text-gray-400">Carregando mapa…</div>
      ) : (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="min-h-0 w-full max-w-5xl flex-1 self-center rounded border border-gray-200 bg-sky-50"
          role="img"
          aria-label="Mapa de contatos dos municípios do Rio de Janeiro por REDEC"
        >
          {geo.features.map((f) => {
            const mun = porNome.get(f.properties.nomeNormalizado);
            const base = mun ? REDEC_CONTATOS_CORES[mun.redec] : "#cbd5e1";
            const fill = mun ? (mun.autonomo ? base : lighten(base, 0.55)) : base;
            const redec = mun ? REDEC_CONTATOS.find((r) => r.id === mun.redec) : undefined;
            return (
              <path
                key={f.properties.codarea}
                d={geometryToPath(f.geometry, project)}
                fill={fill}
                stroke="#ffffff"
                strokeWidth={0.8}
                className={mun ? "cursor-pointer hover:brightness-90" : undefined}
                onClick={mun ? () => setSelecionado(mun) : undefined}
              >
                <title>
                  {f.properties.nome}
                  {redec ? ` - ${redec.numero} (${mun!.autonomo ? "Autônomo" : "Não autônomo"})` : ""}
                </title>
              </path>
            );
          })}
        </svg>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
        {REDEC_CONTATOS.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded-sm" style={{ background: REDEC_CONTATOS_CORES[r.id] }} />
            <i
              className="-ml-1 inline-block h-3 w-3 rounded-sm"
              style={{ background: lighten(REDEC_CONTATOS_CORES[r.id], 0.55) }}
            />
            {r.numero} {r.nome}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-gray-500">
        Tom forte = Autônomo SMS IDAP | Tom claro = Não autônomo SMS IDAP
      </div>

      {selecionado && <ContatoModal municipio={selecionado} onClose={() => setSelecionado(null)} />}
    </div>
  );
}
