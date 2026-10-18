/** `setInterval` que respeita a visibilidade da aba (18/10/2026).
 *
 * Motivo: cada aba do painel fazia ~5-8 requisições por minuto mesmo em segundo plano; várias abas/dispositivos abertos somavam
 * e, em 18/10/2026, o servidor passou a devolver HTTP 429 (Too Many Requests) por alguns minutos. Agora, com a aba oculta
 * (outra aba em foco, janela minimizada, tela bloqueada) a consulta periódica PAUSA, e ao voltar à aba ela atualiza na hora
 * se já passou o intervalo.
 *
 * `msOculto`: período a usar com a aba oculta (padrão `null` = pausa total). Usado só pela checagem leve de "sirene tocando"
 * quando o aviso do navegador (push) está ativado — dado de segurança, não pode parar.
 *
 * Devolve a função de limpeza (use no `return` do `useEffect`). */
export function intervaloVisivel(fn: () => void, ms: number, msOculto: number | null = null): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let ultimo = Date.now();

  const rodar = () => {
    ultimo = Date.now();
    fn();
  };
  const agendar = () => {
    if (timer) clearInterval(timer);
    timer = null;
    const periodo = document.hidden ? msOculto : ms;
    if (periodo != null) timer = setInterval(rodar, periodo);
  };
  const aoMudarVisibilidade = () => {
    if (!document.hidden && Date.now() - ultimo >= ms) rodar(); // voltou à aba e os dados já estão velhos
    agendar();
  };

  document.addEventListener("visibilitychange", aoMudarVisibilidade);
  agendar();
  return () => {
    if (timer) clearInterval(timer);
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  };
}
