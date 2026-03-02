import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDuration, intervalToDuration } from "date-fns";
import { es } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(dateStr: string): string {
  return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: es });
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
