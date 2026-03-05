"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { LayoutDashboard, Clock, UserCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/worker/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/worker/history", label: "Historial", icon: Clock },
  { href: "/worker/profile", label: "Perfil", icon: UserCircle },
];

export default function WorkerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top header */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center">
        <img src="/logo_kronos.png" alt="Kronos" className="h-10 w-auto" />
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
          <button
            onClick={handleLogout}
            className="flex-1 flex flex-col items-center py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-5 h-5 mb-1" />
            Salir
          </button>
        </div>
      </nav>
    </div>
  );
}
