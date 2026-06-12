import type {
  ClipboardSource as DomainClipboardSource,
  CopyError as DomainCopyError,
  CopyOk as DomainCopyOk,
} from "../../../domain/clipboard/copy.js";
import type { CutError as DomainCutError } from "../../../domain/clipboard/cut.js";
import type {
  PasteDiscriminatorMismatch as DomainPasteDiscriminatorMismatch,
  PasteError as DomainPasteError,
  PasteOptions,
  PasteTarget,
} from "../../../domain/clipboard/paste.js";
import type { JSONPatchOperation, JSONResult } from "../../../foundation/patch/contract.js";
import type { Pointer } from "../../../foundation/pointer/index.js";

export interface JSONDocumentPasteOptions extends PasteOptions {
  /**
   * Paste this payload directly instead of reading the document clipboard buffer.
   * Use this for external clipboard, drag/drop, and extension-provided payloads.
   */
  payload?: unknown;
}

export type JSONDocumentPasteTarget = PasteTarget;

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

export type ClipboardSource = DomainClipboardSource;
export type ClipboardCopyOk = DomainCopyOk;
export type ClipboardCopyError = DomainCopyError;
export type ClipboardCopyResult = ClipboardCopyOk | ClipboardCopyError;

export interface ClipboardReadOk {
  ok: true;
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
}

export interface ClipboardEmpty {
  ok: false;
  code: "empty_clipboard";
  reason: string;
}

export type ClipboardReadResult = ClipboardReadOk | ClipboardEmpty;

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

export type ClipboardCutError = DomainCutError;
export type ClipboardCutResult<T> = ClipboardCutOk<T> | ClipboardCutError;
export type ClipboardPasteError = DomainPasteError;
export type ClipboardPasteDiscriminatorMismatch = DomainPasteDiscriminatorMismatch;
export type ClipboardPasteResult<T> =
  | ClipboardMutationOk<T>
  | ClipboardPasteError
  | ClipboardPasteDiscriminatorMismatch
  | ClipboardEmpty;

export interface ClipboardState<T> {
  readonly hasData: boolean;
  readonly source: Pointer | null;
  readonly sources: ReadonlyArray<Pointer> | null;
  read(options?: ClipboardReadOptions): ClipboardReadResult;
  write(payload: unknown, options?: ClipboardWriteOptions): JSONResult;
  clear(): void;

  copy(source?: ClipboardSource, options?: ClipboardCopyOptions): ClipboardCopyResult;
  cut(source?: ClipboardSource, options?: ClipboardCutOptions): ClipboardCutResult<T>;
  paste(target?: JSONDocumentPasteTarget, options?: JSONDocumentPasteOptions): ClipboardPasteResult<T>;
}

export interface ClipboardBuffer {
  payload: unknown;
  source: Pointer | null;
  sources: ReadonlyArray<Pointer> | null;
  schemaTrusted: boolean;
}
