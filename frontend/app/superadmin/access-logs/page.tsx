"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Shield } from "lucide-react";

interface AccessLog {
  id: string;
  admin_id: string;
  admin_email: string | null;
  admin_name: string | null;
  action: string;
  target_user_id: string | null;
  accessed_at: string;
  details: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  VIEW_FICHAJES: "Ver fichajes",
  EXPORT_REPORT: "Exportar informe",
  EDIT_FICHAJE: "Editar fichaje",
};

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      const res = await api.get<AccessLog[]>("/superadmin/access-logs", { params });
      setLogs(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-slate-600" />
        <h1 className="text-xl font-semibold">Log de accesos</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Desde</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Hasta</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded-md px-3 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={fetchLogs}
          className="px-4 py-1.5 bg-slate-800 text-white rounded-md text-sm hover:bg-slate-700"
        >
          Filtrar
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No hay registros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Admin</th>
                <th className="px-4 py-3 text-left">Acción</th>
                <th className="px-4 py-3 text-left">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const dt = new Date(log.accessed_at + "Z");
                const dateStr = dt.toLocaleDateString("es-ES");
                const timeStr = dt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                let details: Record<string, string> | null = null;
                try {
                  if (log.details) details = JSON.parse(log.details);
                } catch {}

                return (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {dateStr} {timeStr}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{log.admin_name ?? "—"}</div>
                      <div className="text-xs text-slate-400">{log.admin_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                      {details
                        ? Object.entries(details)
                            .filter(([, v]) => v)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" | ")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
