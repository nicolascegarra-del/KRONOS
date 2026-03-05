"use client";

import React, { useEffect, useState } from "react";
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
import { Pencil } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: "superadmin" | "admin" | "worker";
  is_active: boolean;
  company_id: string | null;
  company_name: string | null;
  scheduled_start: string | null;
  created_at: string;
}

interface EditForm {
  email: string;
  full_name: string;
  password: string;
  role: string;
  company_id: string;
  scheduled_start: string;
  is_active: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  worker: "Trabajador",
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

export default function SuperadminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [form, setForm] = useState<EditForm>({
    email: "", full_name: "", password: "", role: "worker",
    company_id: "", scheduled_start: "", is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<UserRow[]>("/superadmin/users");
      setUsers(res.data);
    } catch {
      setError("Error al cargar los usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (u: UserRow) => {
    setEditTarget(u);
    setForm({
      email: u.email,
      full_name: u.full_name,
      password: "",
      role: u.role,
      company_id: u.company_id ?? "",
      scheduled_start: u.scheduled_start ?? "",
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
        email: form.email,
        full_name: form.full_name,
        role: form.role,
        is_active: form.is_active,
        company_id: form.company_id || null,
        scheduled_start: form.scheduled_start || null,
      };
      if (form.password) body.password = form.password;
      await api.put(`/superadmin/users/${editTarget.id}`, body);
      setEditTarget(null);
      await load();
    } catch (e: any) {
      setSaveError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Cargando...
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Usuarios</h1>
      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Nombre</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-center p-3 font-medium">Rol</th>
                <th className="text-left p-3 font-medium">Empresa</th>
                <th className="text-center p-3 font-medium">Activo</th>
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="p-3 font-medium">{u.full_name}</td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3 text-center"><RoleBadge role={u.role} /></td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {u.company_name ?? "—"}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {u.is_active ? "Sí" : "No"}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editTarget != null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre completo</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Nueva contraseña (dejar vacío para no cambiar)</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Rol</Label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="superadmin">Superadmin</option>
                <option value="admin">Admin</option>
                <option value="worker">Trabajador</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>ID de empresa (UUID, dejar vacío para ninguna)</Label>
              <Input
                value={form.company_id}
                onChange={(e) => setForm((p) => ({ ...p, company_id: e.target.value }))}
                placeholder="xxxxxxxx-xxxx-..."
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label>Hora de entrada programada (HH:MM)</Label>
              <Input
                type="time"
                value={form.scheduled_start}
                onChange={(e) => setForm((p) => ({ ...p, scheduled_start: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Label>Activo</Label>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-primary" : "bg-slate-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
