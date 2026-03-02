"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Save, Bell } from "lucide-react";

interface AppSettings {
  late_alert_enabled: boolean;
  late_alert_minutes: number;
}

interface EmailConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  has_password: boolean;
}

const EMPTY: EmailConfig = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  from_email: "",
  from_name: "Fichajes",
  use_tls: true,
  has_password: false,
};

export default function SettingsPage() {
  const [form, setForm] = useState<EmailConfig>(EMPTY);
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Notification settings
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifMinutes, setNotifMinutes] = useState(15);
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<EmailConfig>("/settings/email"),
      api.get<AppSettings>("/settings/app"),
    ]).then(([emailRes, appRes]) => {
      setForm(emailRes.data);
      setNotifEnabled(appRes.data.late_alert_enabled);
      setNotifMinutes(appRes.data.late_alert_minutes);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, string | number | boolean> = {
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_user: form.smtp_user,
        from_email: form.from_email,
        from_name: form.from_name,
        use_tls: form.use_tls,
      };
      if (password) body.smtp_password = password;
      const res = await api.put<EmailConfig>("/settings/email", body);
      setForm(res.data);
      setPassword("");
      setSaveMsg({ ok: true, text: "Configuración guardada correctamente." });
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e.response?.data?.detail || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo) return;
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await api.post<{ message: string }>("/settings/email/test", { to: testTo });
      setTestMsg({ ok: true, text: res.data.message });
    } catch (e: any) {
      setTestMsg({ ok: false, text: e.response?.data?.detail || "Error al enviar el test" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveNotif = async () => {
    setSavingNotif(true);
    setNotifMsg(null);
    try {
      await api.put("/settings/app", {
        late_alert_enabled: notifEnabled,
        late_alert_minutes: notifMinutes,
      });
      setNotifMsg({ ok: true, text: "Configuración de alertas guardada." });
    } catch (e: any) {
      setNotifMsg({ ok: false, text: e.response?.data?.detail || "Error al guardar" });
    } finally {
      setSavingNotif(false);
    }
  };

  const set = (key: keyof EmailConfig, val: string | number | boolean) =>
    setForm((p) => ({ ...p, [key]: val }));

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Configuración</h1>

      <form onSubmit={handleSave} className="bg-white border rounded-lg p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-700 border-b pb-2">Servidor de correo (SMTP)</h2>

        <p className="text-xs text-muted-foreground -mt-2">
          Compatible con Gmail (<code>smtp.gmail.com</code> puerto 587) y cualquier servidor corporativo.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1">
            <Label>Servidor SMTP</Label>
            <Input
              placeholder="smtp.gmail.com"
              value={form.smtp_host}
              onChange={(e) => set("smtp_host", e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Puerto</Label>
            <Input
              type="number"
              value={form.smtp_port}
              onChange={(e) => set("smtp_port", Number(e.target.value))}
              required
            />
          </div>

          <div className="space-y-1">
            <Label>Seguridad</Label>
            <select
              value={form.use_tls ? "tls" : "ssl"}
              onChange={(e) => set("use_tls", e.target.value === "tls")}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="tls">STARTTLS (recomendado)</option>
              <option value="ssl">SSL/TLS</option>
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Usuario / Email SMTP</Label>
            <Input
              type="email"
              placeholder="tu@gmail.com"
              value={form.smtp_user}
              onChange={(e) => set("smtp_user", e.target.value)}
              required
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label>
              Contraseña / App password
              {form.has_password && (
                <span className="ml-2 text-xs text-green-600 font-normal">✓ guardada</span>
              )}
            </Label>
            <Input
              type="password"
              placeholder={form.has_password ? "••••••••  (dejar vacío para no cambiar)" : "Contraseña SMTP"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Nombre del remitente</Label>
            <Input
              value={form.from_name}
              onChange={(e) => set("from_name", e.target.value)}
              required
            />
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Email remitente (From)</Label>
            <Input
              type="email"
              placeholder="informes@miempresa.com"
              value={form.from_email}
              onChange={(e) => set("from_email", e.target.value)}
              required
            />
          </div>
        </div>

        {saveMsg && (
          <p className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-destructive"}`}>
            {saveMsg.text}
          </p>
        )}

        <Button type="submit" disabled={saving} className="flex items-center gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Guardando..." : "Guardar configuración"}
        </Button>
      </form>

      {/* Test email */}
      <div className="bg-white border rounded-lg p-6 mt-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-700 border-b pb-2">Enviar email de prueba</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1">
            <Label>Destinatario</Label>
            <Input
              type="email"
              placeholder="tu@email.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={testing || !testTo}
            className="flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {testing ? "Enviando..." : "Enviar prueba"}
          </Button>
        </div>
        {testMsg && (
          <p className={`text-sm ${testMsg.ok ? "text-green-600" : "text-destructive"}`}>
            {testMsg.text}
          </p>
        )}
      </div>

      {/* Notification settings */}
      <div className="bg-white border rounded-lg p-6 mt-6 space-y-4">
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
    </div>
  );
}
