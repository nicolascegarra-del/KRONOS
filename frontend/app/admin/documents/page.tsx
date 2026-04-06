"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { StorageBar } from "@/components/StorageBar";
import { UploadResultDialog } from "@/components/UploadResultDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Trash2,
  Download,
  Search,
  FileText,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { downloadBlob } from "@/lib/downloadBlob";

interface StorageUsage {
  used_bytes: number;
  max_bytes: number;
  percentage: number;
  warning: boolean;
}

interface DocumentOut {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  category: string | null;
  description: string | null;
  user_id: string | null;
  worker_name: string | null;
}

interface DocumentListResponse {
  items: DocumentOut[];
  total: number;
  storage: StorageUsage;
}

interface UploadReport {
  assigned: { filename: string; worker_name: string; size_bytes: number; document_id: string; source: string }[];
  unmatched: { filename: string; dni_found: string; size_bytes: number; source: string }[];
  no_dni: { filename: string; size_bytes: number }[];
  total_files: number;
  total_size_bytes: number;
}

interface Worker {
  id: string;
  full_name: string;
}

const CATEGORIES = ["nomina", "contrato", "otros"];

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(cat: string | null) {
  if (!cat) return null;
  const map: Record<string, string> = { nomina: "Nómina", contrato: "Contrato", otros: "Otros" };
  return map[cat] ?? cat;
}

export default function AdminDocumentsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const [docs, setDocs] = useState<DocumentOut[]>([]);
  const [total, setTotal] = useState(0);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const [search, setSearch] = useState("");
  const [filterWorker, setFilterWorker] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("");
  const [uploadReport, setUploadReport] = useState<UploadReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 50 };
      if (search) params.search = search;
      if (filterWorker) params.worker_id = filterWorker;
      if (filterCategory) params.category = filterCategory;
      const r = await api.get<DocumentListResponse>("/documents", { params });
      setDocs(r.data.items);
      setTotal(r.data.total);
      setStorage(r.data.storage);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, search, filterWorker, filterCategory]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  useEffect(() => {
    api.get<(Worker & { role: string })[]>("/users")
      .then((r) => setWorkers(r.data.filter((u) => u.role === "worker")))
      .catch(() => {});
  }, []);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      Array.from(fileList).forEach((f) => formData.append("files", f));
      if (uploadCategory) formData.append("category", uploadCategory);
      const r = await api.post<UploadReport>("/documents/bulk-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadReport(r.data);
      setReportOpen(true);
      fetchDocs();
    } catch (e: any) {
      setUploadError(e.response?.data?.detail || "Error al subir los archivos");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleDownload = async (doc: DocumentOut) => {
    try {
      const r = await api.get(`/documents/${doc.id}/download`, { responseType: "arraybuffer" });
      downloadBlob(r.data, doc.filename, doc.content_type);
    } catch {
      // ignore
    }
  };

  const handleDeleteOne = async (id: string) => {
    if (!confirm("¿Eliminar este documento?")) return;
    await api.delete(`/documents/${id}`);
    setSelectedIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    fetchDocs();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`¿Eliminar ${selectedIds.size} documento(s) seleccionado(s)?`)) return;
    setDeleting(true);
    try {
      await api.post("/documents/bulk-delete", { ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      fetchDocs();
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === docs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(docs.map((d) => d.id)));
    }
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Documentos</h1>

      {/* Storage bar */}
      {storage && (
        <StorageBar
          usedBytes={storage.used_bytes}
          maxBytes={storage.max_bytes}
          percentage={storage.percentage}
          warning={storage.warning}
        />
      )}

      {/* Upload zone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Subir documentos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Sube múltiples PDFs a la vez. El sistema detectará automáticamente el DNI en el nombre del archivo
            o en el contenido del PDF para asignarlo al trabajador correspondiente.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Sin categoría</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Subiendo..." : "Seleccionar PDFs"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>

          {/* Drag & drop zone */}
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              isDragOver ? "border-primary bg-primary/5" : "border-slate-300 hover:border-slate-400"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileText className="w-10 h-10 mx-auto text-slate-400 mb-2" />
            <p className="text-sm text-muted-foreground">
              Arrastra y suelta los PDFs aquí o haz clic para seleccionarlos
            </p>
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {uploadError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-9"
          />
        </div>
        <select
          value={filterWorker}
          onChange={(e) => { setFilterWorker(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">Todos los trabajadores</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>{w.full_name}</option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </select>
        {(search || filterWorker || filterCategory) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setSearch(""); setFilterWorker(""); setFilterCategory(""); setPage(1); }}
          >
            <X className="w-4 h-4" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Bulk delete bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-red-700">
            {selectedIds.size} documento(s) seleccionado(s)
          </span>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            disabled={deleting}
            className="gap-1.5"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Eliminar seleccionados
          </Button>
        </div>
      )}

      {/* Document list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">No hay documentos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-muted-foreground">
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === docs.length && docs.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Archivo</th>
                    <th className="px-4 py-3 font-medium">Trabajador</th>
                    <th className="px-4 py-3 font-medium">Categoría</th>
                    <th className="px-4 py-3 font-medium">Tamaño</th>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => (
                    <tr key={doc.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(doc.id)}
                          onChange={() => toggleSelect(doc.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="truncate max-w-[200px]" title={doc.filename}>
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {doc.worker_name ? (
                          <span className="font-medium">{doc.worker_name}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {doc.category ? (
                          <Badge variant="outline" className="text-xs">{categoryLabel(doc.category)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatBytes(doc.size_bytes)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(doc.uploaded_at).toLocaleDateString("es-ES")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDownload(doc)}
                            className="h-7 px-2"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteOne(doc.id)}
                            className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      <UploadResultDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        report={uploadReport}
      />
    </div>
  );
}
