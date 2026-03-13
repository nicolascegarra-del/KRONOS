"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err: any) {
      const detail: string = err.response?.data?.detail ?? "";
      if (detail.toLowerCase().includes("válido") || detail.toLowerCase().includes("caducado")) {
        setError("El enlace no es válido o ha caducado. Solicita uno nuevo.");
      } else {
        setError(detail || "Error al restablecer la contraseña.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          Enlace no válido. Asegúrate de haber seguido el enlace del email correctamente.
        </div>
        <Link href="/forgot-password" className="block text-center text-sm text-slate-500 hover:text-slate-700 underline">
          Solicitar nuevo enlace
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
          Contraseña actualizada correctamente. Redirigiendo al inicio de sesión...
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-slate-700 font-medium text-sm">
          Nueva contraseña
        </Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="h-11 border-slate-200 focus:border-slate-500 bg-slate-50"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm" className="text-slate-700 font-medium text-sm">
          Confirmar contraseña
        </Label>
        <Input
          id="confirm"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="h-11 border-slate-200 focus:border-slate-500 bg-slate-50"
        />
      </div>

      {error && (
        <div className="space-y-2">
          <p className="text-sm text-red-600">{error}</p>
          {(error.includes("válido") || error.includes("caducado")) && (
            <Link href="/forgot-password" className="text-sm text-slate-500 hover:text-slate-700 underline">
              Solicitar nuevo enlace
            </Link>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Guardando..." : "Establecer nueva contraseña"}
      </button>

      <Link
        href="/login"
        className="block text-center text-sm text-slate-500 hover:text-slate-700 underline"
      >
        Volver al inicio de sesión
      </Link>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="h-1 w-full bg-gradient-to-r from-slate-600 via-slate-400 to-slate-600 rounded-t-2xl" />
        <div className="bg-white rounded-b-2xl shadow-2xl px-8 py-8 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold text-slate-900">Nueva contraseña</h1>
            <p className="text-sm text-slate-500">Introduce tu nueva contraseña.</p>
          </div>
          <Suspense fallback={<div className="text-sm text-slate-500 text-center">Cargando...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
