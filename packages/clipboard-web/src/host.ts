import {
  webClipboardError,
} from "./errors.js";
import type {
  MaybePromise,
  TextClipboardHost,
  WebClipboardError,
} from "./types.js";

export function resolveReadHost(host?: TextClipboardHost): { ok: true; readText: () => MaybePromise<string> } | WebClipboardError {
  const resolved = host ?? globalThis.navigator?.clipboard;
  if (typeof resolved?.readText === "function") return { ok: true, readText: resolved.readText.bind(resolved) };
  return webClipboardError("clipboard_unavailable", "text clipboard read is unavailable");
}

export function resolveWriteHost(host?: TextClipboardHost): { ok: true; writeText: (text: string) => MaybePromise<void> } | WebClipboardError {
  const resolved = host ?? globalThis.navigator?.clipboard;
  if (typeof resolved?.writeText === "function") return { ok: true, writeText: resolved.writeText.bind(resolved) };
  return webClipboardError("clipboard_unavailable", "text clipboard write is unavailable");
}
