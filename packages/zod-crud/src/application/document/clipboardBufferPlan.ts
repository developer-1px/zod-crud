import { cloneJsonSerializable, cloneTrustedPlainJson, jsonSerializableError } from "../../foundation/json.js";
import type { JSONResult } from "../../foundation/json-patch/index.js";
import { readAt, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import { normalizePointerSources } from "../../foundation/json-pointer/pointerSource.js";
import type {
  ClipboardBuffer,
  ClipboardEmpty,
  ClipboardPeekResult,
  ClipboardReadOptions,
  ClipboardReadResult,
  ClipboardWriteOptions,
} from "./clipboardTypes.js";

export const EMPTY_CLIPBOARD: ClipboardEmpty = {
  ok: false,
  code: "empty_clipboard",
  message: "clipboard is empty",
};

export type ClipboardWriteSourcesResult =
  | { ok: true; sources: Pointer[] | null }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

export type ClipboardWritePayloadPlan =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

export interface ClipboardSchemaTrustedPayloadInput {
  state: unknown;
  stateJsonTrusted: boolean;
  payload: unknown;
  sources: ReadonlyArray<Pointer> | null;
}

export interface ClipboardWritePayloadInput {
  payload: unknown;
  trustedPayload: boolean;
  clonePayload: boolean;
}

export interface ClipboardWriteBufferInput {
  state: unknown;
  stateJsonTrusted: boolean;
  payload: unknown;
  options?: ClipboardWriteOptions;
}

export type ClipboardWriteBufferPlan =
  | { ok: true; buffer: ClipboardBuffer }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

export function planClipboardReadBuffer(
  buffer: ClipboardBuffer | null,
  options: ClipboardReadOptions = {},
): ClipboardReadResult {
  if (!buffer) return EMPTY_CLIPBOARD;
  return {
    ok: true,
    payload: options.clonePayload === false
      ? buffer.payload
      : cloneTrustedPlainJson(buffer.payload),
    source: buffer.source,
    sources: buffer.sources ? [...buffer.sources] : null,
  };
}

export function planClipboardPeekBuffer(
  buffer: ClipboardBuffer | null,
): ClipboardPeekResult {
  if (!buffer) return EMPTY_CLIPBOARD;
  return {
    ok: true,
    payload: buffer.payload,
    source: buffer.source,
    sources: buffer.sources ? [...buffer.sources] : null,
    schemaTrusted: buffer.schemaTrusted,
  };
}

export function planClipboardWriteSources(
  options: ClipboardWriteOptions,
): ClipboardWriteSourcesResult {
  const candidates: Pointer[] = [];
  if (options.source !== undefined && options.source !== null) candidates.push(options.source);
  for (const item of options.sources ?? []) {
    candidates.push(item);
  }
  if (candidates.length === 0) return { ok: true, sources: null };

  const normalized = normalizePointerSources(candidates);
  if (normalized.ok) return { ok: true, sources: normalized.sources };
  if (normalized.code === "empty_selection") return { ok: true, sources: null };
  return {
    ok: false,
    result: {
      ok: false,
      code: "invalid_pointer",
      reason: `invalid clipboard source pointer: ${normalized.pointer}`,
      pointer: normalized.pointer,
    },
  };
}

export function isClipboardSchemaTrustedPayload(
  input: ClipboardSchemaTrustedPayloadInput,
): boolean {
  if (!input.stateJsonTrusted) return false;
  const { state, payload, sources } = input;
  if (payload === state) return true;
  const isSourcePayload = (source: Pointer): boolean => {
    const segments = tryParsePointer(source);
    if (segments === null) return false;
    const value = readAt(state, segments);
    return value.ok && value.value === payload;
  };
  for (const source of sources ?? []) {
    if (isSourcePayload(source)) return true;
  }
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    for (const key in state as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(state, key)
        && (state as Record<string, unknown>)[key] === payload) {
        return true;
      }
    }
  }
  return false;
}

export function planClipboardWritePayload(
  input: ClipboardWritePayloadInput,
): ClipboardWritePayloadPlan {
  if (input.clonePayload) {
    return input.trustedPayload
      ? { ok: true, value: cloneTrustedPlainJson(input.payload) }
      : cloneJsonSerializable(input.payload);
  }
  if (input.trustedPayload) return { ok: true, value: input.payload };

  const reason = jsonSerializableError(input.payload);
  return reason === null
    ? { ok: true, value: input.payload }
    : { ok: false, reason };
}

export function planClipboardWriteBuffer(
  input: ClipboardWriteBufferInput,
): ClipboardWriteBufferPlan {
  const options = input.options ?? {};
  const writtenSources = planClipboardWriteSources(options);
  if (!writtenSources.ok) return writtenSources;

  const sources = writtenSources.sources;
  const schemaTrustedPayload = options.trustedPayload === true && sources === null
    ? false
    : isClipboardSchemaTrustedPayload({
        state: input.state,
        stateJsonTrusted: input.stateJsonTrusted,
        payload: input.payload,
        sources,
      });
  const trustedPayload = options.trustedPayload === true || schemaTrustedPayload;
  const cloned = planClipboardWritePayload({
    payload: input.payload,
    trustedPayload,
    clonePayload: options.clonePayload !== false,
  });
  if (!cloned.ok) {
    return {
      ok: false,
      result: { ok: false, code: "not_serializable", reason: cloned.reason },
    };
  }

  return {
    ok: true,
    buffer: {
      payload: cloned.value,
      source: sources?.[0] ?? null,
      sources,
      schemaTrusted: schemaTrustedPayload,
    },
  };
}
