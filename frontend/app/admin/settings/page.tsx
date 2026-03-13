"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Bell, Clock, XCircle } from "lucide-react";

interface AppSettings {
  late_alert_enabled: boolean;
  late_alert_minutes: number;
  auto_close_enabled: boolean;
  auto_close_hours: number;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);

  // Notification settings
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifMinutes, setNotifMinutes] = useState(15);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Auto-close settings
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);
  const [autoCloseHours, setAutoCloseHours] = useState(12);
  const [savingAutoClose, setSavingAutoClose] = useState(false);
  const [autoCloseMsg, setAutoCloseMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [closeAllMsg, setCloseAllMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.get<AppSettings>("/settings/app").then((res) => {
      setNotifEnabled(res.data.late_alert_enabled);
      setNotifMinutes(res.data.late_alert_minutes);
      setAutoCloseEnabled(res.data.auto_close_enabled);
      setAutoCloseHours(res.data.auto_close_hours);
    }).finally(() => setLoading(false));
  }, []);

  // Auto-dismiss messages after 3s
  useEffect(() => {
    if (!notifMsg) return;
    const t = setTimeout(() => setNotifMsg(null), 3000);
    return () => clearTimeout(t);
  }, [notifMsg]);
  useEffect(() => {
    if (!autoCloseMsg) return;
    const t = setTimeout(() => setAutoCloseMsg(null), 3000);
    return () => clearTimeout(t);
  }, [autoCloseMsg]);
  useEffect(() => {
    if (!closeAllMsg) return;
    const t = setTimeout(() => setCloseAllMsg(null), 3000);
    return () => clearTimeout(t);
  }, [closeAllMsg]);

  const handleSaveNotif = async () => {
    setSavingNotif(true);
    setNotifMsg(null);
    try {
      await api.put("/settings/app", {
        late_alert_enabled: notifEnabled,
        late_alert_minutes: notifMinutes,
        auto_close_enabled: autoCloseEnabled,
        auto_close_hours: autoCloseHours,
      });
      setNotifMsg({ ok: true, text: "Configuración de alertas guardada." });
    } catch (e: any) {
      setNotifMsg({ ok: false, text: e.response?.data?.detail || "Error al guardar" });
    } finally {
      setSavingNotif(false);
    }
  };

  const handleSaveAutoClose = async () => {
    setSavingAutoClose(true);
    setAutoCloseMsg(null);
    try {
      await api.put("/settings/app", {
        late_alert_enabled: notifEnabled,
        late_alert_minutes: notifMinutes,
        auto_close_enabled: autoCloseEnabled,
        auto_close_hours: autoCloseHours,
      });
      setAutoCloseMsg({ ok: true, text: "Configuración de cierre automático guardada." });
    } catch (e: any) {
      setAutoCloseMsg({ ok: false, text: e.response?.data?.detail || "Error al guardar" });
    } finally {
      setSavingAutoClose(false);
    }
  };

  const handleCloseAll = async () => {
    if (!confirm("¿Cerrar TODOS los fichajes activos ahora mismo? Esta acción no se puede deshacer.")) return;
    setClosingAll(true);
    setCloseAllMsg(null);
    try {
      const res = await api.post<{ closed: number }>("/fichajes/admin/close-all");
      setCloseAllMsg({ ok: true, text: `${res.data.closed} fichaje(s) cerrado(s) correctamente.` });
    } catch (e: any) {
      setCloseAllMsg({ ok: false, text: e.response?.data?.detail || "Error al cerrar fichajes" });
    } finally {
      setClosingAll(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Configuración</h1>

      <p className="text-sm text-muted-foreground mb-6 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
        La configuración del servidor de correo (SMTP) la gestiona el superadministrador en la ficha de cada empresa.
      </p>

      {/* Notification settings */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-700 border-b pb-2 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Alertas de puntualidad
        </h2>
        <p className="text-xs text-muted-foreground">
          Recibe una notificación en la campanilla cuando un trabajador fiche tarde o no haya
          fichado pasados X minutos desde su hora de entrada configurada.
        </p>

        <div className="flex items-center gap-3">
          <input
            id="notif-enabled"
            type="checkbox"
            checked={notifEnabled}
            onChange={(e) => setNotifEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-slate-900"
          />
          <Label htmlFor="notif-enabled">Activar alertas de puntualidad</Label>
        </div>

        {notifEnabled && (
          <div className="space-y-1">
            <Label>Minutos de margen tras la hora de entrada</Label>
            <Input
              type="number"
              min={1}
              max={480}
              value={notifMinutes}
              onChange={(e) => setNotifMinutes(Number(e.target.value))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Se mostrará alerta si no ha fichado {notifMinutes} minuto{notifMinutes !== 1 ? "s" : ""} después de su hora de entrada.
            </p>
          </div>
        )}

        {notifMsg && (
          <p className={`text-sm ${notifMsg.ok ? "text-green-600" : "text-destructive"}`}>
            {notifMsg.text}
          </p>
        )}

        <Button
          type="button"
          onClick={handleSaveNotif}
          disabled={savingNotif}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {savingNotif ? "Guardando..." : "Guardar alertas"}
        </Button>
      </div>

      {/* Auto-close settings */}
      <div className="bg-white border rounded-lg p-6 mt-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-700 border-b pb-2 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Cierre automático de fichajes
        </h2>
        <p className="text-xs text-muted-foreground">
          Cierra automáticamente los fichajes que lleven más de X horas abiertos. Se comprueba cada 5 minutos.
        </p>

        <div className="flex items-center gap-3">
          <input
            id="auto-close-enabled"
            type="checkbox"
            checked={autoCloseEnabled}
            onChange={(e) => setAutoCloseEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-slate-900"
          />
          <Label htmlFor="auto-close-enabled">Activar cierre automático</Label>
        </div>

        {autoCloseEnabled && (
          <div className="space-y-1">
            <Label>Cerrar fichajes abiertos más de (horas)</Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={autoCloseHours}
              onChange={(e) => setAutoCloseHours(Number(e.target.value))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Los fichajes con más de {autoCloseHours} hora{autoCloseHours !== 1 ? "s" : ""} sin cerrar se finalizarán automáticamente.
            </p>
          </div>
        )}

        {autoCloseMsg && (
          <p className={`text-sm ${autoCloseMsg.ok ? "text-green-600" : "text-destructive"}`}>
            {autoCloseMsg.text}
          </p>
        )}

        <Button
          type="button"
          onClick={handleSaveAutoClose}
          disabled={savingAutoClose}
          className="flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {savingAutoClose ? "Guardando..." : "Guardar cierre automático"}
        </Button>

        <div className="border-t pt-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-destructive" />
            Cierre manual inmediato
          </h3>
          <p className="text-xs text-muted-foreground">
            Cierra ahora mismo todos los fichajes activos o en pausa de tu empresa.
          </p>
          {closeAllMsg && (
            <p className={`text-sm ${closeAllMsg.ok ? "text-green-600" : "text-destructive"}`}>
              {closeAllMsg.text}
            </p>
          )}
          <Button
            type="button"
            variant="destructive"
            onClick={handleCloseAll}
            disabled={closingAll}
            className="flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            {closingAll ? "Cerrando..." : "Cerrar todos los fichajes ahora"}
          </Button>
        </div>
      </div>
    </div>
  );
}
