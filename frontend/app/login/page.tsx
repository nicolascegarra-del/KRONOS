"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { api, setAccessToken } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import {
  Clock,
  MapPin,
  CalendarDays,
  CalendarRange,
  FileText,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  UserX,
  Lock,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Building2,
  User as UserIcon,
} from "lucide-react";

// ─── Feature list ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Clock,
    title: "Control de fichajes",
    desc: "Registro preciso de entrada y salida en tiempo real",
  },
  {
    icon: MapPin,
    title: "Geolocalización",
    desc: "Verificación de ubicación al marcar presencia",
  },
  {
    icon: CalendarDays,
    title: "Gestión de vacaciones",
    desc: "Solicitud y aprobación de días de descanso",
  },
  {
    icon: CalendarRange,
    title: "Calendario de turnos",
    desc: "Planificación y gestión de turnos de trabajo",
  },
  {
    icon: FileText,
    title: "Envío de documentos",
    desc: "Distribución de nóminas y documentos a trabajadores",
  },
];

// ─── PWA install instructions ────────────────────────────────────────────────

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

// ─── Login page ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();

  // mode
  const [mode, setMode] = useState<"login" | "register">("login");

  // login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // register fields
  const [regCompany, setRegCompany] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regShowPassword, setRegShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);

  const switchMode = (m: "login" | "register") => {
    setMode(m);
    setError(null);
  };

  const redirectByRole = () => {
    const user = useAuthStore.getState().user;
    if (user?.role === "superadmin") router.replace("/superadmin/dashboard");
    else if (user?.role === "admin") router.replace("/admin/dashboard");
    else router.replace("/worker/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      redirectByRole();
    } catch (e: any) {
      const detail: string = e.response?.data?.detail ?? "";
      const status: number = e.response?.status ?? 0;
      if (status === 403 || detail.toLowerCase().includes("desactivada")) {
        setError("Tu cuenta está desactivada. Contacta con tu administrador.");
      } else if (detail.toLowerCase().includes("no existe") || detail.toLowerCase().includes("ninguna cuenta")) {
        setError("No existe ninguna cuenta con ese email.");
      } else {
        setError(detail || "Credenciales incorrectas. Inténtalo de nuevo.");
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setRegLoading(true);
    try {
      const res = await api.post("/auth/register", {
        company_name: regCompany,
        admin_full_name: regName,
        email: regEmail,
        password: regPassword,
      });
      const token: string = res.data.access_token;
      setAccessToken(token);
      const payload = JSON.parse(atob(token.split(".")[1]));
      useAuthStore.getState().setUser({
        id: payload.sub,
        email: regEmail,
        full_name: payload.full_name ?? regName,
        role: payload.role,
        geo_consent: payload.geo_consent ?? null,
        privacy_notice_accepted: payload.privacy_notice_accepted ?? null,
        company_id: payload.company_id ?? null,
      });
      redirectByRole();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al crear la cuenta. Inténtalo de nuevo.");
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left panel: branding (desktop only) ────────────────────────── */}
      <div
        className="hidden lg:flex flex-col overflow-hidden relative
                   lg:w-[55%] lg:min-h-screen"
        style={{ backgroundColor: "#051937" }}
      >
        {/* Decorative circles */}
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-10 pointer-events-none"
          style={{ backgroundColor: "#2E6DB4" }}
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-28 -left-20 w-80 h-80 rounded-full opacity-10 pointer-events-none"
          style={{ backgroundColor: "#2E6DB4" }}
          aria-hidden="true"
        />

        {/* Logo + content — centrados juntos verticalmente */}
        <div className="relative z-10 flex-1 flex items-center px-14">
          <div>
            <img
              src="/logo_kronos_white.png"
              alt="KRONOS by Klyp"
              className="w-full max-w-[260px] h-auto object-contain mb-8"
            />
            <p className="text-lg font-semibold mb-1" style={{ color: "#E8EDF5", opacity: 0.9 }}>
              Plataforma integral para RRHH
            </p>
            <p className="text-sm leading-relaxed max-w-sm mb-10" style={{ color: "#E8EDF5", opacity: 0.55 }}>
              Control de fichajes · Geolocalización · Gestión de vacaciones ·
              Calendario de turnos · Envío de documentos a trabajadores
            </p>

            <ul className="space-y-5">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span
                    className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{ backgroundColor: "rgba(46,109,180,0.25)" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: "#E8EDF5" }} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#E8EDF5", opacity: 0.55 }}>{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer — bottom absolute */}
        <div className="absolute bottom-8 left-14 right-14 z-10 flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#2E6DB4" }} aria-hidden="true" />
          <p className="text-xs" style={{ color: "#E8EDF5", opacity: 0.4 }}>
            © {new Date().getFullYear()} KRONOS by Klyp · Cumple Art. 34.9 ET (RDL 8/2019) · RGPD
          </p>
        </div>
      </div>

      {/* ── Right panel: login form ──────────────────────────────────────── */}
      <div
        className="flex flex-col flex-1 lg:items-center lg:justify-center"
        style={{ backgroundColor: "#F0F4FA" }}
      >
        {/* Mobile header — logo + tagline sobre fondo navy */}
        <div
          className="lg:hidden flex flex-col items-center justify-center pt-10 pb-8 px-8 text-center"
          style={{ backgroundColor: "#051937" }}
        >
          <img
            src="/logo_kronos_white.png"
            alt="KRONOS by Klyp"
            className="w-full max-w-[220px] h-auto object-contain mb-4"
          />
          <p className="text-sm font-semibold" style={{ color: "#E8EDF5", opacity: 0.9 }}>
            Plataforma integral para RRHH
          </p>
          <p className="mt-1 text-xs leading-relaxed max-w-xs" style={{ color: "#E8EDF5", opacity: 0.55 }}>
            Fichajes · Geolocalización · Vacaciones · Turnos · Documentos
          </p>
        </div>

        {/* Form area */}
        <div className="flex-1 lg:flex-none flex items-center justify-center w-full px-6 py-8 lg:px-16">
        <div className="w-full max-w-sm">

          {mode === "login" ? (
            <>
              {/* Heading */}
              <div className="mb-7 text-center">
                <h2 className="text-2xl font-bold" style={{ color: "#051937" }}>Bienvenido</h2>
                <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>Accede a tu cuenta para continuar</p>
              </div>

              {/* Login card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium" style={{ color: "#374151" }}>Email</Label>
                    <Input id="email" type="email" placeholder="tu@email.com" value={email}
                      onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                      data-testid="email-input"
                      className="h-10 bg-slate-50 border-slate-200 focus:border-[#2E6DB4] focus:ring-[#2E6DB4] text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium" style={{ color: "#374151" }}>Contraseña</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••"
                        value={password} onChange={(e) => setPassword(e.target.value)} required
                        autoComplete="current-password" data-testid="password-input"
                        className="h-10 bg-slate-50 border-slate-200 focus:border-[#2E6DB4] focus:ring-[#2E6DB4] text-sm pr-10" />
                      <button type="button" onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div role="alert" className="flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border bg-red-50 border-red-200 text-red-700">
                      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button type="submit" disabled={isLoading} data-testid="login-button"
                    className="w-full h-10 mt-1 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#051937" }}
                    onMouseEnter={(e) => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A3A6B"; }}
                    onMouseLeave={(e) => { if (!isLoading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#051937"; }}>
                    {isLoading ? "Iniciando sesión..." : "Iniciar sesión"}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <Link href="/forgot-password" className="text-xs hover:underline" style={{ color: "#2E6DB4" }}>
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
              </div>

              {/* Free trial CTA */}
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center">
                <p className="text-xs font-medium mb-2" style={{ color: "#374151" }}>
                  ¿Aún no tienes cuenta?
                </p>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  style={{ backgroundColor: "#E8EDF5", color: "#051937" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#d1daea"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#E8EDF5"; }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: "#2E6DB4" }} />
                  Probar gratis — 60 fichajes incluidos
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Heading */}
              <div className="mb-7 text-center">
                <h2 className="text-2xl font-bold" style={{ color: "#051937" }}>Crear cuenta gratis</h2>
                <p className="mt-1 text-sm" style={{ color: "#6B7280" }}>
                  Incluye 60 fichajes sin tarjeta de crédito
                </p>
              </div>

              {/* Register card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Company name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-company" className="text-sm font-medium" style={{ color: "#374151" }}>
                      Nombre de la empresa
                    </Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input id="reg-company" type="text" placeholder="Mi Empresa S.L." value={regCompany}
                        onChange={(e) => setRegCompany(e.target.value)} required
                        className="h-10 bg-slate-50 border-slate-200 focus:border-[#2E6DB4] text-sm pl-9" />
                    </div>
                  </div>

                  {/* Full name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name" className="text-sm font-medium" style={{ color: "#374151" }}>
                      Tu nombre completo
                    </Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input id="reg-name" type="text" placeholder="Juan García" value={regName}
                        onChange={(e) => setRegName(e.target.value)} required
                        className="h-10 bg-slate-50 border-slate-200 focus:border-[#2E6DB4] text-sm pl-9" />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email" className="text-sm font-medium" style={{ color: "#374151" }}>Email</Label>
                    <Input id="reg-email" type="email" placeholder="tu@empresa.com" value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)} required autoComplete="email"
                      className="h-10 bg-slate-50 border-slate-200 focus:border-[#2E6DB4] text-sm" />
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password" className="text-sm font-medium" style={{ color: "#374151" }}>Contraseña</Label>
                    <div className="relative">
                      <Input id="reg-password" type={regShowPassword ? "text" : "password"} placeholder="Mín. 8 caracteres"
                        value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required autoComplete="new-password"
                        className="h-10 bg-slate-50 border-slate-200 focus:border-[#2E6DB4] text-sm pr-10" />
                      <button type="button" onClick={() => setRegShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label={regShowPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                        {regShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div role="alert" className="flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border bg-red-50 border-red-200 text-red-700">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button type="submit" disabled={regLoading}
                    className="w-full h-10 mt-1 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "#2E6DB4" }}
                    onMouseEnter={(e) => { if (!regLoading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A3A6B"; }}
                    onMouseLeave={(e) => { if (!regLoading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2E6DB4"; }}>
                    {regLoading ? "Creando cuenta..." : "Crear cuenta gratis"}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button type="button" onClick={() => switchMode("login")}
                    className="text-xs hover:underline" style={{ color: "#6B7280" }}>
                    ¿Ya tienes cuenta? Inicia sesión
                  </button>
                </div>
              </div>
            </>
          )}

          {/* PWA instructions — only in login mode */}
          {mode === "login" && <PwaInstructions />}
        </div>
        </div>{/* end form area */}
      </div>
    </div>
  );
}
