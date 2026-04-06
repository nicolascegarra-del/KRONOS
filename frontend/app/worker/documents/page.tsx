"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/downloadBlob";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Eye, X } from "lucide-react";

interface DocumentOut {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  category: string | null;
  is_read: boolean;
}

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(cat: string | null) {
  if (!cat) return null;
  const map: Record<string, string> = { nomina: "Nómina", contrato: "Contrato", otros: "Otros" };
  return map[cat] ?? cat;
}

export default function WorkerDocumentsPage() {
  const [docs, setDocs] = useState<DocumentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  // PDF viewer state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("");

  useEffect(() => {
    api.get<DocumentOut[]>("/documents/my")
      .then((r) => setDocs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Revoke blob URL on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const markRead = async (id: string) => {
    try {
      await api.post(`/documents/${id}/mark-read`);
      setDocs((prev) => prev.map((d) => d.id === id ? { ...d, is_read: true } : d));
    } catch {
      // ignore
    }
  };

  const handleView = async (doc: DocumentOut) => {
    setViewing(doc.id);
    try {
      const r = await api.get(`/documents/${doc.id}/download`, { responseType: "arraybuffer" });
      // Revoke previous URL
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const blob = new Blob([r.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      setPdfName(doc.filename);
      if (!doc.is_read) await markRead(doc.id);
    } catch {
      // ignore
    } finally {
      setViewing(null);
    }
  };

  const handleDownload = async (doc: DocumentOut) => {
    setDownloading(doc.id);
    try {
      const r = await api.get(`/documents/${doc.id}/download`, { responseType: "arraybuffer" });
      downloadBlob(r.data, doc.filename, doc.content_type);
      if (!doc.is_read) await markRead(doc.id);
    } catch {
      // ignore
    } finally {
      setDownloading(null);
    }
  };

  const closePdf = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setPdfName("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-xl font-semibold">Mis documentos</h1>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No tienes documentos disponibles</p>
          <p className="text-xs mt-1 text-center max-w-xs">
            Cuando tu empresa suba documentos asignados a ti, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={doc.id} className={doc.is_read ? "" : "border-blue-300 bg-blue-50/40"}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <FileText className="w-9 h-9 text-red-500 mt-0.5" />
                    {!doc.is_read && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${!doc.is_read ? "font-semibold" : "font-medium"}`} title={doc.filename}>
                      {doc.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {!doc.is_read && (
                        <Badge className="text-xs bg-blue-500 hover:bg-blue-500 px-1.5 py-0">Nuevo</Badge>
                      )}
                      {doc.category && (
                        <Badge variant="outline" className="text-xs">{categoryLabel(doc.category)}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatBytes(doc.size_bytes)}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.uploaded_at).toLocaleDateString("es-ES")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant={doc.is_read ? "outline" : "default"}
                    onClick={() => handleView(doc)}
                    disabled={viewing === doc.id}
                    className="gap-1.5"
                  >
                    {viewing === doc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(doc)}
                    disabled={downloading === doc.id}
                    className="gap-1.5"
                  >
                    {downloading === doc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* PDF viewer modal */}
      {pdfUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
            <span className="text-sm font-medium truncate max-w-[calc(100%-3rem)]">{pdfName}</span>
            <button
              onClick={closePdf}
              className="p-1.5 rounded-md hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <iframe
              src={pdfUrl}
              className="w-full h-full"
              title={pdfName}
            />
          </div>
        </div>
      )}
    </div>
  );
}
