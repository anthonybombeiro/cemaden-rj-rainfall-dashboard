"use client";

/** Alça no canto direito do cabeçalho pra arrastar a largura da coluna
 * (mouse, toque e caneta via pointer events). Duplo clique/toque restaura o padrão. */
export default function ColumnResizer({
  width,
  onChange,
  onReset,
  min = 44,
  max = 520,
}: {
  width: number;
  onChange: (px: number) => void;
  onReset: () => void;
  min?: number;
  max?: number;
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar largura da coluna"
      title="Arraste para ajustar a largura (duplo clique restaura)"
      className="absolute right-0 top-0 z-40 flex h-full w-3 cursor-col-resize touch-none select-none items-center justify-end"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const alvo = e.currentTarget;
        const inicioX = e.clientX;
        const larguraInicial = width;
        alvo.setPointerCapture(e.pointerId);
        const mover = (ev: PointerEvent) => {
          onChange(Math.min(max, Math.max(min, larguraInicial + ev.clientX - inicioX)));
        };
        const soltar = () => {
          alvo.removeEventListener("pointermove", mover);
          alvo.removeEventListener("pointerup", soltar);
          alvo.removeEventListener("pointercancel", soltar);
        };
        alvo.addEventListener("pointermove", mover);
        alvo.addEventListener("pointerup", soltar);
        alvo.addEventListener("pointercancel", soltar);
      }}
    >
      <span className="mr-0.5 h-1/2 w-0.5 rounded bg-gray-400/70" />
    </span>
  );
}
