/** Mesmo esquema visual do cabeçalho (pedido do usuário, 2026-09-24: "trocar
 * a cor de fundo do rodapé para a mesma do cabeçalho") — bg-gray-900 igual
 * ao header do Dashboard, logo pequena com opacidade reduzida + texto
 * institucional à esquerda, crédito de desenvolvimento à direita. */
export default function Footer() {
  return (
    // Escondido no celular/tablet (pedido do usuário, 2026-09-29): a barra
    // inferior fixa do menu já ocupa esse espaço nesse breakpoint.
    <footer className="hidden shrink-0 border-t border-gray-800 bg-gray-900 px-4 py-2 md:!block">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src="/logo-cemadenrj.png" alt="CEMADEN-RJ" className="h-5 w-auto opacity-70" />
          <span className="text-xs text-gray-400">Painel Integrado de Monitoramento - CEMADEN-RJ / SEDEC</span>
        </div>
        <span className="text-xs text-gray-500">Desenvolvido por PreserveSOS e CEMADEN-RJ</span>
      </div>
    </footer>
  );
}
