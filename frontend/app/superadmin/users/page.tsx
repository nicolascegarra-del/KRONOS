"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2, FileX, Users, ChevronDown, X, UserPlus, Search } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roleLabels";
import { useTableSort } from "@/hooks/useTableSort";
import { SortableTableHeader } from "@/components/SortableTableHeader";

interface CompanyOption {
  id: string;
  name: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "superadmin" | "admin" | "worker";
  is_active: boolean;
  company_id: string | null;
  company_name: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  dni: string | null;
  created_at: string;
}

interface UserForm {
  email: string;
  full_name: string;
  password: string;
  role: string;
  company_id: string;
  scheduled_start: string;
  scheduled_end: string;
  dni: string;
  is_active: boolean;
}

const EMPTY_FORM: UserForm = {
  email: "", full_name: "", password: "", role: "worker",
  company_id: "", scheduled_start: "", scheduled_end: "", dni: "", is_active: true,
};

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, string> = {
    superadmin: "bg-purple-100 text-purple-700",
    admin: "bg-blue-100 text-blue-700",
    worker: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg[role] ?? "bg-slate-100 text-slate-500"}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function CompanySelect({
  companies,
  value,
  onChange,
}: {
  companies: CompanyOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = companies.find((c) => c.id === value) ?? null;
  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? selected.name : "Sin empresa"}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {selected && (
            <span
              onClick={(e) => { e.stopPropagation(); onChange(""); setSearch(""); }}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          <div className="p-2 border-b">
            <input
              autoFocus
              type="text"
              placeholder="Buscar empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-input px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            <li
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-slate-100 ${value === "" ? "bg-slate-50 font-medium" : ""}`}
            >
              <span className="text-muted-foreground italic">Sin empresa</span>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No hay resultados</li>
            ) : (
              filtered.map((c) => (
                <li
                  key={c.id}
                  onClick={() => { onChange(c.id); setOpen(false); setSearch(""); }}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-slate-100 ${value === c.id ? "bg-blue-50 text-blue-700 font-medium" : ""}`}
                >
                  {c.name}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function UserFormFields({
  form,
  setForm,
  companies,
  isCreate,
}: {
  form: UserForm;
  setForm: React.Dispatch<React.SetStateAction<UserForm>>;
  companies: CompanyOption[];
  isCreate: boolean;
}) {
  const set = (field: keyof UserForm, value: unknown) =>
    setForm((p) => ({ ...p, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Nombre completo</Label>
          <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>DNI / NIF</Label>
          <Input value={form.dni} onChange={(e) => set("dni", e.target.value)} placeholder="12345678A" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Email</Label>
        <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>{isCreate ? "Contraseña" : "Nueva contraseña (dejar vacío para no cambiar)"}</Label>
        <Input
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Rol</Label>
          <select
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          >
            <option value="superadmin">Superadmin</option>
            <option value="admin">Administrador</option>
            <option value="worker">Trabajador</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Empresa</Label>
          <CompanySelect
            companies={companies}
            value={form.company_id}
            onChange={(id) => set("company_id", id)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Hora entrada (HH:MM)</Label>
          <Input type="time" value={form.scheduled_start} onChange={(e) => set("scheduled_start", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Hora salida (HH:MM)</Label>
          <Input type="time" value={form.scheduled_end} onChange={(e) => set("scheduled_end", e.target.value)} />
        </div>
      </div>
      {!isCreate && (
        <div className="flex items-center gap-3">
          <Label>Activo</Label>
          <button
            type="button"
            onClick={() => set("is_active", !form.is_active)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-primary" : "bg-slate-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function SuperadminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<UserForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState<UserForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "deleteUsers" | "deleteFichajes">(null);

  // Filtros
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [filterRole, setFilterRole] = useState<"" | "superadmin" | "admin" | "worker">("");
  const [filterStatus, setFilterStatus] = useState<"" | "active" | "inactive">("");
  const [search, setSearch] = useState("");

  const load = async () => {
    try {
      const [usersRes, companiesRes] = await Promise.all([
        api.get<UserRow[]>("/superadmin/users"),
        api.get<CompanyOption[]>("/companies"),
      ]);
      setUsers(usersRes.data);
      setCompanies(companiesRes.data);
      setSelected(new Set());
    } catch {
      setError("Error al cargar los usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Filtrado en cliente
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filterCompany === "__none__") {
        if (u.company_id !== null) return false;
      } else if (filterCompany && u.company_id !== filterCompany) {
        return false;
      }
      if (filterRole && u.role !== filterRole) return false;
      if (filterStatus === "active" && !u.is_active) return false;
      if (filterStatus === "inactive" && u.is_active) return false;
      if (q) {
        const haystack = `${u.full_name} ${u.email} ${u.dni ?? ""} ${u.company_name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [users, filterCompany, filterRole, filterStatus, search]);

  const { sorted: visibleUsers, sortKey, direction, handleSort } = useTableSort(
    filteredUsers as unknown as Record<string, unknown>[],
    "full_name"
  );

  const selectableIds = filteredUsers.filter((u) => u.role !== "superadmin").map((u) => u.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // --- Create ---
  const handleCreate = async () => {
    if (!createForm.password) { setCreateError("La contraseña es obligatoria"); return; }
    setCreating(true);
    setCreateError(null);
    try {
      await api.post("/superadmin/users", {
        email: createForm.email,
        full_name: createForm.full_name,
        password: createForm.password,
        role: createForm.role,
        company_id: createForm.company_id || null,
        scheduled_start: createForm.scheduled_start || null,
        scheduled_end: createForm.scheduled_end || null,
        dni: createForm.dni || null,
      });
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      await load();
    } catch (e: any) {
      setCreateError(e.response?.data?.detail || "Error al crear el usuario");
    } finally {
      setCreating(false);
    }
  };

  // --- Edit ---
  const openEdit = (u: UserRow) => {
    setEditTarget(u);
    setEditForm({
      email: u.email,
      full_name: u.full_name,
      password: "",
      role: u.role,
      company_id: u.company_id ?? "",
      scheduled_start: u.scheduled_start ?? "",
      scheduled_end: u.scheduled_end ?? "",
      dni: u.dni ?? "",
      is_active: u.is_active,
    });
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        email: editForm.email,
        full_name: editForm.full_name,
        role: editForm.role,
        is_active: editForm.is_active,
        company_id: editForm.company_id || null,
        scheduled_start: editForm.scheduled_start || null,
        scheduled_end: editForm.scheduled_end || null,
        dni: editForm.dni || null,
      };
      if (editForm.password) body.password = editForm.password;
      await api.put(`/superadmin/users/${editTarget.id}`, body);
      setEditTarget(null);
      await load();
    } catch (e: any) {
      setSaveError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  // --- Bulk delete fichajes for single user ---
  const deleteFichajesForUser = async (u: UserRow) => {
    if (!confirm(`¿Borrar TODOS los fichajes de ${u.full_name}? Esta acción no se puede deshacer.`)) return;
    setBulkLoading(true);
    setBulkMsg(null);
    try {
      const res = await api.delete<{ deleted: number }>(`/superadmin/users/fichajes?user_id=${u.id}`);
      setBulkMsg({ ok: true, text: `${res.data.deleted} fichaje(s) de ${u.full_name} eliminados.` });
      await load();
    } catch (e: any) {
      setBulkMsg({ ok: false, text: e.response?.data?.detail || "Error al borrar fichajes" });
    } finally {
      setBulkLoading(false);
    }
  };

  // --- Bulk actions ---
  const executeBulkAction = async () => {
    if (!confirmAction || selected.size === 0) return;
    setBulkLoading(true);
    setBulkMsg(null);
    setConfirmAction(null);
    try {
      const selectedIds = Array.from(selected);
      if (confirmAction === "deleteFichajes") {
        const results = await Promise.all(
          selectedIds.map((uid) => api.delete<{ deleted: number }>(`/superadmin/users/fichajes?user_id=${uid}`))
        );
        const total = results.reduce((acc, r) => acc + r.data.deleted, 0);
        setBulkMsg({ ok: true, text: `${total} fichaje(s) eliminados de ${selectedIds.length} usuario(s).` });
      } else {
        const res = await api.delete<{ deleted: number }>("/superadmin/users/bulk", {
          data: { user_ids: selectedIds },
        });
        setBulkMsg({ ok: true, text: `${res.data.deleted} usuario(s) eliminados correctamente.` });
      }
      await load();
    } catch (e: any) {
      setBulkMsg({ ok: false, text: e.response?.data?.detail || "Error en la operación" });
    } finally {
      setBulkLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={() => { setCreateForm(EMPTY_FORM); setCreateError(null); setCreateOpen(true); }} className="flex items-center gap-2">
          <UserPlus className="w-4 h-4" />
          Crear usuario
        </Button>
      </div>
      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-slate-900 text-white rounded-lg text-sm">
          <Users className="w-4 h-4 shrink-0" />
          <span className="flex-1 font-medium">{selected.size} usuario(s) seleccionado(s)</span>
          <Button size="sm" variant="outline" className="text-white border-white/30 hover:bg-white/10 hover:text-white" disabled={bulkLoading} onClick={() => setConfirmAction("deleteFichajes")}>
            <FileX className="w-3 h-3 mr-1" />Borrar sus fichajes
          </Button>
          <Button size="sm" variant="destructive" disabled={bulkLoading} onClick={() => setConfirmAction("deleteUsers")}>
            <Trash2 className="w-3 h-3 mr-1" />Borrar usuarios
          </Button>
          <button className="ml-1 text-white/60 hover:text-white text-lg leading-none" onClick={() => setSelected(new Set())}>✕</button>
        </div>
      )}

      {bulkMsg && (
        <p className={`text-sm mb-4 px-3 py-2 rounded ${bulkMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-destructive"}`}>
          {bulkMsg.text}
        </p>
      )}

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, email, DNI o empresa…"
            className="pl-9"
          />
        </div>
        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
        >
          <option value="">Todas las empresas</option>
          <option value="__none__">Sin empresa</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as "" | "superadmin" | "admin" | "worker")}
          className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
        >
          <option value="">Todos los roles</option>
          <option value="superadmin">Superadmin</option>
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

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" title="Seleccionar todos (excepto superadmins)" />
                </th>
                <SortableTableHeader label="Nombre" sortKey="full_name" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
                <SortableTableHeader label="Email" sortKey="email" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
                <SortableTableHeader label="Rol" sortKey="role" currentKey={sortKey} currentDirection={direction} onSort={handleSort} align="center" />
                <SortableTableHeader label="Empresa" sortKey="company_name" currentKey={sortKey} currentDirection={direction} onSort={handleSort} />
                <SortableTableHeader label="Activo" sortKey="is_active" currentKey={sortKey} currentDirection={direction} onSort={handleSort} align="center" />
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">
                    No hay usuarios que coincidan con los filtros.
                  </td>
                </tr>
              ) : (visibleUsers as unknown as UserRow[]).map((u) => {
                const isSuperadmin = u.role === "superadmin";
                const isChecked = selected.has(u.id);
                return (
                  <tr key={u.id} className={`border-b last:border-0 hover:bg-slate-50 ${isChecked ? "bg-blue-50" : ""}`}>
                    <td className="p-3">
                      {!isSuperadmin && (
                        <input type="checkbox" checked={isChecked} onChange={() => toggleOne(u.id)} className="h-4 w-4 rounded border-gray-300" />
                      )}
                    </td>
                    <td className="p-3 font-medium">{u.full_name}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3 text-center"><RoleBadge role={u.role} /></td>
                    <td className="p-3 text-sm text-muted-foreground">{u.company_name ?? "—"}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {u.is_active ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(u)} title="Editar usuario">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {!isSuperadmin && (
                          <Button size="sm" variant="ghost" className="text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => deleteFichajesForUser(u)} disabled={bulkLoading} title="Borrar fichajes de este usuario">
                            <FileX className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm bulk action dialog */}
      <Dialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmAction === "deleteUsers" ? "Borrar usuarios" : "Borrar fichajes"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction === "deleteUsers"
              ? `¿Eliminar permanentemente los ${selected.size} usuario(s) seleccionado(s) junto con todos sus fichajes? Esta acción no se puede deshacer.`
              : `¿Eliminar todos los fichajes de los ${selected.size} usuario(s) seleccionado(s)? Los usuarios se conservarán.`}
          </p>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={executeBulkAction} disabled={bulkLoading}>
              {bulkLoading ? "Procesando..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Crear usuario</DialogTitle></DialogHeader>
          <UserFormFields form={createForm} setForm={setCreateForm} companies={companies} isCreate={true} />
          {createError && <p className="text-sm text-destructive">{createError}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creando..." : "Crear usuario"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget != null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
          <UserFormFields form={editForm} setForm={setEditForm} companies={companies} isCreate={false} />
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
