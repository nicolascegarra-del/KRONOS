"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FichajeCard } from "@/components/FichajeCard";
import { Download } from "lucide-react";
import { downloadBlob } from "@/lib/downloadBlob";
import { useToast } from "@/components/ui/use-toast";

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
  modalidad?: string;
  pausas: Pausa[];
}

export default function HistoryPage() {
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { toast } = useToast();

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
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const res = await api.get("/workers/me/export", { params, responseType: "blob" });
      const label = fromDate || toDate
        ? `${fromDate || "inicio"}_${toDate || "hoy"}`
        : new Date().toISOString().slice(0, 7);
      downloadBlob(res.data, `fichajes_${label}.csv`, "text/csv");
      toast({ title: "Descarga completada", description: `fichajes_${label}.csv`, variant: "success" });
    } catch {
      toast({ title: "Error al descargar", description: "Inténtalo de nuevo", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Mi Historial</h1>

      {/* Export panel */}
      <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
        <p className="text-sm font-medium text-slate-700">Descargar mis datos</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Desde</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Hasta</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloading ? "Descargando..." : "Descargar CSV"}
          </button>
        </div>
        {(fromDate || toDate) && (
          <p className="text-xs text-slate-400">
            {fromDate && toDate
              ? `Exportando fichajes del ${fromDate} al ${toDate}`
              : fromDate
              ? `Exportando fichajes desde ${fromDate}`
              : `Exportando fichajes hasta ${toDate}`}
          </p>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex justify-between">
                <div className="h-4 w-32 animate-pulse bg-slate-200 rounded" />
                <div className="h-5 w-16 animate-pulse bg-slate-200 rounded-full" />
              </div>
              <div className="h-3 w-24 animate-pulse bg-slate-200 rounded" />
              <div className="h-3 w-20 animate-pulse bg-slate-200 rounded" />
            </div>
          ))}
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
