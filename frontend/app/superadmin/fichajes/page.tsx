"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Trash2, MessageSquare, MapPin } from "lucide-react";
import { format } from "date-fns";
import { minutesToHoursLabel } from "@/lib/utils";

interface CompanyOption {
  id: string;
  name: string;
}

interface UserBasic {
  id: string;
  email: string;
  full_name: string;
}

interface FichajeSuperadmin {
  id: string;
  user_id: string;
  user?: UserBasic;
  start_time: string;
  end_time?: string;
  status: "active" | "paused" | "finished";
  total_minutes?: number;
  late_minutes?: number;
  modalidad?: string;
  out_of_range?: boolean;
  edit_comment?: string;
  pausas: { id: string }[];
}

function fmtDatetime(iso?: string): string {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy HH:mm");
}

function StatusBadge({ s }: { s: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    active: { label: "Activo", cls: "bg-green-100 text-green-700" },
    paused: { label: "Pausado", cls: "bg-amber-100 text-amber-700" },
    finished: { label: "Finalizado", cls: "bg-slate-100 text-slate-600" },
  };
  const c = cfg[s] ?? { label: s, cls: "bg-slate-100 text-slate-500" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

export default function SuperadminFichajesPage() {
  const [fichajes, setFichajes] = useState<FichajeSuperadmin[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyFilter, setCompanyFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    api.get<CompanyOption[]>("/companies").then((r) => setCompanies(r.data)).catch(() => {});
    fetchFichajes();
  }, []);

  const fetchFichajes = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (companyFilter) params.set("company_id", companyFilter);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      if (statusFilter) params.set("status", statusFilter);
      const res = await api.get<FichajeSuperadmin[]>(`/fichajes/superadmin?${params}`);
      setFichajes(res.data);
    } catch {
      setError("Error al cargar los fichajes");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este fichaje? Esta acción no se puede deshacer.")) return;
    try {
      await api.delete(`/fichajes/admin/${id}`);
      setFichajes((prev) => prev.filter((f) => f.id !== id));
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al eliminar el fichaje");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Fichajes — Vista global</h1>

      {/* Filter bar */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label>Empresa</Label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Todas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Estado</Label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex h-9 w-36 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Todos</option>
              <option value="active">Activo</option>
              <option value="paused">Pausado</option>
              <option value="finished">Finalizado</option>
            </select>
          </div>
          <Button onClick={fetchFichajes} disabled={loading} className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            {loading ? "Cargando..." : "Buscar"}
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Trabajador</th>
                <th className="text-left p-3 font-medium">Inicio</th>
                <th className="text-left p-3 font-medium">Fin</th>
                <th className="text-right p-3 font-medium">Duración</th>
                <th className="text-center p-3 font-medium">Estado</th>
                <th className="text-center p-3 font-medium">Modalidad</th>
                <th className="text-right p-3 font-medium">Pausas</th>
                <th className="text-left p-3 font-medium">Nota edición</th>
                <th className="text-center p-3 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {fichajes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    {loading ? "Cargando..." : "Sin fichajes para los filtros seleccionados"}
                  </td>
                </tr>
              ) : (
                fichajes.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50 align-top">
                    <td className="p-3">
                      {f.user ? (
                        <>
                          <p className="font-medium">{f.user.full_name}</p>
                          <p className="text-xs text-muted-foreground">{f.user.email}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">{f.user_id}</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">{fmtDatetime(f.start_time)}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDatetime(f.end_time)}</td>
                    <td className="p-3 text-right">
                      {f.total_minutes != null ? minutesToHoursLabel(f.total_minutes) : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <StatusBadge s={f.status} />
                        {f.out_of_range && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 whitespace-nowrap">
                            Fuera de rango
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {f.modalidad === "teletrabajo" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Teletrabajo</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Presencial</span>
                      )}
                    </td>
                    <td className="p-3 text-right">{f.pausas.length}</td>
                    <td className="p-3 max-w-[160px]">
                      {f.edit_comment ? (
                        <span className="flex items-start gap-1 text-xs text-slate-600" title={f.edit_comment}>
                          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                          <span className="line-clamp-2">{f.edit_comment}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(f.id)}
                          className="flex items-center gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3 h-3" />
                          Eliminar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
