"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

interface PauseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (data: any) => void;
}

export function PauseDialog({ open, onOpenChange, onSuccess }: PauseDialogProps) {
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (comment.trim().length < 3) {
      setError("El comentario debe tener al menos 3 caracteres");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/fichajes/pause", { comment: comment.trim() });
      setComment("");
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
          <DialogDescription>
            Indica el motivo de la pausa (obligatorio)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="comment">Motivo</Label>
            <Textarea
              id="comment"
              data-testid="pause-comment"
              placeholder="Ej: Almuerzo, reunión, descanso..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              required
              minLength={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

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
              disabled={loading || comment.trim().length < 3}
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
