import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation } from "../../../foundation/patch/types.js";
import type { Pointer } from "../../../foundation/pointer/index.js";
import type {
  SelectionCursorDirection,
  SelectionCursorOptions,
  SelectionScopeOptions,
  SelectionSource,
  SelectionSnap,
} from "../../../domain/selection/types.js";
import type { SelectionTextDeleteOptions } from "../../../domain/selection/textDelete.js";
import type { SelectionTextEditOptions } from "../../../domain/selection/textEdit.js";
import type { ClipboardSource } from "../../../domain/copy.js";
import type { DuplicateOpts } from "../../../domain/duplicate.js";
import type { PasteOptions, PasteTarget } from "../../../domain/paste.js";
import type { CapabilityResult } from "./result.js";
import type { HistoryTransactionOptions, JSONStateOps } from "../state/types.js";

export interface CapabilityPasteExecutionOptions {
  trustedPayload?: boolean;
}

export interface DocumentCapabilities {
  selectScope(options?: SelectionScopeOptions): CapabilityResult;
  moveCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CapabilityResult;
  extendCursor(direction: SelectionCursorDirection, options?: SelectionCursorOptions): CapabilityResult;
  find(jsonpath: string): CapabilityResult;
  move(fromOrTo: Pointer, to?: Pointer): CapabilityResult;
  duplicate(sourceOrOpts?: Pointer | DuplicateOpts, opts?: DuplicateOpts): CapabilityResult;
  remove(source?: SelectionSource): CapabilityResult;
  replace(pathOrValue: Pointer | unknown, value?: unknown): CapabilityResult;
  replaceText(replacement: string, options?: SelectionTextEditOptions & HistoryTransactionOptions): CapabilityResult;
  deleteText(options?: SelectionTextDeleteOptions & HistoryTransactionOptions): CapabilityResult;
  cut(source?: ClipboardSource): CapabilityResult;
  copy(source?: ClipboardSource): CapabilityResult;
  paste(
    payload: unknown,
    target?: PasteTarget,
    options?: PasteOptions,
    executionOptions?: CapabilityPasteExecutionOptions,
  ): CapabilityResult;
  patch(ops: ReadonlyArray<JSONPatchOperation>): CapabilityResult;

  readonly undo: CapabilityResult;
  readonly redo: CapabilityResult;
}

export interface CapabilityHistoryControls {
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface BuildDocumentCapabilitiesArgs<S extends z.ZodType> {
  schema: S;
  ops: JSONStateOps<z.output<S>>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  getStateJsonTrusted?: () => boolean;
  history: CapabilityHistoryControls;
  selectionRef?: { current: SelectionSnap };
}

export interface DocumentCapabilityContext<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection?: SelectionSnap;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  previewTrustedValuesPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
  stateJsonTrusted?: boolean;
}
