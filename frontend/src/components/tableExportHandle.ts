/** Handle exposto via `ref` pelas tabelas (Precipitação/Dados Meteorológicos/
 * Hidrológico/Sirenes) pra permitir que o botão "Exportar CSV" viva FORA da
 * tabela, na barra de filtro flutuante (ver FilterToggleBar.tsx, pedido do
 * usuário 2026-09-23: barra de filtro/exportar/atualizar sempre visível e
 * compacta, filtros em si viram painel flutuante) — sem isso, o botão
 * precisaria duplicar a lógica de ordenação/colunas que já mora dentro de
 * cada tabela, ou a tabela precisaria levantar `sorted` pro componente pai
 * (mais invasivo). `useImperativeHandle` é o padrão do React pra expor uma
 * AÇÃO imperativa sem levantar estado. */
export type TableExportHandle = {
  exportar: () => void;
  /** Monta o ShareData curado (colunas reduzidas, top N pela ordenação
   * atual) e entrega pro callback `onShare` do componente pai — só
   * implementado pelas tabelas que já têm essa curadoria (ver
   * ShareModal.tsx/shareExport.ts). */
  compartilhar?: () => void;
};
