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
import { Plus, Pencil, UserX, UserCheck } from "lucide-react";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "worker";
  is_active: boolean;
  scheduled_start?: string;
}

interface UserFormData {
  email: string;
  full_name: string;
  password: string;
  scheduled_start: string;
}

const emptyForm: UserFormData = {
  email: "",
  full_name: "",
  password: "",
  scheduled_start: "",
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    api
      .get<User[]>("/users")
      .then((res) => setUsers(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
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
    });
    setError(null);
    setDialogOpen(true);
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
        });
      } else {
        await api.post("/users", {
          email: form.email,
          full_name: form.full_name,
          password: form.password,
          scheduled_start: form.scheduled_start || null,
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Nombre</th>
                <th className="text-left p-3 font-medium">Email</th>
                <th className="text-left p-3 font-medium">Rol</th>
                <th className="text-left p-3 font-medium">Entrada</th>
                <th className="text-left p-3 font-medium">Estado</th>
                <th className="text-right p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Cargando...
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3 font-medium">{u.full_name}</td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="p-3">{u.scheduled_start || "—"}</td>
                    <td className="p-3">
                      <Badge variant={u.is_active ? "success" : "destructive"}>
                        {u.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => toggleActive(u)}>
                          {u.is_active ? (
                            <UserX className="w-4 h-4 text-destructive" />
                          ) : (
                            <UserCheck className="w-4 h-4 text-green-600" />
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

            <div className="space-y-2">
              <Label>Hora de entrada prevista</Label>
              <Input
                type="time"
                value={form.scheduled_start}
                onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
              />
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
    </div>
  );
}
