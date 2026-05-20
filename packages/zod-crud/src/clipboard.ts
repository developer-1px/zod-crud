import type * as z from "zod";

import { cloneJson, jsonSerializableError } from "./core/json.js";
import type { JSONResult } from "./core/patch/index.js";
import type { Pointer } from "./core/pointer/index.js";
import type { JSONDocumentOps } from "./jsonOps.js";
import {
  copy,
  toClipboardItems,
  type ClipboardItemMap,
  type ClipboardItemOptions,
  type CopyError,
  type CopyOk,
} from "./verbs/copy.js";
import { cut, type CutError, type CutOk } from "./verbs/cut.js";
import { paste, type PasteDuMismatch, type PasteError, type PasteMode, type PasteOk } from "./verbs/paste.js";

export interface ClipboardWriteOptions {
  source?: Pointer | null;
}

export interface ClipboardReadOk {
  ok: true;
  payload: unknown;
  source: Pointer | null;
}

export interface ClipboardEmpty {
  ok: false;
  code: "empty_clipboard";
  message: string;
}

export type ClipboardReadResult = ClipboardReadOk | ClipboardEmpty;
export type ClipboardPasteResult<T> = PasteOk<T> | PasteError | PasteDuMismatch | ClipboardEmpty;

export interface ClipboardState<T> {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  read(): ClipboardReadResult;
  write(payload: unknown, options?: ClipboardWriteOptions): JSONResult;
  clear(): void;

  copy(source: Pointer): CopyOk | CopyError;
  cut(source: Pointer): CutOk<T> | CutError;
  paste(target: Pointer, mode?: PasteMode): ClipboardPasteResult<T>;
  toItems(options?: ClipboardItemOptions): ClipboardItemMap;
}

interface ClipboardBuffer {
  payload: unknown;
  source: Pointer | null;
}

interface CreateClipboardStateArgs<S extends z.ZodType> {
  schema: S;
  getState(): z.output<S>;
  ops: JSONDocumentOps<z.output<S>>;
  onChange?: () => void;
}

const EMPTY_CLIPBOARD: ClipboardEmpty = {
  ok: false,
  code: "empty_clipboard",
  message: "clipboard is empty",
};

export function createClipboardState<S extends z.ZodType>(
  args: CreateClipboardStateArgs<S>,
): ClipboardState<z.output<S>> {
  const { schema, getState, ops, onChange } = args;
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

  return {
    get hasData() { return buffer !== null; },
    get source() { return buffer?.source ?? null; },

    read() {
      if (!buffer) return EMPTY_CLIPBOARD;
      return {
        ok: true,
        payload: cloneJson(buffer.payload),
        source: buffer.source,
      };
    },

    write(payload, options = {}) {
      const reason = jsonSerializableError(payload);
      if (reason) return { ok: false, code: "not_serializable", reason };
      setBuffer({
        payload: cloneJson(payload),
        source: options.source ?? null,
      });
      return { ok: true };
    },

    clear() {
      setBuffer(null);
    },

    copy(source) {
      const result = copy(getState(), source);
      if (result.ok) {
        setBuffer({ payload: result.payload, source: result.source });
      }
      return result;
    },

    cut(source) {
      const result = cut(schema, getState(), source);
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
      setBuffer({ payload: result.payload, source: result.source });
      return result;
    },

    paste(target, mode = "into") {
      if (!buffer) return EMPTY_CLIPBOARD;
      const result = paste(schema, getState(), buffer.payload, target, mode);
      if (!result.ok) return result;
      const patchResult = ops.patch(result.patch);
      return patchResult.ok ? result : patchError(patchResult);
    },

    toItems(options) {
      return buffer ? toClipboardItems(buffer.payload, schema, options) : {};
    },
  };
}
