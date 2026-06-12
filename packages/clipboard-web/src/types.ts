import type {
  ClipboardCopyError,
  ClipboardCopyOptions,
  ClipboardCopyResult,
  ClipboardCutOptions,
  ClipboardCutResult,
  ClipboardPasteResult,
  ClipboardSource,
  JSONCapabilityResult,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  Pointer,
} from "@interactive-os/json-document";

import type {
  WEB_CLIPBOARD_KIND,
  WEB_CLIPBOARD_VERSION,
} from "./constants.js";

export type MaybePromise<T> = T | Promise<T>;

export interface TextClipboardHost {
  readText?: () => MaybePromise<string>;
  writeText?: (text: string) => MaybePromise<void>;
}

export interface WebClipboardPayload {
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
}

export interface WebClipboardEnvelope extends WebClipboardPayload {
  kind: typeof WEB_CLIPBOARD_KIND;
  version: typeof WEB_CLIPBOARD_VERSION;
}

export interface WebClipboardCodec {
  encode(input: WebClipboardPayload): string;
  decode(text: string): WebClipboardPayload;
}

export interface CreateWebClipboardOptions {
  host?: TextClipboardHost;
  codec?: WebClipboardCodec;
}

export type WebClipboardErrorCode =
  | "clipboard_unavailable"
  | "clipboard_serialize_failed"
  | "clipboard_parse_failed"
  | "clipboard_read_failed"
  | "clipboard_write_failed";

export interface WebClipboardError {
  ok: false;
  code: WebClipboardErrorCode;
  reason: string;
  cause?: unknown;
}

export interface WebClipboardWriteOk {
  ok: true;
}

export type WebClipboardWriteResult = WebClipboardWriteOk | WebClipboardError;
export type WebClipboardReadResult = ({ ok: true } & WebClipboardPayload) | WebClipboardError;
export type WebClipboardCanPasteResult = JSONCapabilityResult | WebClipboardError;
export type JSONCapabilityError = Exclude<JSONCapabilityResult, { ok: true }>;
export type WebClipboardPasteResult<T> = ClipboardPasteResult<T> | JSONCapabilityError | WebClipboardError;
export type WebClipboardCutResult<T> = ClipboardCutResult<T> | ClipboardCopyError | WebClipboardError;
export type WebClipboardCopyResult = ClipboardCopyResult | WebClipboardError;

export interface WebClipboard<T> {
  copy(source?: ClipboardSource, options?: ClipboardCopyOptions): Promise<WebClipboardCopyResult>;
  cut(source?: ClipboardSource, options?: ClipboardCutOptions): Promise<WebClipboardCutResult<T>>;
  read(): Promise<WebClipboardReadResult>;
  writePayload(payload: unknown, metadata?: Partial<Omit<WebClipboardPayload, "payload">>): Promise<WebClipboardWriteResult>;
  canPaste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): Promise<WebClipboardCanPasteResult>;
  canPasteText(target: JSONDocumentPasteTarget, text: string, options?: JSONDocumentPasteOptions): WebClipboardCanPasteResult;
  paste(target: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): Promise<WebClipboardPasteResult<T>>;
  pasteText(target: JSONDocumentPasteTarget, text: string, options?: JSONDocumentPasteOptions): WebClipboardPasteResult<T>;
}
