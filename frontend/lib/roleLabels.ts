export type UserRoleKey = "superadmin" | "admin" | "worker";

export const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Administrador",
  worker: "Trabajador",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}
