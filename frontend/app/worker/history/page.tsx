"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FichajeCard } from "@/components/FichajeCard";
import { Clock, Download } from "lucide-react";

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
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api
      .get<Fichaje[]>("/fichajes/me")
      .then((res) => setFichajes(res.data))
      .catch(() => setError("Error al cargar el historial"))
      .finally(() => setLoading(false));
  }, []);

  const handleExport = async () => {
    setDownloading(true);
    try {
      const res = await api.get("/workers/me/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      const month = new Date().toISOString().slice(0, 7);
      a.href = url;
      a.download = `fichajes_${month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Mi Historial</h1>
        <button
          onClick={handleExport}
          disabled={downloading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {downloading ? "Descargando..." : "Descargar mis datos"}
        </button>
      </div>

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
