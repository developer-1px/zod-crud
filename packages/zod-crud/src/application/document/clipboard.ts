import type * as z from "zod";

import { cloneTrustedJson, jsonSerializableError } from "../../foundation/json.js";
import type { ApplyResult, JSONPatchOperation, JSONResult } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
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
import { paste, resolvePasteArgs, type PasteDuMismatch, type PasteError, type PasteOptions, type PasteTarget } from "../../domain/verbs/paste.js";

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

interface ClipboardMutationOk<T> {
  ok: true;
  value: T;
  applied: ReadonlyArray<JSONPatchOperation>;
}

interface ClipboardCutOk<T> extends ClipboardMutationOk<T> {
  payload: unknown;
  source: Pointer;
  sources: ReadonlyArray<Pointer>;
}

type ClipboardCutResult<T> = ClipboardCutOk<T> | CutError;
type ClipboardPasteResult<T> = ClipboardMutationOk<T> | PasteError | PasteDuMismatch | ClipboardEmpty;

export interface ClipboardState<T> {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  readonly sources: ReadonlyArray<Pointer> | null;
  read(): ClipboardReadResult;
  write(payload: unknown, options?: ClipboardWriteOptions): JSONResult;
  clear(): void;

  copy(source?: ClipboardSource): CopyOk | CopyError;
  cut(source?: ClipboardSource): ClipboardCutResult<T>;
  paste(target?: PasteTarget, options?: PasteOptions): ClipboardPasteResult<T>;
  pastePayload(target: PasteTarget, payload: unknown, options?: PasteOptions): ClipboardPasteResult<T>;
}

interface ClipboardBuffer {
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
}

type ClipboardWriteSourcesResult =
  | { ok: true; sources: Pointer[] | null }
  | { ok: false; result: Exclude<JSONResult, { ok: true }> };

interface CreateClipboardOptions<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
  ops: JSONOps<z.output<S>>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
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

export function createClipboard<S extends z.ZodType>(
  args: CreateClipboardOptions<S>,
): ClipboardState<z.output<S>> {
  const {
    schema,
    getState,
    ops,
    previewPatch,
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
        payload: cloneTrustedJson(buffer.payload),
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
        payload: cloneTrustedJson(payload),
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
      const result = copy(getState(), resolved, { trusted: getStateJsonTrusted?.() === true });
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
      const result = cut(schema, getState(), resolved, {
        trusted: getStateJsonTrusted?.() === true,
        previewPatch,
      });
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
      return {
        ok: true,
        value: getState(),
        applied: getAppliedPatch?.() ?? result.patch,
        payload: result.payload,
        source: result.source,
        sources: result.sources,
      };
    },

    paste(target, options) {
      if (!buffer) return EMPTY_CLIPBOARD;
      return runPaste(buffer.payload, target, options, (buffer.sources?.length ?? 0) > 1);
    },

    pastePayload(target, payload, options) {
      return runPaste(payload, target, options, false);
    },
  };

  function runPaste(
    payload: unknown,
    targetOrSelectionTarget: PasteTarget | undefined,
    options: PasteOptions | undefined,
    spreadByDefault: boolean,
  ): ClipboardPasteResult<z.output<S>> {
    const args = resolvePasteArgs(targetOrSelectionTarget, options);
    const target = targetOrSelection(args.target);
    if (target === null) {
      return {
        ok: false,
        code: "empty_selection",
        message: "paste target selection is empty",
      };
    }
    const spread = args.options.spread ?? spreadByDefault;
    const result = paste(schema, getState(), payload, target, args.mode, {
      ...args.options,
      spread,
      previewPatch,
    });
    if (!result.ok) return result;
    const patchResult = ops.patch(result.patch);
    return patchResult.ok
      ? {
          ok: true,
          value: getState(),
          applied: getAppliedPatch?.() ?? result.patch,
        }
      : patchError(patchResult);
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
