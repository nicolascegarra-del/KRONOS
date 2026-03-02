"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";

interface LateAlert {
  type: "late" | "absent";
  user_id: string;
  full_name: string;
  email: string;
  scheduled_start: string;
  minutes_late: number;
}

const POLL_MS = 60_000;

export default function NotificationBell() {
  const [alerts, setAlerts] = useState<LateAlert[]>([]);
  const [open, setOpen] = useState(false);
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api.get<LateAlert[]>("/admin/notifications/late");
      const incoming = res.data;
      setAlerts(incoming);

      // Fire browser notification for new alerts
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        incoming.forEach((alert) => {
          const key = `${alert.user_id}-${alert.type}`;
          if (!notifiedIds.has(key)) {
            const label =
              alert.type === "absent"
                ? `${alert.full_name} no ha fichado (${alert.minutes_late} min tarde)`
                : `${alert.full_name} llegó ${alert.minutes_late} min tarde`;
            new Notification("Fichajes — Alerta", { body: label });
            setNotifiedIds((prev) => new Set(prev).add(key));
          }
        });
      }
    } catch {
      // silently ignore — user may not be logged in yet
    }
  }, [notifiedIds]);

  // Request permission once on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  // Poll every minute
  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-md hover:bg-slate-800 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5 text-slate-300" />
        {alerts.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold leading-none">
            {alerts.length > 9 ? "9+" : alerts.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2 border-b bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">Alertas de puntualidad</p>
          </div>

          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">Sin alertas activas</p>
          ) : (
            <ul className="divide-y max-h-72 overflow-y-auto">
              {alerts.map((a) => (
                <li key={`${a.user_id}-${a.type}`} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        a.type === "absent" ? "bg-red-500" : "bg-orange-400"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {a.full_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {a.type === "absent"
                          ? `No ha fichado — ${a.minutes_late} min desde las ${a.scheduled_start}`
                          : `Llegó ${a.minutes_late} min tarde (entrada: ${a.scheduled_start})`}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
