"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/auth";

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

interface DaySchedule {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
}

const emptySchedule = (): DaySchedule[] =>
  Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    start_time: null,
    end_time: null,
  }));

export default function WorkerProfile() {
  const { user } = useAuthStore();
  const [schedule, setSchedule] = useState<DaySchedule[]>(emptySchedule());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<DaySchedule[]>("/workers/me/schedule").then((res) => {
      setSchedule(res.data);
    }).finally(() => setLoading(false));
  }, []);

  const toggleDay = (index: number, active: boolean) => {
    setSchedule((prev) =>
      prev.map((d, i) =>
        i === index
          ? { ...d, start_time: active ? "09:00" : null, end_time: active ? "17:00" : null }
          : d
      )
    );
  };

  const updateTime = (index: number, field: "start_time" | "end_time", value: string) => {
    setSchedule((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value || null } : d))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.put<DaySchedule[]>("/workers/me/schedule", { schedule });
      setSchedule(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Cargando horario...
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Mi perfil</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-medium text-slate-800">Horario semanal</h2>
        <p className="text-xs text-muted-foreground">
          Activa los días que trabajas y establece tu hora de entrada y salida.
        </p>
      </div>

      <div className="space-y-3">
        {schedule.map((day, i) => {
          const active = day.start_time !== null || day.end_time !== null;
          return (
            <div
              key={day.day_of_week}
              className="border rounded-lg p-3 space-y-2 bg-white"
            >
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{DAY_NAMES[i]}</Label>
                <button
                  type="button"
                  onClick={() => toggleDay(i, !active)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    active ? "bg-primary" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      active ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {active && (
                <div className="flex gap-3 items-center">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Entrada</Label>
                    <Input
                      type="time"
                      value={day.start_time ?? ""}
                      onChange={(e) => updateTime(i, "start_time", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Salida</Label>
                    <Input
                      type="time"
                      value={day.end_time ?? ""}
                      onChange={(e) => updateTime(i, "end_time", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Guardando..." : saved ? "¡Guardado!" : "Guardar horario"}
      </Button>
    </div>
  );
}
