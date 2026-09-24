"use client";

import { useState } from "react";

import { AuthUser, login } from "@/lib/api";

/** Visual copiado do SIGPLAN-SEDEC (pedido do usuário, 2026-09-23,
 * inspecionado ao vivo em sigplan-sedec.vercel.app): fundo escuro
 * (gray-900), card branco central, botão primário na cor de marca
 * "sedec" (ver globals.css). Logo é a mesma usada no cabeçalho do
 * Dashboard (public/logo-cemadenrj.png). */
export default function Login({ onLoggedIn }: { onLoggedIn: (user: AuthUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(username, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-gray-900 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/logo-cemadenrj.png" alt="CEMADEN-RJ" className="h-14 w-auto" />
        <div>
          <h1 className="text-lg font-bold text-white">Painel Integrado de Monitoramento</h1>
          <p className="text-sm text-gray-400">CEMADEN-RJ / SEDEC</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <h2 className="text-base font-semibold text-gray-900">Entrar no sistema</h2>
        <p className="mb-4 mt-1 text-xs text-gray-500">Acesso restrito, uso interno da Defesa Civil.</p>

        <label className="block text-xs font-medium text-gray-600" htmlFor="login-username">
          Usuário
        </label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          required
          autoComplete="username"
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:border-sedec-400 focus:outline-none focus:ring-1 focus:ring-sedec-400"
        />

        <label className="mt-3 block text-xs font-medium text-gray-600" htmlFor="login-password">
          Senha
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:border-sedec-400 focus:outline-none focus:ring-1 focus:ring-sedec-400"
        />

        {error && <div className="mt-3 rounded bg-red-50 p-2 text-xs text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-sedec-600 py-2 text-sm font-semibold text-white hover:bg-sedec-700 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
