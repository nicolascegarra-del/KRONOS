"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users } from "lucide-react";
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

  useEffect(() => {
    api
      .get<CompanyRead[]>("/companies")
      .then((r) => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
