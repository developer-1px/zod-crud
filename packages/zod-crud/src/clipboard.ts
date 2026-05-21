import type * as z from "zod";

import { cloneJson, jsonSerializableError } from "./core/json.js";
import type { JSONResult } from "./core/patch/index.js";
import type { Pointer } from "./core/pointer/index.js";
import { normalizePointerSources } from "./core/pointer/sourceSet.js";
import type { JSONOps } from "./jsonOps.js";
import type { SelectionSource } from "./core/selection/index.js";
import {
  copy,
  type ClipboardSource,
  type CopyError,
  type CopyOk,
} from "./verbs/copy.js";
import { cut, type CutError, type CutOk } from "./verbs/cut.js";
import { paste, resolvePasteArgs, type PasteDuMismatch, type PasteError, type PasteMode, type PasteOk, type PasteOptions } from "./verbs/paste.js";

interface ClipboardWriteOptions {
  source?: Pointer | null;
  sources?: ReadonlyArray<Pointer> | null;
}

interface ClipboardReadOk {
  ok: true;
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
}

interface ClipboardEmpty {
  ok: false;
  code: "empty_clipboard";
  message: string;
}

type ClipboardReadResult = ClipboardReadOk | ClipboardEmpty;
type ClipboardPasteResult<T> = PasteOk<T> | PasteError | PasteDuMismatch | ClipboardEmpty;

export interface ClipboardState<T> {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  readonly sources: ReadonlyArray<Pointer> | null;
  read(): ClipboardReadResult;
  write(payload: unknown, options?: ClipboardWriteOptions): JSONResult;
  clear(): void;

  copy(source?: ClipboardSource): CopyOk | CopyError;
  cut(source?: ClipboardSource): CutOk<T> | CutError;
  paste(
    targetOrMode?: Pointer | PasteMode,
    payloadOrModeOrOptions?: unknown,
    modeOrOptions?: PasteMode | PasteOptions,
    maybeOptions?: PasteOptions,
  ): ClipboardPasteResult<T>;
}

interface ClipboardBuffer {
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
}

type ClipboardWriteSourcesResult =
  | { ok: true; sources: Pointer[] | null }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

interface DirectPasteArgs {
  targetOrMode: Pointer | PasteMode | undefined;
  payload: unknown;
  modeOrOptions?: PasteMode;
  options?: PasteOptions;
}

interface CreateClipboardOptions<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
  ops: JSONOps<z.output<S>>;
  getSelectionSource?: () => SelectionSource | null;
  getSelectionTarget?: () => Pointer | null;
  onChange?: () => void;
}

const EMPTY_CLIPBOARD: ClipboardEmpty = {
  ok: false,
  code: "empty_clipboard",
  message: "clipboard is empty",
};

export function createClipboard<S extends z.ZodType>(
  args: CreateClipboardOptions<S>,
): ClipboardState<z.output<S>> {
  const { schema, getState, ops, getSelectionSource, getSelectionTarget, onChange } = args;
  let buffer: ClipboardBuffer | null = null;

  const setBuffer = (next: ClipboardBuffer | null): void => {
    buffer = next;
    onChange?.();
  };

  const patchError = (result: Exclude<JSONResult, { ok: true }>): PasteError => ({
    ok: false,
    code: result.code,
    message: result.reason ?? result.code,
  });
  const sourceOrSelection = (source?: ClipboardSource): ClipboardSource | null =>
    source ?? getSelectionSource?.() ?? null;
  const targetOrSelection = (target?: Pointer): Pointer | null =>
    target ?? getSelectionTarget?.() ?? null;
  const writeSources = (options: ClipboardWriteOptions): ClipboardWriteSourcesResult => {
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
  };

  return {
    get hasData() { return buffer !== null; },
    get source() { return buffer?.source ?? null; },
    get sources() { return buffer?.sources ? [...buffer.sources] : null; },

    read() {
      if (!buffer) return EMPTY_CLIPBOARD;
      return {
        ok: true,
        payload: cloneJson(buffer.payload),
        source: buffer.source,
        sources: buffer.sources ? [...buffer.sources] : null,
      };
    },

    write(payload, options = {}) {
      const reason = jsonSerializableError(payload);
      if (reason) return { ok: false, code: "not_serializable", reason };
      const writtenSources = writeSources(options);
      if (!writtenSources.ok) return writtenSources.result;
      const sources = writtenSources.sources;
      const source = sources?.[0] ?? null;
      setBuffer({
        payload: cloneJson(payload),
        source,
        sources,
      });
      return { ok: true };
    },

    clear() {
      setBuffer(null);
    },

    copy(source) {
      const resolved = sourceOrSelection(source);
      if (resolved === null) return emptyCopySource();
      const result = copy(getState(), resolved);
      if (result.ok) {
        setBuffer({
          payload: result.payload,
          source: result.source,
          sources: [...result.sources],
        });
      }
      return result;
    },

    cut(source) {
      const resolved = sourceOrSelection(source);
      if (resolved === null) return emptyCutSource();
      const result = cut(schema, getState(), resolved);
      if (!result.ok) return result;
      const patchResult = ops.patch(result.patch);
      if (!patchResult.ok) {
        return {
          ok: false,
          code: patchResult.code,
          message: patchResult.reason ?? patchResult.code,
          violations: [],
        };
      }
      setBuffer({
        payload: result.payload,
        source: result.source,
        sources: [...result.sources],
      });
      return result;
    },

    paste(targetOrMode, payloadOrModeOrOptions, modeOrOptions, maybeOptions) {
      const direct = resolveDirectPaste(targetOrMode, payloadOrModeOrOptions, modeOrOptions, maybeOptions);
      if (!direct && !buffer) return EMPTY_CLIPBOARD;
      const args = direct
        ? resolvePasteArgs(direct.targetOrMode, direct.modeOrOptions, direct.options)
        : resolvePasteArgs(
          targetOrMode,
          payloadOrModeOrOptions as PasteMode | PasteOptions | undefined,
          modeOrOptions as PasteOptions | undefined,
        );
      const target = targetOrSelection(args.target);
      if (target === null) {
        return {
          ok: false,
          code: "empty_selection",
          message: "paste target selection is empty",
        };
      }
      const spread = args.options.spread ?? (!direct && (buffer?.sources?.length ?? 0) > 1);
      const result = paste(schema, getState(), direct ? direct.payload : buffer!.payload, target, args.mode, {
        ...args.options,
        spread,
      });
      if (!result.ok) return result;
      const patchResult = ops.patch(result.patch);
      return patchResult.ok ? result : patchError(patchResult);
    },
  };
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

function resolveDirectPaste(
  targetOrMode: Pointer | PasteMode | undefined,
  payloadOrModeOrOptions: unknown,
  modeOrOptions?: PasteMode | PasteOptions,
  maybeOptions?: PasteOptions,
): DirectPasteArgs | null {
  if (payloadOrModeOrOptions === undefined || isPasteMode(payloadOrModeOrOptions)) return null;
  const resolved: DirectPasteArgs = {
    targetOrMode,
    payload: payloadOrModeOrOptions,
  };
  if (isPasteMode(modeOrOptions)) {
    resolved.modeOrOptions = modeOrOptions;
    if (maybeOptions !== undefined) resolved.options = maybeOptions;
    return resolved;
  }
  if (modeOrOptions !== undefined) resolved.options = modeOrOptions;
  return resolved;
}

function isPasteMode(value: unknown): value is PasteMode {
  return value === "before" || value === "after" || value === "into" || value === "replace";
}
