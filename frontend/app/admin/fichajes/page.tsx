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
import { Search, Pencil, CheckCircle2, Trash2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { minutesToHoursLabel } from "@/lib/utils";

interface PausaAdmin {
  id: string;
  start_time: string;
  end_time?: string;
  comment: string;
  start_lat?: number;
  start_lng?: number;
  end_lat?: number;
  end_lng?: number;
}

interface UserBasic {
  id: string;
  email: string;
  full_name: string;
}

interface FichajeAdmin {
  id: string;
  user_id: string;
  user?: UserBasic;
  start_time: string;
  end_time?: string;
  status: "active" | "paused" | "finished";
  total_minutes?: number;
  late_minutes?: number;
  start_lat?: number;
  start_lng?: number;
  end_lat?: number;
  end_lng?: number;
  pausas: PausaAdmin[];
}

interface GeoEvent {
  label: string;
  time: string;
  lat: number;
  lng: number;
}

function OsmMap({ lat, lng }: { lat: number; lng: number }) {
  const delta = 0.003;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  return (
    <iframe
      src={src}
      width="100%"
      height="220"
      className="rounded border"
      loading="lazy"
      title="Mapa ubicación"
    />
  );
}

function GeoModal({ fichaje, onClose }: { fichaje: FichajeAdmin; onClose: () => void }) {
  const events: GeoEvent[] = [];

  if (fichaje.start_lat != null && fichaje.start_lng != null) {
    events.push({ label: "Inicio jornada", time: fichaje.start_time, lat: fichaje.start_lat, lng: fichaje.start_lng });
  }
  for (const p of fichaje.pausas) {
    if (p.start_lat != null && p.start_lng != null) {
      events.push({ label: `Pausa (${p.comment})`, time: p.start_time, lat: p.start_lat, lng: p.start_lng });
    }
    if (p.end_lat != null && p.end_lng != null && p.end_time) {
      events.push({ label: `Reanuda (${p.comment})`, time: p.end_time, lat: p.end_lat, lng: p.end_lng });
    }
  }
  if (fichaje.end_lat != null && fichaje.end_lng != null && fichaje.end_time) {
    events.push({ label: "Fin jornada", time: fichaje.end_time, lat: fichaje.end_lat, lng: fichaje.end_lng });
  }

  const mapEvent = events[0] ?? null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Ubicaciones — {fichaje.user?.full_name ?? "Trabajador"}
          </DialogTitle>
        </DialogHeader>

        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No hay datos de geolocalización para este fichaje.
          </p>
        ) : (
          <div className="space-y-4">
            {mapEvent && <OsmMap lat={mapEvent.lat} lng={mapEvent.lng} />}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {events.map((ev, i) => (
                <div key={i} className="flex items-start justify-between text-sm border rounded px-3 py-2">
                  <div>
                    <p className="font-medium">{ev.label}</p>
                    <p className="text-xs text-muted-foreground">{fmtDatetime(ev.time)}</p>
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${ev.lat}&mlon=${ev.lng}#map=17/${ev.lat}/${ev.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline whitespace-nowrap ml-3 mt-0.5"
                  >
                    {ev.lat.toFixed(5)}, {ev.lng.toFixed(5)}
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface EditForm {
  start_time: string;
  end_time: string;
  status: string;
  total_minutes: string;
  late_minutes: string;
}

function fmtDatetime(iso?: string): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy HH:mm");
}

function toInputDatetime(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

function StatusBadge({ s }: { s: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    active: { label: "Activo", cls: "bg-green-100 text-green-700" },
    paused: { label: "Pausado", cls: "bg-amber-100 text-amber-700" },
    finished: { label: "Finalizado", cls: "bg-slate-100 text-slate-600" },
  };
  const c = cfg[s] ?? { label: s, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

export default function AdminFichajesPage() {
  const [fichajes, setFichajes] = useState<FichajeAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [geoTarget, setGeoTarget] = useState<FichajeAdmin | null>(null);
  const [editTarget, setEditTarget] = useState<FichajeAdmin | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    start_time: "",
    end_time: "",
    status: "",
    total_minutes: "",
    late_minutes: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchFichajes = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get<FichajeAdmin[]>(`/fichajes/admin?${params}`);
      setFichajes(res.data);
    } catch {
      setError("Error al cargar los fichajes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFichajes();
  }, []);

  const handleFinalize = async (id: string) => {
    try {
      await api.post(`/fichajes/admin/${id}/end`);
      await fetchFichajes();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al finalizar el fichaje");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este fichaje? Esta acción no se puede deshacer.")) return;
    try {
      await api.delete(`/fichajes/admin/${id}`);
      await fetchFichajes();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al eliminar el fichaje");
    }
  };

  const openEdit = (f: FichajeAdmin) => {
    setEditTarget(f);
    setSaveError(null);
    setEditForm({
      start_time: toInputDatetime(f.start_time),
      end_time: toInputDatetime(f.end_time),
      status: f.status,
      total_minutes: f.total_minutes != null ? String(f.total_minutes) : "",
      late_minutes: f.late_minutes != null ? String(f.late_minutes) : "",
    });
  };

  const handleSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, string | number> = {};
      if (editForm.start_time) body.start_time = editForm.start_time + ":00";
      if (editForm.end_time) body.end_time = editForm.end_time + ":00";
      if (editForm.status) body.status = editForm.status;
      if (editForm.total_minutes !== "") body.total_minutes = Number(editForm.total_minutes);
      if (editForm.late_minutes !== "") body.late_minutes = Number(editForm.late_minutes);
      await api.patch(`/fichajes/admin/${editTarget.id}`, body);
      setEditTarget(null);
      await fetchFichajes();
    } catch (e: any) {
      setSaveError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Gestión de Fichajes</h1>

      {/* Filter bar */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Estado</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-9 w-36 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Todos</option>
              <option value="active">Activo</option>
              <option value="paused">Pausado</option>
              <option value="finished">Finalizado</option>
            </select>
          </div>
          <Button onClick={fetchFichajes} disabled={loading} className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            {loading ? "Cargando..." : "Buscar"}
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Trabajador</th>
                <th className="text-left p-3 font-medium">Inicio</th>
                <th className="text-left p-3 font-medium">Fin</th>
                <th className="text-right p-3 font-medium">Duración</th>
                <th className="text-center p-3 font-medium">Estado</th>
                <th className="text-right p-3 font-medium">Pausas</th>
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {fichajes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {loading ? "Cargando..." : "Sin fichajes para los filtros seleccionados"}
                  </td>
                </tr>
              ) : (
                fichajes.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3">
                      {f.user ? (
                        <>
                          <p className="font-medium">{f.user.full_name}</p>
                          <p className="text-xs text-muted-foreground">{f.user.email}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">{f.user_id}</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">{fmtDatetime(f.start_time)}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDatetime(f.end_time)}</td>
                    <td className="p-3 text-right">
                      {f.total_minutes != null ? minutesToHoursLabel(f.total_minutes) : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <StatusBadge s={f.status} />
                    </td>
                    <td className="p-3 text-right">{f.pausas.length}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setGeoTarget(f)}
                          className="flex items-center gap-1 text-xs"
                          title="Ver ubicaciones"
                        >
                          <MapPin className="w-3 h-3" />
                        </Button>
                        {(f.status === "active" || f.status === "paused") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleFinalize(f.id)}
                            className="flex items-center gap-1 text-xs"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Finalizar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(f)}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Pencil className="w-3 h-3" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(f.id)}
                          className="flex items-center gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar
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

      {/* Geo modal */}
      {geoTarget && <GeoModal fichaje={geoTarget} onClose={() => setGeoTarget(null)} />}

      {/* Edit dialog */}
      <Dialog open={editTarget != null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Fichaje</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Inicio</Label>
              <Input
                type="datetime-local"
                value={editForm.start_time}
                onChange={(e) => setEditForm((p) => ({ ...p, start_time: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Fin (opcional)</Label>
              <Input
                type="datetime-local"
                value={editForm.end_time}
                onChange={(e) => setEditForm((p) => ({ ...p, end_time: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                <option value="finished">Finalizado</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Minutos trabajados (opcional)</Label>
              <Input
                type="number"
                min={0}
                placeholder="Auto-calculado si no se indica"
                value={editForm.total_minutes}
                onChange={(e) => setEditForm((p) => ({ ...p, total_minutes: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Minutos tarde (opcional)</Label>
              <Input
                type="number"
                min={0}
                value={editForm.late_minutes}
                onChange={(e) => setEditForm((p) => ({ ...p, late_minutes: e.target.value }))}
              />
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
