"use client";

import { ArrowLeft, Eye, EyeOff, Lock, User } from "lucide-react";
import { useState } from "react";

import { AuthUser, changePassword, updateProfile } from "@/lib/api";

/** "Meu Perfil" — modelo copiado do SIGPLAN-SEDEC (pedido do usuário,
 * 2026-09-23, inspecionado ao vivo). Não é uma rota Next.js de verdade
 * (o site é 100% estático/client-side, sem servidor pra rotear) — é só
 * uma troca de tela dentro do Dashboard, igual ao padrão já usado pras
 * abas (Mapa/Precipitação/...). "Setor" da referência virou "Papel" aqui
 * (admin/operador) — não temos conceito de setor/lotação neste sistema. */
export default function Profile({
  user,
  onBack,
  onUserUpdated,
}: {
  user: AuthUser;
  onBack: () => void;
  onUserUpdated: (user: AuthUser) => void;
}) {
  const [firstName, setFirstName] = useState(user.first_name);
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "ok" | "erro"; text: string } | null>(null);

  const handleSaveName = async () => {
    setSavingName(true);
    setNameMsg(null);
    try {
      const updated = await updateProfile(firstName);
      onUserUpdated(updated);
      setNameMsg("Salvo.");
    } catch (err) {
      setNameMsg(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "erro", text: "A confirmação não bate com a nova senha." });
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ type: "ok", text: "Senha alterada com sucesso." });
    } catch (err) {
      setPasswordMsg({ type: "erro", text: err instanceof Error ? err.message : "Falha ao alterar a senha." });
    } finally {
      setChangingPassword(false);
    }
  };

  const inputType = showPasswords ? "text" : "password";

  return (
    <div className="h-full w-full overflow-auto bg-gray-50 px-4 py-6">
      <div className="mx-auto max-w-lg">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <h1 className="mb-4 text-lg font-bold text-gray-900">Meu Perfil</h1>

        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <User size={16} className="text-sedec-600" /> Dados Pessoais
          </div>

          <label className="block text-xs font-medium text-gray-600">Usuário</label>
          <input
            value={user.username}
            disabled
            className="mt-1 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500"
          />

          <label className="mt-3 block text-xs font-medium text-gray-600">Nome</label>
          <div className="mt-1 flex gap-2">
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={savingName}
              className="shrink-0 rounded-lg bg-sedec-600 px-4 text-sm font-semibold text-white hover:bg-sedec-700 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
          {nameMsg && <p className="mt-1 text-xs text-gray-500">{nameMsg}</p>}

          <label className="mt-3 block text-xs font-medium text-gray-600">Email</label>
          <input
            value={user.email || "—"}
            disabled
            className="mt-1 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500"
          />
          <p className="mt-1 text-xs text-gray-400">O email só pode ser alterado por um administrador.</p>

          <label className="mt-3 block text-xs font-medium text-gray-600">Papel</label>
          <input
            value={user.role === "admin" ? "Administrador" : "Operador"}
            disabled
            className="mt-1 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-500"
          />
        </div>

        <form onSubmit={handleChangePassword} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Lock size={16} className="text-sedec-600" /> Alterar Senha
          </div>

          <label className="block text-xs font-medium text-gray-600">Senha atual</label>
          <input
            type={inputType}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
          />

          <label className="mt-3 block text-xs font-medium text-gray-600">Nova senha</label>
          <input
            type={inputType}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
          />

          <label className="mt-3 block text-xs font-medium text-gray-600">Confirmar nova senha</label>
          <input
            type={inputType}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
          />

          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPasswords ? "Ocultar senhas" : "Mostrar senhas"}
          </button>

          {passwordMsg && (
            <div
              className={`mt-3 rounded p-2 text-xs ${
                passwordMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {passwordMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={changingPassword}
            className="mt-4 w-full rounded-lg bg-sedec-600 py-2 text-sm font-semibold text-white hover:bg-sedec-700 disabled:opacity-50"
          >
            {changingPassword ? "Alterando…" : "Alterar Senha"}
          </button>
        </form>
      </div>
    </div>
  );
}
