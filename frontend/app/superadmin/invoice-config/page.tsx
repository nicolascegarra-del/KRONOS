"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Save, Upload, Eye, X } from "lucide-react";

interface InvoiceConfigData {
  issuer_name: string;
  issuer_nif: string;
  issuer_address: string;
  issuer_city: string;
  issuer_postal_code: string;
  issuer_phone: string;
  issuer_email: string;
  logo_base64: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
  notes: string;
  html_template: string;
}

const DEFAULT_FORM: InvoiceConfigData = {
  issuer_name: "",
  issuer_nif: "",
  issuer_address: "",
  issuer_city: "",
  issuer_postal_code: "",
  issuer_phone: "",
  issuer_email: "",
  logo_base64: null,
  invoice_prefix: "FAC",
  next_invoice_number: 1,
  notes: "Gracias por confiar en KRONOS.",
  html_template: "",
};

export default function InvoiceConfigPage() {
  const [form, setForm] = useState<InvoiceConfigData>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    api.get<InvoiceConfigData>("/invoice-config")
      .then((r) => setForm(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logo_base64: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImageFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadImageFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await api.put("/invoice-config", form);
      setSavedMsg("Configuración guardada correctamente.");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const html = form.html_template
      .replace("{{LOGO}}", form.logo_base64 ? `<img src="${form.logo_base64}" alt="Logo" />` : `<strong>${form.issuer_name}</strong>`)
      .replace("{{INVOICE_NUMBER}}", `${form.invoice_prefix}-0001`)
      .replace("{{DATE}}", new Date().toISOString().slice(0, 10))
      .replace("{{DUE_DATE}}", new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10))
      .replace("{{ISSUER_NAME}}", form.issuer_name || "Mi Empresa SL")
      .replace("{{ISSUER_NIF}}", form.issuer_nif || "B00000000")
      .replace("{{ISSUER_ADDRESS}}", form.issuer_address || "Calle Ejemplo 1")
      .replace("{{ISSUER_CITY}}", `${form.issuer_postal_code} ${form.issuer_city}`.trim() || "Ciudad")
      .replace("{{ISSUER_EMAIL}}", form.issuer_email || "info@miempresa.com")
      .replace("{{CLIENT_NAME}}", "Empresa Cliente SL")
      .replace("{{CLIENT_NIF}}", "A12345678")
      .replace("{{CLIENT_ADDRESS}}", "Calle Cliente 10")
      .replace("{{CLIENT_CITY}}", "28001 Madrid")
      .replace("{{CLIENT_EMAIL}}", "cliente@empresa.com")
      .replace("{{PLAN}}", "Mensual")
      .replace(/\{\{PRICE\}\}/g, "49.00")
      .replace(/\{\{DISCOUNT\}\}/g, "10")
      .replace(/\{\{SUBTOTAL\}\}/g, "44.10")
      .replace(/\{\{VAT\}\}/g, "9.26")
      .replace(/\{\{TOTAL\}\}/g, "53.36")
      .replace("{{NOTES}}", form.notes || "");
    win.document.write(html);
    win.document.close();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando...</p>;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Configuración de facturas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Datos del emisor, logo y plantilla HTML para la generación de facturas.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Issuer data */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="font-semibold text-sm">Datos del emisor (tu empresa)</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label>Nombre de la empresa</Label>
                <Input value={form.issuer_name} onChange={(e) => setForm((f) => ({ ...f, issuer_name: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>NIF / CIF</Label>
                <Input value={form.issuer_nif} onChange={(e) => setForm((f) => ({ ...f, issuer_nif: e.target.value }))} placeholder="B12345678" />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={form.issuer_phone} onChange={(e) => setForm((f) => ({ ...f, issuer_phone: e.target.value }))} placeholder="+34 900 000 000" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Dirección</Label>
                <Input value={form.issuer_address} onChange={(e) => setForm((f) => ({ ...f, issuer_address: e.target.value }))} placeholder="Calle Mayor 1, 2º" />
              </div>
              <div className="space-y-1">
                <Label>Ciudad</Label>
                <Input value={form.issuer_city} onChange={(e) => setForm((f) => ({ ...f, issuer_city: e.target.value }))} placeholder="Madrid" />
              </div>
              <div className="space-y-1">
                <Label>Código postal</Label>
                <Input value={form.issuer_postal_code} onChange={(e) => setForm((f) => ({ ...f, issuer_postal_code: e.target.value }))} placeholder="28001" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Email</Label>
                <Input type="email" value={form.issuer_email} onChange={(e) => setForm((f) => ({ ...f, issuer_email: e.target.value }))} placeholder="facturacion@tuempresa.com" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logo */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="font-semibold text-sm">Logo de empresa</h2>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className={`relative cursor-pointer border-2 border-dashed rounded-xl transition-colors flex flex-col items-center justify-center gap-3 p-8
                ${dragOver ? "border-primary bg-primary/5" : "border-slate-200 hover:border-primary/50 hover:bg-slate-50"}`}
            >
              {form.logo_base64 ? (
                <>
                  <img
                    src={form.logo_base64}
                    alt="Logo"
                    className="max-h-24 max-w-[240px] object-contain"
                  />
                  <p className="text-xs text-muted-foreground">Haz clic o arrastra para cambiar</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setForm((f) => ({ ...f, logo_base64: null })); }}
                    className="absolute top-2 right-2 rounded-full bg-white border shadow-sm p-1 hover:bg-red-50 hover:text-destructive transition-colors"
                    title="Quitar logo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">Arrastra tu logo aquí</p>
                    <p className="text-xs text-muted-foreground mt-0.5">o haz clic para seleccionar</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, SVG — recomendado fondo transparente</p>
                  </div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />

            {/* Inline invoice header preview */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Vista previa del cabecero de la factura</p>
              <div className="border rounded-lg p-4 bg-white flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {form.logo_base64 ? (
                    <img src={form.logo_base64} alt="Logo" className="h-16 w-auto max-w-[180px] object-contain shrink-0" />
                  ) : (
                    <div className="h-16 w-32 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-400 text-center px-2">
                      Tu logo aparecerá aquí
                    </div>
                  )}
                  <div className="text-xs text-slate-500 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{form.issuer_name || "Nombre de tu empresa"}</p>
                    {form.issuer_nif && <p>NIF: {form.issuer_nif}</p>}
                    {form.issuer_address && <p className="truncate">{form.issuer_address}</p>}
                    {(form.issuer_city || form.issuer_postal_code) && (
                      <p>{`${form.issuer_postal_code} ${form.issuer_city}`.trim()}</p>
                    )}
                    {form.issuer_email && <p>{form.issuer_email}</p>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-slate-900">FACTURA</p>
                  <p className="text-xs text-slate-500">{form.invoice_prefix}-{String(form.next_invoice_number).padStart(4, "0")}</p>
                  <p className="text-xs text-slate-500">{new Date().toLocaleDateString("es-ES")}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Numbering */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h2 className="font-semibold text-sm">Numeración</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Prefijo</Label>
                <Input value={form.invoice_prefix} onChange={(e) => setForm((f) => ({ ...f, invoice_prefix: e.target.value }))} placeholder="FAC" />
              </div>
              <div className="space-y-1">
                <Label>Próximo número</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.next_invoice_number}
                  onChange={(e) => setForm((f) => ({ ...f, next_invoice_number: Number(e.target.value) }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Próxima factura: <strong>{form.invoice_prefix}-{String(form.next_invoice_number).padStart(4, "0")}</strong>
            </p>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <h2 className="font-semibold text-sm">Notas al pie</h2>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Gracias por confiar en nosotros..."
            />
          </CardContent>
        </Card>

        {/* HTML Template */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Plantilla HTML</h2>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handlePreview}>
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  Vista previa
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTemplate((v) => !v)}
                >
                  {showTemplate ? "Ocultar" : "Editar código"}
                </Button>
              </div>
            </div>

            <div className="text-xs text-muted-foreground space-y-1 bg-slate-50 rounded p-3 border">
              <p className="font-medium text-slate-700 mb-1">Variables disponibles:</p>
              <div className="grid grid-cols-2 gap-x-4">
                {[
                  "{{LOGO}}", "{{INVOICE_NUMBER}}", "{{DATE}}", "{{DUE_DATE}}",
                  "{{ISSUER_NAME}}", "{{ISSUER_NIF}}", "{{ISSUER_ADDRESS}}", "{{ISSUER_CITY}}", "{{ISSUER_EMAIL}}",
                  "{{CLIENT_NAME}}", "{{CLIENT_NIF}}", "{{CLIENT_ADDRESS}}", "{{CLIENT_CITY}}", "{{CLIENT_EMAIL}}",
                  "{{PLAN}}", "{{PRICE}}", "{{DISCOUNT}}", "{{SUBTOTAL}}", "{{VAT}}", "{{TOTAL}}", "{{NOTES}}",
                ].map((v) => (
                  <code key={v} className="text-slate-600">{v}</code>
                ))}
              </div>
            </div>

            {showTemplate && (
              <textarea
                className="w-full h-96 font-mono text-xs border rounded p-3 bg-slate-950 text-green-300 resize-y"
                value={form.html_template}
                onChange={(e) => setForm((f) => ({ ...f, html_template: e.target.value }))}
                spellCheck={false}
              />
            )}
          </CardContent>
        </Card>

        {savedMsg && (
          <p className="text-sm text-green-700 bg-green-50 px-4 py-2 rounded border border-green-200">{savedMsg}</p>
        )}
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-4 py-2 rounded">{error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </form>
    </div>
  );
}
