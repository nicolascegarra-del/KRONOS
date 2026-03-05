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
import { Plus, Pencil, Trash2, MapPin } from "lucide-react";

interface WorkCenter {
  id: string;
  company_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
}

interface WcForm {
  name: string;
  lat: string;
  lng: string;
  radius_meters: string;
}

const emptyForm = (): WcForm => ({ name: "", lat: "", lng: "", radius_meters: "200" });

export default function WorkCentersPage() {
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkCenter | null>(null);
  const [form, setForm] = useState<WcForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get<WorkCenter[]>("/work-centers");
      setCenters(res.data);
    } catch {
      setError("Error al cargar los centros de trabajo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm());
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (wc: WorkCenter) => {
    setEditTarget(wc);
    setForm({
      name: wc.name,
      lat: String(wc.lat),
      lng: String(wc.lng),
      radius_meters: String(wc.radius_meters),
    });
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: form.name,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        radius_meters: parseInt(form.radius_meters, 10),
      };
      if (editTarget) {
        await api.put(`/work-centers/${editTarget.id}`, payload);
      } else {
        await api.post("/work-centers", payload);
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      setSaveError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este centro de trabajo?")) return;
    try {
      await api.delete(`/work-centers/${id}`);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al eliminar");
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Centros de Trabajo</h1>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nuevo centro
        </Button>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {centers.length === 0 ? (
        <div className="bg-white border rounded-lg p-8 text-center text-muted-foreground text-sm">
          No hay centros de trabajo configurados. Crea uno para activar el control de geolocalización.
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Nombre</th>
                <th className="text-left p-3 font-medium">Coordenadas</th>
                <th className="text-right p-3 font-medium">Radio (m)</th>
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {centers.map((wc) => (
                <tr key={wc.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="p-3 font-medium">{wc.name}</td>
                  <td className="p-3 text-muted-foreground">
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${wc.lat}&mlon=${wc.lng}#map=17/${wc.lat}/${wc.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline text-xs"
                    >
                      {wc.lat.toFixed(5)}, {wc.lng.toFixed(5)}
                    </a>
                  </td>
                  <td className="p-3 text-right">{wc.radius_meters} m</td>
                  <td className="p-3">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(wc)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(wc.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {editTarget ? "Editar centro de trabajo" : "Nuevo centro de trabajo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                placeholder="Ej: Oficina Central"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Latitud</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="37.61228"
                  value={form.lat}
                  onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Longitud</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="-1.01195"
                  value={form.lng}
                  onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Radio de tolerancia (metros)</Label>
              <Input
                type="number"
                min={10}
                value={form.radius_meters}
                onChange={(e) => setForm((p) => ({ ...p, radius_meters: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                El trabajador debe fichar dentro de este radio para no ser marcado como fuera de rango.
              </p>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.name || !form.lat || !form.lng}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
