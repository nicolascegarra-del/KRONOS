/**
 * Triggers a browser file download from a Blob or array of bytes.
 */
export function downloadBlob(data: BlobPart, filename: string, mimeType = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
