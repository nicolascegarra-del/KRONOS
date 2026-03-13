"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, CalendarRange, Clock } from "lucide-react";

type AbsenceType = "vacaciones" | "baja_medica" | "permiso" | "otros";
type AbsenceStatus = "pending" | "approved" | "rejected";

const TYPE_LABELS: Record<AbsenceType, string> = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  permiso: "Permiso",
  otros: "Otros",
};

const TYPE_COLORS: Record<AbsenceType, string> = {
  vacaciones: "bg-blue-50 border-blue-200 text-blue-700",
  baja_medica: "bg-red-50 border-red-200 text-red-700",
  permiso: "bg-purple-50 border-purple-200 text-purple-700",
  otros: "bg-slate-50 border-slate-200 text-slate-700",
};

const STATUS_LABELS: Record<AbsenceStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

interface Absence {
  id: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  notes?: string;
  status: AbsenceStatus;
  admin_notes?: string;
  created_at: string;
}

interface VacationSummary {
  total: number;
  approved: number;
  pending: number;
  remaining: number;
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function countDays(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function StatusBadge({ status }: { status: AbsenceStatus }) {
  const variants = {
    pending: "secondary",
    approved: "success",
    rejected: "destructive",
  } as const;
  return <Badge variant={variants[status]}>{STATUS_LABELS[status]}</Badge>;
}

export default function WorkerAbsencesPage() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [summary, setSummary] = useState<VacationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    type: "vacaciones" as AbsenceType,
    start_date: "",
    end_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [absRes, sumRes] = await Promise.all([
        api.get<Absence[]>("/workers/me/absences"),
        api.get<VacationSummary>("/workers/me/vacation-summary"),
      ]);
      setAbsences(absRes.data);
      setSummary(sumRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    setForm({ type: "vacaciones", start_date: "", end_date: "", notes: "" });
    setError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date) {
      setError("Selecciona las fechas de inicio y fin");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/workers/me/absences", {
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes || null,
      });
      setDialogOpen(false);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al enviar la solicitud");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/workers/me/absences/${id}`);
      fetchData();
    } finally {
      setDeleting(null);
    }
  };

  const daysInForm =
    form.start_date && form.end_date
      ? countDays(form.start_date, form.end_date)
      : null;

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mis ausencias</h1>
          <p className="text-sm text-muted-foreground">Vacaciones y permisos</p>
        </div>
        <Button onClick={openCreate} size="sm" className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Solicitar
        </Button>
      </div>

      {/* Vacation summary bar */}
      {summary && (
        <div className="bg-white border rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Vacaciones este año</span>
            <span className="text-xs text-muted-foreground">{summary.total} días asignados</span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
              {summary.total > 0 && (
                <>
                  <div
                    className="bg-green-500 h-full transition-all"
                    style={{ width: `${Math.min(100, (summary.approved / summary.total) * 100)}%` }}
                  />
                  <div
                    className="bg-amber-400 h-full transition-all"
                    style={{ width: `${Math.min(100, (summary.pending / summary.total) * 100)}%` }}
                  />
                </>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-green-700">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                {summary.approved} usados
              </span>
              <span className="flex items-center gap-1 text-amber-700">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                {summary.pending} pendientes
              </span>
              <span className="flex items-center gap-1 text-slate-600 ml-auto font-medium">
                {summary.remaining} restantes
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Summary stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {absences.filter((a) => a.status === "pending").length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Pendientes</div>
          </div>
          <div className="bg-white border rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-green-600">
              {absences.filter((a) => a.status === "approved").length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Aprobadas</div>
          </div>
          <div className="bg-white border rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {summary?.remaining ?? "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Días vacc. restantes</div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse bg-slate-100 rounded-xl" />
          ))}
        </div>
      ) : absences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarRange className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Sin solicitudes</p>
          <p className="text-sm text-muted-foreground mt-1">
            Pulsa "Solicitar" para pedir vacaciones o un permiso
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {absences.map((a) => (
            <div key={a.id} className="bg-white border rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[a.type]}`}
                  >
                    {TYPE_LABELS[a.type]}
                  </span>
                  <StatusBadge status={a.status} />
                </div>
                {a.status === "pending" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 -mt-1 -mr-1"
                    onClick={() => handleDelete(a.id)}
                    disabled={deleting === a.id}
                    aria-label="Cancelar solicitud"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-slate-700">
                <CalendarRange className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-medium">{formatDate(a.start_date)}</span>
                <span className="text-slate-400">→</span>
                <span className="font-medium">{formatDate(a.end_date)}</span>
                <span className="text-xs text-muted-foreground ml-1">
                  ({countDays(a.start_date, a.end_date)} día{countDays(a.start_date, a.end_date) !== 1 ? "s" : ""})
                </span>
              </div>

              {a.notes && (
                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                  {a.notes}
                </p>
              )}

              {a.admin_notes && (
                <p className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <span className="font-medium text-amber-700">Nota del admin: </span>
                  {a.admin_notes}
                </p>
              )}

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Solicitado el {formatDate(a.created_at.split("T")[0])}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva solicitud</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TYPE_LABELS) as AbsenceType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm({ ...form, type: t })}
                    className={`text-sm font-medium px-3 py-2 rounded-lg border transition-all ${
                      form.type === t
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  min={form.start_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  required
                />
              </div>
            </div>

            {daysInForm !== null && (
              <div className="flex items-center gap-3 text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-muted-foreground">
                  Total: <strong>{daysInForm}</strong> día{daysInForm !== 1 ? "s" : ""}
                </span>
                {form.type === "vacaciones" && summary && (
                  <span className={`ml-auto text-xs font-medium ${daysInForm > summary.remaining ? "text-red-600" : "text-green-700"}`}>
                    {daysInForm > summary.remaining
                      ? `⚠ Supera los ${summary.remaining} días restantes`
                      : `✓ Quedarán ${summary.remaining - daysInForm} días restantes`}
                  </span>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                placeholder="Motivo o información adicional..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Enviando..." : "Enviar solicitud"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
