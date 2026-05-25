import type { ClipboardSource, CopyError, CopyOk } from "../../../domain/verbs/copy.js";
import type { CutError } from "../../../domain/verbs/cut.js";
import type { PasteDuMismatch, PasteError, PasteOptions, PasteTarget } from "../../../domain/verbs/paste.js";
import type { JSONPatchOperation, JSONResult } from "../../../foundation/json-patch/types.js";
import type { Pointer } from "../../../foundation/json-pointer/pointerCore.js";

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

export interface ClipboardBuffer {
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
  schemaTrusted: boolean;
}
