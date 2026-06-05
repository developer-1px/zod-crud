import {
  WEB_CLIPBOARD_KIND,
  WEB_CLIPBOARD_VERSION,
} from "./constants.js";
import {
  webClipboardError,
} from "./errors.js";
import type {
  WebClipboardCodec,
  WebClipboardEnvelope,
  WebClipboardError,
  WebClipboardPayload,
  WebClipboardReadResult,
} from "./types.js";

export const defaultWebClipboardCodec: WebClipboardCodec = {
  encode(input) {
    return JSON.stringify({
      kind: WEB_CLIPBOARD_KIND,
      version: WEB_CLIPBOARD_VERSION,
      payload: input.payload,
      source: input.source,
      sources: input.sources,
    } satisfies WebClipboardEnvelope);
  },
  decode(text) {
    const value = JSON.parse(text) as unknown;
    if (isWebClipboardEnvelope(value)) {
      return {
        payload: value.payload,
        source: typeof value.source === "string" ? value.source : null,
        sources: Array.isArray(value.sources) && value.sources.every((item) => typeof item === "string") ? value.sources : null,
      };
    }
    return {
      payload: value,
      source: null,
      sources: null,
    };
  },
};

export function encodePayload(
  codec: WebClipboardCodec,
  payload: WebClipboardPayload,
): { ok: true; text: string } | WebClipboardError {
  try {
    return { ok: true, text: codec.encode(payload) };
  } catch (cause) {
    return webClipboardError("clipboard_serialize_failed", "failed to serialize clipboard payload", cause);
  }
}

export function decodeText(codec: WebClipboardCodec, text: string): WebClipboardReadResult {
  try {
    return { ok: true, ...codec.decode(text) };
  } catch (cause) {
    return webClipboardError("clipboard_parse_failed", "failed to parse clipboard text", cause);
  }
}

function isWebClipboardEnvelope(value: unknown): value is WebClipboardEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { kind?: unknown; version?: unknown; payload?: unknown };
  return candidate.kind === WEB_CLIPBOARD_KIND && candidate.version === WEB_CLIPBOARD_VERSION && "payload" in candidate;
}
