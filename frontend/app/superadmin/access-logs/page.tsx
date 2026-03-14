"use client";

import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Shield, Download, ChevronLeft, ChevronRight } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AccessLog {
  id: string;
  admin_id: string;
  admin_email: string | null;
  admin_name: string | null;
  company_name: string | null;
  action: string;
  accessed_at: string;
  details: string | null;
}

interface Company {
  id: string;
  name: string;
}

interface AdminUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  company_id: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  VIEW_FICHAJES: "Ver fichajes",
  EXPORT_REPORT: "Exportar informe",
  EDIT_FICHAJE: "Editar fichaje",
};

const ACTION_COLORS: Record<string, string> = {
  VIEW_FICHAJES: "bg-blue-50 text-blue-700",
  EXPORT_REPORT: "bg-purple-50 text-purple-700",
  EDIT_FICHAJE: "bg-amber-50 text-amber-700",
};

const PAGE_SIZE = 50;

// ── Component ──────────────────────────────────────────────────────────────────

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [adminId, setAdminId] = useState("");

  // Options for dropdowns
  const [companies, setCompanies] = useState<Company[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);

  // Load companies and admins for filter dropdowns
  useEffect(() => {
    api.get<Company[]>("/companies").then((r) => setCompanies(r.data)).catch(() => {});
    api.get<AdminUser[]>("/superadmin/users")
      .then((r) => setAdmins(r.data.filter((u) => u.role === "admin")))
      .catch(() => {});
  }, []);

  // Filter admins by selected company
  const filteredAdmins = companyId
    ? admins.filter((a) => a.company_id === companyId)
    : admins;

  const fetchLogs = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(targetPage),
        page_size: String(PAGE_SIZE),
      };
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (companyId) params.company_id = companyId;
      if (adminId) params.admin_id = adminId;

      const res = await api.get<{ items: AccessLog[]; total: number }>(
        "/superadmin/access-logs",
        { params }
      );
      setLogs(res.data.items);
      setTotal(res.data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, fromDate, toDate, companyId, adminId]);

  useEffect(() => {
    fetchLogs(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters() {
    setPage(1);
    fetchLogs(1);
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setCompanyId("");
    setAdminId("");
    setPage(1);
    // fetch with no filters
    setLoading(true);
    api
      .get<{ items: AccessLog[]; total: number }>("/superadmin/access-logs", {
        params: { page: "1", page_size: String(PAGE_SIZE) },
      })
      .then((r) => {
        setLogs(r.data.items);
        setTotal(r.data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function exportCsv() {
    const params = new URLSearchParams({ page_size: "10000" });
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    if (companyId) params.set("company_id", companyId);
    if (adminId) params.set("admin_id", adminId);

    // Use base API URL from axios config
    const baseUrl = (api.defaults.baseURL ?? "").replace(/\/$/, "");
    window.open(`${baseUrl}/superadmin/access-logs/export.csv?${params.toString()}`, "_blank");
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-slate-600" />
          <h1 className="text-xl font-semibold">Log de accesos</h1>
          {!loading && (
            <span className="text-sm text-slate-400 ml-1">({total} registros)</span>
          )}
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-50 border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Desde</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Hasta</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-white"
            />
          </div>

          {/* Company */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Empresa</label>
            <select
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setAdminId(""); }}
              className="border rounded-md px-3 py-1.5 text-sm bg-white min-w-[160px]"
            >
              <option value="">Todas las empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Admin user */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Admin</label>
            <select
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              className="border rounded-md px-3 py-1.5 text-sm bg-white min-w-[180px]"
            >
              <option value="">Todos los admins</option>
              {filteredAdmins.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              className="px-4 py-1.5 bg-slate-800 text-white rounded-md text-sm hover:bg-slate-700"
            >
              Filtrar
            </button>
            <button
              onClick={clearFilters}
              className="px-4 py-1.5 border rounded-md text-sm hover:bg-white"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No hay registros.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Fecha / Hora</th>
                <th className="px-4 py-3 text-left">Admin</th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Acción</th>
                <th className="px-4 py-3 text-left">Detalles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const dt = new Date(log.accessed_at + "Z");
                const dateStr = dt.toLocaleDateString("es-ES");
                const timeStr = dt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                let details: Record<string, string> | null = null;
                try {
                  if (log.details) details = JSON.parse(log.details);
                } catch {}

                return (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {dateStr} {timeStr}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{log.admin_name ?? "—"}</div>
                      <div className="text-xs text-slate-400">{log.admin_email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.company_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] ?? "bg-slate-100 text-slate-600"}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                      {details
                        ? Object.entries(details)
                            .filter(([, v]) => v)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" | ")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Página {page} de {totalPages} · {total} registros
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded border hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page numbers */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`w-8 h-8 rounded border text-xs font-medium transition-colors ${
                      page === p
                        ? "bg-slate-800 text-white border-slate-800"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded border hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
