"use client";

import React, { useEffect, useState } from "react";
import { ShiftButton } from "@/components/ShiftButton";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuthStore } from "@/store/auth";
import { api } from "@/lib/api";
import { AlertCircle } from "lucide-react";

interface FichajeLimit {
  has_limit: boolean;
  max_fichajes: number | null;
  used: number;
  remaining: number | null;
}

export default function WorkerDashboard() {
  const { user } = useAuthStore();
  const today = format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es });
  const [fichajeLimit, setFichajeLimit] = useState<FichajeLimit | null>(null);

  useEffect(() => {
    api.get<FichajeLimit>("/fichajes/limit").then((r) => setFichajeLimit(r.data)).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-6">
      {/* Quota banner */}
      {fichajeLimit?.has_limit && (
        <div className={`w-full max-w-sm flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm ${
          fichajeLimit.remaining === 0
            ? "bg-red-50 border-red-200 text-red-800"
            : (fichajeLimit.remaining ?? 99) <= 10
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-blue-50 border-blue-200 text-blue-800"
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            {fichajeLimit.remaining === 0
              ? <span className="font-medium">Límite alcanzado. </span>
              : <span className="font-medium">Plan gratuito: </span>
            }
            {fichajeLimit.used} / {fichajeLimit.max_fichajes} fichajes usados
            {fichajeLimit.remaining !== null && fichajeLimit.remaining > 0 && (
              <span> · <strong>{fichajeLimit.remaining} restantes</strong></span>
            )}
          </div>
        </div>
      )}

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
