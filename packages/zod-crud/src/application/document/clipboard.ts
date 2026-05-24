import type * as z from "zod";

import { cloneJsonSerializable, cloneTrustedPlainJson, jsonSerializableError } from "../../foundation/json.js";
import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import { readAt, tryParsePointer, type Pointer } from "../../foundation/json-pointer/index.js";
import { normalizePointerSources } from "../../foundation/json-pointer/sourceSet.js";
import type { JSONOps } from "./ops.js";
import type { SelectionSource } from "../../domain/selection/index.js";
import {
  copy,
  type ClipboardSource,
  type CopyError,
  type CopyOk,
} from "../../domain/verbs/copy.js";
import { cut, type CutError } from "../../domain/verbs/cut.js";
import { paste, rekeyProducesTrustedPayload, resolvePasteArgs, type PasteDuMismatch, type PasteError, type PasteOptions, type PasteTarget } from "../../domain/verbs/paste.js";

export const INTERNAL_CLIPBOARD_PEEK: unique symbol = Symbol("zod-crud.internal.clipboard.peek");

export interface ClipboardWriteOptions {
  source?: Pointer | null;
  sources?: ReadonlyArray<Pointer> | null;
  /** Skip JSON-serializability validation when the caller already owns that boundary. */
  trustedPayload?: boolean;
  /** Store the payload reference directly. Use only when the caller owns its immutability boundary. */
  clonePayload?: boolean;
}

export interface ClipboardReadOptions {
  /** Return the buffered payload reference directly. Use only when the caller owns its mutation boundary. */
  clonePayload?: boolean;
}

export interface ClipboardCopyOptions {
  /** Store and return the copied source reference directly. Use only when the caller owns its mutation boundary. */
  clonePayload?: boolean;
}

export interface ClipboardCutOptions {
  /** Store and return the cut source reference directly. Use only when the caller owns its mutation boundary. */
  clonePayload?: boolean;
}

export interface ClipboardReadOk {
  ok: true;
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
}

interface ClipboardPeekOk extends ClipboardReadOk {
  schemaTrusted: boolean;
}

export interface ClipboardEmpty {
  ok: false;
  code: "empty_clipboard";
  message: string;
}

export type ClipboardReadResult = ClipboardReadOk | ClipboardEmpty;
export type ClipboardPeekResult = ClipboardPeekOk | ClipboardEmpty;

export interface ClipboardMutationOk<T> {
  ok: true;
  value: T;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface ClipboardCutOk<T> extends ClipboardMutationOk<T> {
  payload: unknown;
  source: Pointer;
  sources: ReadonlyArray<Pointer>;
}

export type ClipboardCutResult<T> = ClipboardCutOk<T> | CutError;
export type ClipboardPasteResult<T> = ClipboardMutationOk<T> | PasteError | PasteDuMismatch | ClipboardEmpty;

export interface ClipboardState<T> {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  readonly sources: ReadonlyArray<Pointer> | null;
  read(options?: ClipboardReadOptions): ClipboardReadResult;
  write(payload: unknown, options?: ClipboardWriteOptions): JSONResult;
  clear(): void;

  copy(source?: ClipboardSource, options?: ClipboardCopyOptions): CopyOk | CopyError;
  cut(source?: ClipboardSource, options?: ClipboardCutOptions): ClipboardCutResult<T>;
  paste(target?: PasteTarget, options?: PasteOptions): ClipboardPasteResult<T>;
  pastePayload(target: PasteTarget, payload: unknown, options?: PasteOptions): ClipboardPasteResult<T>;
}

interface InternalClipboardState<T> extends ClipboardState<T> {
  [INTERNAL_CLIPBOARD_PEEK](): ClipboardPeekResult;
}

export interface ClipboardBuffer {
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
  schemaTrusted: boolean;
}

export type ClipboardWriteSourcesResult =
  | { ok: true; sources: Pointer[] | null }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

export type ClipboardWritePayloadPlan =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

export interface ClipboardCutPlanContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source: ClipboardSource;
  stateJsonTrusted?: boolean;
  clonePayload?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface ClipboardPastePlanContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  payload: unknown;
  target?: PasteTarget;
  selectionTarget?: Pointer | null;
  options?: PasteOptions;
  spreadByDefault?: boolean;
  trustedPayload?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface ClipboardCopyPlanContext {
  state: unknown;
  source: ClipboardSource;
  stateJsonTrusted?: boolean;
  clonePayload?: boolean;
}

export interface ClipboardPasteApplyResultInput<T> {
  result: JSONResult;
  state: T;
  applied: ReadonlyArray<JSONPatchOperation>;
}

export interface ClipboardCutApplyResultInput<T> {
  result: JSONResult;
  state: T;
  applied: ReadonlyArray<JSONPatchOperation>;
  payload: unknown;
  source: Pointer;
  sources: ReadonlyArray<Pointer>;
}

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

export interface ClipboardSchemaTrustedSourceBufferInput {
  payload: unknown;
  source: Pointer;
  sources: ReadonlyArray<Pointer>;
}

export type ClipboardWriteBufferPlan =
  | { ok: true; buffer: ClipboardBuffer }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

export type ClipboardCutPlanResult<T> =
  | {
      ok: true;
      next: T;
      patch: JSONPatchOperation[];
      applied: ReadonlyArray<JSONPatchOperation>;
      payload: unknown;
      source: Pointer;
      sources: ReadonlyArray<Pointer>;
    }
  | CutError;

export type ClipboardPastePlanResult<T> =
  | {
      ok: true;
      next: T;
      patch: JSONPatchOperation[];
      applied: ReadonlyArray<JSONPatchOperation>;
    }
  | PasteError
  | PasteDuMismatch;

interface CreateClipboardOptions<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
  ops: JSONOps<z.output<S>>;
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

const EMPTY_CLIPBOARD: ClipboardEmpty = {
  ok: false,
  code: "empty_clipboard",
  message: "clipboard is empty",
};

export function planClipboardCopy(
  context: ClipboardCopyPlanContext,
): CopyOk | CopyError {
  const copyOptions: { trusted: boolean; clonePayload?: boolean } = {
    trusted: context.stateJsonTrusted === true,
  };
  if (context.clonePayload !== undefined) copyOptions.clonePayload = context.clonePayload;
  return copy(context.state, context.source, copyOptions);
}

export function planClipboardCut<S extends z.ZodType>(
  context: ClipboardCutPlanContext<S>,
): ClipboardCutPlanResult<z.output<S>> {
  const cutOptions: {
    trusted: boolean;
    clonePayload?: boolean;
    previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  } = {
    trusted: context.stateJsonTrusted === true,
  };
  if (context.clonePayload !== undefined) cutOptions.clonePayload = context.clonePayload;
  if (context.previewPatch !== undefined) cutOptions.previewPatch = context.previewPatch;
  return cut(context.schema, context.state, context.source, cutOptions);
}

export function planClipboardPaste<S extends z.ZodType>(
  context: ClipboardPastePlanContext<S>,
): ClipboardPastePlanResult<z.output<S>> {
  const args = resolvePasteArgs(context.target, context.options);
  const target = args.target ?? context.selectionTarget ?? null;
  if (target === null) {
    return {
      ok: false,
      code: "empty_selection",
      message: "paste target selection is empty",
    };
  }
  const spread = args.options.spread ?? context.spreadByDefault ?? false;
  const inputTrustedPayload = context.trustedPayload === true
    || args.options.trustedPayload === true;
  const patchValuesTrusted = inputTrustedPayload || rekeyProducesTrustedPayload(args.options);
  const pastePreview = patchValuesTrusted && context.previewTrustedValuesPatch
    ? context.previewTrustedValuesPatch
    : context.previewPatch;
  return paste(context.schema, context.state, context.payload, target, args.mode, {
    ...args.options,
    spread,
    previewPatch: pastePreview,
    trustedPayload: inputTrustedPayload,
  });
}

export function planClipboardPasteApplyResult<T>(
  input: ClipboardPasteApplyResultInput<T>,
): ClipboardMutationOk<T> | PasteError {
  if (input.result.ok) {
    return {
      ok: true,
      value: input.state,
      applied: input.applied,
    };
  }
  return {
    ok: false,
    code: input.result.code,
    message: input.result.reason ?? input.result.code,
  };
}

export function planClipboardCutApplyResult<T>(
  input: ClipboardCutApplyResultInput<T>,
): ClipboardCutResult<T> {
  if (!input.result.ok) {
    return {
      ok: false,
      code: input.result.code,
      message: input.result.reason ?? input.result.code,
      violations: [],
    };
  }
  return {
    ok: true,
    value: input.state,
    applied: input.applied,
    payload: input.payload,
    source: input.source,
    sources: input.sources,
  };
}

export function planClipboardSchemaTrustedSourceBuffer(
  input: ClipboardSchemaTrustedSourceBufferInput,
): ClipboardBuffer {
  return {
    payload: input.payload,
    source: input.source,
    sources: [...input.sources],
    schemaTrusted: true,
  };
}

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

  const sourceOrSelection = (source?: ClipboardSource): ClipboardSource | null =>
    source ?? getSelectionSource?.() ?? null;
  const targetOrSelection = (target?: Pointer): Pointer | null =>
    target ?? getSelectionTarget?.() ?? null;

  return {
    get hasData() { return buffer !== null; },
    get source() { return buffer?.source ?? null; },
    get sources() { return buffer?.sources ? [...buffer.sources] : null; },

    read(options = {}) {
      return planClipboardReadBuffer(buffer, options);
    },

    [INTERNAL_CLIPBOARD_PEEK]() {
      return planClipboardPeekBuffer(buffer);
    },

    write(payload, options = {}) {
      const plan = planClipboardWriteBuffer({
        state: getState(),
        stateJsonTrusted: getStateJsonTrusted?.() === true,
        payload,
        options,
      });
      if (!plan.ok) return plan.result;
      setBuffer(plan.buffer);
      return { ok: true };
    },

    clear() {
      setBuffer(null);
    },

    copy(source, options = {}) {
      const resolved = sourceOrSelection(source);
      if (resolved === null) return emptyCopySource();
      const result = planClipboardCopy({
        state: getState(),
        source: resolved,
        stateJsonTrusted: getStateJsonTrusted?.() === true,
        ...(options.clonePayload !== undefined ? { clonePayload: options.clonePayload } : {}),
      });
      if (result.ok) {
        setBuffer(planClipboardSchemaTrustedSourceBuffer(result));
      }
      return result;
    },

    cut(source, options = {}) {
      const resolved = sourceOrSelection(source);
      if (resolved === null) return emptyCutSource();
      const result = planClipboardCut({
        schema,
        state: getState(),
        source: resolved,
        stateJsonTrusted: getStateJsonTrusted?.() === true,
        ...(options.clonePayload !== undefined ? { clonePayload: options.clonePayload } : {}),
        ...(previewPatch !== undefined ? { previewPatch } : {}),
      });
      if (!result.ok) return result;
      const patchResult = applyPreviewedPatch
        ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
        : ops.patch(result.patch);
      const applyResult = planClipboardCutApplyResult({
        result: patchResult,
        state: getState(),
        applied: getAppliedPatch?.() ?? result.patch,
        payload: result.payload,
        source: result.source,
        sources: result.sources,
      });
      if (applyResult.ok) {
        setBuffer(planClipboardSchemaTrustedSourceBuffer(applyResult));
      }
      return applyResult;
    },

    paste(target, options) {
      if (!buffer) return EMPTY_CLIPBOARD;
      return runPaste(buffer.payload, target, options, (buffer.sources?.length ?? 0) > 1, true);
    },

    pastePayload(target, payload, options) {
      return runPaste(payload, target, options, false, false);
    },
  };

  function runPaste(
    payload: unknown,
    targetOrSelectionTarget: PasteTarget | undefined,
    options: PasteOptions | undefined,
    spreadByDefault: boolean,
    trustedPayload: boolean,
  ): ClipboardPasteResult<z.output<S>> {
    const result = planClipboardPaste({
      schema,
      state: getState(),
      payload,
      selectionTarget: getSelectionTarget?.() ?? null,
      spreadByDefault,
      trustedPayload,
      ...(targetOrSelectionTarget !== undefined ? { target: targetOrSelectionTarget } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(previewPatch !== undefined ? { previewPatch } : {}),
      ...(previewTrustedValuesPatch !== undefined ? { previewTrustedValuesPatch } : {}),
    });
    if (!result.ok) return result;
    const patchResult = applyPreviewedPatch
      ? applyPreviewedPatch(result.next as z.output<S>, result.patch, result.applied)
      : ops.patch(result.patch);
    return planClipboardPasteApplyResult({
      result: patchResult,
      state: getState(),
      applied: getAppliedPatch?.() ?? result.patch,
    });
  }
}

function emptyCopySource(): CopyError {
  return {
    ok: false,
    code: "empty_selection",
    message: "copy source selection is empty",
  };
}

function emptyCutSource(): CutError {
  return {
    ok: false,
    code: "empty_selection",
    message: "cut source selection is empty",
  };
}
