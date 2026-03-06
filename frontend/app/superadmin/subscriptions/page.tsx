"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Building2, FileText, Pencil, CheckCircle, Clock, AlertCircle } from "lucide-react";

interface Company {
  id: string;
  name: string;
  max_workers: number;
  worker_count: number;
  nif?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  billing_email?: string;
  subscription_plan?: string;
  subscription_price?: number;
  subscription_discount?: number;
  subscription_start?: string;
  subscription_end?: string;
}

interface InvoiceConfig {
  issuer_name: string;
  issuer_nif: string;
  issuer_address: string;
  issuer_city: string;
  issuer_postal_code: string;
  issuer_phone: string;
  issuer_email: string;
  logo_base64?: string;
  invoice_prefix: string;
  next_invoice_number: number;
  notes?: string;
  html_template: string;
}

const PLAN_LABELS: Record<string, string> = {
  trial: "Prueba",
  monthly: "Mensual",
  annual: "Anual",
};

const PLAN_COLORS: Record<string, string> = {
  trial: "bg-amber-100 text-amber-800",
  monthly: "bg-blue-100 text-blue-800",
  annual: "bg-green-100 text-green-800",
};

function planBadge(plan?: string) {
  if (!plan) return <span className="text-xs text-muted-foreground">Sin plan</span>;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[plan] ?? "bg-slate-100 text-slate-700"}`}>
      {PLAN_LABELS[plan] ?? plan}
    </span>
  );
}

function subscriptionStatus(c: Company) {
  if (!c.subscription_plan) return { icon: <AlertCircle className="w-4 h-4 text-slate-400" />, label: "Sin suscripción" };
  if (!c.subscription_end) return { icon: <CheckCircle className="w-4 h-4 text-green-600" />, label: "Activa" };
  const end = new Date(c.subscription_end);
  const now = new Date();
  const days = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { icon: <AlertCircle className="w-4 h-4 text-red-500" />, label: "Vencida" };
  if (days <= 15) return { icon: <Clock className="w-4 h-4 text-amber-500" />, label: `Vence en ${days}d` };
  return { icon: <CheckCircle className="w-4 h-4 text-green-600" />, label: "Activa" };
}

function calcTotals(price: number, discount: number) {
  const subtotal = price * (1 - discount / 100);
  const vat = subtotal * 0.21;
  const total = subtotal + vat;
  return { subtotal, vat, total };
}

function pad2(n: number) { return String(n).padStart(2, "0"); }
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function SubscriptionsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceConfig, setInvoiceConfig] = useState<InvoiceConfig | null>(null);

  // Subscription edit dialog
  const [editTarget, setEditTarget] = useState<Company | null>(null);
  const [subForm, setSubForm] = useState({
    subscription_plan: "",
    subscription_price: 0,
    subscription_discount: 0,
    subscription_start: fmtDate(new Date()),
    subscription_end: "",
  });
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  // Invoice preview dialog
  const [invoiceTarget, setInvoiceTarget] = useState<Company | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Company[]>("/companies"),
      api.get<InvoiceConfig>("/invoice-config"),
    ])
      .then(([c, ic]) => {
        setCompanies(c.data);
        setInvoiceConfig(ic.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (c: Company) => {
    setEditTarget(c);
    setSubForm({
      subscription_plan: c.subscription_plan ?? "",
      subscription_price: c.subscription_price ?? 0,
      subscription_discount: c.subscription_discount ?? 0,
      subscription_start: c.subscription_start ? c.subscription_start.slice(0, 10) : fmtDate(new Date()),
      subscription_end: c.subscription_end ? c.subscription_end.slice(0, 10) : "",
    });
    setSubError(null);
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setSubLoading(true);
    setSubError(null);
    try {
      await api.put(`/companies/${editTarget.id}`, {
        subscription_plan: subForm.subscription_plan || null,
        subscription_price: subForm.subscription_price,
        subscription_discount: subForm.subscription_discount,
        subscription_start: subForm.subscription_start || null,
        subscription_end: subForm.subscription_end || null,
      });
      setEditTarget(null);
      load();
    } catch (err: any) {
      setSubError(err.response?.data?.detail || "Error al guardar");
    } finally {
      setSubLoading(false);
    }
  };

  const buildInvoiceHtml = (c: Company, cfg: InvoiceConfig): string => {
    const price = c.subscription_price ?? 0;
    const discount = c.subscription_discount ?? 0;
    const { subtotal, vat, total } = calcTotals(price, discount);
    const invoiceNumber = `${cfg.invoice_prefix}-${String(cfg.next_invoice_number).padStart(4, "0")}`;
    const today = fmtDate(new Date());
    const dueDate = fmtDate(new Date(Date.now() + 30 * 86400000));

    const logo = cfg.logo_base64
      ? `<img src="${cfg.logo_base64}" alt="Logo" />`
      : `<strong style="font-size:20px">${cfg.issuer_name}</strong>`;

    return cfg.html_template
      .replace("{{LOGO}}", logo)
      .replace("{{INVOICE_NUMBER}}", invoiceNumber)
      .replace("{{DATE}}", today)
      .replace("{{DUE_DATE}}", dueDate)
      .replace("{{ISSUER_NAME}}", cfg.issuer_name)
      .replace("{{ISSUER_NIF}}", cfg.issuer_nif)
      .replace("{{ISSUER_ADDRESS}}", cfg.issuer_address)
      .replace("{{ISSUER_CITY}}", `${cfg.issuer_postal_code ?? ""} ${cfg.issuer_city}`.trim())
      .replace("{{ISSUER_EMAIL}}", cfg.issuer_email)
      .replace("{{CLIENT_NAME}}", c.name)
      .replace("{{CLIENT_NIF}}", c.nif ?? "—")
      .replace("{{CLIENT_ADDRESS}}", c.address ?? "—")
      .replace("{{CLIENT_CITY}}", `${c.postal_code ?? ""} ${c.city ?? ""}`.trim() || "—")
      .replace("{{CLIENT_EMAIL}}", c.billing_email ?? "—")
      .replace("{{PLAN}}", PLAN_LABELS[c.subscription_plan ?? ""] ?? "—")
      .replace(/\{\{PRICE\}\}/g, price.toFixed(2))
      .replace(/\{\{DISCOUNT\}\}/g, discount.toFixed(0))
      .replace(/\{\{SUBTOTAL\}\}/g, subtotal.toFixed(2))
      .replace(/\{\{VAT\}\}/g, vat.toFixed(2))
      .replace(/\{\{TOTAL\}\}/g, total.toFixed(2))
      .replace("{{NOTES}}", cfg.notes ?? "");
  };

  const handleGenerateInvoice = async (c: Company) => {
    if (!invoiceConfig) return;
    const html = buildInvoiceHtml(c, invoiceConfig);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
    // Increment invoice number
    await api.post("/invoice-config/increment-number").catch(() => {});
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Suscripciones</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona los planes de suscripción de cada empresa y genera facturas.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay empresas registradas.</p>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => {
            const status = subscriptionStatus(c);
            const price = c.subscription_price ?? 0;
            const discount = c.subscription_discount ?? 0;
            const { total } = calcTotals(price, discount);
            return (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <Building2 className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{c.name}</p>
                          {planBadge(c.subscription_plan)}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {status.icon} {status.label}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          {c.subscription_plan ? (
                            <>
                              <p>
                                Precio: <strong>{price.toFixed(2)} €</strong>
                                {discount > 0 && <span className="ml-1 text-green-600">(-{discount}%)</span>}
                                {" · "}Total c/IVA: <strong>{total.toFixed(2)} €</strong>
                              </p>
                              {c.subscription_start && (
                                <p>Inicio: {new Date(c.subscription_start).toLocaleDateString("es-ES")}</p>
                              )}
                              {c.subscription_end && (
                                <p>Fin: {new Date(c.subscription_end).toLocaleDateString("es-ES")}</p>
                              )}
                            </>
                          ) : (
                            <p className="italic">Sin plan asignado</p>
                          )}
                          {c.nif && <p>NIF: {c.nif}</p>}
                          {c.billing_email && <p>Email: {c.billing_email}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Plan
                      </Button>
                      <Button
                        size="sm"
                        disabled={!c.subscription_plan || !invoiceConfig}
                        onClick={() => handleGenerateInvoice(c)}
                        title={!c.subscription_plan ? "Asigna un plan primero" : "Generar factura PDF"}
                      >
                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                        Factura
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Subscription edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suscripción — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveSub} className="space-y-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={subForm.subscription_plan}
                onChange={(e) => setSubForm((f) => ({ ...f, subscription_plan: e.target.value }))}
              >
                <option value="">Sin plan</option>
                <option value="trial">Prueba</option>
                <option value="monthly">Mensual</option>
                <option value="annual">Anual</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Precio (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={subForm.subscription_price}
                  onChange={(e) => setSubForm((f) => ({ ...f, subscription_price: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Descuento (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={subForm.subscription_discount}
                  onChange={(e) => setSubForm((f) => ({ ...f, subscription_discount: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha inicio</Label>
                <Input
                  type="date"
                  value={subForm.subscription_start}
                  onChange={(e) => setSubForm((f) => ({ ...f, subscription_start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha fin</Label>
                <Input
                  type="date"
                  value={subForm.subscription_end}
                  onChange={(e) => setSubForm((f) => ({ ...f, subscription_end: e.target.value }))}
                />
              </div>
            </div>
            {subForm.subscription_price > 0 && (
              <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                {(() => {
                  const { subtotal, vat, total } = calcTotals(subForm.subscription_price, subForm.subscription_discount);
                  return (
                    <>
                      <p className="flex justify-between"><span>Base imponible</span><span>{subtotal.toFixed(2)} €</span></p>
                      <p className="flex justify-between"><span>IVA (21%)</span><span>{vat.toFixed(2)} €</span></p>
                      <p className="flex justify-between font-semibold"><span>Total</span><span>{total.toFixed(2)} €</span></p>
                    </>
                  );
                })()}
              </div>
            )}
            {subError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{subError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
              <Button type="submit" disabled={subLoading}>
                {subLoading ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
