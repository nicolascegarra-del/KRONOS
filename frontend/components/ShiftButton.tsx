"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { getCurrentCoords } from "@/lib/geo";
import { useAuthStore } from "@/store/auth";
import { PauseDialog } from "./PauseDialog";
import { Play, Square, Coffee, RotateCcw } from "lucide-react";

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
  const [status, setStatus] = useState<ShiftStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [fichaje, setFichaje] = useState<Fichaje | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [elapsed, setElapsed] = useState("00:00:00");
  const [error, setError] = useState<string | null>(null);
  // RGPD: local geo_consent mirrors JWT value; null means not yet asked
  const [geoConsent, setGeoConsent] = useState<boolean | null>(user?.geo_consent ?? null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentLoading, setConsentLoading] = useState(false);

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
      const res = await api.post<Fichaje>("/fichajes/start", { coords });
      setFichaje(res.data);
      setStatus("active");
      onStatusChange?.("active");
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

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded-md">
          {error}
        </p>
      )}

      {/* Main action button */}
      {status === "idle" && (
        <button
          onClick={handleStart}
          disabled={loading}
          data-testid="btn-start"
          className={cn(
            "w-64 h-64 rounded-full text-white text-2xl font-bold shadow-2xl transition-all duration-200",
            "bg-green-500 hover:bg-green-600 active:scale-95",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "flex flex-col items-center justify-center gap-3"
          )}
        >
          <Play className="w-12 h-12" />
          <span>Iniciar Jornada</span>
        </button>
      )}

      {status === "active" && (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={handleEnd}
            disabled={loading}
            data-testid="btn-end"
            className={cn(
              "w-64 h-64 rounded-full text-white text-2xl font-bold shadow-2xl transition-all duration-200",
              "bg-red-500 hover:bg-red-600 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex flex-col items-center justify-center gap-3"
            )}
          >
            <Square className="w-12 h-12" />
            <span>Finalizar Jornada</span>
          </button>

          <button
            onClick={() => setPauseOpen(true)}
            disabled={loading}
            data-testid="btn-pause"
            className={cn(
              "px-8 py-3 rounded-full text-white font-semibold text-lg shadow-md transition-all duration-200",
              "bg-amber-500 hover:bg-amber-600 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center gap-2"
            )}
          >
            <Coffee className="w-5 h-5" />
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
            className={cn(
              "w-64 h-64 rounded-full text-white text-2xl font-bold shadow-2xl transition-all duration-200",
              "bg-blue-500 hover:bg-blue-600 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex flex-col items-center justify-center gap-3"
            )}
          >
            <RotateCcw className="w-12 h-12" />
            <span>Reanudar</span>
          </button>
        </div>
      )}

      <PauseDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        onSuccess={handlePauseSuccess}
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
