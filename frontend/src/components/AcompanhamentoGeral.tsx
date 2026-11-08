"use client";

import { CardAviso } from "@/components/AvisosVigentes";
import { Acompanhar } from "@/components/informativo/InformativoPanel";
import { CardRecomendacao, useRecomendacoesAtivas } from "@/components/RecomendacoesAtivas";
import { useAvisosPublicos } from "@/lib/avisosPublicos";

/** Resumo 24 h → Acompanhamento do Nowcasting (visível a todos): o mapa com o que está valendo agora e, abaixo, os cards vigentes lado a lado — o aviso
 * meteorológico vigente SEMPRE em primeiro, depois o informativo (com vigência, radar e Idap) e as recomendações de alarme das últimas 24 h.
 * No mapa: contorno laranja tracejado nas REDECs do aviso e contorno colorido (pela probabilidade) nos municípios com recomendação. */
export default function AcompanhamentoGeral() {
  const avisos = useAvisosPublicos() ?? [];
  const { lista: recs } = useRecomendacoesAtivas();
  const recomendacoes = recs ?? [];
  return (
    <section aria-labelledby="acomp-nowcasting" className="space-y-3">
      <h2 id="acomp-nowcasting" className="text-base font-bold text-gray-900">Acompanhamento do Nowcasting</h2>
      <Acompanhar
        avisosMapa={avisos.map((a) => ({ numero: a.numero, ano: a.ano, regioes: a.regioes }))}
        recsMapa={recomendacoes.map((r) => ({ municipio: r.municipio, numero: r.numero, probabilidade: r.probabilidade, estagio: r.estagio_operacional }))}
        cardsAntes={avisos.length ? avisos.map((a) => <CardAviso key={`${a.ano}-${a.numero}`} a={a} />) : undefined}
        cardsDepois={recomendacoes.length ? recomendacoes.map((r) => <CardRecomendacao key={r.id} r={r} />) : undefined}
      />
      {recs && recs.length === 0 && <p className="text-xs text-gray-500">Nenhuma recomendação de alarme nas últimas 24 horas.</p>}
    </section>
  );
}
