"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle, FileQuestion, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AssignedItem {
  filename: string;
  worker_name: string;
  size_bytes: number;
  document_id: string;
  source: string;
}

interface UnmatchedItem {
  filename: string;
  dni_found: string;
  size_bytes: number;
  source: string;
}

interface NoDniItem {
  filename: string;
  size_bytes: number;
}

interface UploadReport {
  assigned: AssignedItem[];
  unmatched: UnmatchedItem[];
  no_dni: NoDniItem[];
  total_files: number;
  total_size_bytes: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  report: UploadReport | null;
}

type Tab = "assigned" | "unmatched" | "no_dni";

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadResultDialog({ open, onClose, report }: Props) {
  const [tab, setTab] = useState<Tab>("assigned");

  if (!report) return null;

  const tabs: { key: Tab; label: string; count: number; icon: React.ReactNode; color: string }[] = [
    {
      key: "assigned",
      label: "Asignados",
      count: report.assigned.length,
      icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
      color: "text-green-700",
    },
    {
      key: "unmatched",
      label: "DNI sin trabajador",
      count: report.unmatched.length,
      icon: <AlertCircle className="w-4 h-4 text-amber-600" />,
      color: "text-amber-700",
    },
    {
      key: "no_dni",
      label: "Sin DNI",
      count: report.no_dni.length,
      icon: <FileQuestion className="w-4 h-4 text-slate-500" />,
      color: "text-slate-600",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Resultado de la carga</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="text-sm text-slate-600 pb-2 border-b">
          <span className="font-medium">{report.total_files}</span> archivos procesados
          {" · "}
          <span className="text-green-600 font-medium">{report.assigned.length} asignados</span>
          {report.unmatched.length > 0 && (
            <>, <span className="text-amber-600 font-medium">{report.unmatched.length} sin trabajador</span></>
          )}
          {report.no_dni.length > 0 && (
            <>, <span className="text-slate-500">{report.no_dni.length} sin DNI</span></>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon}
              {t.label}
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                {t.count}
              </Badge>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {tab === "assigned" && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">Archivo</th>
                  <th className="py-2 pr-4 font-medium">Trabajador</th>
                  <th className="py-2 pr-4 font-medium">Origen DNI</th>
                  <th className="py-2 font-medium text-right">Tamaño</th>
                </tr>
              </thead>
              <tbody>
                {report.assigned.length === 0 ? (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Ningún archivo asignado</td></tr>
                ) : report.assigned.map((item, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-4 max-w-[200px] truncate" title={item.filename}>{item.filename}</td>
                    <td className="py-2 pr-4 font-medium text-green-700">{item.worker_name}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className="text-xs">
                        {item.source === "filename" ? "Nombre" : "Contenido PDF"}
                      </Badge>
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{formatBytes(item.size_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "unmatched" && (
            <div className="space-y-2 py-2">
              {report.unmatched.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">Sin archivos en esta categoría</p>
              ) : (
                <>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    Se encontró el DNI en estos archivos pero no hay ningún trabajador con ese DNI en la empresa.
                    Revisa que el DNI esté registrado en el perfil del trabajador.
                  </p>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-4 font-medium">Archivo</th>
                        <th className="py-2 pr-4 font-medium">DNI encontrado</th>
                        <th className="py-2 pr-4 font-medium">Origen</th>
                        <th className="py-2 font-medium text-right">Tamaño</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.unmatched.map((item, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-2 pr-4 max-w-[180px] truncate" title={item.filename}>{item.filename}</td>
                          <td className="py-2 pr-4 font-mono font-medium text-amber-700">{item.dni_found}</td>
                          <td className="py-2 pr-4">
                            <Badge variant="outline" className="text-xs">
                              {item.source === "filename" ? "Nombre" : "Contenido PDF"}
                            </Badge>
                          </td>
                          <td className="py-2 text-right text-muted-foreground">{formatBytes(item.size_bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {tab === "no_dni" && (
            <div className="space-y-2 py-2">
              {report.no_dni.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">Sin archivos en esta categoría</p>
              ) : (
                <>
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                    No se encontró DNI ni en el nombre del archivo ni en el contenido del PDF.
                    Estos documentos se han subido sin asignar a ningún trabajador.
                  </p>
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-4 font-medium">Archivo</th>
                        <th className="py-2 font-medium text-right">Tamaño</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.no_dni.map((item, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-2 pr-4 max-w-[300px] truncate" title={item.filename}>{item.filename}</td>
                          <td className="py-2 text-right text-muted-foreground">{formatBytes(item.size_bytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
