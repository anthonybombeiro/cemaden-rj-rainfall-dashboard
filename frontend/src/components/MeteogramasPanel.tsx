"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchCidadesRJ, fetchMeteogramaCidade, fetchMeteogramaCoordenada, Opcao } from "@/lib/inmet";
import { PONTOS_METEOGRAMA, PontoMeteograma, RODADAS, Rodada, urlMeteograma } from "@/lib/produtosMarinha";

// Cidade do RJ (nome no INMET) → ponto equivalente da Marinha (arquivo).
const PONTO_MARINHA_DA_CIDADE: Record<string, string> = {
  "Angra dos Reis": "Angra_R",
  "Cabo Frio": "CaboFri",
  Macaé: "Macae_R",
  "Rio de Janeiro": "BaiaGua",
  Niterói: "ClubeNa",
};
const SO_MARINHA = ["IlhaGra", "Maramba", "BaiaOut", "IlhaRas", "BaciaCa"]; // pontos no mar (sem cidade no INMET)
const COORDENADA = "__coord__";

type Sel = { tipo: "cidade"; cidade: Opcao } | { tipo: "mar"; ponto: PontoMeteograma } | { tipo: "coord" };

function hojeUtc(deslocDias = 0) {
  const d = new Date(Date.now() + deslocDias * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Sub-aba "Meteogramas": Marinha (ICON-LAM 6,5 km, 5 dias) e INMET (COSMO 2,8 km, 48 h) lado a lado para o mesmo local;
 * o INMET também gera meteograma para qualquer coordenada. */
export default function MeteogramasPanel() {
  const [cidades, setCidades] = useState<Opcao[]>([]);
  const [valor, setValor] = useState<string>("00212"); // Rio de Janeiro
  const [rodada, setRodada] = useState<Rodada>("00");
  const [lat, setLat] = useState("-22.90");
  const [lon, setLon] = useState("-43.17");
  const [inmet, setInmet] = useState<{ base64: string | null; data?: string; rodada?: string; carregando: boolean; erro?: string }>({ base64: null, carregando: false });
  const [erroMar, setErroMar] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchCidadesRJ()
      .then((l) => setCidades([...l].sort((a, b) => a.nome.localeCompare(b.nome))))
      .catch(() => setCidades([]));
  }, []);

  const sel: Sel = useMemo(() => {
    if (valor === COORDENADA) return { tipo: "coord" };
    const mar = PONTOS_METEOGRAMA.find((p) => `mar:${p.arquivo}` === valor);
    if (mar) return { tipo: "mar", ponto: mar };
    return { tipo: "cidade", cidade: cidades.find((c) => c.sigla === valor) ?? { sigla: valor, nome: "Rio de Janeiro" } };
  }, [valor, cidades]);

  const pontoMarinha: PontoMeteograma | undefined =
    sel.tipo === "mar" ? sel.ponto : sel.tipo === "cidade" ? PONTOS_METEOGRAMA.find((p) => p.arquivo === PONTO_MARINHA_DA_CIDADE[sel.cidade.nome]) : undefined;

  const latNum = Number(lat.replace(",", "."));
  const lonNum = Number(lon.replace(",", "."));
  useEffect(() => {
    if (sel.tipo === "mar") return;
    let cancelado = false;
    Promise.resolve().then(() => {
      if (!cancelado) setInmet({ base64: null, carregando: true });
    });
    const busca =
      sel.tipo === "cidade"
        ? fetchMeteogramaCidade(sel.cidade.sigla, rodada)
        : (async () => {
            if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return null;
            for (const d of [hojeUtc(0), hojeUtc(-1)]) {
              const b = await fetchMeteogramaCoordenada(latNum, lonNum, d, rodada);
              if (b) return { base64: b, data: d, rodada };
            }
            return null;
          })();
    busca
      .then((r) => {
        if (!cancelado) setInmet(r ? { base64: r.base64, data: r.data, rodada: r.rodada, carregando: false } : { base64: null, carregando: false, erro: "Meteograma do INMET indisponível para este local/rodada." });
      })
      .catch(() => {
        if (!cancelado) setInmet({ base64: null, carregando: false, erro: "INMET indisponível no momento." });
      });
    return () => {
      cancelado = true;
    };
  }, [sel, rodada, latNum, lonNum]);

  const campo = "rounded border border-gray-300 bg-white px-2 py-1.5";
  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-2 sm:p-3">
      <h2 className="mb-2 text-sm text-gray-800">
        <span className="font-bold">Meteogramas do RJ</span>
        <span className="text-xs text-gray-500"> · Marinha (ICON-LAM 6,5 km) e INMET (COSMO 2,8 km)</span>
      </h2>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <select aria-label="Local" value={valor} onChange={(e) => { setValor(e.target.value); setErroMar({}); }} className={`${campo} max-w-[16rem] sm:max-w-none`}>
          <optgroup label="Cidades (INMET)">
            {(cidades.length ? cidades : [{ sigla: "00212", nome: "Rio de Janeiro" }]).map((c) => (
              <option key={c.sigla} value={c.sigla}>
                {c.nome}
                {PONTO_MARINHA_DA_CIDADE[c.nome] ? " ★" : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="Pontos no mar (Marinha)">
            {PONTOS_METEOGRAMA.filter((p) => SO_MARINHA.includes(p.arquivo)).map((p) => (
              <option key={p.arquivo} value={`mar:${p.arquivo}`}>
                {p.nome}
              </option>
            ))}
          </optgroup>
          <option value={COORDENADA}>Coordenada livre (INMET)…</option>
        </select>
        <div className="flex overflow-hidden rounded border border-gray-300" role="group" aria-label="Rodada">
          {RODADAS.map((r) => (
            <button key={r} type="button" onClick={() => { setRodada(r); setErroMar({}); }} className={`px-3 py-1.5 font-medium ${rodada === r ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"}`}>
              {r}Z
            </button>
          ))}
        </div>
        {sel.tipo === "coord" && (
          <>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Lat <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" className={`${campo} w-20`} />
            </label>
            <label className="flex items-center gap-1 text-xs text-gray-600">
              Lon <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" className={`${campo} w-20`} />
            </label>
          </>
        )}
        <span className="text-xs text-gray-500">★ = local com os dois modelos. A data de referência está no cabeçalho de cada gráfico.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {pontoMarinha && (
          <section>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">Marinha — ICON-LAM 6,5 km · {pontoMarinha.nome}</h3>
            <div className="grid gap-2">
              {([0, 1] as const).map((g) => {
                const url = urlMeteograma(pontoMarinha, rodada, g);
                return (
                  <figure key={`${pontoMarinha.arquivo}-${rodada}-${g}`} className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
                    <figcaption className="mb-1 text-xs font-semibold text-gray-600">{g === 0 ? "Pressão, temperatura, umidade e vento" : "Visibilidade, precipitação e nuvens"}</figcaption>
                    {erroMar[url] ? (
                      <p className="p-6 text-center text-sm text-gray-500">Gráfico indisponível nesta rodada.</p>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={`Meteograma Marinha ${pontoMarinha.nome} ${g + 1}`} className="mx-auto w-full max-w-xl" onError={() => setErroMar((e) => ({ ...e, [url]: true }))} />
                    )}
                  </figure>
                );
              })}
            </div>
          </section>
        )}
        {sel.tipo !== "mar" && (
          <section>
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">
              INMET — COSMO 2,8 km · {sel.tipo === "cidade" ? sel.cidade.nome : `${lat}, ${lon}`}
              {inmet.data && ` · ${inmet.data.split("-").reverse().join("/")} ${inmet.rodada}Z`}
            </h3>
            <figure className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm">
              {inmet.carregando && <p className="p-8 text-center text-sm text-gray-400">Carregando…</p>}
              {inmet.erro && <p className="p-6 text-center text-sm text-gray-500">{inmet.erro}</p>}
              {inmet.base64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inmet.base64} alt="Meteograma INMET" className="mx-auto w-full max-w-xl" />
              )}
            </figure>
          </section>
        )}
      </div>
    </div>
  );
}
