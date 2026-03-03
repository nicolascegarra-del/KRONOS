"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatTime, minutesToHoursLabel } from "@/lib/utils";
import { Clock, Coffee } from "lucide-react";

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

export function FichajeCard({ fichaje }: FichajeCardProps) {
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
              <Clock className="w-4 h-4" />
              <span className="font-medium">
                {minutesToHoursLabel(fichaje.total_minutes)}
              </span>
              <span className="text-muted-foreground">trabajadas</span>
            </div>
          )}

          {fichaje.pausas.length > 0 && (
            <div className="flex items-center gap-1 text-amber-600">
              <Coffee className="w-4 h-4" />
              <span>{fichaje.pausas.length} pausa{fichaje.pausas.length > 1 ? "s" : ""}</span>
            </div>
          )}

        </div>

        {/* Pauses detail */}
        {fichaje.pausas.length > 0 && (
          <div className="mt-3 space-y-1 border-t pt-3">
            {fichaje.pausas.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate flex-1 mr-2">{p.comment}</span>
                <span className="shrink-0">
                  {formatTime(p.start_time)}
                  {p.end_time ? ` – ${formatTime(p.end_time)}` : " (abierta)"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
