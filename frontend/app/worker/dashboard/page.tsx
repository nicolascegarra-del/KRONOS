"use client";

import React from "react";
import { ShiftButton } from "@/components/ShiftButton";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuthStore } from "@/store/auth";

export default function WorkerDashboard() {
  const { user } = useAuthStore();
  const today = format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es });

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          Hola, {user?.full_name || "trabajador"}
        </h1>
        <p className="text-sm text-muted-foreground capitalize">{today}</p>
      </div>

      <ShiftButton />
    </div>
  );
}
