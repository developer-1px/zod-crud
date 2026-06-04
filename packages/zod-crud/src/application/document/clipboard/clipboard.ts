import type * as z from "zod";

import { cloneJsonSerializable } from "../../../foundation/json/clone.js";
import { jsonSerializableError } from "../../../foundation/json/serializable.js";
import { cloneTrustedPlainJson } from "../../../foundation/json/trustedClone.js";
import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../../foundation/patch/types.js";
import { readAt, tryParsePointer, type Pointer } from "../../../foundation/pointer/index.js";
import { normalizePointerSources } from "../../../foundation/pointer/source.js";
import type { JSONDocumentPasteOptions, JSONStateOps } from "../runtime/types.js";
import type { SelectionSource } from "../../../domain/selection/types.js";
import {
  paste,
  rekeyProducesTrustedPayload,
  resolvePasteArgs,
  type PasteOptions,
  type PasteTarget,
} from "../../../domain/paste.js";
import {
  copy,
  type CopyError,
} from "../../../domain/copy.js";
import { cut, type CutError } from "../../../domain/cut.js";
import type {
  ClipboardBuffer,
  ClipboardCutResult,
  ClipboardEmpty,
  ClipboardPasteResult,
  ClipboardPeekResult,
  ClipboardState,
  ClipboardWriteOptions,
} from "./types.js";

const EMPTY_CLIPBOARD: ClipboardEmpty = {
  ok: false,
  code: "empty_clipboard",
  reason: "clipboard is empty",
};

export const INTERNAL_CLIPBOARD_PEEK: unique symbol = Symbol("zod-crud.internal.clipboard.peek");

type ClipboardWriteSourcesResult =
  | { ok: true; sources: Pointer[] | null }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

type ClipboardWritePayloadPlan =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

interface ClipboardSchemaTrustedPayloadInput {
  state: unknown;
  stateJsonTrusted: boolean;
  payload: unknown;
  sources: ReadonlyArray<Pointer> | null;
}

interface ClipboardWritePayloadInput {
  payload: unknown;
  trustedPayload: boolean;
  clonePayload: boolean;
}

type ClipboardWriteBufferPlan =
  | { ok: true; buffer: ClipboardBuffer }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

interface InternalClipboardState<T> extends ClipboardState<T> {
  [INTERNAL_CLIPBOARD_PEEK](): ClipboardPeekResult;
}

interface CreateClipboardOptions<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
  ops: JSONStateOps<z.output<S>>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  applyPreviewedPatch?: (
    next: z.output<S>,
    operations: ReadonlyArray<JSONPatchOperation>,
    applied: ReadonlyArray<JSONPatchOperation>,
  ) => JSONResult;
  getSelectionSource?: () => SelectionSource | null;
  getSelectionTarget?: () => Pointer | null;
  getAppliedPatch?: () => ReadonlyArray<JSONPatchOperation>;
  getStateJsonTrusted?: () => boolean;
  onChange?: () => void;
}

function writeClipboardBuffer(
  state: unknown,
  stateJsonTrusted: boolean,
  payload: unknown,
  options: ClipboardWriteOptions,
): ClipboardWriteBufferPlan {
  const writtenSources = clipboardWriteSources(options);
  if (!writtenSources.ok) return writtenSources;

  const sources = writtenSources.sources;
  const schemaTrustedPayload = options.trustedPayload === true && sources === null
    ? false
    : isClipboardSchemaTrustedPayload({
        state,
        stateJsonTrusted,
        payload,
        sources,
      });
  const trustedPayload = options.trustedPayload === true || schemaTrustedPayload;
  const cloned = clipboardWritePayload({
    payload,
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

function trustedSourceBuffer(
  payload: unknown,
  source: Pointer,
  sources: ReadonlyArray<Pointer>,
): ClipboardBuffer {
  return {
    payload,
    source,
    sources: [...sources],
    schemaTrusted: true,
  };
}

export function createClipboard<S extends z.ZodType>(
  args: CreateClipboardOptions<S>,
): InternalClipboardState<z.output<S>> {
  const {
    schema,
    getState,
    ops,
    previewPatch,
    previewTrustedValuesPatch,
    applyPreviewedPatch,
    getSelectionSource,
    getSelectionTarget,
    getAppliedPatch,
    getStateJsonTrusted,
    onChange,
  } = args;
  let buffer: ClipboardBuffer | null = null;

  const setBuffer = (next: ClipboardBuffer | null): void => {
    buffer = next;
    onChange?.();
  };

  return {
    get hasData() { return buffer !== null; },
    get source() { return buffer?.source ?? null; },
    get sources() { return buffer?.sources ? [...buffer.sources] : null; },

    read(options = {}) {
      if (!buffer) return EMPTY_CLIPBOARD;
      return {
        ok: true,
        payload: options.clonePayload === false
          ? buffer.payload
          : cloneTrustedPlainJson(buffer.payload),
        source: buffer.source,
        sources: buffer.sources ? [...buffer.sources] : null,
      };
    },

    [INTERNAL_CLIPBOARD_PEEK]() {
      if (!buffer) return EMPTY_CLIPBOARD;
      return {
        ok: true,
        payload: buffer.payload,
        source: buffer.source,
        sources: buffer.sources ? [...buffer.sources] : null,
        schemaTrusted: buffer.schemaTrusted,
      };
    },

    write(payload, options = {}) {
      const plan = writeClipboardBuffer(getState(), getStateJsonTrusted?.() === true, payload, options);
      if (!plan.ok) return plan.result;
      setBuffer(plan.buffer);
      return { ok: true };
    },

    clear() {
      setBuffer(null);
    },

    copy(source, options = {}) {
      const resolvedSource = source ?? getSelectionSource?.() ?? null;
      if (resolvedSource === null) return emptyCopySource();
      const copyOptions: { trusted: boolean; clonePayload?: boolean } = {
        trusted: getStateJsonTrusted?.() === true,
      };
      if (options.clonePayload !== undefined) copyOptions.clonePayload = options.clonePayload;
      const result = copy(getState(), resolvedSource, copyOptions);
      if (result.ok) {
        setBuffer(trustedSourceBuffer(result.payload, result.source, result.sources));
      }
      return result;
    },

    cut(source, options = {}) {
      const resolvedSource = source ?? getSelectionSource?.() ?? null;
      if (resolvedSource === null) return emptyCutSource();
      const cutOptions: {
        trusted: boolean;
        clonePayload?: boolean;
        previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
      } = {
        trusted: getStateJsonTrusted?.() === true,
      };
      if (options.clonePayload !== undefined) cutOptions.clonePayload = options.clonePayload;
      if (previewPatch !== undefined) cutOptions.previewPatch = previewPatch;
      const result = cut(schema, getState(), resolvedSource, cutOptions);
      if (!result.ok) return result;
      const patchResult = applyPreviewedPatch
        ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
        : ops.patch(result.patch);
      const applyResult: ClipboardCutResult<z.output<S>> = patchResult.ok
        ? {
            ok: true,
            value: getState(),
            applied: getAppliedPatch?.() ?? result.patch,
            payload: result.payload,
            source: result.source,
            sources: result.sources,
          }
        : {
            ok: false,
            code: patchResult.code,
            reason: patchResult.reason ?? patchResult.code,
            violations: [],
          };
      if (applyResult.ok) {
        setBuffer(trustedSourceBuffer(applyResult.payload, applyResult.source, applyResult.sources));
      }
      return applyResult;
    },

    paste(target, options) {
      const pasteOptions = splitPasteOptions(options);
      if (pasteOptions.kind === "payload") {
        return runPaste(pasteOptions.payload, target, pasteOptions.options, false, false);
      }
      if (!buffer) return EMPTY_CLIPBOARD;
      return runPaste(buffer.payload, target, pasteOptions.options, (buffer.sources?.length ?? 0) > 1, true);
    },
  };

  function runPaste(
    payload: unknown,
    targetOrSelectionTarget: PasteTarget | undefined,
    options: PasteOptions | undefined,
    spreadByDefault: boolean,
    trustedPayload: boolean,
  ): ClipboardPasteResult<z.output<S>> {
    const args = resolvePasteArgs(targetOrSelectionTarget, options);
    const target = args.target ?? getSelectionTarget?.() ?? null;
    if (target === null) {
      return {
        ok: false,
        code: "empty_selection",
        reason: "paste target selection is empty",
      };
    }
    const nextTrustedPayload = trustedPayload || args.options.trustedPayload === true;
    const patchValuesTrusted = nextTrustedPayload || rekeyProducesTrustedPayload(args.options);
    const executionOptions: PasteOptions & {
      previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
    } = {
      ...args.options,
      spread: args.options.spread ?? spreadByDefault,
      trustedPayload: nextTrustedPayload,
    };
    const pastePreview = patchValuesTrusted && previewTrustedValuesPatch
      ? previewTrustedValuesPatch
      : previewPatch;
    if (pastePreview !== undefined) executionOptions.previewPatch = pastePreview;
    const result = paste(schema, getState(), payload, target, args.mode, executionOptions);
    if (!result.ok) return result;
    const patchResult = applyPreviewedPatch
      ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
      : ops.patch(result.patch);
    return patchResult.ok
      ? {
          ok: true,
          value: getState(),
          applied: getAppliedPatch?.() ?? result.patch,
        }
      : {
          ok: false,
          code: patchResult.code,
          reason: patchResult.reason ?? patchResult.code,
        };
  }
}

function clipboardWriteSources(
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

function isClipboardSchemaTrustedPayload(
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

function clipboardWritePayload(
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

function splitPasteOptions(options?: JSONDocumentPasteOptions):
  | { kind: "clipboard"; options?: PasteOptions }
  | { kind: "payload"; payload: unknown; options?: PasteOptions } {
  if (!options || !Object.prototype.hasOwnProperty.call(options, "payload")) {
    return options === undefined ? { kind: "clipboard" } : { kind: "clipboard", options };
  }
  const { payload, ...pasteOptions } = options;
  return Object.keys(pasteOptions).length === 0
    ? { kind: "payload", payload }
    : { kind: "payload", payload, options: pasteOptions };
}

function emptyCopySource(): CopyError {
  return {
    ok: false,
    code: "empty_selection",
    reason: "copy source selection is empty",
  };
}

function emptyCutSource(): CutError {
  return {
    ok: false,
    code: "empty_selection",
    reason: "cut source selection is empty",
  };
}
