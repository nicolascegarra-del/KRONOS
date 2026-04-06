"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { LayoutDashboard, Clock, UserCircle, LogOut, ShieldCheck, CalendarRange, CalendarDays, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Features { schedule_enabled: boolean; vacation_enabled: boolean; docs_enabled: boolean; }

const BASE_NAV = [
  { href: "/worker/dashboard", label: "Inicio", icon: LayoutDashboard, feature: null },
  { href: "/worker/history", label: "Historial", icon: Clock, feature: null },
  { href: "/worker/absences", label: "Ausencias", icon: CalendarRange, feature: "vacation_enabled" },
  { href: "/worker/turnos", label: "Turnos", icon: CalendarDays, feature: "schedule_enabled" },
  { href: "/worker/documents", label: "Docs", icon: FileText, feature: "docs_enabled" },
  { href: "/worker/profile", label: "Perfil", icon: UserCircle, feature: null },
] as const;

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, setUser } = useAuthStore();
  const [acceptingNotice, setAcceptingNotice] = useState(false);
  const [features, setFeatures] = useState<Features>({ schedule_enabled: true, vacation_enabled: true, docs_enabled: false });

  useEffect(() => {
    api.get<Features>("/companies/features").then((r) => setFeatures(r.data)).catch(() => {});
  }, []);

  const navItems = BASE_NAV.filter(
    (item) => item.feature === null || features[item.feature as keyof Features]
  );

  const handleAcceptNotice = async () => {
    setAcceptingNotice(true);
    try {
      await api.post("/workers/me/privacy-notice");
      if (user) setUser({ ...user, privacy_notice_accepted: true });
    } finally {
      setAcceptingNotice(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* RGPD Art. 13 — Privacy information notice (blocking until acknowledged) */}
      {user && !user.privacy_notice_accepted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-800">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-lg font-semibold">Información sobre protección de datos</h2>
            </div>
            <div className="text-sm text-slate-600 space-y-3 leading-relaxed">
              <p>
                En cumplimiento del <strong>Reglamento (UE) 2016/679 (RGPD)</strong> y el
                <strong> Art. 34.9 del Estatuto de los Trabajadores</strong>, te informamos de
                lo siguiente:
              </p>
              <ul className="space-y-2 list-none">
                <li><span className="font-medium">Responsable:</span> Tu empresa (administrada por tu admin en Kronos)</li>
                <li><span className="font-medium">Finalidad:</span> Registro obligatorio de jornada laboral. Los datos no se usarán para ninguna otra finalidad.</li>
                <li><span className="font-medium">Datos registrados:</span> Hora de entrada, hora de salida, pausas y, si lo autorizas, ubicación GPS en el momento del fichaje.</li>
                <li><span className="font-medium">Base jurídica:</span> Obligación legal (Art. 34.9 ET). No se requiere tu consentimiento para el registro horario.</li>
                <li><span className="font-medium">Conservación:</span> 4 años, conforme al Art. 34.9 ET.</li>
                <li><span className="font-medium">Destinatarios:</span> El administrador de tu empresa y, en caso de inspección, la Inspección de Trabajo.</li>
                <li>
                  <span className="font-medium">Tus derechos:</span> Acceso, rectificación, portabilidad (descarga de datos disponible en &quot;Mi Historial&quot;) y limitación del tratamiento, dirigiéndote a tu empresa.
                </li>
              </ul>
            </div>
            <button
              onClick={handleAcceptNotice}
              disabled={acceptingNotice}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {acceptingNotice ? "Guardando..." : "He leído y entendido esta información"}
            </button>
          </div>
        </div>
      )}

      {/* Top header */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center">
        <div className="flex-1 flex justify-center">
          <img src="/logo_kronos.png" alt="Kronos" className="h-10 w-auto max-w-[160px] object-contain" />
        </div>
        <button
          onClick={handleLogout}
          title={user?.email}
          className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t">
        <div className="flex">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors",
                pathname === href
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5 mb-1" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
