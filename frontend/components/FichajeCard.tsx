"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatTime, minutesToHoursLabel } from "@/lib/utils";
import { Clock, Coffee, Pencil, Monitor, Home } from "lucide-react";

interface Pausa {
  id: string;
  start_time: string;
  end_time?: string;
  comment: string;
}

interface Fichaje {
  id: string;
  start_time: string;
  end_time?: string;
  status: "active" | "paused" | "finished";
  total_minutes?: number;
  late_minutes?: number;
  modalidad?: string;
  edit_comment?: string;
  pausas: Pausa[];
}

interface FichajeCardProps {
  fichaje: Fichaje;
}

const statusLabels: Record<Fichaje["status"], string> = {
  active: "Activo",
  paused: "En pausa",
  finished: "Finalizado",
};

const statusVariants: Record<Fichaje["status"], "success" | "warning" | "secondary"> = {
  active: "success",
  paused: "warning",
  finished: "secondary",
};

export const FichajeCard = React.memo(function FichajeCard({ fichaje }: FichajeCardProps) {
  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(fichaje.start_time)}
            </p>
            {fichaje.end_time && (
              <p className="text-sm text-muted-foreground">
                → {formatTime(fichaje.end_time)}
              </p>
            )}
          </div>
          <Badge variant={statusVariants[fichaje.status]}>
            {statusLabels[fichaje.status]}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          {fichaje.total_minutes !== undefined && fichaje.total_minutes !== null && (
            <div className="flex items-center gap-1 text-slate-700">
              <Clock className="w-4 h-4" aria-hidden="true" />
              <span className="font-medium">
                {minutesToHoursLabel(fichaje.total_minutes)}
              </span>
              <span className="text-muted-foreground">trabajadas</span>
            </div>
          )}

          {fichaje.pausas.length > 0 && (
            <div className="flex items-center gap-1 text-amber-600">
              <Coffee className="w-4 h-4" aria-hidden="true" />
              <span>{fichaje.pausas.length} pausa{fichaje.pausas.length > 1 ? "s" : ""}</span>
            </div>
          )}

          {fichaje.modalidad === "teletrabajo" ? (
            <div className="flex items-center gap-1 text-blue-600">
              <Home className="w-4 h-4" aria-hidden="true" />
              <span>Teletrabajo</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-500">
              <Monitor className="w-4 h-4" aria-hidden="true" />
              <span>Presencial</span>
            </div>
          )}

        </div>

        {/* Edit comment */}
        {fichaje.edit_comment && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <Pencil className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{fichaje.edit_comment}</span>
          </div>
        )}

        {/* Pauses detail */}
        {fichaje.pausas.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <table className="w-full text-xs text-muted-foreground">
              <thead>
                <tr>
                  <th className="text-left font-medium pb-1">Pausa</th>
                  <th className="text-right font-medium pb-1">Horario</th>
                  <th className="text-right font-medium pb-1">Duración</th>
                </tr>
              </thead>
              <tbody>
                {fichaje.pausas.map((p) => {
                  const durationMs = p.end_time
                    ? new Date(p.end_time.endsWith("Z") ? p.end_time : p.end_time + "Z").getTime() -
                      new Date(p.start_time.endsWith("Z") ? p.start_time : p.start_time + "Z").getTime()
                    : null;
                  const durationMin = durationMs ? Math.round(durationMs / 60000) : null;
                  return (
                    <tr key={p.id}>
                      <td className="truncate max-w-[100px] py-0.5">{p.comment}</td>
                      <td className="text-right py-0.5 whitespace-nowrap">
                        {formatTime(p.start_time)}
                        {p.end_time ? ` – ${formatTime(p.end_time)}` : " (abierta)"}
                      </td>
                      <td className="text-right py-0.5 whitespace-nowrap">
                        {durationMin !== null ? `${durationMin}m` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
