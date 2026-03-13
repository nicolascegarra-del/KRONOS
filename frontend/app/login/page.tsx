"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Smartphone, ChevronDown, ChevronUp, ShieldCheck, AlertCircle, UserX, Lock } from "lucide-react";

function PwaInstructions() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-slate-600 font-medium"
      >
        <span className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-slate-500" aria-hidden="true" />
          Añadir a la pantalla de inicio
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="px-4 py-4 space-y-4 bg-white">
          <div className="space-y-2">
            <p className="font-semibold text-slate-800">🤖 Android (Chrome)</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-600 text-xs leading-relaxed">
              <li>Abre esta página en <strong>Chrome</strong></li>
              <li>Pulsa el menú <strong>⋮</strong> (tres puntos, arriba a la derecha)</li>
              <li>Selecciona <strong>"Añadir a pantalla de inicio"</strong> o <strong>"Instalar app"</strong></li>
              <li>Confirma pulsando <strong>"Añadir"</strong></li>
            </ol>
          </div>
          <div className="border-t" />
          <div className="space-y-2">
            <p className="font-semibold text-slate-800">🍎 iPhone / iPad (Safari)</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-600 text-xs leading-relaxed">
              <li>Abre esta página en <strong>Safari</strong> (no Chrome)</li>
              <li>Pulsa el botón <strong>compartir</strong> <span className="inline-block border rounded px-1 font-mono">⎙</span> (abajo en el centro)</li>
              <li>Desliza y selecciona <strong>"Añadir a pantalla de inicio"</strong></li>
              <li>Escribe el nombre y pulsa <strong>"Añadir"</strong></li>
            </ol>
            <p className="text-xs text-slate-400">
              Se creará un icono que abre la app a pantalla completa sin barra del navegador.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{ message: string; type: "disabled" | "notfound" | "generic" } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      const user = useAuthStore.getState().user;
      if (user?.role === "superadmin") {
        router.replace("/superadmin/dashboard");
      } else if (user?.role === "admin") {
        router.replace("/admin/dashboard");
      } else {
        router.replace("/worker/dashboard");
      }
    } catch (e: any) {
      const detail: string = e.response?.data?.detail ?? "";
      const status: number = e.response?.status ?? 0;
      if (status === 403 || detail.toLowerCase().includes("desactivada")) {
        setError({ message: "Tu cuenta está desactivada. Contacta con tu administrador.", type: "disabled" });
      } else if (detail.toLowerCase().includes("no existe") || detail.toLowerCase().includes("ninguna cuenta")) {
        setError({ message: "No existe ninguna cuenta con ese email.", type: "notfound" });
      } else {
        setError({ message: detail || "Credenciales incorrectas. Inténtalo de nuevo.", type: "generic" });
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 p-4">
      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Brand header strip */}
        <div className="h-1 w-full bg-gradient-to-r from-slate-600 via-slate-400 to-slate-600 rounded-t-2xl" />

        <div className="bg-white rounded-b-2xl shadow-2xl overflow-hidden">
          {/* Logo area */}
          <div className="px-8 pt-8 pb-2 text-center">
            <img
              src="/logo.png"
              alt="Kronos"
              className="w-full max-w-[220px] h-auto object-contain mx-auto"
            />
            <p className="mt-3 text-sm text-slate-400 font-medium tracking-wide">
              Inicia sesión para continuar
            </p>
          </div>

          {/* Form */}
          <div className="px-8 pb-8 pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-slate-700 font-medium text-sm">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  data-testid="email-input"
                  className="h-11 border-slate-200 focus:border-slate-500 focus:ring-slate-500 bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-slate-700 font-medium text-sm">
                  Contraseña
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  data-testid="password-input"
                  className="h-11 border-slate-200 focus:border-slate-500 focus:ring-slate-500 bg-slate-50"
                />
              </div>

              <div className="text-right">
                <Link href="/forgot-password" className="text-xs text-slate-500 hover:text-slate-700 underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>

              {error && (
                <div
                  role="alert"
                  className={`flex items-start gap-2.5 text-sm px-3 py-2.5 rounded-lg border ${
                    error.type === "disabled"
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : error.type === "notfound"
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {error.type === "disabled" ? (
                    <UserX className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : error.type === "notfound" ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{error.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                data-testid="login-button"
                className="w-full h-11 mt-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
              </button>
            </form>

            <PwaInstructions />
          </div>
        </div>

        {/* Compliance footer */}
        <div className="mt-6 flex items-start gap-2 text-xs text-slate-500 text-center px-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" aria-hidden="true" />
          <span>
            Cumple con el{" "}
            <span className="text-slate-400 font-medium">Art. 34.9 ET</span>
            {" "}— registro diario de jornada (RDL 8/2019) y{" "}
            <span className="text-slate-400 font-medium">RGPD</span>.
          </span>
        </div>
      </div>
    </div>
  );
}
