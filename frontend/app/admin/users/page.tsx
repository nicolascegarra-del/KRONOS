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
import { Plus, Pencil, UserX, UserCheck, CalendarDays, KeyRound } from "lucide-react";

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

const emptyForm: UserFormData = {
  email: "",
  full_name: "",
  password: "",
  scheduled_start: "",
  scheduled_end: "",
  dni: "",
  vacation_days: "22",
};

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

  // Reset password dialog
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSendEmail, setResetSendEmail] = useState(true);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Schedule dialog
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedScheduleUser, setSelectedScheduleUser] = useState<User | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1) // 1-based
  const [scheduleMap, setScheduleMap] = useState<Map<string, { start_time: string; end_time: string }>>(new Map())
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [bulkStart, setBulkStart] = useState("09:00")
  const [bulkEnd, setBulkEnd] = useState("17:00")
  const [scheduleLoading, setScheduleLoading] = useState(false)

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

  const loadScheduleMonth = async (userId: string, year: number, month: number) => {
    setScheduleLoading(true)
    try {
      const res = await api.get(`/users/${userId}/schedule`, { params: { year, month } })
      const map = new Map<string, { start_time: string; end_time: string }>()
      for (const day of res.data) {
        if (day.start_time && day.end_time) {
          map.set(day.schedule_date, { start_time: day.start_time.slice(0,5), end_time: day.end_time.slice(0,5) })
        }
      }
      setScheduleMap(map)
      setSelectedDates(new Set())
    } catch (e) {
      console.error(e)
    } finally {
      setScheduleLoading(false)
    }
  }

  const openResetPassword = (u: User) => {
    setResetUser(u);
    setResetPassword("");
    setResetSendEmail(true);
    setResetError(null);
    setResetSuccess(false);
    setShowResetDialog(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    setResetSaving(true);
    setResetError(null);
    try {
      await api.post(`/users/${resetUser.id}/reset-password`, {
        new_password: resetPassword,
        send_email: resetSendEmail,
      });
      setResetSuccess(true);
      setTimeout(() => setShowResetDialog(false), 1500);
    } catch (err: any) {
      setResetError(err.response?.data?.detail || "Error al resetear la contraseña");
    } finally {
      setResetSaving(false);
    }
  };

  const openSchedule = (user: User) => {
    const year = new Date().getFullYear()
    const month = new Date().getMonth() + 1
    setSelectedScheduleUser(user)
    setCalYear(year)
    setCalMonth(month)
    loadScheduleMonth(user.id, year, month)
    setShowScheduleDialog(true)
  }

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
                        {u.role === "worker" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openResetPassword(u)}
                            aria-label="Resetear contraseña"
                            title="Resetear contraseña"
                          >
                            <KeyRound className="w-4 h-4 text-amber-600" aria-hidden="true" />
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

      {/* Reset Password Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resetear contraseña — {resetUser?.full_name}</DialogTitle>
          </DialogHeader>

          {resetSuccess ? (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
              Contraseña actualizada correctamente.
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label>Nueva contraseña</Label>
                <Input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="send-email-check"
                  checked={resetSendEmail}
                  onChange={(e) => setResetSendEmail(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="send-email-check" className="text-sm text-slate-700">
                  Enviar email al trabajador con la nueva contraseña
                </label>
              </div>

              {resetError && <p className="text-sm text-destructive">{resetError}</p>}

              <div className="flex gap-3 justify-end">
                <Button type="button" variant="outline" onClick={() => setShowResetDialog(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={resetSaving}>
                  {resetSaving ? "Guardando..." : "Resetear"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={(open) => { if (!open) { setShowScheduleDialog(false); setSelectedScheduleUser(null); setSelectedDates(new Set()); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cuadrante — {selectedScheduleUser?.full_name}</DialogTitle>
          </DialogHeader>

          {scheduleLoading ? (
            <div className="flex justify-center py-8"><span className="text-sm text-muted-foreground">Cargando...</span></div>
          ) : (
            <div className="space-y-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between">
                <button
                  className="p-1 rounded hover:bg-accent"
                  onClick={() => {
                    const d = new Date(calYear, calMonth - 2, 1)
                    const newYear = d.getFullYear(); const newMonth = d.getMonth() + 1
                    setCalYear(newYear); setCalMonth(newMonth)
                    if (selectedScheduleUser) loadScheduleMonth(selectedScheduleUser.id, newYear, newMonth)
                  }}
                >‹</button>
                <span className="font-semibold text-sm">
                  {new Date(calYear, calMonth - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
                </span>
                <button
                  className="p-1 rounded hover:bg-accent"
                  onClick={() => {
                    const d = new Date(calYear, calMonth, 1)
                    const newYear = d.getFullYear(); const newMonth = d.getMonth() + 1
                    setCalYear(newYear); setCalMonth(newMonth)
                    if (selectedScheduleUser) loadScheduleMonth(selectedScheduleUser.id, newYear, newMonth)
                  }}
                >›</button>
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
                {["L","M","X","J","V","S","D"].map(d => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const firstDay = new Date(calYear, calMonth - 1, 1)
                  const daysInMonth = new Date(calYear, calMonth, 0).getDate()
                  // Monday=0 offset
                  const startOffset = (firstDay.getDay() + 6) % 7
                  const cells: React.ReactNode[] = []
                  for (let i = 0; i < startOffset; i++) {
                    cells.push(<div key={`empty-${i}`} />)
                  }
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                    const hasSchedule = scheduleMap.has(dateStr)
                    const isSelected = selectedDates.has(dateStr)
                    const sched = scheduleMap.get(dateStr)
                    cells.push(
                      <button
                        key={dateStr}
                        onClick={() => {
                          setSelectedDates(prev => {
                            const next = new Set(prev)
                            if (next.has(dateStr)) next.delete(dateStr)
                            else next.add(dateStr)
                            return next
                          })
                        }}
                        className={[
                          "rounded p-1 text-xs min-h-[3rem] flex flex-col items-center justify-start border transition-colors",
                          isSelected ? "border-primary bg-primary/10" : "border-transparent",
                          hasSchedule && !isSelected ? "bg-blue-50 text-blue-800" : "",
                          !hasSchedule && !isSelected ? "hover:bg-accent" : "",
                        ].join(" ")}
                      >
                        <span className="font-medium">{day}</span>
                        {sched && <span className="text-[10px] leading-tight">{sched.start_time.slice(0,5)}–{sched.end_time.slice(0,5)}</span>}
                      </button>
                    )
                  }
                  return cells
                })()}
              </div>

              {/* Bulk toolbar */}
              {selectedDates.size > 0 && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="text-sm font-medium">{selectedDates.size} día{selectedDates.size !== 1 ? "s" : ""} seleccionado{selectedDates.size !== 1 ? "s" : ""}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-muted-foreground">Entrada</label>
                    <input type="time" value={bulkStart} onChange={e => setBulkStart(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                    <label className="text-xs text-muted-foreground">Salida</label>
                    <input type="time" value={bulkEnd} onChange={e => setBulkEnd(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                    <Button size="sm" onClick={async () => {
                      if (!selectedScheduleUser) return
                      const days = Array.from(selectedDates).map(d => ({ schedule_date: d, start_time: bulkStart + ":00", end_time: bulkEnd + ":00" }))
                      await api.put(`/users/${selectedScheduleUser.id}/schedule`, { days })
                      const next = new Map(scheduleMap)
                      Array.from(selectedDates).forEach(d => next.set(d, { start_time: bulkStart, end_time: bulkEnd }))
                      setScheduleMap(next)
                      setSelectedDates(new Set())
                    }}>Aplicar</Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      if (!selectedScheduleUser) return
                      const days = Array.from(selectedDates).map(d => ({ schedule_date: d, start_time: null, end_time: null }))
                      await api.put(`/users/${selectedScheduleUser.id}/schedule`, { days })
                      const next = new Map(scheduleMap)
                      Array.from(selectedDates).forEach(d => next.delete(d))
                      setScheduleMap(next)
                      setSelectedDates(new Set())
                    }}>Libre</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedDates(new Set())}>✕</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
