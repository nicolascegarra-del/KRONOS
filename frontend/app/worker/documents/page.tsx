"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { downloadBlob } from "@/lib/downloadBlob";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2 } from "lucide-react";

interface DocumentOut {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  category: string | null;
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

  useEffect(() => {
    api.get<DocumentOut[]>("/documents/my")
      .then((r) => setDocs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (doc: DocumentOut) => {
    setDownloading(doc.id);
    try {
      const r = await api.get(`/documents/${doc.id}/download`, { responseType: "arraybuffer" });
      downloadBlob(r.data, doc.filename, doc.content_type);
    } catch {
      // ignore
    } finally {
      setDownloading(null);
    }
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
            <Card key={doc.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <FileText className="w-9 h-9 text-red-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(doc)}
                  disabled={downloading === doc.id}
                  className="shrink-0 gap-1.5"
                >
                  {downloading === doc.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Descargar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
