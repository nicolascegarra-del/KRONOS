"use client";

import React, { useEffect, useRef, useState } from "react";
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
import { Building2, Pencil, Trash2, Plus, MapPin, MapPinOff, FileX, ImagePlus, Send, Save } from "lucide-react";

interface CompanyRead {
  id: string;
  name: string;
  max_workers: number;
  geo_enabled: boolean;
  schedule_enabled: boolean;
  vacation_enabled: boolean;
  worker_count: number;
  fichaje_count: number;
  is_trial: boolean;
  max_fichajes?: number | null;
  docs_enabled: boolean;
  max_storage_mb: number;
  tablet_enabled: boolean;
  created_at: string;
  logo_url?: string;
  // Billing
  nif?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  phone?: string;
  billing_email?: string;
  // Subscription
  subscription_plan?: string;
  subscription_price?: number;
  subscription_discount?: number;
  subscription_start?: string;
  subscription_end?: string;
  // Plan tier
  plan_tier?: string | null;
  max_documents?: number | null;
  max_vacation_requests?: number | null;
}

interface CreateForm {
  name: string;
  max_workers: number;
  admin_email: string;
  admin_full_name: string;
  admin_password: string;
}

// ── Plan definitions (mirror of backend PLAN_MODULES) ────────────────────────
const PLAN_MODULES: Record<string, { geo_enabled: boolean; schedule_enabled: boolean; vacation_enabled: boolean; docs_enabled: boolean; tablet_enabled: boolean }> = {
  basico: { geo_enabled: true, schedule_enabled: false, vacation_enabled: false, docs_enabled: false, tablet_enabled: false },
  pro:    { geo_enabled: true, schedule_enabled: true,  vacation_enabled: false, docs_enabled: false, tablet_enabled: false },
  hr:     { geo_enabled: true, schedule_enabled: true,  vacation_enabled: true,  docs_enabled: false, tablet_enabled: false },
  total:  { geo_enabled: true, schedule_enabled: true,  vacation_enabled: true,  docs_enabled: true,  tablet_enabled: true  },
}

const PLAN_LABELS: Record<string, string> = {
  trial:        "Trial (gratuito)",
  basico:       "Básico — €15/mes",
  pro:          "Pro — €25/mes",
  hr:           "HR — €35/mes",
  total:        "Total — €45/mes",
  personalizado:"Personalizado",
}

const PLAN_COLORS: Record<string, string> = {
  trial:        "bg-amber-100 text-amber-700",
  basico:       "bg-slate-100 text-slate-600",
  pro:          "bg-green-100 text-green-700",
  hr:           "bg-blue-100 text-blue-700",
  total:        "bg-purple-100 text-purple-700",
  personalizado:"bg-orange-100 text-orange-700",
}

function inferPlan(geo: boolean, schedule: boolean, vacation: boolean, docs: boolean, tablet: boolean): string {
  for (const [plan, mods] of Object.entries(PLAN_MODULES)) {
    if (mods.geo_enabled === geo && mods.schedule_enabled === schedule &&
        mods.vacation_enabled === vacation && mods.docs_enabled === docs &&
        mods.tablet_enabled === tablet) return plan
  }
  return "personalizado"
}

interface EditForm {
  name: string;
  max_workers: number;
  plan_tier: string;
  geo_enabled: boolean;
  schedule_enabled: boolean;
  vacation_enabled: boolean;
  is_trial: boolean;
  max_fichajes: string; // string to allow empty = unlimited
  docs_enabled: boolean;
  max_storage_mb: string;
  tablet_enabled: boolean;
  // Billing
  nif: string;
  address: string;
  city: string;
  postal_code: string;
  phone: string;
  billing_email: string;
}

interface EmailConfigForm {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  use_tls: boolean;
  has_password: boolean;
}

const emptyCreate: CreateForm = {
  name: "",
  max_workers: 10,
  admin_email: "",
  admin_full_name: "",
  admin_password: "",
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRead[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<CompanyRead | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", max_workers: 10, plan_tier: "", geo_enabled: true, schedule_enabled: true, vacation_enabled: true, is_trial: false, max_fichajes: "", docs_enabled: false, max_storage_mb: "100", tablet_enabled: false, nif: "", address: "", city: "", postal_code: "", phone: "", billing_email: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Email config (inside edit dialog)
  const [emailForm, setEmailForm] = useState<EmailConfigForm>({
    smtp_host: "", smtp_port: 587, smtp_user: "", smtp_password: "",
    from_email: "", from_name: "Fichajes", use_tls: true, has_password: false,
  });
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailTestTo, setEmailTestTo] = useState("");
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailTestMsg, setEmailTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Delete company confirm
  const [deleteTarget, setDeleteTarget] = useState<CompanyRead | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Delete fichajes for company
  const [fichajesToDelete, setFichajesToDelete] = useState<CompanyRead | null>(null);
  const [fichajesLoading, setFichajesLoading] = useState(false);
  const [fichajesMsg, setFichajesMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Logo upload
  const [logoUploading, setLogoUploading] = useState<string | null>(null); // company id being uploaded
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoTargetId, setLogoTargetId] = useState<string | null>(null);

  const handleLogoClick = (companyId: string) => {
    setLogoTargetId(companyId);
    logoInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !logoTargetId) return;
    e.target.value = "";
    setLogoUploading(logoTargetId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/companies/${logoTargetId}/logo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchCompanies();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Error al subir el logo");
    } finally {
      setLogoUploading(null);
      setLogoTargetId(null);
    }
  };

  const handleLogoDelete = async (companyId: string) => {
    if (!confirm("¿Eliminar el logo de esta empresa?")) return;
    try {
      await api.delete(`/companies/${companyId}/logo`);
      fetchCompanies();
    } catch {
      alert("Error al eliminar el logo");
    }
  };

  const fetchCompanies = () => {
    setLoading(true);
    api
      .get<CompanyRead[]>("/companies")
      .then((r) => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);
    try {
      await api.post("/companies", createForm);
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      fetchCompanies();
    } catch (err: any) {
      setCreateError(
        err.response?.data?.detail || "Error al crear la empresa"
      );
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (c: CompanyRead) => {
    setEditTarget(c);
    setEditForm({
      name: c.name,
      max_workers: c.max_workers,
      plan_tier: c.plan_tier ?? inferPlan(c.geo_enabled, c.schedule_enabled, c.vacation_enabled, c.docs_enabled ?? false, c.tablet_enabled ?? false),
      geo_enabled: c.geo_enabled,
      schedule_enabled: c.schedule_enabled,
      vacation_enabled: c.vacation_enabled,
      is_trial: c.is_trial ?? false,
      max_fichajes: c.max_fichajes != null ? String(c.max_fichajes) : "",
      docs_enabled: c.docs_enabled ?? false,
      max_storage_mb: String(c.max_storage_mb ?? 100),
      tablet_enabled: c.tablet_enabled ?? false,
      nif: c.nif ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      postal_code: c.postal_code ?? "",
      phone: c.phone ?? "",
      billing_email: c.billing_email ?? "",
    });
    setEditError(null);
    setEmailMsg(null);
    setEmailTestMsg(null);
    setEmailTestTo("");
    // Load email config for this company
    api.get<EmailConfigForm>(`/companies/${c.id}/email-config`).then((res) => {
      setEmailForm({ ...res.data, smtp_password: "" });
    }).catch(() => {});
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);
    setEditLoading(true);
    try {
      await api.put(`/companies/${editTarget.id}`, {
        ...editForm,
        plan_tier: editForm.plan_tier || null,
        max_fichajes: editForm.max_fichajes === "" ? 0 : parseInt(editForm.max_fichajes, 10),
        max_storage_mb: parseInt(editForm.max_storage_mb, 10) || 100,
      });
      setEditTarget(null);
      fetchCompanies();
    } catch (err: any) {
      setEditError(
        err.response?.data?.detail || "Error al actualizar la empresa"
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleSaveEmail = async () => {
    if (!editTarget) return;
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      const body: Record<string, string | number | boolean> = {
        smtp_host: emailForm.smtp_host,
        smtp_port: emailForm.smtp_port,
        smtp_user: emailForm.smtp_user,
        from_email: emailForm.from_email,
        from_name: emailForm.from_name,
        use_tls: emailForm.use_tls,
      };
      if (emailForm.smtp_password) body.smtp_password = emailForm.smtp_password;
      const res = await api.put<EmailConfigForm>(`/companies/${editTarget.id}/email-config`, body);
      setEmailForm({ ...res.data, smtp_password: "" });
      setEmailMsg({ ok: true, text: "Configuración SMTP guardada." });
    } catch (err: any) {
      setEmailMsg({ ok: false, text: err.response?.data?.detail || "Error al guardar" });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!editTarget || !emailTestTo) return;
    setEmailTesting(true);
    setEmailTestMsg(null);
    try {
      const res = await api.post<{ message: string }>(`/companies/${editTarget.id}/email-config/test`, { to: emailTestTo });
      setEmailTestMsg({ ok: true, text: res.data.message });
    } catch (err: any) {
      setEmailTestMsg({ ok: false, text: err.response?.data?.detail || "Error al enviar el test" });
    } finally {
      setEmailTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await api.delete(`/companies/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchCompanies();
    } catch (err: any) {
      setDeleteError(
        err.response?.data?.detail || "Error al eliminar la empresa"
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteFichajes = async () => {
    if (!fichajesToDelete) return;
    setFichajesLoading(true);
    setFichajesMsg(null);
    try {
      const res = await api.delete<{ deleted: number }>(
        `/superadmin/users/fichajes?company_id=${fichajesToDelete.id}`
      );
      setFichajesMsg({ ok: true, text: `${res.data.deleted} fichaje(s) de ${fichajesToDelete.name} eliminados.` });
      setFichajesToDelete(null);
    } catch (err: any) {
      setFichajesMsg({ ok: false, text: err.response?.data?.detail || "Error al borrar fichajes" });
      setFichajesToDelete(null);
    } finally {
      setFichajesLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Empresas</h1>
        <Button onClick={() => { setCreateForm(emptyCreate); setCreateError(null); setCreateOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva empresa
        </Button>
      </div>

      {fichajesMsg && (
        <p className={`text-sm mb-4 px-3 py-2 rounded ${fichajesMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-destructive"}`}>
          {fichajesMsg.text}
        </p>
      )}

      {/* Hidden file input for logo upload */}
      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoChange} />

      {loading ? (
        <p className="text-muted-foreground text-sm">Cargando...</p>
      ) : companies.length === 0 ? (
        <p className="text-muted-foreground text-sm">No hay empresas registradas.</p>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Logo preview or fallback icon */}
                    <div className="shrink-0 w-12 h-12 rounded-lg border bg-slate-50 flex items-center justify-center overflow-hidden">
                      {c.logo_url
                        ? <img src={c.logo_url} alt={c.name} className="w-full h-full object-contain p-1" />
                        : <Building2 className="w-5 h-5 text-slate-400" />
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{c.name}</p>
                        {(() => {
                          const tier = c.plan_tier ?? inferPlan(c.geo_enabled, c.schedule_enabled, c.vacation_enabled, c.docs_enabled ?? false, c.tablet_enabled ?? false)
                          return (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${PLAN_COLORS[tier] ?? "bg-slate-100 text-slate-600"}`}>
                              {tier.toUpperCase()}
                            </span>
                          )
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.worker_count} / {c.max_workers} trabajadores ·{" "}
                        Alta: {new Date(c.created_at).toLocaleDateString("es-ES")}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-xs ${c.geo_enabled ? "text-green-600" : "text-slate-400"}`}>
                          {c.geo_enabled ? <MapPin className="w-3 h-3" /> : <MapPinOff className="w-3 h-3" />}
                          Geo
                        </span>
                        <span className={`text-xs ${c.schedule_enabled ? "text-green-600" : "text-slate-400"}`}>
                          📅 Cuadrantes {c.schedule_enabled ? "ON" : "OFF"}
                        </span>
                        <span className={`text-xs ${c.vacation_enabled ? "text-green-600" : "text-slate-400"}`}>
                          🏖 Vacaciones {c.vacation_enabled ? "ON" : "OFF"}
                        </span>
                        <span className={`text-xs ${c.docs_enabled ? "text-green-600" : "text-slate-400"}`}>
                          📄 Documentos {c.docs_enabled ? "ON" : "OFF"}
                        </span>
                        <span className={`text-xs ${c.tablet_enabled ? "text-green-600" : "text-slate-400"}`}>
                          📲 Tablet {c.tablet_enabled ? "ON" : "OFF"}
                        </span>
                      </div>
                      {/* Fichaje quota bar */}
                      {c.max_fichajes != null && (
                        <div className="mt-2 max-w-xs">
                          <div className="flex justify-between text-xs text-muted-foreground mb-0.5">
                            <span>Fichajes usados</span>
                            <span className={c.fichaje_count >= c.max_fichajes ? "text-red-600 font-semibold" : ""}>
                              {c.fichaje_count} / {c.max_fichajes}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                c.fichaje_count >= c.max_fichajes
                                  ? "bg-red-500"
                                  : c.fichaje_count >= c.max_fichajes * 0.8
                                  ? "bg-amber-400"
                                  : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min(100, (c.fichaje_count / c.max_fichajes) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleLogoClick(c.id)}
                      disabled={logoUploading === c.id}
                      title={c.logo_url ? "Cambiar logo" : "Subir logo"}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      {logoUploading === c.id
                        ? <span className="text-xs">...</span>
                        : <ImagePlus className="w-4 h-4" />
                      }
                    </Button>
                    {c.logo_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleLogoDelete(c.id)}
                        title="Eliminar logo"
                        className="text-slate-400 hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Editar empresa">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      onClick={() => { setFichajesMsg(null); setFichajesToDelete(c); }}
                      disabled={fichajesLoading}
                      title="Borrar todos los fichajes de esta empresa"
                    >
                      <FileX className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => { setDeleteError(null); setDeleteTarget(c); }}
                      title="Eliminar empresa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la empresa</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Máximo de trabajadores</Label>
              <Input
                type="number"
                min={1}
                value={createForm.max_workers}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, max_workers: Number(e.target.value) }))
                }
                required
              />
            </div>
            <hr />
            <p className="text-sm font-medium text-muted-foreground">Administrador de la empresa</p>
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input
                value={createForm.admin_full_name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, admin_full_name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.admin_email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, admin_email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={createForm.admin_password}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, admin_password: e.target.value }))
                }
                required
              />
            </div>
            {createError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {createError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? "Creando..." : "Crear empresa"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Máximo de trabajadores</Label>
              <Input
                type="number"
                min={1}
                value={editForm.max_workers}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, max_workers: Number(e.target.value) }))
                }
                required
              />
            </div>
            {/* Plan / quota */}
            <div className="space-y-3 rounded-lg border p-3 bg-slate-50">
              <p className="text-sm font-semibold">Plan y cuota de fichajes</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Free Trial</p>
                  <p className="text-xs text-muted-foreground">Empresa en periodo de prueba gratuito</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm((f) => ({ ...f, is_trial: !f.is_trial }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.is_trial ? "bg-amber-400" : "bg-slate-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.is_trial ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              <div className="space-y-1">
                <Label>Límite de fichajes</Label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.max_fichajes}
                  onChange={(e) => setEditForm((f) => ({ ...f, max_fichajes: e.target.value }))}
                  placeholder="Vacío = sin límite"
                />
                <p className="text-xs text-muted-foreground">
                  Deja vacío para ilimitado · Pon 0 para eliminar el límite actual ·{" "}
                  {editTarget?.fichaje_count ?? 0} fichajes usados actualmente
                </p>
              </div>
            </div>

            {/* Plan selector */}
            <div className="space-y-3 rounded-lg border p-3 bg-slate-50">
              <p className="text-sm font-semibold">Plan de suscripción</p>
              <select
                value={editForm.plan_tier}
                onChange={(e) => {
                  const tier = e.target.value
                  if (tier === "trial") {
                    setEditForm((f) => ({ ...f, plan_tier: "trial", is_trial: true, max_workers: 2, max_fichajes: "60", geo_enabled: true, schedule_enabled: true, vacation_enabled: true, docs_enabled: true, tablet_enabled: true }))
                  } else if (PLAN_MODULES[tier]) {
                    setEditForm((f) => ({ ...f, plan_tier: tier, is_trial: false, ...PLAN_MODULES[tier] }))
                  } else {
                    setEditForm((f) => ({ ...f, plan_tier: tier }))
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— Sin asignar —</option>
                {Object.entries(PLAN_LABELS).map(([tier, label]) => (
                  <option key={tier} value={tier}>{label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Cambiar el plan actualiza los módulos automáticamente. También puedes cambiar los módulos manualmente.
              </p>
            </div>

            {/* Module toggles */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Módulos activos</p>
              {[
                { key: "geo_enabled" as const, label: "Geolocalización", desc: "Control de presencia por GPS en fichajes." },
                { key: "schedule_enabled" as const, label: "Cuadrante de turnos", desc: "El admin gestiona el horario anual de cada trabajador." },
                { key: "vacation_enabled" as const, label: "Gestión de vacaciones", desc: "Los trabajadores pueden solicitar vacaciones y permisos." },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm((f) => {
                      const next = { ...f, [key]: !f[key] }
                      return { ...next, plan_tier: inferPlan(next.geo_enabled, next.schedule_enabled, next.vacation_enabled, next.docs_enabled, next.tablet_enabled) }
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm[key] ? "bg-primary" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm[key] ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              ))}
              {/* Document module */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Módulo de documentos</p>
                    <p className="text-xs text-muted-foreground">El admin puede subir nóminas y contratos para los trabajadores.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm((f) => {
                      const next = { ...f, docs_enabled: !f.docs_enabled }
                      return { ...next, plan_tier: inferPlan(next.geo_enabled, next.schedule_enabled, next.vacation_enabled, next.docs_enabled, next.tablet_enabled) }
                    })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.docs_enabled ? "bg-primary" : "bg-slate-200"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.docs_enabled ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
                {editForm.docs_enabled && (
                  <div className="space-y-1">
                    <Label className="text-xs">Cuota de almacenamiento (MB)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={50}
                        value={editForm.max_storage_mb}
                        onChange={(e) => setEditForm((f) => ({ ...f, max_storage_mb: e.target.value }))}
                        className="h-8 w-32"
                      />
                      <div className="flex gap-1">
                        {[100, 1000, 5000].map((mb) => (
                          <button
                            key={mb}
                            type="button"
                            onClick={() => setEditForm((f) => ({ ...f, max_storage_mb: String(mb) }))}
                            className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-600"
                          >
                            {mb >= 1000 ? `${mb / 1000}GB` : `${mb}MB`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* Tablet kiosk module */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Tablet de fichaje</p>
                  <p className="text-xs text-muted-foreground">Pantalla de kiosco donde los trabajadores fichan con un código numérico.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm((f) => {
                    const next = { ...f, tablet_enabled: !f.tablet_enabled }
                    return { ...next, plan_tier: inferPlan(next.geo_enabled, next.schedule_enabled, next.vacation_enabled, next.docs_enabled, next.tablet_enabled) }
                  })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.tablet_enabled ? "bg-primary" : "bg-slate-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editForm.tablet_enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
            <hr />
            <p className="text-sm font-medium text-muted-foreground">Datos de facturación</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>NIF / CIF</Label>
                <Input
                  value={editForm.nif}
                  onChange={(e) => setEditForm((f) => ({ ...f, nif: e.target.value }))}
                  placeholder="B12345678"
                />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+34 900 000 000"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Dirección fiscal</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Calle Mayor 1, 1º"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ciudad</Label>
                <Input
                  value={editForm.city}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Madrid"
                />
              </div>
              <div className="space-y-1">
                <Label>Código postal</Label>
                <Input
                  value={editForm.postal_code}
                  onChange={(e) => setEditForm((f) => ({ ...f, postal_code: e.target.value }))}
                  placeholder="28001"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email de facturación</Label>
              <Input
                type="email"
                value={editForm.billing_email}
                onChange={(e) => setEditForm((f) => ({ ...f, billing_email: e.target.value }))}
                placeholder="facturas@empresa.com"
              />
            </div>
            {editError && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>

          {/* Email config section */}
          <div className="border-t pt-4 space-y-3 mt-2">
            <p className="text-sm font-semibold text-slate-700">Servidor de correo (SMTP)</p>
            <p className="text-xs text-muted-foreground">
              Configura el servidor SMTP que usará esta empresa para enviar emails de bienvenida, recuperación de contraseña y resúmenes mensuales.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Servidor SMTP</Label>
                <Input
                  placeholder="smtp.gmail.com"
                  value={emailForm.smtp_host}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtp_host: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Puerto</Label>
                <Input
                  type="number"
                  value={emailForm.smtp_port}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtp_port: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Seguridad</Label>
                <select
                  value={emailForm.use_tls ? "tls" : "ssl"}
                  onChange={(e) => setEmailForm((f) => ({ ...f, use_tls: e.target.value === "tls" }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="tls">STARTTLS</option>
                  <option value="ssl">SSL/TLS</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Usuario SMTP</Label>
                <Input
                  type="email"
                  placeholder="tu@gmail.com"
                  value={emailForm.smtp_user}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtp_user: e.target.value }))}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>
                  Contraseña SMTP
                  {emailForm.has_password && (
                    <span className="ml-2 text-xs text-green-600 font-normal">✓ guardada</span>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={emailForm.has_password ? "•••••••• (vacío = no cambiar)" : "Contraseña SMTP"}
                  value={emailForm.smtp_password}
                  onChange={(e) => setEmailForm((f) => ({ ...f, smtp_password: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Nombre remitente</Label>
                <Input
                  value={emailForm.from_name}
                  onChange={(e) => setEmailForm((f) => ({ ...f, from_name: e.target.value }))}
                  placeholder="Fichajes"
                />
              </div>
              <div className="space-y-1">
                <Label>Email remitente (From)</Label>
                <Input
                  type="email"
                  placeholder="info@empresa.com"
                  value={emailForm.from_email}
                  onChange={(e) => setEmailForm((f) => ({ ...f, from_email: e.target.value }))}
                />
              </div>
            </div>
            {emailMsg && (
              <p className={`text-sm ${emailMsg.ok ? "text-green-600" : "text-destructive"}`}>{emailMsg.text}</p>
            )}
            <Button type="button" size="sm" onClick={handleSaveEmail} disabled={emailSaving} className="flex items-center gap-2">
              <Save className="w-3.5 h-3.5" />
              {emailSaving ? "Guardando..." : "Guardar SMTP"}
            </Button>

            {/* Test email */}
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-slate-600">Enviar email de prueba</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Input
                    type="email"
                    placeholder="destinatario@test.com"
                    value={emailTestTo}
                    onChange={(e) => setEmailTestTo(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestEmail}
                  disabled={emailTesting || !emailTestTo}
                  className="flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {emailTesting ? "Enviando..." : "Test"}
                </Button>
              </div>
              {emailTestMsg && (
                <p className={`text-xs ${emailTestMsg.ok ? "text-green-600" : "text-destructive"}`}>{emailTestMsg.text}</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar empresa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres eliminar <strong>{deleteTarget?.name}</strong>? Esta acción no
            se puede deshacer. La empresa debe no tener usuarios asociados.
          </p>
          {deleteError && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
              {deleteError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete fichajes of company confirm dialog */}
      <Dialog open={!!fichajesToDelete} onOpenChange={(o) => !o && setFichajesToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Borrar fichajes de empresa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Borrar <strong>todos los fichajes</strong> de{" "}
            <strong>{fichajesToDelete?.name}</strong>? Los trabajadores se conservarán pero
            perderán todo su historial de fichajes. Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFichajesToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteFichajes} disabled={fichajesLoading}>
              {fichajesLoading ? "Borrando..." : "Borrar fichajes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
