"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Pencil, Trash2, Plus } from "lucide-react";

interface CompanyRead {
  id: string;
  name: string;
  max_workers: number;
  worker_count: number;
  created_at: string;
}

interface CreateForm {
  name: string;
  max_workers: number;
  admin_email: string;
  admin_full_name: string;
  admin_password: string;
}

interface EditForm {
  name: string;
  max_workers: number;
}

const emptyCreate: CreateForm = {
  name: "",
  max_workers: 10,
  admin_email: "",
  admin_full_name: "",
  admin_password: "",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRead[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<CompanyRead | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", max_workers: 10 });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<CompanyRead | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchCompanies = () => {
    setLoading(true);
    api
      .get<CompanyRead[]>("/companies")
      .then((r) => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      await api.post("/companies", createForm);
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      fetchCompanies();
    } catch (err: any) {
      setCreateError(
        err.response?.data?.detail || "Error al crear la empresa"
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (c: CompanyRead) => {
    setEditTarget(c);
    setEditForm({ name: c.name, max_workers: c.max_workers });
    setEditError(null);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);
    setEditLoading(true);
    try {
      await api.put(`/companies/${editTarget.id}`, editForm);
      setEditTarget(null);
      fetchCompanies();
    } catch (err: any) {
      setEditError(
        err.response?.data?.detail || "Error al actualizar la empresa"
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await api.delete(`/companies/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchCompanies();
    } catch (err: any) {
      setDeleteError(
        err.response?.data?.detail || "Error al eliminar la empresa"
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Empresas</h1>
        <Button onClick={() => { setCreateForm(emptyCreate); setCreateError(null); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva empresa
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando...</p>
      ) : companies.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay empresas registradas.</p>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.worker_count} / {c.max_workers} trabajadores ·{" "}
                        Alta: {new Date(c.created_at).toLocaleDateString("es-ES")}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => { setDeleteError(null); setDeleteTarget(c); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la empresa</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Máximo de trabajadores</Label>
              <Input
                type="number"
                min={1}
                value={createForm.max_workers}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, max_workers: Number(e.target.value) }))
                }
                required
              />
            </div>
            <hr />
            <p className="text-sm font-medium text-muted-foreground">Administrador de la empresa</p>
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                value={createForm.admin_full_name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, admin_full_name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.admin_email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, admin_email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={createForm.admin_password}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, admin_password: e.target.value }))
                }
                required
              />
            </div>
            {createError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {createError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Creando..." : "Crear empresa"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Máximo de trabajadores</Label>
              <Input
                type="number"
                min={1}
                value={editForm.max_workers}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, max_workers: Number(e.target.value) }))
                }
                required
              />
            </div>
            {editError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {editError}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar empresa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres eliminar <strong>{deleteTarget?.name}</strong>? Esta acción no
            se puede deshacer. La empresa debe no tener usuarios asociados.
          </p>
          {deleteError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
