import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDuration, intervalToDuration } from "date-fns";
import { es } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(dateStr: string): string {
  const normalized = dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
  return format(new Date(normalized), "dd/MM/yyyy HH:mm", { locale: es });
}

export function formatTime(dateStr: string): string {
  return format(new Date(dateStr), "HH:mm", { locale: es });
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), "dd/MM/yyyy", { locale: es });
}

export function minutesToHoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function getShiftDuration(startTime: string, endTime?: string): string {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  const duration = intervalToDuration({ start, end });
  return formatDuration(duration, {
    format: ["hours", "minutes"],
    locale: es,
  });
}

/**
 * Convierte el valor de un input <input type="datetime-local"> (hora local naive,
 * formato "YYYY-MM-DDTHH:mm") a un ISO 8601 en UTC con sufijo "Z" para enviar al
 * backend. Así la BD guarda siempre UTC y la app evita las inconsistencias entre
 * roles (CEST vs UTC) que surgen al persistir hora local cruda.
 */
export function localInputToUtcIso(localInput: string): string {
  if (!localInput) return "";
  // new Date("YYYY-MM-DDTHH:mm") interpreta el string como hora local del navegador
  const d = new Date(localInput);
  return d.toISOString();
}

/**
 * Convierte un ISO 8601 (con o sin "Z", asumido UTC si no tiene tz) al formato
 * "YYYY-MM-DDTHH:mm" en hora local del navegador, listo para un input
 * <input type="datetime-local">.
 */
export function utcIsoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const normalized = iso.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  // Construye YYYY-MM-DDTHH:mm en hora local sin desfase
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
