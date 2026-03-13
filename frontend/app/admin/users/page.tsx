"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ImportWorkers } from "@/components/ImportWorkers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, UserX, UserCheck, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "worker";
  is_active: boolean;
  scheduled_start?: string;
  scheduled_end?: string;
  dni?: string;
  vacation_days?: number;
}

interface UserFormData {
  email: string;
  full_name: string;
  password: string;
  scheduled_start: string;
  scheduled_end: string;
  dni: string;
  vacation_days: string;
}

interface DaySchedule {
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
}

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const emptyForm: UserFormData = {
  email: "",
  full_name: "",
  password: "",
  scheduled_start: "",
  scheduled_end: "",
  dni: "",
  vacation_days: "22",
};

const CURRENT_YEAR = new Date().getFullYear();

const emptySchedule = (): DaySchedule[] =>
  Array.from({ length: 7 }, (_, i) => ({ day_of_week: i, start_time: null, end_time: null }));

interface Features { schedule_enabled: boolean; vacation_enabled: boolean; }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<Features>({ schedule_enabled: true, vacation_enabled: true });

  // Schedule dialog
  const [scheduleUser, setScheduleUser] = useState<User | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleYear, setScheduleYear] = useState(CURRENT_YEAR);
  const [schedule, setSchedule] = useState<DaySchedule[]>(emptySchedule());
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    api
      .get<User[]>("/users")
      .then((res) => setUsers(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    api.get<Features>("/companies/features").then((r) => setFeatures(r.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditUser(null);
    setForm(emptyForm);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({
      email: u.email,
      full_name: u.full_name,
      password: "",
      scheduled_start: u.scheduled_start || "",
      scheduled_end: u.scheduled_end || "",
      dni: u.dni || "",
      vacation_days: String(u.vacation_days ?? 22),
    });
    setError(null);
    setDialogOpen(true);
  };

  const openSchedule = async (u: User) => {
    setScheduleUser(u);
    setScheduleOpen(true);
    setScheduleSaved(false);
    setScheduleYear(CURRENT_YEAR);
    await loadScheduleForYear(u.id, CURRENT_YEAR);
  };

  const loadScheduleForYear = async (userId: string, year: number) => {
    setScheduleLoading(true);
    try {
      const res = await api.get<DaySchedule[]>(`/users/${userId}/schedule`, { params: { year } });
      setSchedule(res.data);
    } finally {
      setScheduleLoading(false);
    }
  };

  const changeScheduleYear = async (delta: number) => {
    if (!scheduleUser) return;
    const newYear = scheduleYear + delta;
    setScheduleYear(newYear);
    await loadScheduleForYear(scheduleUser.id, newYear);
  };

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

  const saveSchedule = async () => {
    if (!scheduleUser) return;
    setScheduleSaving(true);
    try {
      const res = await api.put<DaySchedule[]>(`/users/${scheduleUser.id}/schedule`, {
        year: scheduleYear,
        schedule,
      });
      setSchedule(res.data);
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 3000);
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editUser) {
        await api.put(`/users/${editUser.id}`, {
          full_name: form.full_name,
          scheduled_start: form.scheduled_start || null,
          scheduled_end: form.scheduled_end || null,
          dni: form.dni || null,
          vacation_days: form.vacation_days ? parseInt(form.vacation_days) : 22,
        });
      } else {
        await api.post("/users", {
          email: form.email,
          full_name: form.full_name,
          password: form.password,
          scheduled_start: form.scheduled_start || null,
          scheduled_end: form.scheduled_end || null,
          dni: form.dni || null,
          vacation_days: form.vacation_days ? parseInt(form.vacation_days) : 22,
        });
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: User) => {
    await api.put(`/users/${u.id}`, { is_active: !u.is_active });
    fetchUsers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Trabajadores</h1>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo
        </Button>
      </div>

      <div className="mb-6 p-4 border rounded-lg bg-white">
        <h2 className="font-semibold mb-3">Importación masiva</h2>
        <ImportWorkers />
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-medium">Nombre</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">DNI/NIF</th>
                <th className="text-left p-3 font-medium">Rol</th>
                <th className="text-left p-3 font-medium">Horario</th>
                <th className="text-left p-3 font-medium">Estado</th>
                <th className="text-right p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3"><div className="h-4 w-28 animate-pulse bg-slate-200 rounded" /></td>
                    <td className="p-3"><div className="h-4 w-36 animate-pulse bg-slate-200 rounded" /></td>
                    <td className="p-3"><div className="h-4 w-20 animate-pulse bg-slate-200 rounded" /></td>
                    <td className="p-3"><div className="h-5 w-14 animate-pulse bg-slate-200 rounded-full" /></td>
                    <td className="p-3"><div className="h-4 w-20 animate-pulse bg-slate-200 rounded" /></td>
                    <td className="p-3"><div className="h-5 w-14 animate-pulse bg-slate-200 rounded-full" /></td>
                    <td className="p-3 text-right"><div className="h-8 w-24 animate-pulse bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3 font-medium">{u.full_name}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3 text-muted-foreground">{u.dni || "—"}</td>
                    <td className="p-3">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {u.scheduled_start
                        ? `${u.scheduled_start}${u.scheduled_end ? ` – ${u.scheduled_end}` : ""}`
                        : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={u.is_active ? "success" : "destructive"}>
                        {u.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {features.schedule_enabled && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openSchedule(u)}
                            aria-label="Cuadrante anual"
                            title="Cuadrante anual"
                          >
                            <CalendarDays className="w-4 h-4 text-blue-600" aria-hidden="true" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)} aria-label="Editar trabajador">
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => toggleActive(u)} aria-label={u.is_active ? "Desactivar trabajador" : "Activar trabajador"}>
                          {u.is_active ? (
                            <UserX className="w-4 h-4 text-destructive" aria-hidden="true" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-green-600" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create user dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editUser ? "Editar trabajador" : "Nuevo trabajador"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </div>

            {!editUser && (
              <>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contraseña</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>DNI / NIF</Label>
                <Input
                  value={form.dni}
                  onChange={(e) => setForm({ ...form, dni: e.target.value })}
                  placeholder="12345678A"
                />
              </div>
              <div className="space-y-2">
                <Label>Días de vacaciones / año</Label>
                <Input
                  type="number"
                  min="0"
                  max="365"
                  value={form.vacation_days}
                  onChange={(e) => setForm({ ...form, vacation_days: e.target.value })}
                  placeholder="22"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Hora de entrada prevista</Label>
                <Input
                  type="time"
                  value={form.scheduled_start}
                  onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora de salida prevista</Label>
                <Input
                  type="time"
                  value={form.scheduled_end}
                  onChange={(e) => setForm({ ...form, scheduled_end: e.target.value })}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Cuadrante — {scheduleUser?.full_name}
            </DialogTitle>
          </DialogHeader>

          {/* Year navigator */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
            <button
              type="button"
              onClick={() => changeScheduleYear(-1)}
              disabled={scheduleLoading}
              className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-800">{scheduleYear}</span>
            <button
              type="button"
              onClick={() => changeScheduleYear(1)}
              disabled={scheduleLoading}
              className="p-1 rounded hover:bg-slate-200 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {scheduleLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse bg-slate-100 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {schedule.map((day, i) => {
                const active = day.start_time !== null || day.end_time !== null;
                return (
                  <div key={day.day_of_week} className="border rounded-lg p-3 space-y-2 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{DAY_NAMES[i]}</span>
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
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveSchedule} disabled={scheduleSaving || scheduleLoading}>
              {scheduleSaving ? "Guardando..." : scheduleSaved ? "¡Guardado!" : "Guardar cuadrante"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
