import type {
  JSONDocument,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
} from "zod-crud";

import {
  decodeText,
  defaultWebClipboardCodec,
  encodePayload,
} from "./codec.js";
import {
  webClipboardError,
} from "./errors.js";
import {
  resolveReadHost,
  resolveWriteHost,
} from "./host.js";
import {
  canPasteText,
  pasteText,
} from "./paste.js";
import type {
  CreateWebClipboardOptions,
  WebClipboard,
  WebClipboardPasteResult,
  WebClipboardPayload,
  WebClipboardReadResult,
  WebClipboardWriteResult,
} from "./types.js";

export function createWebClipboard<T>(
  doc: JSONDocument<T>,
  options: CreateWebClipboardOptions = {},
): WebClipboard<T> {
  const codec = options.codec ?? defaultWebClipboardCodec;

  const read = async (): Promise<WebClipboardReadResult> => {
    const host = resolveReadHost(options.host);
    if (!host.ok) return host;

    try {
      const text = await host.readText();
      return decodeText(codec, text);
    } catch (cause) {
      return webClipboardError("clipboard_read_failed", "failed to read text from clipboard", cause);
    }
  };

  const writePayload = async (
    payload: unknown,
    metadata: Partial<Omit<WebClipboardPayload, "payload">> = {},
  ): Promise<WebClipboardWriteResult> => {
    const host = resolveWriteHost(options.host);
    if (!host.ok) return host;

    const encoded = encodePayload(codec, {
      payload,
      source: metadata.source ?? null,
      sources: metadata.sources ?? null,
    });
    if (!encoded.ok) return encoded;

    try {
      await host.writeText(encoded.text);
      return { ok: true };
    } catch (cause) {
      return webClipboardError("clipboard_write_failed", "failed to write text to clipboard", cause);
    }
  };

  return {
    async copy(source, copyOptions) {
      const previous = doc.clipboard.read({ clonePayload: false });
      const result = doc.clipboard.copy(source, copyOptions);
      if (!result.ok) return result;

      const written = await writePayload(result.payload, {
        source: result.source,
        sources: result.sources,
      });
      if (!written.ok) restoreClipboard(doc, previous);
      return written.ok ? result : written;
    },

    async cut(source, cutOptions) {
      const previous = doc.clipboard.read({ clonePayload: false });
      const copied = doc.clipboard.copy(source, cutOptions);
      if (!copied.ok) return copied;

      const written = await writePayload(copied.payload, {
        source: copied.source,
        sources: copied.sources,
      });
      if (!written.ok) {
        restoreClipboard(doc, previous);
        return written;
      }

      const cut = doc.clipboard.cut(source, cutOptions);
      if (!cut.ok) restoreClipboard(doc, previous);
      return cut;
    },

    read,
    writePayload,

    async canPaste(target, pasteOptions) {
      const result = await read();
      if (!result.ok) return result;
      return doc.canPaste(target, { ...pasteOptions, payload: result.payload });
    },

    canPasteText: (target, text, pasteOptions) => canPasteText(doc, codec, target, text, pasteOptions),

    async paste(target, pasteOptions) {
      const result = await read();
      if (!result.ok) return result;

      const capability = doc.canPaste(target, { ...pasteOptions, payload: result.payload });
      if (!capability.ok) return capability;

      return doc.paste(target, { ...pasteOptions, payload: result.payload });
    },

    pasteText: (target, text, pasteOptions): WebClipboardPasteResult<T> => pasteText(doc, codec, target, text, pasteOptions),
  };
}

function restoreClipboard<T>(
  doc: JSONDocument<T>,
  previous: ReturnType<JSONDocument<T>["clipboard"]["read"]>,
): void {
  if (!previous.ok) {
    doc.clipboard.clear();
    return;
  }
  doc.clipboard.write(previous.payload, {
    source: previous.source,
    sources: previous.sources,
    trustedPayload: true,
    clonePayload: false,
  });
}
