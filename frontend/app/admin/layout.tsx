"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import {
  LayoutDashboard,
  Users,
  BarChart2,
  Clock,
  Tag,
  Settings,
  LogOut,
  X,
  MapPin,
  MoreHorizontal,
  CalendarRange,
  FileText,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";
import { api } from "@/lib/api";

interface Features { schedule_enabled: boolean; vacation_enabled: boolean; docs_enabled: boolean; }

const BASE_NAV = [
  { href: "/admin/dashboard", label: "Panel", icon: LayoutDashboard, feature: null },
  { href: "/admin/users", label: "Trabajadores", icon: Users, feature: null },
  { href: "/admin/fichajes", label: "Fichajes", icon: Clock, feature: null },
  { href: "/admin/reports", label: "Informes", icon: BarChart2, feature: null },
  { href: "/admin/absences", label: "Ausencias", icon: CalendarRange, feature: "vacation_enabled" },
  { href: "/admin/team-calendar", label: "Calendario", icon: CalendarRange, feature: "vacation_enabled" },
  { href: "/admin/documents", label: "Documentos", icon: FileText, feature: "docs_enabled" },
  { href: "/admin/work-centers", label: "Centros de Trabajo", icon: MapPin, feature: null },
  { href: "/admin/pause-types", label: "Tipos de Pausa", icon: Tag, feature: null },
  { href: "/admin/settings", label: "Configuración", icon: Settings, feature: null },
  { href: "/admin/profile", label: "Mi perfil", icon: UserCircle, feature: null },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [features, setFeatures] = useState<Features>({ schedule_enabled: true, vacation_enabled: true, docs_enabled: false });

  useEffect(() => {
    // Sin cache: el superadmin puede activar/desactivar módulos en cualquier
    // momento y los admins necesitan reflejarlo sin tener que cerrar sesión.
    api.get<Features>("/companies/features")
      .then((r) => setFeatures(r.data))
      .catch(() => {});
  }, []);

  const navItems = BASE_NAV.filter(
    (item) => item.feature === null || features[item.feature as keyof Features]
  );
  const bottomNavItems = navItems.slice(0, 4);
  const moreNavItems = navItems.slice(4);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const isMoreActive = moreNavItems.some((item) => pathname === item.href);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* ── Sidebar ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-200",
          "md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="px-4 pt-5 pb-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex-1 flex justify-center">
              <img src="/logo_kronos.png" alt="Kronos" className="h-14 w-auto max-w-[200px] object-contain" />
            </div>
            <button className="md:hidden shrink-0" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
          <img src="/logo_kronos.png" alt="Kronos" className="h-8 w-auto max-w-[110px] object-contain md:hidden" />
          <div className="flex-1" />
          <NotificationBell />
          <button
            onClick={handleLogout}
            title={user?.email}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-auto pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* ── Bottom nav (mobile only) ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t md:hidden z-30">
        <div className="flex">
          {bottomNavItems.map(({ href, label, icon: Icon }) => (
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

          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors",
              isMoreActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5 mb-1" />
            Más
          </button>
        </div>
      </nav>

      {/* ── "Más" slide-up panel (mobile only) ── */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl md:hidden">
            <div className="flex justify-between items-center px-5 pt-4 pb-2 border-b">
              <span className="text-sm font-semibold text-slate-700">Más opciones</span>
              <button onClick={() => setMoreOpen(false)}>
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-1">
              {moreNavItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors",
                    pathname === href
                      ? "bg-primary/10 text-primary"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
