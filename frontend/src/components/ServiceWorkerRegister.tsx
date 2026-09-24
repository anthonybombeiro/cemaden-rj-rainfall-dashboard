"use client";

import { useEffect } from "react";

/** Registra o service worker (public/sw.js) — pedido do usuário,
 * 2026-09-24: "deixar o site instalável como um app pro celular". Sem
 * isso, o manifest.json sozinho não basta pro navegador oferecer
 * "instalar app"/"adicionar à tela inicial" de verdade (Chrome/Android
 * exigem os dois: manifest válido + service worker registrado com um
 * handler de fetch). Componente client-only, sem UI própria. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Falha aqui (ex: navegador sem suporte, sw.js 404) não deve
      // quebrar o resto do app — o painel funciona igual sem PWA.
    });
  }, []);

  return null;
}
