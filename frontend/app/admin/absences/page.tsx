"use client";

import React, { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, Check, X, Clock, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AbsenceType = "vacaciones" | "baja_medica" | "permiso" | "otros";
type AbsenceStatus = "pending" | "approved" | "rejected";

const TYPE_LABELS: Record<AbsenceType, string> = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  permiso: "Permiso",
  otros: "Otros",
};

const TYPE_COLORS: Record<AbsenceType, string> = {
  vacaciones: "bg-blue-50 text-blue-700 border-blue-200",
  baja_medica: "bg-red-50 text-red-700 border-red-200",
  permiso: "bg-purple-50 text-purple-700 border-purple-200",
  otros: "bg-slate-50 text-slate-700 border-slate-200",
};

const STATUS_LABELS: Record<AbsenceStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};

interface Absence {
  id: string;
  user_id: string;
  user_name?: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  notes?: string;
  status: AbsenceStatus;
  admin_notes?: string;
  created_at: string;
  user_vacation_days?: number;
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
  const variants = { pending: "secondary", approved: "success", rejected: "destructive" } as const;
  return <Badge variant={variants[status]}>{STATUS_LABELS[status]}</Badge>;
}

const FILTER_OPTIONS: { value: AbsenceStatus | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobadas" },
  { value: "rejected", label: "Rechazadas" },
];

/** Per-worker vacation days summary computed from the absence list. */
function useWorkerVacationMap(absences: Absence[]) {
  return useMemo(() => {
    const map: Record<string, { approved: number; pending: number; total: number }> = {};
    for (const a of absences) {
      if (a.type !== "vacaciones" || a.status === "rejected") continue;
      if (!map[a.user_id]) {
        map[a.user_id] = { approved: 0, pending: 0, total: a.user_vacation_days ?? 22 };
      }
      const days = countDays(a.start_date, a.end_date);
      if (a.status === "approved") map[a.user_id].approved += days;
      if (a.status === "pending") map[a.user_id].pending += days;
    }
    return map;
  }, [absences]);
}

export default function AdminAbsencesPage() {
  // We always load ALL absences (unfiltered) to compute vacation summaries correctly,
  // then apply visual filter client-side.
  const [allAbsences, setAllAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<AbsenceStatus | "all">("all");

  const [reviewAbsence, setReviewAbsence] = useState<Absence | null>(null);
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected" | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const fetchAbsences = () => {
    setLoading(true);
    api
      .get<Absence[]>("/admin/absences")
      .then((res) => setAllAbsences(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAbsences();
  }, []);

  const vacationMap = useWorkerVacationMap(allAbsences);

  const absences =
    filterStatus === "all"
      ? allAbsences
      : allAbsences.filter((a) => a.status === filterStatus);

  const pendingCount = allAbsences.filter((a) => a.status === "pending").length;

  const openReview = (absence: Absence, action: "approved" | "rejected") => {
    setReviewAbsence(absence);
    setReviewAction(action);
    setAdminNotes("");
    setReviewError(null);
  };

  const submitReview = async () => {
    if (!reviewAbsence || !reviewAction) return;
    setReviewing(true);
    setReviewError(null);
    try {
      await api.patch(`/admin/absences/${reviewAbsence.id}`, {
        status: reviewAction,
        admin_notes: adminNotes || null,
      });
      setReviewAbsence(null);
      fetchAbsences();
    } catch (e: any) {
      setReviewError(e.response?.data?.detail || "Error al procesar");
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Ausencias y vacaciones
            {pendingCount > 0 && (
              <span className="text-sm font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona las solicitudes de tus trabajadores
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilterStatus(opt.value)}
            className={`text-sm px-3 py-1.5 rounded-full border transition-all ${
              filterStatus === opt.value
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse bg-slate-100 rounded-xl" />
          ))}
        </div>
      ) : absences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarRange className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Sin solicitudes</p>
          <p className="text-sm text-muted-foreground mt-1">
            No hay solicitudes con el filtro seleccionado
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {absences.map((a) => {
            const vacInfo = a.type === "vacaciones" ? vacationMap[a.user_id] : null;
            const thisDays = countDays(a.start_date, a.end_date);
            const vacTotal = vacInfo?.total ?? (a.user_vacation_days ?? 22);
            const vacUsed = vacInfo?.approved ?? 0;
            const vacPending = vacInfo?.pending ?? 0;
            const vacRemaining = Math.max(0, vacTotal - vacUsed - vacPending);

            return (
              <div key={a.id} className="bg-white border rounded-xl p-4">
                <div className="flex items-start gap-4">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900">{a.user_name || "Trabajador"}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[a.type]}`}>
                        {TYPE_LABELS[a.type]}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>

                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CalendarRange className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{formatDate(a.start_date)}</span>
                      <span className="text-slate-400">→</span>
                      <span>{formatDate(a.end_date)}</span>
                      <span className="text-xs text-muted-foreground">
                        ({thisDays} día{thisDays !== 1 ? "s" : ""})
                      </span>
                    </div>

                    {/* Vacation days bar — only for vacaciones type */}
                    {a.type === "vacaciones" && (
                      <div className="space-y-1">
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                          <div
                            className="bg-green-500 h-full"
                            style={{ width: `${Math.min(100, (vacUsed / vacTotal) * 100)}%` }}
                          />
                          <div
                            className="bg-amber-400 h-full"
                            style={{ width: `${Math.min(100, (vacPending / vacTotal) * 100)}%` }}
                          />
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span className="text-green-700">{vacUsed} usados</span>
                          <span className="text-amber-700">{vacPending} pendientes</span>
                          <span className="ml-auto font-medium text-slate-700">
                            {vacRemaining} restantes / {vacTotal} total
                          </span>
                        </div>
                      </div>
                    )}

                    {a.notes && (
                      <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                        {a.notes}
                      </p>
                    )}

                    {a.admin_notes && (
                      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <span className="font-medium">Tu nota: </span>{a.admin_notes}
                      </p>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDate(a.created_at.split("T")[0])}
                    </div>
                  </div>

                  {/* Right: actions */}
                  {a.status === "pending" && (
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-300 text-green-700 hover:bg-green-50 w-full"
                        onClick={() => openReview(a, "approved")}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50 w-full"
                        onClick={() => openReview(a, "rejected")}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Rechazar
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review dialog */}
      <Dialog
        open={reviewAbsence !== null}
        onOpenChange={(open) => { if (!open) setReviewAbsence(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Aprobar solicitud" : "Rechazar solicitud"}
            </DialogTitle>
          </DialogHeader>

          {reviewAbsence && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                <div className="font-medium">{reviewAbsence.user_name}</div>
                <div className="text-muted-foreground">
                  {TYPE_LABELS[reviewAbsence.type]} · {formatDate(reviewAbsence.start_date)} → {formatDate(reviewAbsence.end_date)}
                  <span className="ml-1">({countDays(reviewAbsence.start_date, reviewAbsence.end_date)} días)</span>
                </div>
                {reviewAbsence.notes && (
                  <div className="text-slate-600 pt-1">{reviewAbsence.notes}</div>
                )}
              </div>

              {/* Vacation balance preview (only for vacaciones) */}
              {reviewAbsence.type === "vacaciones" && (() => {
                const vm = vacationMap[reviewAbsence.user_id];
                const total = vm?.total ?? (reviewAbsence.user_vacation_days ?? 22);
                const used = vm?.approved ?? 0;
                const pending = vm?.pending ?? 0;
                const thisDays = countDays(reviewAbsence.start_date, reviewAbsence.end_date);
                const remaining = Math.max(0, total - used - pending);
                const afterApprove = remaining - thisDays;
                return reviewAction === "approved" ? (
                  <div className={`text-sm rounded-lg px-3 py-2 border ${afterApprove < 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"}`}>
                    {afterApprove < 0
                      ? `⚠ El trabajador superará su límite en ${Math.abs(afterApprove)} días (tiene ${remaining} restantes)`
                      : `✓ Le quedarán ${afterApprove} días de vacaciones tras la aprobación`}
                  </div>
                ) : null;
              })()}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Nota para el trabajador (opcional)
                </label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={3}
                  placeholder={
                    reviewAction === "approved"
                      ? "Ej: Aprobado, disfruta tus vacaciones"
                      : "Ej: Ya hay demasiadas ausencias ese período"
                  }
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </div>

              {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setReviewAbsence(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={submitReview}
                  disabled={reviewing}
                  className={
                    reviewAction === "approved"
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }
                >
                  {reviewing
                    ? "Procesando..."
                    : reviewAction === "approved"
                    ? "Confirmar aprobación"
                    : "Confirmar rechazo"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
