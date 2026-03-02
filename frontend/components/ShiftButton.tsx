"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { PauseDialog } from "./PauseDialog";
import { Play, Square, Coffee, RotateCcw } from "lucide-react";

type ShiftStatus = "idle" | "active" | "paused";

interface Fichaje {
  id: string;
  status: ShiftStatus | "finished";
  start_time: string;
  end_time?: string;
  total_minutes?: number;
  late_minutes?: number;
}

interface ShiftButtonProps {
  onStatusChange?: (status: ShiftStatus) => void;
}

export function ShiftButton({ onStatusChange }: ShiftButtonProps) {
  const [status, setStatus] = useState<ShiftStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [fichaje, setFichaje] = useState<Fichaje | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [elapsed, setElapsed] = useState("00:00:00");
  const [error, setError] = useState<string | null>(null);

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

  // Update elapsed timer
  useEffect(() => {
    if (!fichaje || status === "idle") return;
    const tick = () => {
      const start = new Date(fichaje.start_time).getTime();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, "0");
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, "0");
      const s = (diff % 60).toString().padStart(2, "0");
      setElapsed(`${h}:${m}:${s}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [fichaje, status]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<Fichaje>("/fichajes/start");
      setFichaje(res.data);
      setStatus("active");
      onStatusChange?.("active");
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al iniciar jornada");
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post("/fichajes/end");
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
      const res = await api.post<Fichaje>("/fichajes/resume");
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
    </div>
  );
}
