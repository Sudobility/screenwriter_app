/** Browser download of in-memory bytes (the lib hands bytes out; the file save is the app's job). */
export function downloadBytes(filename: string, mimeType: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
