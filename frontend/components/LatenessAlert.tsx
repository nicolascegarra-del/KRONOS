"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface LatenessAlertProps {
  lateMinutes: number;
  scheduledStart?: string;
  actualStart: string;
}

export function LatenessAlert({
  lateMinutes,
  scheduledStart,
  actualStart,
}: LatenessAlertProps) {
  if (lateMinutes <= 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="destructive" className="flex items-center gap-1">
        <AlertCircle className="w-3 h-3" />
        {lateMinutes}min tarde
      </Badge>
      {scheduledStart && (
        <span className="text-xs text-muted-foreground">
          (previsto {scheduledStart}, llegó {actualStart})
        </span>
      )}
    </div>
  );
}
