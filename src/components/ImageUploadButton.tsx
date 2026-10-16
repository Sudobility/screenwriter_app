import { useRef, useState } from "react";
import { fileToPngDataUrl } from "../util/image-upload";

/**
 * A button that lets the user pick an image file, converts it to a PNG data URL, and hands it to `onUpload`
 * (which stores it via the image endpoints). Used wherever an image can be uploaded instead of generated.
 */
export function ImageUploadButton({ label, onUpload, disabled, className }: {
  label: string;
  onUpload(dataUrl: string): Promise<void> | void;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(await fileToPngDataUrl(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={className ?? "rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40"}
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Uploading…" : label}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={e => void onPick(e.target.files?.[0])} />
      {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
