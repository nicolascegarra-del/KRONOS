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
import { Plus, Trash2, Tablet, Info } from "lucide-react";

interface TabletUser {
  id: string;
  email: string;
  full_name: string;
  work_center_id?: string | null;
  created_at: string;
}

interface WorkCenter {
  id: string;
  name: string;
}

interface TabletForm {
  email: string;
  full_name: string;
  password: string;
  work_center_id: string;
}

const emptyForm = (): TabletForm => ({ email: "", full_name: "Tablet de fichaje", password: "", work_center_id: "" });

export default function AdminTabletPage() {
  const [tablets, setTablets] = useState<TabletUser[]>([]);
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TabletForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTablets = () => {
    setLoading(true);
    api
      .get<TabletUser[]>("/users/tablet")
      .then((r) => setTablets(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTablets();
    api.get<WorkCenter[]>("/work-centers").then((r) => setCenters(r.data)).catch(() => {});
  }, []);

  const openCreate = () => {
    setForm(emptyForm());
    setError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post("/users/tablet", {
        email: form.email,
        full_name: form.full_name || "Tablet de fichaje",
        password: form.password,
        work_center_id: form.work_center_id || null,
      });
      setDialogOpen(false);
      fetchTablets();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al crear la tablet");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta cuenta de tablet? El dispositivo dejará de poder fichar.")) return;
    await api.delete(`/users/tablet/${id}`);
    fetchTablets();
  };

  const centerName = (id?: string | null) =>
    id ? centers.find((c) => c.id === id)?.name ?? "—" : "Cualquiera";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tablet className="w-6 h-6 text-primary" /> Tablet de fichaje
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cuentas de kiosco para que los trabajadores fichen con su código numérico.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nueva tablet
        </Button>
      </div>

      <div className="rounded-lg border bg-sky-50 text-sky-900 p-3 flex gap-2 text-sm">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Inicia sesión en la tablet con el email y la contraseña de una de estas cuentas.
          La pantalla mostrará un teclado numérico. Cada trabajador ficha introduciendo su
          código (configúralo en la ficha de cada trabajador).
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : tablets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Tablet className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No hay cuentas de tablet todavía.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tablets.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border p-3 bg-white">
              <div className="min-w-0">
                <p className="font-medium truncate">{t.full_name}</p>
                <p className="text-sm text-muted-foreground truncate">{t.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Centro: {centerName(t.work_center_id)}</p>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                className="p-2 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Eliminar"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva tablet de fichaje</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Tablet entrada principal"
              />
            </div>
            <div className="space-y-2">
              <Label>Email de acceso</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="tablet@miempresa.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required
              />
            </div>
            {centers.length > 0 && (
              <div className="space-y-2">
                <Label>Centro de trabajo (opcional)</Label>
                <select
                  value={form.work_center_id}
                  onChange={(e) => setForm({ ...form, work_center_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">— Sin asignar —</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creando…" : "Crear tablet"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
