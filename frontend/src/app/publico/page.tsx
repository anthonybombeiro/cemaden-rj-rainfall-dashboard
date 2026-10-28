import type { Metadata } from "next";

import PublicoMonitoramento from "@/components/PublicoMonitoramento";

export const metadata: Metadata = {
  title: "Nível de Monitoramento — CEMADEN-RJ",
  description: "Nível de Monitoramento por município e mapas de risco do Estado do Rio de Janeiro (CEMADEN-RJ / Defesa Civil RJ). Acesso público.",
};

/** Rota pública, SEM login (para COMDECs e demais órgãos): só lê /api/publico/monitoramento/. */
export default function PublicoPage() {
  return <PublicoMonitoramento />;
}
