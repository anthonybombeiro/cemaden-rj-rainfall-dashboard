/** Mesmo esquema visual do rodapé do SIGPLAN-SEDEC (pedido do usuário,
 * 2026-09-23, inspecionado ao vivo em sigplan-sedec.vercel.app/dashboard):
 * fundo branco, borda superior clara, logo pequena com opacidade reduzida
 * + texto institucional à esquerda, crédito de desenvolvimento à direita. */
export default function Footer() {
  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src="/logo-cemadenrj.png" alt="CEMADEN-RJ" className="h-5 w-auto opacity-60" />
          <span className="text-xs text-gray-400">Painel Integrado de Monitoramento - CEMADEN-RJ / SEDEC</span>
        </div>
        <span className="text-xs text-gray-300">Desenvolvido por PreserveSOS e CEMADEN-RJ</span>
      </div>
    </footer>
  );
}
