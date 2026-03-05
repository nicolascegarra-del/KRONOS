"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Smartphone, ChevronDown, ChevronUp } from "lucide-react";

function PwaInstructions() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border rounded-lg overflow-hidden text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-slate-700 font-medium"
      >
        <span className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" />
          Añadir a la pantalla de inicio
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
            <p className="text-xs text-muted-foreground">
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
  const [error, setError] = useState<string | null>(null);

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
      setError(
        e.response?.data?.detail || "Credenciales incorrectas. Inténtalo de nuevo."
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src="/logo.png" alt="Logo" className="w-full max-w-[260px] h-auto object-contain" />
          </div>
          <CardDescription>Inicia sesión para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                data-testid="email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                data-testid="password-input"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="login-button"
            >
              {isLoading ? "Iniciando sesión..." : "Iniciar Sesión"}
            </Button>
          </form>
          <PwaInstructions />
        </CardContent>
      </Card>
    </div>
  );
}
