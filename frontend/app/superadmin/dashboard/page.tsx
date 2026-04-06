"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Sparkles, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface CompanyRead {
  id: string;
  name: string;
  max_workers: number;
  worker_count: number;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const [companies, setCompanies] = useState<CompanyRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [trialMax, setTrialMax] = useState(60);
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialMsg, setTrialMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.get<CompanyRead[]>("/companies").then((r) => setCompanies(r.data)).catch(() => {}).finally(() => setLoading(false));
    api.get<{ free_trial_max_fichajes: number }>("/settings/superadmin").then((r) => setTrialMax(r.data.free_trial_max_fichajes)).catch(() => {});
  }, []);

  const saveTrialMax = async () => {
    setTrialSaving(true);
    setTrialMsg(null);
    try {
      await api.put("/settings/superadmin", { free_trial_max_fichajes: trialMax });
      setTrialMsg({ ok: true, text: "Guardado correctamente" });
    } catch {
      setTrialMsg({ ok: false, text: "Error al guardar" });
    } finally {
      setTrialSaving(false);
      setTimeout(() => setTrialMsg(null), 3000);
    }
  };

  const totalWorkers = companies.reduce((sum, c) => sum + c.worker_count, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Panel de Superadmin</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Empresas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? "—" : companies.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Trabajadores totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? "—" : totalWorkers}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Free trial config */}
      <Card className="mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Configuración del plan gratuito
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 max-w-xs">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Fichajes incluidos en el registro gratuito</Label>
              <Input
                type="number"
                min={1}
                value={trialMax}
                onChange={(e) => setTrialMax(Number(e.target.value))}
                className="h-9"
              />
            </div>
            <Button size="sm" onClick={saveTrialMax} disabled={trialSaving} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />
              {trialSaving ? "..." : "Guardar"}
            </Button>
          </div>
          {trialMsg && (
            <p className={`text-xs mt-2 ${trialMsg.ok ? "text-green-600" : "text-red-600"}`}>{trialMsg.text}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Este valor se aplica a todas las empresas que se registren desde la web a partir de ahora. Las empresas existentes mantienen su límite.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Empresas registradas</h2>
        <Button asChild size="sm">
          <Link href="/superadmin/companies">Gestionar empresas</Link>
        </Button>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-muted-foreground text-sm">Cargando...</p>
        ) : companies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay empresas registradas.</p>
        ) : (
          companies.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.worker_count} / {c.max_workers} trabajadores
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("es-ES")}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
