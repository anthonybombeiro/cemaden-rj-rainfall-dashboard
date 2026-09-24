"use client";

import { Check, Save } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { fetchPrevisoes, Previsao, REDECS, salvarPrevisao } from "@/lib/api";
import { ICONES_TEMPO, iconeSrc, VENTOS } from "@/lib/meteorologia";

type Campos = {
  tmax: string;
  tmin: string;
  umax: string;
  umin: string;
  vento: string;
  direcao: string;
  nascer: string;
  por: string;
  comentario: string;
  icone: string;
};

const VAZIO: Campos = {
  tmax: "",
  tmin: "",
  umax: "",
  umin: "",
  vento: "Fraco",
  direcao: "",
  nascer: "",
  por: "",
  comentario: "",
  icone: "",
};

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function deCampos(p: Previsao): Campos {
  return {
    tmax: String(p.temperatura_maxima),
    tmin: String(p.temperatura_minima),
    umax: String(p.umidade_maxima),
    umin: String(p.umidade_minima),
    vento: p.vento_velocidade,
    direcao: p.vento_direcao,
    nascer: p.nascer_sol,
    por: p.por_sol,
    comentario: p.comentario,
    icone: p.icone,
  };
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validar(c: Campos): string | null {
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v));
  const [tmax, tmin, umax, umin] = [n(c.tmax), n(c.tmin), n(c.umax), n(c.umin)];
  if ([tmax, tmin, umax, umin].some(Number.isNaN)) return "Preencha as temperaturas e umidades (máxima e mínima).";
  if (![tmax, tmin, umax, umin].every(Number.isInteger)) return "Use números inteiros nas temperaturas e umidades.";
  if (tmin > tmax) return "A temperatura mínima não pode ser maior que a máxima.";
  if (umin > umax) return "A umidade mínima não pode ser maior que a máxima.";
  if (umin < 0 || umax > 100) return "A umidade deve estar entre 0 e 100.";
  if (tmin < -10 || tmax > 50) return "Confira as temperaturas (esperado entre -10 e 50 °C).";
  if (c.nascer && !HORA.test(c.nascer)) return "Nascer do sol deve estar no formato HH:MM.";
  if (c.por && !HORA.test(c.por)) return "Pôr do sol deve estar no formato HH:MM.";
  if (!c.icone) return "Escolha a imagem do clima.";
  return null;
}

const inputCls = "w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900";
const labelCls = "mb-1 block text-xs font-medium text-gray-600";

export default function PrevisaoForm() {
  const [data, setData] = useState(hojeISO());
  const [regiao, setRegiao] = useState<string>(REDECS[0]);
  const [c, setC] = useState<Campos>(VAZIO);
  const [doDia, setDoDia] = useState<Previsao[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const porRegiao = useMemo(() => new Map(doDia.map((p) => [p.regiao, p])), [doDia]);

  const carregarDia = useCallback(async (d: string) => {
    try {
      setDoDia(await fetchPrevisoes(d));
    } catch {
      setDoDia([]);
    }
  }, []);

  useEffect(() => {
    void carregarDia(data);
  }, [data, carregarDia]);

  // Trocou de dia/região: carrega o registro existente (edição) ou limpa.
  useEffect(() => {
    const existente = porRegiao.get(regiao);
    setC(existente ? deCampos(existente) : VAZIO);
    setErro(null);
  }, [regiao, porRegiao]);

  const set = (k: keyof Campos) => (v: string) => setC((atual) => ({ ...atual, [k]: v }));
  const existente = porRegiao.get(regiao);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setOk(null);
    const problema = validar(c);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setSaving(true);
    try {
      await salvarPrevisao({
        data,
        regiao,
        temperatura_maxima: Number(c.tmax),
        temperatura_minima: Number(c.tmin),
        umidade_maxima: Number(c.umax),
        umidade_minima: Number(c.umin),
        vento_velocidade: c.vento,
        vento_direcao: c.direcao.trim(),
        nascer_sol: c.nascer,
        por_sol: c.por,
        comentario: c.comentario.trim(),
        icone: c.icone,
      });
      setOk(`Previsão de ${regiao} salva para ${data.split("-").reverse().join("/")}.`);
      const atualizadas = await fetchPrevisoes(data);
      setDoDia(atualizadas);
      const proxima = REDECS.find((r) => r !== regiao && !atualizadas.some((p) => p.regiao === r));
      if (proxima) setRegiao(proxima);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a previsão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 p-3 sm:p-4">
      <form onSubmit={enviar} className="mx-auto max-w-4xl space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls} htmlFor="prev-data">
              Data
            </label>
            <input
              id="prev-data"
              type="date"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className={labelCls} htmlFor="prev-regiao">
              Região
            </label>
            <select id="prev-regiao" value={regiao} onChange={(e) => setRegiao(e.target.value)} className={inputCls}>
              {REDECS.map((r) => (
                <option key={r} value={r}>
                  {r}
                  {porRegiao.has(r) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>
          {existente && (
            <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
              Já existe previsão — salvar substitui (última alteração: {existente.atualizado_por || "—"}).
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {REDECS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegiao(r)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                r === regiao
                  ? "border-sedec-600 bg-sedec-600 text-white"
                  : porRegiao.has(r)
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-gray-300 bg-white text-gray-500"
              }`}
            >
              {porRegiao.has(r) && <Check size={11} />}
              {r}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Temperatura máxima (°C)</label>
            <input inputMode="numeric" maxLength={2} value={c.tmax} onChange={(e) => set("tmax")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Temperatura mínima (°C)</label>
            <input inputMode="numeric" maxLength={2} value={c.tmin} onChange={(e) => set("tmin")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Umidade máxima (%)</label>
            <input inputMode="numeric" maxLength={3} value={c.umax} onChange={(e) => set("umax")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Umidade mínima (%)</label>
            <input inputMode="numeric" maxLength={3} value={c.umin} onChange={(e) => set("umin")(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Velocidade do vento</label>
            <select value={c.vento} onChange={(e) => set("vento")(e.target.value)} className={inputCls}>
              {VENTOS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Direção do vento</label>
            <input maxLength={20} placeholder="Ex.: NE/E" value={c.direcao} onChange={(e) => set("direcao")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nascer do sol</label>
            <input maxLength={5} placeholder="HH:MM" value={c.nascer} onChange={(e) => set("nascer")(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Pôr do sol</label>
            <input maxLength={5} placeholder="HH:MM" value={c.por} onChange={(e) => set("por")(e.target.value)} className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Comentário ({c.comentario.length}/200)</label>
          <textarea
            rows={3}
            maxLength={200}
            value={c.comentario}
            onChange={(e) => set("comentario")(e.target.value)}
            className={inputCls}
          />
        </div>

        <fieldset>
          <legend className={labelCls}>Imagem do clima</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ICONES_TEMPO.map((i) => (
              <button
                key={i.key}
                type="button"
                onClick={() => set("icone")(i.key)}
                aria-pressed={c.icone === i.key}
                className={`flex items-center gap-2 rounded border p-2 text-left text-xs ${
                  c.icone === i.key ? "border-sedec-600 bg-blue-50 ring-1 ring-sedec-600" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={iconeSrc(i.key)} alt="" className="h-9 w-9 shrink-0 object-contain" />
                <span className="text-gray-700">{i.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {erro && <div className="rounded bg-red-50 p-2 text-sm text-red-600">{erro}</div>}
        {ok && <div className="rounded bg-emerald-50 p-2 text-sm text-emerald-700">{ok}</div>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-sedec-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? "Salvando…" : existente ? "Atualizar previsão" : "Salvar previsão"}
          </button>
        </div>
      </form>
    </div>
  );
}
