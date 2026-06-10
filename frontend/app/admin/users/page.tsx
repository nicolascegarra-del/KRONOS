"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import { Plus, Pencil, UserX, UserCheck, CalendarDays, KeyRound, Search } from "lucide-react";
import { roleLabel } from "@/lib/roleLabels";
import { useTableSort } from "@/hooks/useTableSort";
import { SortableTableHeader } from "@/components/SortableTableHeader";

const CCAA = [
  { code: "ES-AN", name: "Andalucía" }, { code: "ES-AR", name: "Aragón" },
  { code: "ES-AS", name: "Asturias" }, { code: "ES-IB", name: "Illes Balears" },
  { code: "ES-CN", name: "Canarias" }, { code: "ES-CB", name: "Cantabria" },
  { code: "ES-CL", name: "Castilla y León" }, { code: "ES-CM", name: "Castilla-La Mancha" },
  { code: "ES-CT", name: "Cataluña" }, { code: "ES-EX", name: "Extremadura" },
  { code: "ES-GA", name: "Galicia" }, { code: "ES-RI", name: "La Rioja" },
  { code: "ES-MD", name: "Madrid" }, { code: "ES-MC", name: "Murcia" },
  { code: "ES-NC", name: "Navarra" }, { code: "ES-PV", name: "País Vasco" },
  { code: "ES-VC", name: "C. Valenciana" },
]

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
  vacation_days_type?: "laborales" | "naturales";
  position?: string;
  department?: string;
  region_code?: string;
  fichaje_code?: string;
}

interface UserFormData {
  email: string;
  full_name: string;
  password: string;
  scheduled_start: string;
  scheduled_end: string;
  dni: string;
  vacation_days: string;
  vacation_days_type: "laborales" | "naturales";
  position: string;
  department: string;
  region_code: string;
  fichaje_code: string;
}

const emptyForm: UserFormData = {
  email: "",
  full_name: "",
  password: "",
  scheduled_start: "",
  scheduled_end: "",
  dni: "",
  vacation_days: "22",
  vacation_days_type: "laborales",
  position: "",
  department: "",
  region_code: "",
  fichaje_code: "",
};

interface Features { schedule_enabled: boolean; vacation_enabled: boolean; tablet_enabled: boolean; }

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<Features>({ schedule_enabled: true, vacation_enabled: true, tablet_enabled: false });
  const [codeEmailMsg, setCodeEmailMsg] = useState<string | null>(null);

  // Reset password dialog
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSendEmail, setResetSendEmail] = useState(true);
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetEmailStatus, setResetEmailStatus] = useState<{ sent: boolean; error: string | null } | null>(null);

  // Schedule dialog
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [selectedScheduleUser, setSelectedScheduleUser] = useState<User | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1) // 1-based
  const [scheduleMap, setScheduleMap] = useState<Map<string, { start_time: string; end_time: string; start_time_2?: string; end_time_2?: string }>>(new Map())
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  // Ancla para selección por rango: primer día clicado sin seleccionar.
  const [anchorDate, setAnchorDate] = useState<string | null>(null)
  // Festivos del trabajador para el año mostrado (clave fecha ISO → nombre festivo).
  const [holidaysMap, setHolidaysMap] = useState<Map<string, string>>(new Map())
  const [bulkStart, setBulkStart] = useState("09:00")
  const [bulkEnd, setBulkEnd] = useState("17:00")
  const [splitShift, setSplitShift] = useState(false)
  const [bulkStart2, setBulkStart2] = useState("17:00")
  const [bulkEnd2, setBulkEnd2] = useState("20:00")
  const [scheduleLoading, setScheduleLoading] = useState(false)

  // Filtros
  const [filterRole, setFilterRole] = useState<"" | "admin" | "worker">("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("");
  const [search, setSearch] = useState("");

  // Alta con set-password-link (solo modo creación)
  const [sendSetPasswordLink, setSendSetPasswordLink] = useState(false);

  const fetchUsers = () => {
    setLoading(true);
    api
      .get<User[]>("/users")
      .then((res) => setUsers(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    api.get<Features>("/companies/features")
      .then((r) => setFeatures(r.data))
      .catch(() => {});
  }, []);

  // Filtrado en cliente (la lista viene completa del endpoint)
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filterRole && u.role !== filterRole) return false;
      if (filterStatus === "active" && !u.is_active) return false;
      if (filterStatus === "inactive" && u.is_active) return false;
      if (q) {
        const haystack = `${u.full_name} ${u.email} ${u.dni ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [users, filterRole, filterStatus, search]);

  const { sorted: visibleUsers, sortKey, direction, handleSort } = useTableSort(
    filteredUsers as unknown as Record<string, unknown>[],
    "full_name"
  );

  const openCreate = () => {
    setEditUser(null);
    setForm(emptyForm);
    setSendSetPasswordLink(false);
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
      vacation_days_type: u.vacation_days_type ?? "laborales",
      position: u.position || "",
      department: u.department || "",
      region_code: u.region_code || "",
      fichaje_code: u.fichaje_code || "",
    });
    setError(null);
    setCodeEmailMsg(null);
    setDialogOpen(true);
  };

  const loadScheduleMonth = async (userId: string, year: number, month: number) => {
    setScheduleLoading(true)
    try {
      const res = await api.get(`/users/${userId}/schedule`, { params: { year, month } })
      const map = new Map<string, { start_time: string; end_time: string; start_time_2?: string; end_time_2?: string }>()
      for (const day of res.data) {
        if (day.start_time && day.end_time) {
          map.set(day.schedule_date, {
            start_time: day.start_time.slice(0,5),
            end_time: day.end_time.slice(0,5),
            start_time_2: day.start_time_2 ? day.start_time_2.slice(0,5) : undefined,
            end_time_2: day.end_time_2 ? day.end_time_2.slice(0,5) : undefined,
          })
        }
      }
      setScheduleMap(map)
      setSelectedDates(new Set())
      setAnchorDate(null)
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
    setResetEmailStatus(null);
    try {
      const res = await api.post<{ ok: boolean; email_sent: boolean; email_error: string | null }>(
        `/users/${resetUser.id}/reset-password`,
        { new_password: resetPassword, send_email: resetSendEmail },
      );
      setResetSuccess(true);
      if (resetSendEmail) {
        setResetEmailStatus({ sent: res.data.email_sent, error: res.data.email_error });
      }
      // Si el email falló, no cerramos el diálogo: que el admin vea el motivo.
      if (!resetSendEmail || res.data.email_sent) {
        setTimeout(() => setShowResetDialog(false), 1800);
      }
    } catch (err: any) {
      setResetError(err.response?.data?.detail || "Error al resetear la contraseña");
    } finally {
      setResetSaving(false);
    }
  };

  const loadHolidaysYear = async (userId: string, year: number) => {
    try {
      const res = await api.get<Array<{ holiday_date: string; name: string }>>(
        `/users/${userId}/holidays`, { params: { year } }
      )
      const map = new Map<string, string>()
      for (const h of res.data) map.set(h.holiday_date, h.name)
      setHolidaysMap(map)
    } catch {
      setHolidaysMap(new Map())
    }
  }

  const openSchedule = (user: User) => {
    const year = new Date().getFullYear()
    const month = new Date().getMonth() + 1
    setSelectedScheduleUser(user)
    setCalYear(year)
    setCalMonth(month)
    loadScheduleMonth(user.id, year, month)
    loadHolidaysYear(user.id, year)
    setShowScheduleDialog(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const hrFields = {
        position: form.position || null,
        department: form.department || null,
        region_code: form.region_code || null,
      };
      if (editUser) {
        await api.put(`/users/${editUser.id}`, {
          full_name: form.full_name,
          scheduled_start: form.scheduled_start || null,
          scheduled_end: form.scheduled_end || null,
          dni: form.dni || null,
          fichaje_code: form.fichaje_code || "",
          vacation_days: form.vacation_days ? parseInt(form.vacation_days) : 22,
          vacation_days_type: form.vacation_days_type,
          ...hrFields,
        });
      } else {
        await api.post("/users", {
          email: form.email,
          full_name: form.full_name,
          password: sendSetPasswordLink ? null : form.password,
          send_set_password_link: sendSetPasswordLink,
          scheduled_start: form.scheduled_start || null,
          scheduled_end: form.scheduled_end || null,
          dni: form.dni || null,
          fichaje_code: form.fichaje_code || null,
          vacation_days: form.vacation_days ? parseInt(form.vacation_days) : 22,
          vacation_days_type: form.vacation_days_type,
          ...hrFields,
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

  // Genera un código numérico aleatorio de 6 dígitos para el campo de fichaje.
  const generateFichajeCode = () => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setForm((f) => ({ ...f, fichaje_code: code }));
    setCodeEmailMsg(null);
  };

  // Reenvía por email al trabajador su código de fichaje actual (solo en edición).
  const sendFichajeCodeEmail = async () => {
    if (!editUser) return;
    setCodeEmailMsg("Enviando…");
    try {
      const res = await api.post<{ email_sent: boolean; email_error: string | null }>(
        `/users/${editUser.id}/fichaje-code/email`
      );
      setCodeEmailMsg(
        res.data.email_sent
          ? "✓ Código enviado por email"
          : `No se pudo enviar: ${res.data.email_error ?? "error desconocido"}`
      );
    } catch (e: any) {
      setCodeEmailMsg(e.response?.data?.detail || "No se pudo enviar el email");
    }
  };

  // Memoize calendar grid cells — only regenerate when month/year or data change
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth - 1, 1)
    const daysInMonth = new Date(calYear, calMonth, 0).getDate()
    const startOffset = (firstDay.getDay() + 6) % 7
    const cells: React.ReactNode[] = []
    for (let i = 0; i < startOffset; i++) {
      cells.push(<div key={`empty-${i}`} />)
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const hasSchedule = scheduleMap.has(dateStr)
      const isSelected = selectedDates.has(dateStr)
      const isAnchor = anchorDate === dateStr
      const sched = scheduleMap.get(dateStr)
      const holidayName = holidaysMap.get(dateStr)
      cells.push(
        <button
          key={dateStr}
          title={holidayName || undefined}
          onClick={() => {
            if (isSelected) {
              // Quitar este día de la selección, conservando el resto del rango.
              setSelectedDates(prev => {
                const next = new Set(prev)
                next.delete(dateStr)
                if (next.size === 0) setAnchorDate(null)
                return next
              })
              if (isAnchor) setAnchorDate(null)
              return
            }
            if (anchorDate) {
              // Construir rango desde el ancla hasta este día.
              const start = anchorDate < dateStr ? anchorDate : dateStr
              const end = anchorDate < dateStr ? dateStr : anchorDate
              setSelectedDates(prev => {
                const next = new Set(prev)
                const startDate = new Date(start + "T00:00:00")
                const endDate = new Date(end + "T00:00:00")
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                  next.add(ds)
                }
                return next
              })
              setAnchorDate(null)
              return
            }
            // Primer click: marcar este día como ancla y seleccionarlo.
            setSelectedDates(prev => {
              const next = new Set(prev)
              next.add(dateStr)
              return next
            })
            setAnchorDate(dateStr)
          }}
          className={[
            "rounded p-1 text-xs min-h-[3rem] flex flex-col items-center justify-start border transition-colors",
            isSelected ? "border-primary bg-primary/10" : "border-transparent",
            isAnchor ? "ring-2 ring-primary ring-offset-1" : "",
            holidayName && !isSelected ? "bg-red-50 text-red-700" : "",
            hasSchedule && !isSelected && !holidayName ? "bg-blue-50 text-blue-800" : "",
            !hasSchedule && !isSelected && !holidayName ? "hover:bg-accent" : "",
          ].join(" ")}
        >
          <span className={`font-medium ${holidayName && !isSelected ? "text-red-700" : ""}`}>{day}</span>
          {holidayName && !sched && (
            <span className="text-[9px] leading-tight text-red-600 truncate w-full px-0.5" title={holidayName}>
              {holidayName.length > 10 ? holidayName.slice(0, 10) + "…" : holidayName}
            </span>
          )}
          {sched && <span className="text-[10px] leading-tight">{sched.start_time}–{sched.end_time}</span>}
          {sched?.start_time_2 && sched?.end_time_2 && (
            <span className="text-[10px] leading-tight text-blue-600">{sched.start_time_2}–{sched.end_time_2}</span>
          )}
        </button>
      )
    }
    return cells
  }, [calYear, calMonth, scheduleMap, selectedDates, anchorDate, holidaysMap])

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

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email o DNI…"
            className="pl-9"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as "" | "admin" | "worker")}
          className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
        >
          <option value="">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="worker">Trabajador</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "" | "active" | "inactive")}
          className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
        >
          <option value="">Activos e inactivos</option>
          <option value="active">Solo activos</option>
          <option value="inactive">Solo inactivos</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b sticky top-0 z-10">
              <tr>
                <SortableTableHeader label="Nombre" sortKey="full_name" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
                <SortableTableHeader label="Email" sortKey="email" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
                <SortableTableHeader label="DNI/NIF" sortKey="dni" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
                <SortableTableHeader label="Rol" sortKey="role" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
                <th className="text-left p-3 font-medium">Horario</th>
                <SortableTableHeader label="Estado" sortKey="is_active" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
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
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">
                    No hay trabajadores que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                (visibleUsers as unknown as User[]).map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3 font-medium">{u.full_name}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3 text-muted-foreground">{u.dni || "—"}</td>
                    <td className="p-3">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {roleLabel(u.role)}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                <div className="flex items-start gap-2 p-3 border rounded-md bg-slate-50">
                  <input
                    type="checkbox"
                    id="send-set-password-link"
                    checked={sendSetPasswordLink}
                    onChange={(e) => setSendSetPasswordLink(e.target.checked)}
                    className="rounded mt-0.5"
                  />
                  <label htmlFor="send-set-password-link" className="text-sm text-slate-700 cursor-pointer leading-snug">
                    Enviar email al trabajador para que <strong>establezca su propia contraseña</strong>
                    {" "}(en lugar de fijarla yo aquí).
                  </label>
                </div>
                {!sendSetPasswordLink && (
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
                )}
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
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={form.vacation_days}
                    onChange={(e) => setForm({ ...form, vacation_days: e.target.value })}
                    placeholder={form.vacation_days_type === "naturales" ? "30" : "22"}
                    className="flex-1"
                  />
                  <select
                    value={form.vacation_days_type}
                    onChange={(e) =>
                      setForm({ ...form, vacation_days_type: e.target.value as "laborales" | "naturales" })
                    }
                    className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    aria-label="Tipo de días de vacaciones"
                  >
                    <option value="laborales">Laborales</option>
                    <option value="naturales">Naturales</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {form.vacation_days_type === "laborales"
                    ? "Solo se cuentan días laborables (L-V, sin festivos)."
                    : "Se cuentan todos los días, incluidos fines de semana y festivos."}
                </p>
              </div>
            </div>

            {features.tablet_enabled && (
              <div className="space-y-2 rounded-lg border p-3 bg-slate-50">
                <Label>Código de fichaje (tablet)</Label>
                <div className="flex gap-2">
                  <Input
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={6}
                    value={form.fichaje_code}
                    onChange={(e) => {
                      setForm({ ...form, fichaje_code: e.target.value.replace(/\D/g, "").slice(0, 6) });
                      setCodeEmailMsg(null);
                    }}
                    placeholder="4 a 6 dígitos"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={generateFichajeCode}
                    className="text-sm px-3 rounded-md border border-slate-200 hover:bg-white text-slate-600 whitespace-nowrap"
                  >
                    Generar
                  </button>
                  {editUser && (
                    <button
                      type="button"
                      onClick={sendFichajeCodeEmail}
                      disabled={!editUser.fichaje_code}
                      title={editUser.fichaje_code ? "Enviar el código guardado por email" : "Guarda primero un código"}
                      className="text-sm px-3 rounded-md border border-slate-200 hover:bg-white text-slate-600 whitespace-nowrap disabled:opacity-40"
                    >
                      Enviar por email
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  El trabajador usa este código en la tablet para fichar. Debe ser único en la empresa.
                  {editUser && " Para enviar un código nuevo, guarda primero los cambios."}
                </p>
                {codeEmailMsg && <p className="text-xs text-slate-600">{codeEmailMsg}</p>}
              </div>
            )}

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

            {/* Datos laborales */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Datos laborales</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Puesto / cargo</Label>
                  <Input
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                    placeholder="Ej: Técnico de soporte"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Departamento</Label>
                  <Input
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    placeholder="Ej: Operaciones"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Comunidad autónoma</Label>
                <select
                  value={form.region_code}
                  onChange={(e) => setForm({ ...form, region_code: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">— Sin especificar —</option>
                  {CCAA.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
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
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
                Contraseña actualizada correctamente.
              </div>
              {resetEmailStatus && (
                resetEmailStatus.sent ? (
                  <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-2 text-xs">
                    Email enviado al trabajador.
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2 text-xs">
                    No se pudo enviar el email{resetEmailStatus.error ? `: ${resetEmailStatus.error}` : ""}.
                    La contraseña sí se ha cambiado; comunícasela manualmente.
                  </div>
                )
              )}
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
      <Dialog open={showScheduleDialog} onOpenChange={(open) => { if (!open) { setShowScheduleDialog(false); setSelectedScheduleUser(null); setSelectedDates(new Set()); setAnchorDate(null); setHolidaysMap(new Map()); } }}>
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
                    const yearChanged = newYear !== calYear
                    setCalYear(newYear); setCalMonth(newMonth)
                    if (selectedScheduleUser) {
                      loadScheduleMonth(selectedScheduleUser.id, newYear, newMonth)
                      if (yearChanged) loadHolidaysYear(selectedScheduleUser.id, newYear)
                    }
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
                    const yearChanged = newYear !== calYear
                    setCalYear(newYear); setCalMonth(newMonth)
                    if (selectedScheduleUser) {
                      loadScheduleMonth(selectedScheduleUser.id, newYear, newMonth)
                      if (yearChanged) loadHolidaysYear(selectedScheduleUser.id, newYear)
                    }
                  }}
                >›</button>
              </div>

              {/* Calendar grid */}
              <p className="text-xs text-muted-foreground bg-slate-50 border rounded px-2 py-1.5 leading-snug">
                Pincha el primer día y luego el último para seleccionar el rango.
                Pincha un día seleccionado para quitarlo (p. ej. fines de semana).
              </p>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-1">
                {["L","M","X","J","V","S","D"].map(d => <div key={d}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells}
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
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="split-shift-check"
                      checked={splitShift}
                      onChange={e => setSplitShift(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="split-shift-check" className="text-xs text-muted-foreground cursor-pointer">Horario partido (2º turno)</label>
                  </div>
                  {splitShift && (
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs text-blue-600">Entrada 2</label>
                      <input type="time" value={bulkStart2} onChange={e => setBulkStart2(e.target.value)} className="border rounded px-2 py-1 text-sm border-blue-300" />
                      <label className="text-xs text-blue-600">Salida 2</label>
                      <input type="time" value={bulkEnd2} onChange={e => setBulkEnd2(e.target.value)} className="border rounded px-2 py-1 text-sm border-blue-300" />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={async () => {
                      if (!selectedScheduleUser) return
                      const days = Array.from(selectedDates).map(d => ({
                        schedule_date: d,
                        start_time: bulkStart + ":00",
                        end_time: bulkEnd + ":00",
                        start_time_2: splitShift ? bulkStart2 + ":00" : null,
                        end_time_2: splitShift ? bulkEnd2 + ":00" : null,
                      }))
                      await api.put(`/users/${selectedScheduleUser.id}/schedule`, { days })
                      const next = new Map(scheduleMap)
                      Array.from(selectedDates).forEach(d => next.set(d, {
                        start_time: bulkStart,
                        end_time: bulkEnd,
                        start_time_2: splitShift ? bulkStart2 : undefined,
                        end_time_2: splitShift ? bulkEnd2 : undefined,
                      }))
                      setScheduleMap(next)
                      setSelectedDates(new Set())
                      setAnchorDate(null)
                    }}>Aplicar</Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      if (!selectedScheduleUser) return
                      const days = Array.from(selectedDates).map(d => ({ schedule_date: d, start_time: null, end_time: null }))
                      await api.put(`/users/${selectedScheduleUser.id}/schedule`, { days })
                      const next = new Map(scheduleMap)
                      Array.from(selectedDates).forEach(d => next.delete(d))
                      setScheduleMap(next)
                      setSelectedDates(new Set())
                      setAnchorDate(null)
                    }}>Libre</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setSelectedDates(new Set()); setAnchorDate(null) }}>✕</Button>
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
