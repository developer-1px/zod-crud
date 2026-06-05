import type {
  WebClipboardError,
  WebClipboardErrorCode,
} from "./types.js";

export function webClipboardError(code: WebClipboardErrorCode, reason: string, cause?: unknown): WebClipboardError {
  if (cause === undefined) return { ok: false, code, reason };
  return { ok: false, code, reason, cause };
}
