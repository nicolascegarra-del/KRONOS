"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface AbsenceEntry {
  start_date: string;
  end_date: string;
  type: string;
  status: string;
}

interface WorkerCalendarEntry {
  user_id: string;
  full_name: string;
  department?: string;
  region_code?: string;
  absences: AbsenceEntry[];
  holidays: string[]; // ISO date strings
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAY_ABBR = ["L", "M", "X", "J", "V", "S", "D"];

/** Return ISO date string for a given year/month/day. */
function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Determine cell type for a given date and worker entry. */
type CellType =
  | "vacaciones_approved"
  | "vacaciones_pending"
  | "baja_medica"
  | "permiso"
  | "asuntos_propios"
  | "maternidad_paternidad"
  | "lactancia"
  | "excedencia"
  | "permiso_no_retribuido"
  | "otros_absence"
  | "holiday"
  | "weekend"
  | "normal";

function getCellType(
  dateStr: string,
  worker: WorkerCalendarEntry,
  dayOfWeek: number, // 0=Mon … 6=Sun
): CellType {
  if (dayOfWeek >= 5) return "weekend";
  if (worker.holidays.includes(dateStr)) return "holiday";
  for (const a of worker.absences) {
    if (dateStr >= a.start_date && dateStr <= a.end_date) {
      if (a.type === "vacaciones") {
        return a.status === "approved" ? "vacaciones_approved" : "vacaciones_pending";
      }
      if (a.type === "baja_medica") return "baja_medica";
      if (a.type === "permiso") return "permiso";
      if (a.type === "asuntos_propios") return "asuntos_propios";
      if (a.type === "maternidad_paternidad") return "maternidad_paternidad";
      if (a.type === "lactancia") return "lactancia";
      if (a.type === "excedencia") return "excedencia";
      if (a.type === "permiso_no_retribuido") return "permiso_no_retribuido";
      return "otros_absence";
    }
  }
  return "normal";
}

const CELL_STYLES: Record<CellType, string> = {
  vacaciones_approved:   "bg-green-500",
  vacaciones_pending:    "bg-amber-400",
  baja_medica:           "bg-red-500",
  permiso:               "bg-purple-400",
  asuntos_propios:       "bg-cyan-400",
  maternidad_paternidad: "bg-pink-400",
  lactancia:             "bg-rose-400",
  excedencia:            "bg-gray-400",
  permiso_no_retribuido: "bg-orange-400",
  otros_absence:         "bg-slate-400",
  holiday:               "bg-slate-200",
  weekend:               "bg-slate-50",
  normal:                "bg-white",
};

const CELL_TOOLTIPS: Record<CellType, string> = {
  vacaciones_approved:   "Vacaciones (aprobadas)",
  vacaciones_pending:    "Vacaciones (pendientes)",
  baja_medica:           "Baja médica",
  permiso:               "Permiso retribuido",
  asuntos_propios:       "Asuntos propios",
  maternidad_paternidad: "Maternidad / Paternidad",
  lactancia:             "Lactancia",
  excedencia:            "Excedencia",
  permiso_no_retribuido: "Permiso no retribuido",
  otros_absence:         "Ausencia",
  holiday:               "Festivo",
  weekend:               "Fin de semana",
  normal:                "",
};

const LEGEND: { type: CellType; label: string }[] = [
  { type: "vacaciones_approved",   label: "Vacaciones" },
  { type: "vacaciones_pending",    label: "Vacaciones (pend.)" },
  { type: "baja_medica",           label: "Baja médica" },
  { type: "permiso",               label: "Permiso ret." },
  { type: "asuntos_propios",       label: "Asuntos propios" },
  { type: "maternidad_paternidad", label: "Maternidad/Pat." },
  { type: "holiday",               label: "Festivo" },
  { type: "weekend",               label: "Fin de semana" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeamCalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [entries, setEntries] = useState<WorkerCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const daysInMonth = new Date(year, month, 0).getDate();

  // day-of-week for each day (0=Mon … 6=Sun)
  const dayOfWeeks = Array.from({ length: daysInMonth }, (_, i) => {
    return (new Date(year, month - 1, i + 1).getDay() + 6) % 7;
  });

  const fetchCalendar = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await api.get<WorkerCalendarEntry[]>("/admin/team-calendar", {
        params: { year: y, month: m },
      });
      setEntries(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar(year, month);
  }, [year, month, fetchCalendar]);

  const goToPrev = () => {
    const d = new Date(year, month - 2, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const goToNext = () => {
    const d = new Date(year, month, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const syncHolidays = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      // Collect unique region codes from visible workers
      const regionSet = new Set<string>();
      for (const e of entries) { if (e.region_code) regionSet.add(e.region_code); }
      const regions = Array.from(regionSet);
      if (regions.length === 0) {
        setSyncMsg("Ningún trabajador tiene comunidad autónoma asignada.");
        return;
      }
      let total = 0;
      for (const code of regions) {
        const res = await api.post("/admin/holidays/sync", null, {
          params: { region_code: code, year },
        });
        total += res.data.synced ?? 0;
      }
      setSyncMsg(`Sincronizados ${total} festivos para ${regions.length} región${regions.length !== 1 ? "es" : ""}.`);
      fetchCalendar(year, month);
    } catch {
      setSyncMsg("Error al sincronizar festivos.");
    } finally {
      setSyncing(false);
    }
  };

  // Group workers by department
  const deptMap = new Map<string, WorkerCalendarEntry[]>();
  for (const e of entries) {
    const dept = e.department || "Sin departamento";
    if (!deptMap.has(dept)) deptMap.set(dept, []);
    deptMap.get(dept)!.push(e);
  }
  const deptGroups = Array.from(deptMap.entries()).map(([dept, workers]) => ({ dept, workers }));

  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendario de equipo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Ausencias y festivos por trabajador</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={syncHolidays}
          disabled={syncing || loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar festivos"}
        </Button>
      </div>

      {syncMsg && (
        <p className="text-sm text-slate-600 bg-slate-50 border rounded-lg px-3 py-2">{syncMsg}</p>
      )}

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={goToPrev}
          className="p-1.5 rounded hover:bg-accent"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold text-lg min-w-[14ch] text-center">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button
          onClick={goToNext}
          className="p-1.5 rounded hover:bg-accent"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {LEGEND.map((l) => (
          <div key={l.type} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`w-3 h-3 rounded-sm inline-block border border-slate-200 ${CELL_STYLES[l.type]}`} />
            {l.label}
          </div>
        ))}
      </div>

      {/* Calendar table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse bg-slate-100 rounded-lg" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-slate-500 font-medium">Sin trabajadores</p>
          <p className="text-sm text-muted-foreground mt-1">No hay trabajadores activos en tu empresa.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="text-xs border-collapse" style={{ minWidth: `${180 + daysInMonth * 28}px` }}>
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-3 py-2 font-medium text-slate-600 min-w-[160px]">
                  Trabajador
                </th>
                {dayNumbers.map((day) => {
                  const dow = dayOfWeeks[day - 1];
                  const isWeekend = dow >= 5;
                  return (
                    <th
                      key={day}
                      className={`w-7 text-center py-1 font-medium ${isWeekend ? "text-slate-400" : "text-slate-600"}`}
                    >
                      <div>{day}</div>
                      <div className="text-[10px] font-normal">{DAY_ABBR[dow]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {deptGroups.map(({ dept, workers }) => (
                <React.Fragment key={dept}>
                  {/* Department row */}
                  <tr className="bg-slate-100">
                    <td
                      colSpan={daysInMonth + 1}
                      className="sticky left-0 z-10 bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wide"
                    >
                      {dept}
                    </td>
                  </tr>

                  {/* Worker rows */}
                  {workers.map((worker) => (
                    <tr key={worker.user_id} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-slate-50/50 px-3 py-1.5 font-medium text-slate-800 whitespace-nowrap">
                        {worker.full_name}
                      </td>
                      {dayNumbers.map((day) => {
                        const dateStr = isoDate(year, month, day);
                        const dow = dayOfWeeks[day - 1];
                        const cellType = getCellType(dateStr, worker, dow);
                        const tooltip = CELL_TOOLTIPS[cellType];
                        return (
                          <td
                            key={day}
                            title={tooltip || undefined}
                            className={`w-7 h-7 border-l border-slate-100 ${CELL_STYLES[cellType]}`}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
