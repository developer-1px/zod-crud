import type {
  ClipboardCopyError,
  ClipboardCopyOptions,
  ClipboardCopyResult,
  ClipboardCutOptions,
  ClipboardCutResult,
  ClipboardPasteResult,
  ClipboardSource,
  JSONCapabilityResult,
  JSONDocument,
  JSONDocumentPasteOptions,
  JSONDocumentPasteTarget,
  Pointer,
} from "zod-crud";

type MaybePromise<T> = T | Promise<T>;

export const WEB_CLIPBOARD_KIND = "zod-crud.clipboard+json" as const;
export const WEB_CLIPBOARD_VERSION = 1 as const;

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
        source: normalizePointer(value.source),
        sources: normalizePointerList(value.sources),
      };
    }
    return {
      payload: value,
      source: null,
      sources: null,
    };
  },
};

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

  const canPasteText = (
    target: JSONDocumentPasteTarget,
    text: string,
    pasteOptions?: JSONDocumentPasteOptions,
  ): WebClipboardCanPasteResult => {
    const decoded = decodeText(codec, text);
    if (!decoded.ok) return decoded;
    return doc.canPaste(target, { ...pasteOptions, payload: decoded.payload });
  };

  const pasteText = (
    target: JSONDocumentPasteTarget,
    text: string,
    pasteOptions?: JSONDocumentPasteOptions,
  ): WebClipboardPasteResult<T> => {
    const decoded = decodeText(codec, text);
    if (!decoded.ok) return decoded;

    const capability = doc.canPaste(target, { ...pasteOptions, payload: decoded.payload });
    if (!capability.ok) return capability;

    return doc.paste(target, { ...pasteOptions, payload: decoded.payload });
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

    canPasteText,

    async paste(target, pasteOptions) {
      const result = await read();
      if (!result.ok) return result;

      const capability = doc.canPaste(target, { ...pasteOptions, payload: result.payload });
      if (!capability.ok) return capability;

      return doc.paste(target, { ...pasteOptions, payload: result.payload });
    },

    pasteText,
  };
}

function resolveReadHost(host?: TextClipboardHost): { ok: true; readText: () => MaybePromise<string> } | WebClipboardError {
  const resolved = host ?? getNavigatorClipboard();
  if (typeof resolved?.readText === "function") return { ok: true, readText: resolved.readText.bind(resolved) };
  return webClipboardError("clipboard_unavailable", "text clipboard read is unavailable");
}

function resolveWriteHost(host?: TextClipboardHost): { ok: true; writeText: (text: string) => MaybePromise<void> } | WebClipboardError {
  const resolved = host ?? getNavigatorClipboard();
  if (typeof resolved?.writeText === "function") return { ok: true, writeText: resolved.writeText.bind(resolved) };
  return webClipboardError("clipboard_unavailable", "text clipboard write is unavailable");
}

function getNavigatorClipboard(): TextClipboardHost | undefined {
  return globalThis.navigator?.clipboard;
}

function encodePayload(
  codec: WebClipboardCodec,
  payload: WebClipboardPayload,
): { ok: true; text: string } | WebClipboardError {
  try {
    return { ok: true, text: codec.encode(payload) };
  } catch (cause) {
    return webClipboardError("clipboard_serialize_failed", "failed to serialize clipboard payload", cause);
  }
}

function decodeText(codec: WebClipboardCodec, text: string): WebClipboardReadResult {
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

function normalizePointer(value: unknown): Pointer | null {
  return typeof value === "string" ? value : null;
}

function normalizePointerList(value: unknown): ReadonlyArray<Pointer> | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
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

function webClipboardError(code: WebClipboardErrorCode, reason: string, cause?: unknown): WebClipboardError {
  if (cause === undefined) return { ok: false, code, reason };
  return { ok: false, code, reason, cause };
}
