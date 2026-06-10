"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete, LogOut, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const MAX_LEN = 6;
const MIN_LEN = 4;
const FEEDBACK_MS = 3500;

interface KioskResponse {
  worker_name: string;
  action: "start" | "end";
  total_minutes?: number | null;
  start_time?: string | null;
}

type Feedback =
  | { kind: "start"; name: string }
  | { kind: "end"; name: string; totalMinutes: number | null }
  | { kind: "error"; message: string };

/** Formatea minutos como "Xh Ym" (o "Ym" si <1h). */
function formatDuration(min: number | null | undefined): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function nowHHMM(): string {
  return new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export default function TabletKioskPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard: un usuario que NO sea tablet (p.ej. un trabajador) no debe usar el kiosco.
  // Tras un refresh el store puede estar vacío pero el dispositivo sigue autenticado
  // vía cookie; en ese caso dejamos pasar y el interceptor de la API gestiona el 401.
  useEffect(() => {
    if (user && user.role !== "tablet") {
      router.replace("/");
    }
  }, [user, router]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const vibrate = (pattern: number | number[]) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* no-op */
    }
  };

  const dismissFeedback = useCallback(() => {
    clearTimer();
    setFeedback(null);
    setCode("");
  }, []);

  const showFeedback = useCallback(
    (fb: Feedback) => {
      setFeedback(fb);
      vibrate(fb.kind === "error" ? [80, 60, 80] : 60);
      clearTimer();
      timerRef.current = setTimeout(dismissFeedback, FEEDBACK_MS);
    },
    [dismissFeedback]
  );

  const handleDigit = (d: string) => {
    if (loading || feedback) return;
    setCode((c) => (c.length >= MAX_LEN ? c : c + d));
  };

  const handleBackspace = () => {
    if (loading || feedback) return;
    setCode((c) => c.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (loading || feedback || code.length < MIN_LEN) return;
    setLoading(true);
    try {
      const res = await api.post<KioskResponse>("/fichajes/kiosk", { code });
      const data = res.data;
      if (data.action === "start") {
        showFeedback({ kind: "start", name: data.worker_name });
      } else {
        showFeedback({ kind: "end", name: data.worker_name, totalMinutes: data.total_minutes ?? null });
      }
    } catch (err: unknown) {
      // 404 → trabajador no válido. Resto → mensaje genérico de reintento.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        showFeedback({
          kind: "error",
          message: "Error en fichaje — trabajador no válido, llame a su responsable",
        });
      } else {
        showFeedback({
          kind: "error",
          message: "No se pudo registrar el fichaje. Inténtelo de nuevo o avise a su responsable.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Soporte de teclado físico (teclados numéricos USB en tablets/PCs de kiosco).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (feedback) {
        dismissFeedback();
        return;
      }
      if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
      else if (e.key === "Backspace") handleBackspace();
      else if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, code, loading]);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900 text-white select-none">
      {/* Header */}
      <header className="flex items-center px-5 py-4">
        <img src="/logo_kronos.png" alt="Kronos" className="h-9 w-auto object-contain" />
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          title="Cerrar sesión del dispositivo"
          className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Keypad */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-6">
        <p className="text-slate-300 text-lg sm:text-xl mb-2 text-center">
          Introduce tu código de fichaje
        </p>

        {/* Code display (masked) */}
        <div className="h-16 flex items-center justify-center gap-3 mb-6" aria-live="polite">
          {Array.from({ length: MAX_LEN }).map((_, i) => (
            <span
              key={i}
              className={`w-4 h-4 rounded-full transition-colors ${
                i < code.length ? "bg-sky-400" : "bg-slate-700"
              }`}
            />
          ))}
        </div>

        {/* Numeric pad */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 w-full max-w-sm">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <KeypadButton key={d} onClick={() => handleDigit(d)} disabled={loading}>
              {d}
            </KeypadButton>
          ))}
          <KeypadButton onClick={handleBackspace} disabled={loading} variant="muted" aria-label="Borrar">
            <Delete className="w-7 h-7" />
          </KeypadButton>
          <KeypadButton onClick={() => handleDigit("0")} disabled={loading}>
            0
          </KeypadButton>
          <KeypadButton
            onClick={handleSubmit}
            disabled={loading || code.length < MIN_LEN}
            variant="accent"
            aria-label="Aceptar"
          >
            <Check className="w-8 h-8" />
          </KeypadButton>
        </div>
      </div>

      {/* Full-screen feedback overlay */}
      {feedback && (
        <button
          onClick={dismissFeedback}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center cursor-pointer ${
            feedback.kind === "start"
              ? "bg-emerald-600"
              : feedback.kind === "end"
              ? "bg-sky-600"
              : "bg-red-600"
          }`}
        >
          {feedback.kind === "start" && (
            <>
              <Check className="w-24 h-24 mb-4" strokeWidth={3} />
              <p className="text-2xl sm:text-3xl font-medium opacity-90">Entrada registrada</p>
              <p className="text-4xl sm:text-6xl font-bold mt-2">{feedback.name}</p>
              <p className="text-xl sm:text-2xl mt-4 opacity-90">{nowHHMM()}</p>
            </>
          )}
          {feedback.kind === "end" && (
            <>
              <Check className="w-24 h-24 mb-4" strokeWidth={3} />
              <p className="text-2xl sm:text-3xl font-medium opacity-90">Salida registrada</p>
              <p className="text-4xl sm:text-6xl font-bold mt-2">{feedback.name}</p>
              <p className="text-xl sm:text-2xl mt-4 opacity-90">
                Jornada: <strong>{formatDuration(feedback.totalMinutes)}</strong>
              </p>
            </>
          )}
          {feedback.kind === "error" && (
            <>
              <p className="text-6xl sm:text-7xl font-bold mb-6">⚠️</p>
              <p className="text-2xl sm:text-4xl font-bold max-w-2xl leading-snug">
                {feedback.message}
              </p>
            </>
          )}
          <p className="absolute bottom-8 text-sm opacity-70">Toca para continuar</p>
        </button>
      )}
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
  disabled,
  variant = "default",
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "muted" | "accent";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "h-20 sm:h-24 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl font-semibold transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100";
  const styles =
    variant === "accent"
      ? "bg-sky-500 hover:bg-sky-400 text-white"
      : variant === "muted"
      ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
      : "bg-slate-700 hover:bg-slate-600 text-white";
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}
