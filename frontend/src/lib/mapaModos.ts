/** Modos de visualização das bolinhas do mapa (botão "Estações", 08/10/2026). */
export type ModoMapa = "redes" | "sirenes" | "chuva1h" | "chuva24h" | "vento";

export const MODOS_MAPA: { key: ModoMapa; label: string; descricao: string }[] = [
  { key: "redes", label: "Todas as estações (por rede)", descricao: "Uma cor por rede/fonte (padrão)" },
  { key: "sirenes", label: "Sirenes", descricao: "Só as sirenes: tocando × não tocando, com as cores da tabela Sirenes" },
  { key: "chuva1h", label: "Chuva em 1 h", descricao: "Acumulado de 1 h dentro da bolinha, com as faixas de chuva do painel" },
  { key: "chuva24h", label: "Chuva em 24 h", descricao: "Acumulado de 24 h dentro da bolinha" },
  { key: "vento", label: "Vento (rajada)", descricao: "Rajada em km/h dentro da bolinha, só estações que informam rajada" },
];

const CHAVE = "mapa-modo-estacoes-v1";

export function lerModoSalvo(): ModoMapa {
  try {
    const v = window.localStorage.getItem(CHAVE);
    if (v && MODOS_MAPA.some((m) => m.key === v)) return v as ModoMapa;
  } catch {
    /* navegação privada / armazenamento bloqueado: segue o padrão */
  }
  return "redes";
}

export function salvarModo(modo: ModoMapa): void {
  try {
    window.localStorage.setItem(CHAVE, modo);
  } catch {
    /* ignora */
  }
}
