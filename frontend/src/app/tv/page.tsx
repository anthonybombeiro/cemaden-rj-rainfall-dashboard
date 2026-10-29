import type { Metadata } from "next";

import ModoTv from "@/components/ModoTv";

export const metadata: Metadata = {
  title: "Modo TV — CEMADEN-RJ",
  description: "Painel para TV e videowall do CEMADEN-RJ: Nível de Monitoramento, previsão, mapas de risco, informativo e sirenes alternando sozinhos.",
  robots: { index: false, follow: false },
};

/** Rota pública, SEM login, para TV e videowall. Só lê os endpoints /api/publico/*. Parâmetros: ?seg=12 (segundos por tela) e ?telas=nm,previsao,riscos,informativo,sirenes. */
export default function TvPage() {
  return <ModoTv />;
}
