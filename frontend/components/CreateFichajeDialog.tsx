"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import UserSelect from "@/components/UserSelect";

interface Company {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  mode: "admin" | "superadmin";
  onClose: () => void;
  onCreated: () => void;
}

interface CreateForm {
  user_id: string;
  start_time: string;
  end_time: string;
  modalidad: string;
  late_minutes: string;
  edit_comment: string;
}

const EMPTY_FORM: CreateForm = {
  user_id: "",
  start_time: "",
  end_time: "",
  modalidad: "presencial",
  late_minutes: "",
  edit_comment: "",
};

export default function CreateFichajeDialog({ open, mode, onClose, onCreated }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setCompanyId("");
      setError(null);
    }
  }, [open]);

  // Load companies for superadmin mode
  useEffect(() => {
    if (open && mode === "superadmin" && companies.length === 0) {
      api
        .get<Company[]>("/companies")
        .then((res) => setCompanies(res.data ?? []))
        .catch(() => setError("Error al cargar empresas"));
    }
  }, [open, mode, companies.length]);

  // Reset user when company changes
  useEffect(() => {
    setForm((p) => ({ ...p, user_id: "" }));
  }, [companyId]);

  const handleSave = async () => {
    if (!form.user_id) {
      setError("Debes seleccionar un trabajador");
      return;
    }
    if (!form.start_time) {
      setError("La hora de inicio es obligatoria");
      return;
    }
    if (form.end_time && form.end_time <= form.start_time) {
      setError("La hora de fin debe ser posterior al inicio");
      return;
    }
    if (form.edit_comment.trim().length < 3) {
      setError("El motivo es obligatorio (mínimo 3 caracteres)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | number | null> = {
        user_id: form.user_id,
        start_time: form.start_time + ":00",
        modalidad: form.modalidad,
        edit_comment: form.edit_comment.trim(),
      };
      if (form.end_time) body.end_time = form.end_time + ":00";
      if (form.late_minutes !== "") body.late_minutes = Number(form.late_minutes);
      if (mode === "superadmin" && companyId) body.company_id = companyId;

      await api.post(`/fichajes/admin`, body);
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al crear el fichaje");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo fichaje manual</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Empresa (superadmin) + Trabajador */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b pb-1 mb-3">
              Trabajador
            </p>
            <div className="space-y-3">
              {mode === "superadmin" && (
                <div className="space-y-1">
                  <Label>
                    Empresa <span className="text-destructive">*</span>
                  </Label>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Selecciona una empresa</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <UserSelect
                label="Trabajador"
                required
                value={form.user_id}
                onChange={(id) => setForm((p) => ({ ...p, user_id: id }))}
                endpoint={mode}
                companyId={mode === "superadmin" ? companyId || null : null}
              />
            </div>
          </div>

          {/* Tiempos */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b pb-1 mb-3">
              Tiempos
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>
                  Inicio <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={form.start_time}
                  onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>
                  Fin <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={form.end_time}
                  onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Modalidad</Label>
                <select
                  value={form.modalidad}
                  onChange={(e) => setForm((p) => ({ ...p, modalidad: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="presencial">Presencial</option>
                  <option value="teletrabajo">Teletrabajo</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>
                  Min. tarde <span className="text-muted-foreground text-xs">(opcional)</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Auto-calculado"
                  value={form.late_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, late_minutes: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Si no indicas hora de fin, el fichaje se creará abierto (estado <em>activo</em>).
              Los minutos trabajados se calcularán automáticamente cuando se finalice.
            </p>
          </div>

          {/* Auditoría */}
          <div className="bg-amber-50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pb-1">
              Auditoría
            </p>
            <Label>
              Motivo de la creación <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="¿Por qué se crea este fichaje manualmente? (mín. 3 caracteres)"
              rows={3}
              value={form.edit_comment}
              onChange={(e) => setForm((p) => ({ ...p, edit_comment: e.target.value }))}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Creando..." : "Crear fichaje"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
