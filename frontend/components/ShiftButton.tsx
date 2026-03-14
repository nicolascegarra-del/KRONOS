"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { getCurrentCoords } from "@/lib/geo";
import { useAuthStore } from "@/store/auth";
import { PauseDialog, PausaTipo } from "./PauseDialog";
import { Play, Square, Coffee, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type ShiftStatus = "idle" | "active" | "paused";

interface Pausa {
  id: string;
  start_time: string;
  end_time?: string;
  comment: string;
}

interface Fichaje {
  id: string;
  status: ShiftStatus | "finished";
  start_time: string;
  end_time?: string;
  total_minutes?: number;
  late_minutes?: number;
  pausas: Pausa[];
}

/** Parse a naive UTC datetime string from the backend as UTC (appending "Z"). */
function utcMs(iso: string): number {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").getTime();
}

/** Returns true if worker has been working continuously > 6h without a break ≥ 15 min (Art. 34.4 ET). */
function needsBreakReminder(fichaje: Fichaje): boolean {
  if (fichaje.status !== "active") return false;
  // Find the end time of the most recent pause ≥ 15 min (sufficient break)
  const lastSufficientBreakMs = fichaje.pausas
    .filter((p) => p.end_time != null && utcMs(p.end_time!) - utcMs(p.start_time) >= 15 * 60 * 1000)
    .reduce((latest, p) => {
      const endMs = utcMs(p.end_time!);
      return endMs > latest ? endMs : latest;
    }, 0);
  // Continuous working time = now minus (last sufficient break end, or shift start)
  const referenceMs = lastSufficientBreakMs || utcMs(fichaje.start_time);
  return Date.now() - referenceMs >= 6 * 3600 * 1000;
}

function computeElapsedSeconds(fichaje: Fichaje): number {
  const startMs = utcMs(fichaje.start_time);
  const completedPauseMs = fichaje.pausas
    .filter((p) => p.end_time != null)
    .reduce(
      (acc, p) => acc + (utcMs(p.end_time!) - utcMs(p.start_time)),
      0
    );
  if (fichaje.status === "paused") {
    const openPause = fichaje.pausas.find((p) => p.end_time == null);
    const freezeAt = openPause ? utcMs(openPause.start_time) : Date.now();
    return Math.max(0, Math.floor((freezeAt - startMs - completedPauseMs) / 1000));
  }
  return Math.max(0, Math.floor((Date.now() - startMs - completedPauseMs) / 1000));
}

interface ShiftButtonProps {
  onStatusChange?: (status: ShiftStatus) => void;
}

export function ShiftButton({ onStatusChange }: ShiftButtonProps) {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();
  const [modalidad, setModalidad] = useState<"presencial" | "teletrabajo">("presencial");
  const [status, setStatus] = useState<ShiftStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [fichaje, setFichaje] = useState<Fichaje | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseTipos, setPauseTipos] = useState<PausaTipo[]>([]);
  const [elapsed, setElapsed] = useState("00:00:00");
  const [error, setError] = useState<string | null>(null);
  // RGPD: local geo_consent mirrors JWT value; null means not yet asked
  const [geoConsent, setGeoConsent] = useState<boolean | null>(user?.geo_consent ?? null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);

  // Fetch pause types once on mount (cached for entire session)
  useEffect(() => {
    api.get<PausaTipo[]>("/pause-types").then((res) => setPauseTipos(res.data)).catch(() => {});
  }, []);

  // Poll for active fichaje on mount
  useEffect(() => {
    api.get<Fichaje | null>("/fichajes/active").then((res) => {
      if (res.data) {
        const s = res.data.status as ShiftStatus;
        setFichaje(res.data);
        setStatus(s);
        onStatusChange?.(s);
      }
    });
  }, []);

  // Update elapsed timer (pause-aware, freezes when paused)
  useEffect(() => {
    if (!fichaje || status === "idle") return;
    const render = () => {
      const total = computeElapsedSeconds(fichaje);
      const h = Math.floor(total / 3600).toString().padStart(2, "0");
      const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
      const s = (total % 60).toString().padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };
    render();
    if (status !== "active") return; // freeze when paused
    const id = setInterval(render, 1000);
    return () => clearInterval(id);
  }, [fichaje, status]);

  /** Returns coords only if consent was granted; null if denied or unavailable. */
  const getCoordsIfConsented = async (): Promise<{ lat: number; lng: number } | null> => {
    if (geoConsent === false) return null;
    return getCurrentCoords();
  };

  const handleConsentAccept = async () => {
    setConsentLoading(true);
    try {
      await api.post("/workers/me/geo-consent", { accepted: true });
      setGeoConsent(true);
      if (user) setUser({ ...user, geo_consent: true });
    } catch {
      // proceed anyway
    } finally {
      setConsentLoading(false);
      setConsentOpen(false);
      doStart();
    }
  };

  const handleConsentReject = async () => {
    setConsentLoading(true);
    try {
      await api.post("/workers/me/geo-consent", { accepted: false });
      setGeoConsent(false);
      if (user) setUser({ ...user, geo_consent: false });
    } catch {
      // proceed anyway
    } finally {
      setConsentLoading(false);
      setConsentOpen(false);
      doStart();
    }
  };

  const doStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const coords = geoConsent === false ? null : await getCurrentCoords();
      const res = await api.post<Fichaje>("/fichajes/start", { coords, modalidad });
      setFichaje(res.data);
      setStatus("active");
      onStatusChange?.("active");
      toast({ title: "Jornada iniciada", variant: "success" });
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al iniciar jornada");
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (geoConsent === null) {
      setConsentOpen(true);
      return;
    }
    doStart();
  };

  const handleEnd = async () => {
    setLoading(true);
    setError(null);
    try {
      const coords = await getCoordsIfConsented();
      await api.post("/fichajes/end", { coords });
      setFichaje(null);
      setStatus("idle");
      setElapsed("00:00:00");
      onStatusChange?.("idle");
      toast({ title: "Jornada finalizada", variant: "success" });
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al finalizar jornada");
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    setError(null);
    try {
      const coords = await getCoordsIfConsented();
      const res = await api.post<Fichaje>("/fichajes/resume", { coords });
      setFichaje(res.data);
      setStatus("active");
      onStatusChange?.("active");
      toast({ title: "Jornada reanudada", variant: "success" });
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al reanudar");
    } finally {
      setLoading(false);
    }
  };

  const handlePauseSuccess = (data: Fichaje) => {
    setFichaje(data);
    setStatus("paused");
    onStatusChange?.("paused");
    setPauseOpen(false);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Elapsed time */}
      {status !== "idle" && (
        <div className="text-4xl font-mono font-bold tabular-nums text-slate-700">
          {elapsed}
        </div>
      )}

      {/* Break reminder — Art. 34.4 ET: mandatory 15 min break after 6h */}
      {fichaje && needsBreakReminder(fichaje) && (
        <div role="alert" aria-live="polite" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-sm max-w-xs text-center">
          <Coffee className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>Llevas más de 6h trabajando. Recuerda tomar un descanso de al menos 15 minutos.</span>
        </div>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
          {error}
        </p>
      )}

      {/* Modalidad toggle — only visible before starting */}
      {status === "idle" && (
        <div className="flex rounded-full overflow-hidden border border-slate-300 text-sm font-medium">
          <button
            onClick={() => setModalidad("presencial")}
            aria-pressed={modalidad === "presencial"}
            className={cn(
              "px-5 py-1.5 transition-colors",
              modalidad === "presencial"
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Presencial
          </button>
          <button
            onClick={() => setModalidad("teletrabajo")}
            aria-pressed={modalidad === "teletrabajo"}
            className={cn(
              "px-5 py-1.5 transition-colors",
              modalidad === "teletrabajo"
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            Teletrabajo
          </button>
        </div>
      )}

      {/* Main action button */}
      {status === "idle" && (
        <button
          onClick={handleStart}
          disabled={loading}
          data-testid="btn-start"
          aria-label="Iniciar jornada laboral"
          className={cn(
            "w-64 h-64 rounded-full text-white text-2xl font-bold shadow-2xl transition-all duration-200",
            "bg-green-500 hover:bg-green-600 active:scale-95",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "flex flex-col items-center justify-center gap-3"
          )}
        >
          <Play className="w-12 h-12" aria-hidden="true" />
          <span>Iniciar Jornada</span>
        </button>
      )}

      {status === "active" && (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleEnd}
            disabled={loading}
            data-testid="btn-end"
            aria-label="Finalizar jornada laboral"
            className={cn(
              "w-64 h-64 rounded-full text-white text-2xl font-bold shadow-2xl transition-all duration-200",
              "bg-red-500 hover:bg-red-600 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex flex-col items-center justify-center gap-3"
            )}
          >
            <Square className="w-12 h-12" aria-hidden="true" />
            <span>Finalizar Jornada</span>
          </button>

          <button
            onClick={() => setPauseOpen(true)}
            disabled={loading}
            data-testid="btn-pause"
            aria-label="Iniciar pausa"
            className={cn(
              "px-8 py-3 rounded-full text-white font-semibold text-lg shadow-md transition-all duration-200",
              "bg-amber-500 hover:bg-amber-600 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center gap-2"
            )}
          >
            <Coffee className="w-5 h-5" aria-hidden="true" />
            Pausa
          </button>
        </div>
      )}

      {status === "paused" && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-amber-600 font-semibold text-lg mb-2">
            En pausa
          </div>
          <button
            onClick={handleResume}
            disabled={loading}
            data-testid="btn-resume"
            aria-label="Reanudar jornada"
            className={cn(
              "w-64 h-64 rounded-full text-white text-2xl font-bold shadow-2xl transition-all duration-200",
              "bg-blue-500 hover:bg-blue-600 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex flex-col items-center justify-center gap-3"
            )}
          >
            <RotateCcw className="w-12 h-12" aria-hidden="true" />
            <span>Reanudar</span>
          </button>
        </div>
      )}

      <PauseDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        onSuccess={handlePauseSuccess}
        tipos={pauseTipos}
      />

      {/* RGPD Art. 7 — Geolocation consent dialog */}
      {consentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Uso de ubicación</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Kronos registra tu ubicación GPS en el momento de marcar entrada, salida y pausas.
              Esta información es accesible por el administrador de tu empresa para verificar que
              fichas desde el centro de trabajo. Puedes revocar este consentimiento en cualquier
              momento desde tu perfil.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleConsentReject}
                disabled={consentLoading}
                className="flex-1 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                onClick={handleConsentAccept}
                disabled={consentLoading}
                className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 disabled:opacity-50"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
