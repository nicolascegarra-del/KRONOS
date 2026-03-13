"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { LayoutDashboard, Building2, Users, LogOut, X, CreditCard, FileText, Clock, Shield, MoreHorizontal, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/superadmin/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/superadmin/companies", label: "Empresas", icon: Building2 },
  { href: "/superadmin/users", label: "Usuarios", icon: Users },
  { href: "/superadmin/subscriptions", label: "Suscripciones", icon: CreditCard },
  { href: "/superadmin/invoice-config", label: "Config. Facturas", icon: FileText },
  { href: "/superadmin/fichajes", label: "Fichajes", icon: Clock },
  { href: "/superadmin/access-logs", label: "Log de accesos", icon: Shield },
];

const bottomNavItems = navItems.slice(0, 4);
const moreNavItems = navItems.slice(4);

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreNavItems.some((item) => pathname === item.href);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

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
          <div className="flex items-start justify-between">
            <div className="flex-1 flex flex-col items-center gap-1">
              <img src="/logo_kronos.png" alt="Kronos" className="h-14 w-auto max-w-[200px] object-contain" />
              <span className="text-[9px] text-slate-500 font-semibold uppercase tracking-widest">Powered by Klyp</span>
            </div>
            <button className="md:hidden mt-1 shrink-0" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
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
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3">
          <button
            className="md:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <img src="/logo_kronos.png" alt="Kronos" className="h-8 w-auto max-w-[110px] object-contain md:hidden" />
          <div className="flex-1" />
          <button
            onClick={handleLogout}
            title={user?.email}
            aria-label="Cerrar sesión"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
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
                "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors",
                pathname === href ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors",
              isMoreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {/* ── "Más" slide-up panel (mobile) ── */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-xl md:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-slate-800">Más opciones</span>
              <button onClick={() => setMoreOpen(false)} aria-label="Cerrar panel">
                <X className="w-5 h-5 text-slate-500" aria-hidden="true" />
              </button>
            </div>
            <nav className="p-4 space-y-1 pb-8">
              {moreNavItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors",
                    pathname === href
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
