"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FichajeCard } from "@/components/FichajeCard";
import { Clock } from "lucide-react";

interface Pausa {
  id: string;
  start_time: string;
  end_time?: string;
  comment: string;
}

interface Fichaje {
  id: string;
  start_time: string;
  end_time?: string;
  status: "active" | "paused" | "finished";
  total_minutes?: number;
  late_minutes?: number;
  pausas: Pausa[];
}

export default function HistoryPage() {
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Fichaje[]>("/fichajes/me")
      .then((res) => setFichajes(res.data))
      .catch(() => setError("Error al cargar el historial"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Mi Historial</h1>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Clock className="w-5 h-5 animate-spin mr-2" />
          Cargando...
        </div>
      )}

      {error && (
        <p className="text-destructive text-sm">{error}</p>
      )}

      {!loading && fichajes.length === 0 && !error && (
        <p className="text-muted-foreground text-center py-12">
          No hay fichajes registrados aún.
        </p>
      )}

      <div className="space-y-3">
        {fichajes.map((f) => (
          <FichajeCard key={f.id} fichaje={f} />
        ))}
      </div>
    </div>
  );
}
