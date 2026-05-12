"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Save, Send, Loader2 } from "lucide-react";

interface EmailConfigForm {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

interface EmailConfigRead extends Omit<EmailConfigForm, "smtp_password"> {
  has_password: boolean;
}

const EMPTY_FORM: EmailConfigForm = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  from_email: "",
  from_name: "Fichajes",
  use_tls: true,
};

export default function SuperadminSettingsPage() {
  const [form, setForm] = useState<EmailConfigForm>(EMPTY_FORM);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api
      .get<EmailConfigRead>("/settings/superadmin/email-config")
      .then((r) => {
        setForm({ ...r.data, smtp_password: "" });
        setHasPassword(r.data.has_password);
      })
      .catch(() => setFeedback({ ok: false, text: "Error al cargar la configuración SMTP" }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        smtp_user: form.smtp_user,
        from_email: form.from_email,
        from_name: form.from_name,
        use_tls: form.use_tls,
      };
      if (form.smtp_password) payload.smtp_password = form.smtp_password;
      const r = await api.put<EmailConfigRead>("/settings/superadmin/email-config", payload);
      setForm({ ...r.data, smtp_password: "" });
      setHasPassword(r.data.has_password);
      setFeedback({ ok: true, text: "Configuración SMTP global guardada." });
    } catch (err: any) {
      setFeedback({ ok: false, text: err.response?.data?.detail || "Error al guardar" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testTo) return;
    setTesting(true);
    setFeedback(null);
    try {
      await api.post("/settings/superadmin/email-config/test", { to: testTo });
      setFeedback({ ok: true, text: `Email de prueba enviado a ${testTo}` });
    } catch (err: any) {
      setFeedback({ ok: false, text: err.response?.data?.detail || "Error al enviar el email de prueba" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuración General</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4" />
            SMTP global de Klyp (fallback)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Servidor SMTP usado cuando una empresa no tiene su propia configuración. Klyp envía
            desde aquí los emails de bienvenida y de reset de contraseña.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Servidor SMTP</Label>
                <Input
                  required
                  placeholder="smtp.gmail.com"
                  value={form.smtp_host}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Puerto</Label>
                <Input
                  required
                  type="number"
                  min={1}
                  max={65535}
                  value={form.smtp_port}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_port: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Usuario SMTP</Label>
                <Input
                  placeholder="usuario@gmail.com"
                  value={form.smtp_user}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_user: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{hasPassword ? "Contraseña (dejar vacío para mantener la actual)" : "Contraseña"}</Label>
                <Input
                  type="password"
                  placeholder={hasPassword ? "••••••••" : "Contraseña / App Password"}
                  value={form.smtp_password}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email remitente</Label>
                <Input
                  required
                  type="email"
                  placeholder="no-reply@klyp.es"
                  value={form.from_email}
                  onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre remitente</Label>
                <Input
                  value={form.from_name}
                  onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.use_tls}
                onChange={(e) => setForm((f) => ({ ...f, use_tls: e.target.checked }))}
                className="rounded"
              />
              Usar STARTTLS (puerto 587). Desmarcar para SSL directo (puerto 465).
            </label>

            {feedback && (
              <p
                className={`text-sm rounded px-3 py-2 ${
                  feedback.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                {feedback.text}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t pt-4 space-y-2">
            <Label className="text-sm font-medium">Enviar email de prueba</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="destinatario@example.com"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" disabled={testing || !testTo} onClick={handleTest} className="gap-2">
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Guarda primero la configuración. La prueba usa los datos actualmente almacenados.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
