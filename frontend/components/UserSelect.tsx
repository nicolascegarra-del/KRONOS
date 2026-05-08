"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Label } from "@/components/ui/label";

interface UserOption {
  id: string;
  email: string;
  full_name: string;
  company_id?: string | null;
  role?: string;
}

interface Props {
  value: string;
  onChange: (userId: string) => void;
  endpoint?: "admin" | "superadmin";
  companyId?: string | null;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

/**
 * Selector de usuario reutilizable.
 * - endpoint="admin": carga usuarios de la empresa del admin (GET /users).
 * - endpoint="superadmin": carga usuarios filtrados por companyId (GET /superadmin/users).
 *   Cuando companyId es null/undefined, no carga nada y queda deshabilitado.
 */
export default function UserSelect({
  value,
  onChange,
  endpoint = "admin",
  companyId = null,
  disabled = false,
  label,
  placeholder = "Selecciona un trabajador",
  required = false,
}: Props) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Superadmin: requiere companyId para evitar listar miles de usuarios
      if (endpoint === "superadmin" && !companyId) {
        setUsers([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const url =
          endpoint === "superadmin"
            ? `/superadmin/users?company_id=${companyId}&page_size=500`
            : `/users?limit=500`;
        const res = await api.get<UserOption[]>(url);
        if (!cancelled) setUsers(res.data ?? []);
      } catch {
        if (!cancelled) setError("Error al cargar usuarios");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [endpoint, companyId]);

  const isDisabled = disabled || loading || (endpoint === "superadmin" && !companyId);

  return (
    <div className="space-y-1">
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isDisabled}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={label ?? "Trabajador"}
      >
        <option value="">
          {endpoint === "superadmin" && !companyId
            ? "Selecciona primero una empresa"
            : loading
            ? "Cargando..."
            : placeholder}
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name} — {u.email}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
