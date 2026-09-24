"use client";

import { useEffect, useState } from "react";

import Dashboard from "@/components/Dashboard";
import Login from "@/components/Login";
import { AuthUser, fetchMe, logout as apiLogout } from "@/lib/api";

/** Painel inteiro exige login (pedido do usuário, 2026-09-23) — este
 * componente só decide "logado ou não" e mostra a tela certa; toda a
 * lógica do painel em si mora em Dashboard.tsx. Estático (Next.js
 * `output: "export"`, sem servidor) então essa checagem só pode acontecer
 * no cliente: `/api/auth/me/` usa o cookie de sessão pra responder 200
 * (logado) ou 403 (não logado) — não tem "middleware" de rota aqui. */
type AuthState = "checking" | "anon" | "authed";

export default function HomePage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((u) => {
        if (!cancelled) {
          setUser(u);
          setAuthState("authed");
        }
      })
      .catch(() => {
        if (!cancelled) setAuthState("anon");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authState === "checking") {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-400">Carregando…</div>
    );
  }

  if (authState === "anon" || !user) {
    return (
      <Login
        onLoggedIn={(loggedInUser) => {
          setUser(loggedInUser);
          setAuthState("authed");
        }}
      />
    );
  }

  return (
    <Dashboard
      user={user}
      onLogout={async () => {
        await apiLogout();
        setUser(null);
        setAuthState("anon");
      }}
      onUserUpdated={setUser}
    />
  );
}
