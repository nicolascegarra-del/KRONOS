"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { Clock, CalendarDays, Info, ChevronLeft, ChevronRight } from "lucide-react";

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

interface DaySchedule {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
}

function hoursFromSchedule(s: DaySchedule): number | null {
  if (!s.start_time || !s.end_time) return null;
  const [sh, sm] = s.start_time.split(":").map(Number);
  const [eh, em] = s.end_time.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

const CURRENT_YEAR = new Date().getFullYear();

export default function WorkerProfile() {
  const { user } = useAuthStore();
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(CURRENT_YEAR);

  const loadSchedule = (y: number) => {
    setLoading(true);
    api
      .get<DaySchedule[]>("/workers/me/schedule", { params: { year: y } })
      .then((res) => setSchedule(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSchedule(year); }, []);

  const changeYear = (delta: number) => {
    const newYear = year + delta;
    setYear(newYear);
    loadSchedule(newYear);
  };

  const activeDays = schedule.filter((d) => d.start_time !== null);
  const totalHours = activeDays.reduce((sum, d) => sum + (hoursFromSchedule(d) ?? 0), 0);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      {/* User info card */}
      <div className="bg-white border rounded-2xl p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl select-none">
          {user?.full_name?.charAt(0).toUpperCase() ?? "?"}
        </div>
        <div>
          <p className="font-semibold text-slate-900">{user?.full_name}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {/* Schedule section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">Mi cuadrante</h2>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1">
            <button
              onClick={() => changeYear(-1)}
              disabled={loading}
              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700 w-12 text-center">{year}</span>
            <button
              onClick={() => changeYear(1)}
              disabled={loading}
              className="p-0.5 rounded hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : activeDays.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center space-y-2">
            <CalendarDays className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-500">Sin cuadrante asignado</p>
            <p className="text-xs text-muted-foreground">
              Tu administrador aún no ha configurado tu horario semanal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Day dots — visual week overview */}
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }, (_, i) => {
                const day = schedule.find((d) => d.day_of_week === i);
                const active = day?.start_time != null;
                return (
                  <div
                    key={i}
                    className={`rounded-xl py-2 text-center ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    <div className="text-xs font-semibold">{DAY_NAMES[i]}</div>
                  </div>
                );
              })}
            </div>

            {/* Day schedule detail list */}
            <div className="bg-white border rounded-xl overflow-hidden">
              {activeDays.map((day, idx) => {
                const hours = hoursFromSchedule(day);
                return (
                  <div
                    key={day.day_of_week}
                    className={`flex items-center justify-between px-4 py-3 text-sm ${
                      idx < activeDays.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <span className="font-medium text-slate-700 w-24">
                      {DAY_FULL[day.day_of_week]}
                    </span>
                    <span className="text-slate-600 tabular-nums">
                      {day.start_time} – {day.end_time}
                    </span>
                    {hours !== null && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 min-w-[40px] justify-end">
                        <Clock className="w-3 h-3" />
                        {hours}h
                      </span>
                    )}
                  </div>
                );
              })}

              {totalHours > 0 && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t text-sm">
                  <span className="text-muted-foreground">Total semanal</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {totalHours}h
                  </span>
                </div>
              )}
            </div>

            {/* Info notice */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span>
                Tu cuadrante es gestionado por el administrador. Para solicitar cambios, contacta con él directamente.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
