import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface UseTableSortResult<T> {
  sorted: T[];
  sortKey: string | null;
  direction: SortDirection;
  handleSort: (key: string) => void;
}

/**
 * Genérico para ordenar arrays de objetos por una clave seleccionable en runtime.
 * Strings usan localeCompare("es") para acentos. Booleanos: true antes que false en asc.
 * Valores null/undefined van al final.
 */
export function useTableSort<T extends Record<string, unknown>>(
  items: T[],
  initialKey: string | null = null,
  initialDirection: SortDirection = "asc"
): UseTableSortResult<T> {
  const [sortKey, setSortKey] = useState<string | null>(initialKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    const dir = direction === "asc" ? 1 : -1;
    const out = [...items];
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv, "es", { sensitivity: "base" }) * dir;
      }
      if (typeof av === "boolean" && typeof bv === "boolean") {
        return (av === bv ? 0 : av ? -1 : 1) * dir;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), "es") * dir;
    });
    return out;
  }, [items, sortKey, direction]);

  return { sorted, sortKey, direction, handleSort };
}
