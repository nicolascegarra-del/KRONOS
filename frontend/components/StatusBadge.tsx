const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  active: { label: "Activo", cls: "bg-green-100 text-green-700" },
  paused: { label: "Pausado", cls: "bg-amber-100 text-amber-700" },
  finished: { label: "Finalizado", cls: "bg-slate-100 text-slate-600" },
};

export function StatusBadge({ s }: { s: string }) {
  const c = STATUS_CFG[s] ?? { label: s, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}
