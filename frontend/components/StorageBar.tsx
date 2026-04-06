"use client";

import React from "react";
import { HardDrive, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface StorageBarProps {
  usedBytes: number;
  maxBytes: number;
  percentage: number;
  warning: boolean;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StorageBar({ usedBytes, maxBytes, percentage, warning, className }: StorageBarProps) {
  const isCritical = percentage >= 95;
  const isWarning = !isCritical && percentage >= 80;

  const barColor = isCritical
    ? "bg-red-500"
    : isWarning
    ? "bg-amber-500"
    : "bg-green-500";

  const textColor = isCritical
    ? "text-red-700"
    : isWarning
    ? "text-amber-700"
    : "text-slate-600";

  const bgColor = isCritical
    ? "bg-red-50 border-red-200"
    : isWarning
    ? "bg-amber-50 border-amber-200"
    : "bg-slate-50 border-slate-200";

  return (
    <div className={cn("rounded-lg border p-3", bgColor, className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          {(isCritical || isWarning) ? (
            <AlertTriangle className={cn("w-4 h-4", isCritical ? "text-red-500" : "text-amber-500")} />
          ) : (
            <HardDrive className="w-4 h-4 text-slate-500" />
          )}
          Almacenamiento de documentos
        </div>
        <span className={cn("text-xs font-semibold", textColor)}>
          {formatBytes(usedBytes)} / {formatBytes(maxBytes)} ({percentage.toFixed(1)}%)
        </span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-2">
        <div
          className={cn("h-2 rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {isCritical && (
        <p className="text-xs text-red-600 mt-1.5 font-medium">
          Almacenamiento casi lleno. Elimina documentos antiguos para liberar espacio.
        </p>
      )}
      {isWarning && (
        <p className="text-xs text-amber-600 mt-1.5">
          Queda poco espacio disponible. Considera eliminar documentos antiguos.
        </p>
      )}
    </div>
  );
}
