import { isApiError } from "@sudobility/screenwriter_client";

export interface DescribedError {
  code: string;
  message: string;
  /** IMPORT_INVALID: what the validator objected to. */
  issues: string[];
}

/** Turn a failed import/export into text a writer can act on. */
export function describeError(e: Error): DescribedError {
  if (!isApiError(e)) return { code: "UNKNOWN", message: e.message, issues: [] };
  switch (e.code) {
    case "UNSUPPORTED_FORMAT":
      return { code: e.code, message: `This file is not a format Fadewright can import (Fountain, Final Draft FDX, Fade In). ${e.message}`, issues: [] };
    case "IMPORT_FAILED":
      return { code: e.code, message: `The file looks like a script but could not be read: ${e.message}`, issues: [] };
    case "IMPORT_INVALID": {
      const raw = (e.details as { issues?: { code?: string; message?: string }[] } | undefined)?.issues ?? [];
      return {
        code: e.code,
        message: "The file was read, but the resulting document failed validation and was not created.",
        issues: raw.map(i => `${i.code ?? "issue"}: ${i.message ?? ""}`),
      };
    }
    case "IMPORT_TOO_LARGE":
      return { code: e.code, message: `The file is too large to import. ${e.message}`, issues: [] };
    case "NETWORK_ERROR":
      return { code: e.code, message: `Could not reach the server: ${e.message}. Check your connection and try again.`, issues: [] };
    default:
      return { code: e.code, message: e.message, issues: [] };
  }
}
