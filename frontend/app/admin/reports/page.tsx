"use client";

import React, { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LatenessAlert } from "@/components/LatenessAlert";
import { minutesToHoursLabel } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { Search, Download } from "lucide-react";

interface WorkerSummary {
  user_id: string;
  full_name: string;
  email: string;
  total_minutes: number;
  total_hours: number;
  late_minutes: number;
  fichaje_count: number;
  pause_count: number;
}

interface HoursReport {
  from_date: string;
  to_date: string;
  workers: WorkerSummary[];
}

interface Alert {
  user_id: string;
  full_name: string;
  email: string;
  date: string;
  scheduled_start?: string;
  actual_start: string;
  late_minutes: number;
}

export default function ReportsPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(subDays(new Date(), 6), "yyyy-MM-dd");

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [report, setReport] = useState<HoursReport | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"hours" | "alerts">("hours");

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const [hoursRes, alertsRes] = await Promise.all([
        api.get<HoursReport>(`/reports/hours?from_date=${fromDate}&to_date=${toDate}`),
        api.get<Alert[]>(`/reports/alerts?from_date=${fromDate}&to_date=${toDate}`),
      ]);
      setReport(hoursRes.data);
      setAlerts(alertsRes.data);
    } catch {
      setError("Error al cargar el informe");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!report) return;
    const headers = ["Nombre", "Email", "Fichajes", "Horas trabajadas", "Minutos tarde", "Pausas"];
    const rows = report.workers.map((w) => [
      w.full_name,
      w.email,
      w.fichaje_count,
      w.total_hours,
      w.late_minutes,
      w.pause_count,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `informe_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Informes</h1>

      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate}
            />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate}
              max={today}
            />
          </div>
          <Button onClick={fetchReport} disabled={loading} className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            {loading ? "Cargando..." : "Consultar"}
          </Button>
          {report && (
            <Button variant="outline" onClick={exportCSV} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {report && (
        <>
          <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === "hours" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTab("hours")}
            >
              Horas ({report.workers.length})
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === "alerts" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setTab("alerts")}
            >
              Retrasos{" "}
              {alerts.length > 0 && (
                <span className="ml-1 bg-red-100 text-red-700 rounded-full px-1.5 text-xs">
                  {alerts.length}
                </span>
              )}
            </button>
          </div>

          {tab === "hours" && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Trabajador</th>
                      <th className="text-right p-3 font-medium">Fichajes</th>
                      <th className="text-right p-3 font-medium">Horas</th>
                      <th className="text-right p-3 font-medium">Min. tarde</th>
                      <th className="text-right p-3 font-medium">Pausas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.workers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          Sin datos para el período seleccionado
                        </td>
                      </tr>
                    ) : (
                      report.workers.map((w) => (
                        <tr key={w.user_id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="p-3">
                            <p className="font-medium">{w.full_name}</p>
                            <p className="text-xs text-muted-foreground">{w.email}</p>
                          </td>
                          <td className="p-3 text-right">{w.fichaje_count}</td>
                          <td className="p-3 text-right font-medium">
                            {minutesToHoursLabel(w.total_minutes)}
                          </td>
                          <td className="p-3 text-right">
                            {w.late_minutes > 0 ? (
                              <span className="text-red-600 font-medium">{w.late_minutes}min</span>
                            ) : (
                              <span className="text-green-600">0</span>
                            )}
                          </td>
                          <td className="p-3 text-right">{w.pause_count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "alerts" && (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Trabajador</th>
                      <th className="text-left p-3 font-medium">Fecha</th>
                      <th className="text-left p-3 font-medium">Retraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-muted-foreground">
                          Sin retrasos en el período seleccionado
                        </td>
                      </tr>
                    ) : (
                      alerts.map((a, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="p-3">
                            <p className="font-medium">{a.full_name}</p>
                            <p className="text-xs text-muted-foreground">{a.email}</p>
                          </td>
                          <td className="p-3">{a.date}</td>
                          <td className="p-3">
                            <LatenessAlert
                              lateMinutes={a.late_minutes}
                              scheduledStart={a.scheduled_start}
                              actualStart={a.actual_start}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
