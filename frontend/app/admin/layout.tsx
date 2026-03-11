"use client";

import React, { useState } from "react";
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
  Menu,
  X,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { href: "/admin/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/admin/users", label: "Trabajadores", icon: Users },
  { href: "/admin/fichajes", label: "Fichajes", icon: Clock },
  { href: "/admin/reports", label: "Informes", icon: BarChart2 },
  { href: "/admin/work-centers", label: "Centros trabajo", icon: MapPin },
  { href: "/admin/pause-types", label: "Tipos pausa", icon: Tag },
  { href: "/admin/settings", label: "Configuración", icon: Settings },
];

// Bottom nav: 4 main items + "Más" button
const bottomNavItems = navItems.slice(0, 4);
const moreNavItems = navItems.slice(4);

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

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const isMoreActive = moreNavItems.some((item) => pathname === item.href);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* ── Sidebar (desktop always visible, mobile slide-in) ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white flex flex-col transition-transform duration-200",
          "md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
          <img src="/logo_kronos.png" alt="Kronos" className="h-12 w-auto max-w-[180px]" />
          <button className="md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
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

        <div className="p-4 border-t border-slate-700">
          <p className="text-xs text-slate-400 mb-1">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
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
          {/* Logo only on mobile (desktop sidebar already shows it) */}
          <img src="/logo_kronos.png" alt="Kronos" className="h-10 w-auto md:hidden" />
          <div className="flex-1" />
          <NotificationBell />
        </header>

        {/* Extra padding on mobile so content clears the bottom nav */}
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

          {/* "Más" button */}
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
              <div className="border-t pt-2 mt-2">
                <p className="text-xs text-muted-foreground px-3 mb-1">{user?.email}</p>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-100 w-full transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
