"use client";

import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Download, Upload, CheckCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  created: string[];
  skipped: string[];
}

export function ImportWorkers() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownloadTemplate = async () => {
    const res = await api.get("/users/template", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fichajes_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.post<ImportResult>("/users/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Error al importar fichero");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Descargar Plantilla CSV
        </Button>

        <Button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          {loading ? "Importando..." : "Importar CSV / Excel"}
        </Button>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2 text-sm border rounded-md p-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="w-4 h-4" />
            <span>
              <strong>{result.created.length}</strong> usuarios creados
            </span>
          </div>
          {result.skipped.length > 0 && (
            <div className="text-muted-foreground">
              <strong>{result.skipped.length}</strong> ya existían:{" "}
              {result.skipped.join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
