"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

interface PausaTipo {
  id: string;
  name: string;
}

interface PauseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (data: any) => void;
}

export function PauseDialog({ open, onOpenChange, onSuccess }: PauseDialogProps) {
  const [tipos, setTipos] = useState<PausaTipo[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load pause types each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setSelected("");
    setError(null);
    api.get<PausaTipo[]>("/pause-types").then((res) => setTipos(res.data));
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      setError("Selecciona un tipo de pausa");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/fichajes/pause", { comment: selected });
      onSuccess(res.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al pausar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar Pausa</DialogTitle>
          <DialogDescription>Selecciona el motivo de la pausa</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo">Motivo</Label>
            <select
              id="tipo"
              data-testid="pause-tipo"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Selecciona un motivo —</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !selected}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {loading ? "Pausando..." : "Pausar Jornada"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
