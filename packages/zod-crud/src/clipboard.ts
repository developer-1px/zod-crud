import type * as z from "zod";

import { cloneJson, jsonSerializableError } from "./core/json.js";
import type { JSONResult } from "./core/patch/index.js";
import type { Pointer } from "./core/pointer/index.js";
import { schemaAtPointer } from "./core/schema/introspection.js";
import type { JSONDocumentOps } from "./jsonOps.js";
import {
  copy,
  toClipboardItems,
  type ClipboardSource,
  type ClipboardItemMap,
  type ClipboardItemOptions,
  type CopyError,
  type CopyOk,
} from "./verbs/copy.js";
import { cut, type CutError, type CutOk } from "./verbs/cut.js";
import { paste, type PasteDuMismatch, type PasteError, type PasteMode, type PasteOk } from "./verbs/paste.js";

export type { ClipboardSource } from "./verbs/copy.js";

export interface ClipboardWriteOptions {
  source?: Pointer | null;
  sources?: ReadonlyArray<Pointer> | null;
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
  readonly sources: ReadonlyArray<Pointer> | null;
  read(): ClipboardReadResult;
  write(payload: unknown, options?: ClipboardWriteOptions): JSONResult;
  clear(): void;

  copy(source: ClipboardSource): CopyOk | CopyError;
  cut(source: ClipboardSource): CutOk<T> | CutError;
  paste(target: Pointer, mode?: PasteMode): ClipboardPasteResult<T>;
  toItems(options?: ClipboardItemOptions): ClipboardItemMap;
}

interface ClipboardBuffer {
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
  schema: z.ZodType;
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
  const bufferSchema = (source: Pointer | null): z.ZodType =>
    source === null ? schema : (schemaAtPointer(schema, source) ?? schema);
  const writeSources = (options: ClipboardWriteOptions): Pointer[] | null => {
    const sources: Pointer[] = [];
    if (options.source !== undefined && options.source !== null) sources.push(options.source);
    for (const item of options.sources ?? []) {
      if (!sources.includes(item)) sources.push(item);
    }
    return sources.length > 0 ? sources : null;
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
      };
    },

    write(payload, options = {}) {
      const reason = jsonSerializableError(payload);
      if (reason) return { ok: false, code: "not_serializable", reason };
      const sources = writeSources(options);
      const source = sources?.[0] ?? null;
      setBuffer({
        payload: cloneJson(payload),
        source,
        sources,
        schema: bufferSchema(source),
      });
      return { ok: true };
    },

    clear() {
      setBuffer(null);
    },

    copy(source) {
      const result = copy(getState(), source);
      if (result.ok) {
        setBuffer({
          payload: result.payload,
          source: result.source,
          sources: [...result.sources],
          schema: bufferSchema(result.source),
        });
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
      setBuffer({
        payload: result.payload,
        source: result.source,
        sources: [...result.sources],
        schema: bufferSchema(result.source),
      });
      return result;
    },

    paste(target, mode = "into") {
      if (!buffer) return EMPTY_CLIPBOARD;
      const result = paste(schema, getState(), buffer.payload, target, mode, {
        spread: (buffer.sources?.length ?? 0) > 1,
      });
      if (!result.ok) return result;
      const patchResult = ops.patch(result.patch);
      return patchResult.ok ? result : patchError(patchResult);
    },

    toItems(options) {
      return buffer ? toClipboardItems(buffer.payload, buffer.schema, options) : {};
    },
  };
}
