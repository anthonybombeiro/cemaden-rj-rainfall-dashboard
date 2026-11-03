"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { fetchFontesSaude, FontesSaude, nomeFonte } from "@/lib/api";
import { intervaloVisivel } from "@/lib/intervaloVisivel";

// Faixa de "saúde das fontes" (06/10/2026): o cron do servidor não avisa quando uma
// coleta falha; aqui aparece quando alguma fonte está com a última coleta além do
// limite esperado ou quando estações que reportavam pararam (> 4 h sem leitura).
// Só é exibida quando há problema; clique para ver o detalhe por fonte.

function idade(min: number | null): string {
  if (min == null) return "sem registro de coleta";
  if (min < 90) return `há ${Math.round(min)} min`;
  return `há ${(min / 60).toFixed(1)} h`;
}

export default function SaudeFontesBanner() {
  const [saude, setSaude] = useState<FontesSaude | null>(null);
  const [aberto, setAberto] = useState(false);
  // Fechar a faixa vale até o resumo mudar (mais estações paradas ou outra fonte atrasada) ou até fechar o navegador.
  const [fechadaChave, setFechadaChave] = useState<string | null>(() => {
    try { return sessionStorage.getItem("saude-faixa-fechada"); } catch { return null; }
  });

  useEffect(() => {
    let cancelado = false;
    const consultar = () =>
      fetchFontesSaude()
        .then((s) => {
          if (!cancelado) setSaude(s);
        })
        .catch(() => {});
    consultar();
    const id = intervaloVisivel(consultar, 300_000);
    return () => {
      cancelado = true;
      id();
    };
  }, []);

  if (!saude || (saude.resumo.fontes_atrasadas === 0 && saude.resumo.estacoes_paradas === 0)) return null;

  const chave = `${saude.resumo.fontes_atrasadas}-${saude.resumo.estacoes_paradas}`;
  if (fechadaChave === chave) return null;
  const fechar = () => {
    setFechadaChave(chave);
    try { sessionStorage.setItem("saude-faixa-fechada", chave); } catch { /* sem armazenamento: fecha só nesta tela */ }
  };

  const atrasadas = saude.fontes.filter((f) => f.atrasada);
  const comParadas = saude.fontes.filter((f) => f.estacoes_paradas > 0).sort((a, b) => Number(b.sensivel) - Number(a.sensivel));

  return (
    <div className="border-b border-orange-300 bg-orange-100 text-orange-950">
      <div className="flex items-center">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex min-w-0 flex-1 items-center gap-x-3 px-3 py-0.5 text-left text-[11px] font-semibold sm:px-4 sm:py-1 sm:text-sm"
        aria-expanded={aberto}
      >
        {/* Uma linha só (truncada): no celular a faixa não pode crescer e empurrar a tela. */}
        <span className="min-w-0 flex-1 truncate">
          ⚠ Fontes:
          {saude.resumo.fontes_atrasadas > 0 && (
            <> {saude.resumo.fontes_atrasadas} atrasada(s) ({atrasadas.map((f) => nomeFonte(f.slug, f.nome)).join(", ")})</>
          )}
          {saude.resumo.estacoes_paradas > 0 && (
            <>
              {saude.resumo.fontes_atrasadas > 0 ? " ·" : ""} {saude.resumo.estacoes_paradas} estação(ões) parada(s) &gt; {saude.parada_apos_h} h
            </>
          )}
        </span>
        <span className="shrink-0 font-normal underline">{aberto ? "ocultar" : "detalhes"}</span>
      </button>
      <button type="button" onClick={fechar} aria-label="Fechar aviso de fontes" title="Fechar (volta se o resumo mudar)" className="shrink-0 px-2 py-1 text-orange-900 hover:bg-orange-200"><X size={14} /></button>
      </div>
      {aberto && (
        <div className="max-h-64 space-y-2 overflow-auto border-t border-orange-200 px-4 py-2 text-xs">
          {atrasadas.map((f) => (
            <div key={f.slug}>
              <strong>{nomeFonte(f.slug, f.nome)}</strong>: última coleta {idade(f.idade_min)} (limite {f.limite_min} min).
              {f.erro ? <span className="text-red-700"> Erro: {f.erro}</span> : null}
            </div>
          ))}
          {comParadas.map((f) => (
            <div key={`p-${f.slug}`}>
              <strong>{nomeFonte(f.slug, f.nome)}</strong>{f.sensivel ? "" : " (não dispara alerta)"}: {f.estacoes_paradas} parada(s) de {f.estacoes_total} ({f.estacoes_ativas} ativas) —{" "}
              {f.paradas
                .slice(0, 8)
                .map((p) => `${p.nome} (${p.idade_h} h)`)
                .join("; ")}
              {f.paradas.length > 8 ? "…" : ""}
            </div>
          ))}
          <div className="text-[11px] text-orange-800">
            “Parada” = tinha leitura nas últimas 48 h e nenhuma há mais de {saude.parada_apos_h} h. Estações sem nenhum dado
            em 48 h não entram aqui (ver o inventário em docs).
          </div>
        </div>
      )}
    </div>
  );
}
