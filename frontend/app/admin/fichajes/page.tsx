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
import { Search, Pencil, CheckCircle2, MapPin, MessageSquare, History } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ModalidadBadge } from "@/components/ModalidadBadge";
import { Textarea } from "@/components/ui/textarea";
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
  modalidad?: string;
  start_lat?: number;
  start_lng?: number;
  end_lat?: number;
  end_lng?: number;
  out_of_range?: boolean;
  rest_violation?: boolean;
  edit_comment?: string;
  last_edited_at?: string;
  pausas: PausaAdmin[];
}

interface FieldChange {
  before: string | null;
  after: string | null;
}

interface EditLogEntry {
  id: string;
  edited_at: string;
  edited_by: { id: string; full_name: string; email: string } | null;
  comment: string;
  changes: Record<string, FieldChange>;
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

  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const mapEvent = events[selectedIdx] ?? events[0] ?? null;

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
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full flex items-start justify-between text-sm border rounded px-3 py-2 text-left transition-colors ${
                    i === selectedIdx ? "border-primary bg-primary/5" : "hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <p className="font-medium">{ev.label}</p>
                    <p className="text-xs text-muted-foreground">{fmtDatetime(ev.time)}</p>
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${ev.lat}&mlon=${ev.lng}#map=17/${ev.lat}/${ev.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-primary underline whitespace-nowrap ml-3 mt-0.5"
                  >
                    {ev.lat.toFixed(5)}, {ev.lng.toFixed(5)}
                  </a>
                </button>
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
  modalidad: string;
  total_minutes: string;
  late_minutes: string;
  edit_comment: string;
}

function fmtDatetime(iso?: string): string {
  if (!iso) return "—";
  return format(new Date(iso.endsWith("Z") ? iso : iso + "Z"), "dd/MM/yyyy HH:mm");
}

const FIELD_LABELS: Record<string, string> = {
  start_time: "Inicio",
  end_time: "Fin",
  status: "Estado",
  modalidad: "Modalidad",
  total_minutes: "Min. trabajados",
  late_minutes: "Min. tarde",
  out_of_range: "Fuera de rango",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  finished: "Finalizado",
};

function formatFieldValue(field: string, value: string | null): string {
  if (value === null || value === "None" || value === "null") return "—";
  if (field === "start_time" || field === "end_time") {
    try {
      const d = new Date(value.endsWith("Z") ? value : value + "Z");
      return format(d, "dd/MM/yyyy HH:mm");
    } catch { return value; }
  }
  if (field === "status") return STATUS_LABELS[value] ?? value;
  if (field === "modalidad") return value === "teletrabajo" ? "Teletrabajo" : "Presencial";
  if (field === "total_minutes" || field === "late_minutes") return `${value} min`;
  if (field === "out_of_range") return value === "True" || value === "true" ? "Sí" : "No";
  return value;
}

function toInputDatetime(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export default function AdminFichajesPage() {
  const [fichajes, setFichajes] = useState<FichajeAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [geoTarget, setGeoTarget] = useState<FichajeAdmin | null>(null);
  const [historyTarget, setHistoryTarget] = useState<FichajeAdmin | null>(null);
  const [historyLog, setHistoryLog] = useState<EditLogEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<FichajeAdmin | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    start_time: "",
    end_time: "",
    status: "",
    modalidad: "presencial",
    total_minutes: "",
    late_minutes: "",
    edit_comment: "",
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

  const openEdit = (f: FichajeAdmin) => {
    setEditTarget(f);
    setSaveError(null);
    setEditForm({
      start_time: toInputDatetime(f.start_time),
      end_time: toInputDatetime(f.end_time),
      status: f.status,
      modalidad: f.modalidad ?? "presencial",
      total_minutes: f.total_minutes != null ? String(f.total_minutes) : "",
      late_minutes: f.late_minutes != null ? String(f.late_minutes) : "",
      edit_comment: "",
    });
  };

  const openHistory = async (f: FichajeAdmin) => {
    setHistoryTarget(f);
    setHistoryLoading(true);
    setHistoryLog([]);
    setHistoryError(null);
    try {
      const res = await api.get<EditLogEntry[]>(`/fichajes/admin/${f.id}/history`);
      setHistoryLog(res.data);
    } catch {
      setHistoryError("Error al cargar el historial. Inténtalo de nuevo.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editTarget) return;
    if (editForm.edit_comment.trim().length < 3) {
      setSaveError("El motivo del cambio es obligatorio (mínimo 3 caracteres)");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, string | number> = { edit_comment: editForm.edit_comment.trim() };
      if (editForm.start_time) body.start_time = editForm.start_time + ":00";
      if (editForm.end_time) body.end_time = editForm.end_time + ":00";
      if (editForm.status) body.status = editForm.status;
      if (editForm.modalidad) body.modalidad = editForm.modalidad;
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
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-medium">Trabajador</th>
                <th className="text-left p-3 font-medium">Inicio</th>
                <th className="text-left p-3 font-medium">Fin</th>
                <th className="text-right p-3 font-medium">Duración</th>
                <th className="text-center p-3 font-medium">Estado</th>
                <th className="text-center p-3 font-medium">Modalidad</th>
                <th className="text-right p-3 font-medium">Pausas</th>
                <th className="text-left p-3 font-medium">Nota edición</th>
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-3"><div className="h-4 w-28 animate-pulse bg-slate-200 rounded" /><div className="h-3 w-32 animate-pulse bg-slate-200 rounded mt-1" /></td>
                    <td className="p-3"><div className="h-4 w-28 animate-pulse bg-slate-200 rounded" /></td>
                    <td className="p-3"><div className="h-4 w-28 animate-pulse bg-slate-200 rounded" /></td>
                    <td className="p-3 text-right"><div className="h-4 w-12 animate-pulse bg-slate-200 rounded ml-auto" /></td>
                    <td className="p-3 text-center"><div className="h-5 w-16 animate-pulse bg-slate-200 rounded-full mx-auto" /></td>
                    <td className="p-3 text-center"><div className="h-5 w-20 animate-pulse bg-slate-200 rounded-full mx-auto" /></td>
                    <td className="p-3 text-right"><div className="h-4 w-4 animate-pulse bg-slate-200 rounded ml-auto" /></td>
                    <td className="p-3"><div className="h-4 w-24 animate-pulse bg-slate-200 rounded" /></td>
                    <td className="p-3"><div className="h-7 w-16 animate-pulse bg-slate-200 rounded mx-auto" /></td>
                  </tr>
                ))
              ) : fichajes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    Sin fichajes para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                fichajes.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50 align-top">
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
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge s={f.status} />
                        {f.out_of_range && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 whitespace-nowrap">
                            Fuera de rango
                          </span>
                        )}
                        {f.rest_violation && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 whitespace-nowrap" title="Menos de 12h de descanso entre jornadas (Art. 34.3 ET)">
                            &lt;12h descanso
                          </span>
                        )}
                        {f.total_minutes != null && f.total_minutes > 540 && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 whitespace-nowrap" title="Jornada superior a 9h (Art. 34.1 ET)">
                            Jornada &gt;9h
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <ModalidadBadge modalidad={f.modalidad} />
                    </td>
                    <td className="p-3 text-right">{f.pausas.length}</td>
                    <td className="p-3 max-w-[160px]">
                      {f.edit_comment ? (
                        <span className="flex items-start gap-1 text-xs text-slate-600" title={f.edit_comment}>
                          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                          <span className="line-clamp-2">{f.edit_comment}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setGeoTarget(f)}
                          className="flex items-center gap-1 text-xs"
                          title="Ver ubicaciones"
                        >
                          <MapPin className="w-3 h-3" aria-hidden="true" />
                        </Button>
                        {f.last_edited_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openHistory(f)}
                            className="flex items-center gap-1 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                            title="Ver historial de cambios"
                          >
                            <History className="w-3 h-3" aria-hidden="true" />
                          </Button>
                        )}
                        {(f.status === "active" || f.status === "paused") && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleFinalize(f.id)}
                            className="flex items-center gap-1 text-xs"
                          >
                            <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                            Finalizar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEdit(f)}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Pencil className="w-3 h-3" aria-hidden="true" />
                          Editar
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

      {/* History dialog */}
      <Dialog open={historyTarget != null} onOpenChange={(open) => !open && setHistoryTarget(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4 text-amber-600" aria-hidden="true" />
              Historial de cambios
              {historyTarget?.user && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  — {historyTarget.user.full_name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {historyLoading && (
            <div className="space-y-3 py-2">
              {[1, 2].map((i) => (
                <div key={i} className="border rounded-lg p-4 space-y-2">
                  <div className="h-4 w-40 animate-pulse bg-slate-200 rounded" />
                  <div className="h-3 w-64 animate-pulse bg-slate-200 rounded" />
                  <div className="h-16 w-full animate-pulse bg-slate-200 rounded" />
                </div>
              ))}
            </div>
          )}

          {!historyLoading && historyError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded text-center" role="alert">
              {historyError}
            </p>
          )}

          {!historyLoading && !historyError && historyLog.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay modificaciones registradas para este fichaje.
            </p>
          )}

          {!historyLoading && !historyError && historyLog.length > 0 && (
            <div className="space-y-4 py-2">
              {historyLog.map((entry, idx) => (
                <div key={entry.id} className="border rounded-lg overflow-hidden">
                  {/* Entry header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-800">
                        {idx === 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                            Última modificación
                          </span>
                        ) : (
                          `Modificación #${historyLog.length - idx}`
                        )}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">
                        {format(new Date(entry.edited_at + "Z"), "dd/MM/yyyy HH:mm")}
                      </span>
                      {entry.edited_by && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-600">{entry.edited_by.full_name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Comment */}
                  <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-start gap-1.5 text-sm">
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
                    <span className="text-amber-800 italic">{entry.comment}</span>
                  </div>

                  {/* Diff table */}
                  {Object.keys(entry.changes).length > 0 ? (
                    <div className="divide-y text-sm">
                      {Object.entries(entry.changes).map(([field, change]) => (
                        <div key={field} className="grid grid-cols-[120px_1fr_1fr] items-stretch">
                          <div className="px-3 py-2 bg-slate-50 font-medium text-slate-600 text-xs flex items-center border-r">
                            {FIELD_LABELS[field] ?? field}
                          </div>
                          <div className="px-3 py-2 bg-red-50 text-red-700 flex items-center gap-1.5 border-r">
                            <span className="font-bold text-red-400 text-xs">−</span>
                            <span className="font-mono text-xs">{formatFieldValue(field, change.before)}</span>
                          </div>
                          <div className="px-3 py-2 bg-green-50 text-green-700 flex items-center gap-1.5">
                            <span className="font-bold text-green-500 text-xs">+</span>
                            <span className="font-mono text-xs">{formatFieldValue(field, change.after)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-2 text-xs text-muted-foreground">Sin cambios en campos registrados.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editTarget != null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Editar Fichaje
              {editTarget?.user && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  — {editTarget.user.full_name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Tiempos */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b pb-1 mb-3">Tiempos</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Inicio</Label>
                  <Input
                    type="datetime-local"
                    value={editForm.start_time}
                    onChange={(e) => setEditForm((p) => ({ ...p, start_time: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Fin <span className="text-muted-foreground text-xs">(opcional)</span></Label>
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
                  <Label>Modalidad</Label>
                  <select
                    value={editForm.modalidad}
                    onChange={(e) => setEditForm((p) => ({ ...p, modalidad: e.target.value }))}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="presencial">Presencial</option>
                    <option value="teletrabajo">Teletrabajo</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Cálculos */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b pb-1 mb-3">Cálculos <span className="text-slate-400 normal-case font-normal">(opcionales)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Min. trabajados</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Auto-calculado"
                    value={editForm.total_minutes}
                    onChange={(e) => setEditForm((p) => ({ ...p, total_minutes: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Min. tarde</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editForm.late_minutes}
                    onChange={(e) => setEditForm((p) => ({ ...p, late_minutes: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Auditoría */}
            <div className="bg-amber-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pb-1">Auditoría</p>
              <Label>
                Motivo del cambio <span className="text-destructive">*</span>
              </Label>
              <Textarea
                placeholder="Describe el motivo de la edición (obligatorio, mín. 3 caracteres)"
                rows={3}
                value={editForm.edit_comment}
                onChange={(e) => setEditForm((p) => ({ ...p, edit_comment: e.target.value }))}
              />
            </div>

            {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}

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
