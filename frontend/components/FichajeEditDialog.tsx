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

interface UserBasic {
  id: string;
  email: string;
  full_name: string;
}

export interface FichajeEditTarget {
  id: string;
  user_id: string;
  user?: UserBasic;
  start_time: string;
  end_time?: string;
  status: "active" | "paused" | "finished";
  total_minutes?: number;
  late_minutes?: number;
  modalidad?: string;
}

interface Props {
  target: FichajeEditTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

interface EditForm {
  start_time: string;
  end_time: string;
  status: string;
  modalidad: string;
  total_minutes: string;
  late_minutes: string;
  edit_comment: string;
}

function toInputDatetime(iso?: string): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export default function FichajeEditDialog({ target, onClose, onSaved }: Props) {
  const [form, setForm] = useState<EditForm>({
    start_time: "",
    end_time: "",
    status: "",
    modalidad: "presencial",
    total_minutes: "",
    late_minutes: "",
    edit_comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setError(null);
      setForm({
        start_time: toInputDatetime(target.start_time),
        end_time: toInputDatetime(target.end_time),
        status: target.status,
        modalidad: target.modalidad ?? "presencial",
        total_minutes: target.total_minutes != null ? String(target.total_minutes) : "",
        late_minutes: target.late_minutes != null ? String(target.late_minutes) : "",
        edit_comment: "",
      });
    }
  }, [target]);

  const handleSave = async () => {
    if (!target) return;
    if (form.edit_comment.trim().length < 3) {
      setError("El motivo del cambio es obligatorio (mínimo 3 caracteres)");
      return;
    }
    if (form.start_time && form.end_time && form.end_time <= form.start_time) {
      setError("La hora de fin debe ser posterior al inicio");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string | number> = {
        edit_comment: form.edit_comment.trim(),
      };
      if (form.start_time) body.start_time = form.start_time + ":00";
      if (form.end_time) body.end_time = form.end_time + ":00";
      if (form.status) body.status = form.status;
      if (form.modalidad) body.modalidad = form.modalidad;
      if (form.total_minutes !== "") body.total_minutes = Number(form.total_minutes);
      if (form.late_minutes !== "") body.late_minutes = Number(form.late_minutes);
      await api.patch(`/fichajes/admin/${target.id}`, body);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Editar Fichaje
            {target?.user && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                — {target.user.full_name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Tiempos */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b pb-1 mb-3">
              Tiempos
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Inicio</Label>
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
                <Label>Estado</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="active">Activo</option>
                  <option value="paused">Pausado</option>
                  <option value="finished">Finalizado</option>
                </select>
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
            </div>
          </div>

          {/* Cálculos */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide border-b pb-1 mb-3">
              Cálculos{" "}
              <span className="text-slate-400 normal-case font-normal">(opcionales)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Min. trabajados</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Auto-calculado"
                  value={form.total_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, total_minutes: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Min. tarde</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.late_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, late_minutes: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Auditoría */}
          <div className="bg-amber-50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pb-1">
              Auditoría
            </p>
            <Label>
              Motivo del cambio <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Describe el motivo de la edición (obligatorio, mín. 3 caracteres)"
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
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
