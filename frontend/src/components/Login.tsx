"use client";

import { useState } from "react";

import { AuthUser, login } from "@/lib/api";

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
    <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-bold text-gray-900">Painel Meteorológico/Hidrológico</h1>
        <p className="mb-4 mt-1 text-xs text-gray-500">
          CEMADEN-RJ — acesso restrito, uso interno da Defesa Civil.
        </p>

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
          className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
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
          className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
        />

        {error && <div className="mt-3 rounded bg-red-50 p-2 text-xs text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
