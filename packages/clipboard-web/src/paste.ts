import type {
  JSONDocument,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
} from "@interactive-os/json-document";

import {
  decodeText,
} from "./codec.js";
import type {
  WebClipboardCanPasteResult,
  WebClipboardCodec,
  WebClipboardPasteResult,
} from "./types.js";

export function canPasteText<T>(
  doc: JSONDocument<T>,
  codec: WebClipboardCodec,
  target: JSONDocumentPasteTarget,
  text: string,
  pasteOptions?: JSONDocumentPasteOptions,
): WebClipboardCanPasteResult {
  const decoded = decodeText(codec, text);
  if (!decoded.ok) return decoded;
  return doc.canPaste(target, { ...pasteOptions, payload: decoded.payload });
}

export function pasteText<T>(
  doc: JSONDocument<T>,
  codec: WebClipboardCodec,
  target: JSONDocumentPasteTarget,
  text: string,
  pasteOptions?: JSONDocumentPasteOptions,
): WebClipboardPasteResult<T> {
  const decoded = decodeText(codec, text);
  if (!decoded.ok) return decoded;

  const capability = doc.canPaste(target, { ...pasteOptions, payload: decoded.payload });
  if (!capability.ok) return capability;

  return doc.paste(target, { ...pasteOptions, payload: decoded.payload });
}
