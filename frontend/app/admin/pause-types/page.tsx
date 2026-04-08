"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

interface PausaTipo {
  id: string;
  name: string;
  active: boolean;
}

export default function PauseTypesPage() {
  const [tipos, setTipos] = useState<PausaTipo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const fetchTipos = async () => {
    setLoading(true);
    try {
      const res = await api.get<PausaTipo[]>("/pause-types");
      setTipos(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTipos(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.post("/pause-types", { name: newName.trim() });
      setNewName("");
      await fetchTipos();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al crear el tipo");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmId) return;
    try {
      await api.delete(`/pause-types/${confirmId}`);
      await fetchTipos();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al eliminar");
    } finally {
      setConfirmId(null);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold mb-6">Tipos de Pausa</h1>

      {/* Create form */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <form onSubmit={handleCreate} className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label>Nuevo tipo</Label>
            <Input
              placeholder="Ej: Formación"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              minLength={2}
              maxLength={60}
            />
          </div>
          <Button type="submit" disabled={creating || newName.trim().length < 2} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Añadir
          </Button>
        </form>
        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
      </div>

      {/* List */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando...</p>
        ) : tipos.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No hay tipos definidos.</p>
        ) : (
          <ul className="divide-y">
            {tipos.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium">{t.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmId(t.id)}
                  aria-label={`Eliminar ${t.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmId}
        title="Eliminar tipo de pausa"
        description="¿Seguro que quieres eliminar este tipo de pausa? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
