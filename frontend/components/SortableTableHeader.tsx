"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/useTableSort";

interface Props {
  label: string;
  sortKey: string;
  currentKey: string | null;
  currentDirection: SortDirection;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}

export function SortableTableHeader({
  label,
  sortKey,
  currentKey,
  currentDirection,
  onSort,
  align = "left",
  className,
}: Props) {
  const isActive = currentKey === sortKey;
  const Icon = isActive ? (currentDirection === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justifyClass =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th className={cn(alignClass, "p-3 font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors w-full",
          justifyClass,
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        <Icon
          className={cn(
            "w-3 h-3 shrink-0",
            isActive ? "text-foreground" : "text-muted-foreground/40"
          )}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}
