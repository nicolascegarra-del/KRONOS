"use client";

import React, { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Users,
  Clock,
  AlertCircle,
  CheckCircle2,
  UserPlus,
  FileText,
  CalendarDays,
  Activity,
  Check,
  X,
  Map,
  Settings2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import type { GeoWorker } from "@/components/WorkerGeoMap";

// ── Lazy-load Leaflet (client only, no SSR) ────────────────────────────────────
const WorkerGeoMap = dynamic(() => import("@/components/WorkerGeoMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
      Cargando mapa…
    </div>
  ),
});

// ── Dashboard config ───────────────────────────────────────────────────────────

const CONFIG_KEY = "admin_dashboard_config";

interface DashboardConfig {
  showKpis: boolean;
  showQuickActions: boolean;
  showLateWorkers: boolean;
  showActiveFichajes: boolean;
  showPendingAbsences: boolean;
  showGeoMap: boolean;
}

const CONFIG_DEFAULTS: DashboardConfig = {
  showKpis: true,
  showQuickActions: true,
  showLateWorkers: true,
  showActiveFichajes: true,
  showPendingAbsences: true,
  showGeoMap: true,
};

function loadConfig(): DashboardConfig {
  if (typeof window === "undefined") return CONFIG_DEFAULTS;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? { ...CONFIG_DEFAULTS, ...JSON.parse(raw) } : CONFIG_DEFAULTS;
  } catch {
    return CONFIG_DEFAULTS;
  }
}

function saveConfig(cfg: DashboardConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

const CONFIG_LABELS: { key: keyof DashboardConfig; label: string }[] = [
  { key: "showKpis", label: "Estadísticas (KPIs)" },
  { key: "showQuickActions", label: "Accesos rápidos" },
  { key: "showLateWorkers", label: "Tarde / Ausentes hoy" },
  { key: "showActiveFichajes", label: "Fichajes activos" },
  { key: "showPendingAbsences", label: "Solicitudes pendientes" },
  { key: "showGeoMap", label: "Mapa de geolocalizaciones" },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserItem {
  role: "admin" | "worker" | "superadmin";
  is_active: boolean;
}

interface LateAlert {
  type: "late" | "absent";
  full_name: string;
  scheduled_start: string;
  minutes_late: number;
}

interface AbsenceOut {
  id: string;
  user_name: string | null;
  type: "vacaciones" | "baja_medica" | "permiso" | "otros";
  start_date: string;
  end_date: string;
  status: string;
}

interface FichajeAdminItem {
  id: string;
  user: { full_name: string } | null;
  start_time: string;
  end_time: string | null;
  status: string;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  user_id: string;
}

interface KPIs {
  total_workers: number;
  fichando_ahora: number;
  fichajes_hoy: number;
  tarde_ausentes: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function elapsedLabel(startIso: string): string {
  const ms = Date.now() - new Date(startIso.endsWith("Z") ? startIso : startIso + "Z").getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function fmtTime(iso: string): string {
  return format(new Date(iso.endsWith("Z") ? iso : iso + "Z"), "HH:mm");
}

function countDays(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

const ABSENCE_LABELS: Record<string, string> = {
  vacaciones: "Vacaciones",
  baja_medica: "Baja médica",
  permiso: "Permiso",
  otros: "Otros",
};

/** Extract GeoWorker list from today's fichajes: one per worker, most recent coords */
function buildGeoWorkers(fichajes: FichajeAdminItem[]): GeoWorker[] {
  const byUser: Record<string, FichajeAdminItem> = {};
  for (const f of fichajes) {
    const existing = byUser[f.user_id];
    if (!existing || new Date(f.start_time) > new Date(existing.start_time)) {
      byUser[f.user_id] = f;
    }
  }

  const result: GeoWorker[] = [];
  for (const f of Object.values(byUser)) {
    // Prefer last known position: end coords if available, else start
    const lat = f.end_lat ?? f.start_lat;
    const lng = f.end_lng ?? f.start_lng;
    if (lat == null || lng == null) continue;

    const status: GeoWorker["status"] =
      f.status === "active" ? "active" : f.status === "paused" ? "paused" : "ended";
    const label =
      f.status === "active" || f.status === "paused"
        ? `Desde ${fmtTime(f.start_time)}`
        : `${fmtTime(f.start_time)} – ${f.end_time ? fmtTime(f.end_time) : "?"}`;

    result.push({
      user_id: f.user_id,
      full_name: f.user?.full_name ?? "—",
      lat,
      lng,
      status,
      label,
    });
  }
  return result;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [config, setConfig] = useState<DashboardConfig>(CONFIG_DEFAULTS);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [lateAlerts, setLateAlerts] = useState<LateAlert[]>([]);
  const [pendingAbsences, setPendingAbsences] = useState<AbsenceOut[]>([]);
  const [activeFichajes, setActiveFichajes] = useState<FichajeAdminItem[]>([]);
  const [geoWorkers, setGeoWorkers] = useState<GeoWorker[]>([]);
  const [vacationEnabled, setVacationEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const today = format(new Date(), "yyyy-MM-dd");

  // Load config from localStorage after mount
  useEffect(() => {
    setConfig(loadConfig());
    setConfigLoaded(true);
  }, []);

  function updateConfig(key: keyof DashboardConfig, value: boolean) {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      saveConfig(next);
      return next;
    });
  }

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api.get<UserItem[]>("/users"),
      api.get<{ workers: unknown[] }>(`/reports/hours?from_date=${today}&to_date=${today}`),
      api.get<LateAlert[]>("/admin/notifications/late"),
      api.get<{ items: FichajeAdminItem[]; total: number }>("/fichajes/admin?status=active&limit=5"),
      api.get<AbsenceOut[]>("/admin/absences?filter_status=pending"),
      api.get<{ vacation_enabled: boolean }>("/companies/features"),
      // Fetch all today's fichajes for the geo map (no status filter, higher limit)
      api.get<{ items: FichajeAdminItem[]; total: number }>(
        `/fichajes/admin?from_date=${today}&to_date=${today}&limit=200`
      ),
    ]);

    const [usersRes, hoursRes, lateRes, activeFRes, absencesRes, featuresRes, allTodayRes] = results;

    const totalWorkers =
      usersRes.status === "fulfilled"
        ? usersRes.value.data.filter((u) => u.role === "worker" && u.is_active).length
        : 0;
    const fichandoTotal =
      activeFRes.status === "fulfilled" ? activeFRes.value.data.total : 0;
    const fichajesHoy =
      hoursRes.status === "fulfilled" ? hoursRes.value.data.workers.length : 0;
    const alerts = lateRes.status === "fulfilled" ? lateRes.value.data : [];
    const active = activeFRes.status === "fulfilled" ? activeFRes.value.data.items : [];
    const absences = absencesRes.status === "fulfilled" ? absencesRes.value.data : [];
    const vacEnabled =
      featuresRes.status === "fulfilled" ? featuresRes.value.data.vacation_enabled : false;
    const allToday =
      allTodayRes.status === "fulfilled" ? allTodayRes.value.data.items : [];

    setKpis({
      total_workers: totalWorkers,
      fichando_ahora: fichandoTotal,
      fichajes_hoy: fichajesHoy,
      tarde_ausentes: alerts.length,
    });
    setLateAlerts(alerts);
    setActiveFichajes(active);
    setPendingAbsences(absences.slice(0, 5));
    setVacationEnabled(vacEnabled);
    setGeoWorkers(buildGeoWorkers(allToday));
    setLoading(false);
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 60000);
    return () => clearInterval(id);
  }, []);

  async function handleAbsenceAction(id: string, status: "approved" | "rejected") {
    try {
      await api.patch(`/admin/absences/${id}`, { status });
      setPendingAbsences((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // ignore
    }
  }

  if (!configLoaded) return null; // avoid hydration mismatch

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Panel de Control</h1>
          <p className="text-muted-foreground capitalize">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>

        {/* Config button */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="w-4 h-4" />
              Personalizar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Personalizar panel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {CONFIG_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label htmlFor={key} className="text-sm cursor-pointer">
                    {label}
                  </Label>
                  <Switch
                    id={key}
                    checked={config[key]}
                    onCheckedChange={(v) => updateConfig(key, v)}
                  />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Row */}
      {config.showKpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            icon={<Users className="w-4 h-4" />}
            label="Trabajadores"
            value={loading ? "—" : String(kpis!.total_workers)}
          />
          <KpiCard
            icon={<Activity className="w-4 h-4 text-green-600" />}
            label="Fichando ahora"
            value={loading ? "—" : String(kpis!.fichando_ahora)}
            valueClass="text-green-600"
          />
          <KpiCard
            icon={<Clock className="w-4 h-4" />}
            label="Fichajes hoy"
            value={loading ? "—" : String(kpis!.fichajes_hoy)}
          />
          <KpiCard
            icon={<AlertCircle className="w-4 h-4" />}
            label="Tarde / Ausentes"
            value={loading ? "—" : String(kpis!.tarde_ausentes)}
            valueClass={!loading && kpis!.tarde_ausentes > 0 ? "text-red-600" : undefined}
          />
        </div>
      )}

      {/* Quick Actions */}
      {config.showQuickActions && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Accesos rápidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <QuickAction href="/admin/users" icon={<UserPlus className="w-5 h-5" />} label="Nuevo trabajador" />
              <QuickAction href="/admin/fichajes" icon={<Clock className="w-5 h-5" />} label="Ver fichajes" />
              <QuickAction href="/admin/reports" icon={<FileText className="w-5 h-5" />} label="Generar informe" />
              {vacationEnabled && (
                <QuickAction href="/admin/absences" icon={<CalendarDays className="w-5 h-5" />} label="Ausencias" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Late workers + Active fichajes */}
      {(config.showLateWorkers || config.showActiveFichajes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {config.showLateWorkers && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Tarde / Ausentes hoy
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : lateAlerts.length === 0 ? (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Todos a tiempo hoy
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {lateAlerts.map((a, i) => (
                      <li key={i} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{a.full_name}</span>
                          <span className="text-muted-foreground ml-2">({a.scheduled_start})</span>
                        </div>
                        {a.type === "absent" ? (
                          <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            Ausente
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            Tarde {a.minutes_late}min
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {config.showActiveFichajes && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Fichajes activos
                </CardTitle>
                <Link href="/admin/fichajes" className="text-xs text-blue-600 hover:underline">
                  Ver todos →
                </Link>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : activeFichajes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin fichajes activos en este momento</p>
                ) : (
                  <ul className="space-y-2">
                    {activeFichajes.map((f) => (
                      <li key={f.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                          <span className="font-medium">{f.user?.full_name ?? "—"}</span>
                        </div>
                        <div className="text-muted-foreground text-right">
                          <span>{fmtTime(f.start_time)}</span>
                          <span className="ml-2 text-xs">({elapsedLabel(f.start_time)})</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <span className="hidden">{elapsed}</span>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Geo map */}
      {config.showGeoMap && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Map className="w-4 h-4" />
              Última geolocalización de trabajadores
              {!loading && (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({geoWorkers.length} con datos hoy)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden rounded-b-lg">
            {loading ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Cargando…
              </div>
            ) : (
              <div className="px-4 pb-4">
                <WorkerGeoMap workers={geoWorkers} />
                <p className="text-xs text-muted-foreground mt-2">
                  🟢 Activo &nbsp; 🟡 En pausa &nbsp; ⚪ Finalizado hoy
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending absences */}
      {config.showPendingAbsences && vacationEnabled && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Solicitudes pendientes
              {pendingAbsences.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold dark:bg-amber-900/40 dark:text-amber-300">
                  {pendingAbsences.length}
                </span>
              )}
            </CardTitle>
            <Link href="/admin/absences" className="text-xs text-blue-600 hover:underline">
              Ver todas →
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : pendingAbsences.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Sin solicitudes pendientes
              </div>
            ) : (
              <ul className="divide-y">
                {pendingAbsences.map((a) => {
                  const days = countDays(a.start_date, a.end_date);
                  return (
                    <li key={a.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{a.user_name ?? "—"}</span>
                        <span className="text-muted-foreground ml-2">
                          {ABSENCE_LABELS[a.type] ?? a.type}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {a.start_date === a.end_date
                            ? a.start_date
                            : `${a.start_date} – ${a.end_date}`}{" "}
                          ({days}d)
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/20"
                          onClick={() => handleAbsenceAction(a.id, "approved")}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
                          onClick={() => handleAbsenceAction(a.id, "rejected")}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${valueClass ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link href={href}>
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card hover:bg-accent transition-colors p-4 cursor-pointer text-center h-full">
        <div className="text-primary">{icon}</div>
        <span className="text-xs font-medium text-muted-foreground leading-tight">{label}</span>
      </div>
    </Link>
  );
}
