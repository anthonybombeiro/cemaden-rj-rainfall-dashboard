/** Cores das sirenes em hex — espelham as classes Tailwind da tabela Sirenes (SirenesTable.tsx):
 * toque aviso = amber-500, teste = sky-600, mobilização = red-600, outro = purple-700;
 * estação online = emerald-600, offline = gray-500. Usadas pelo modo "Sirenes" do mapa. */
export const COR_ACAO: Record<string, string> = {
  aviso: "#f59e0b",
  teste: "#0284c7",
  mobilizacao: "#dc2626",
  outro: "#7e22ce",
};
export const ROTULO_ACAO: Record<string, string> = {
  aviso: "Aviso de Chuva",
  teste: "Teste de Manutenção",
  mobilizacao: "Mobilização",
  outro: "Outro / a confirmar",
};
export const COR_ONLINE = "#059669";
export const COR_OFFLINE = "#6b7280";
export const COR_DESCONHECIDO = "#9ca3af";
