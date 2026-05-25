import type * as z from "zod";

import type { ApplyResult, JSONPatchOperation } from "../../foundation/json-patch/index.js";
import type { Pointer } from "../../foundation/json-pointer/index.js";
import type { SelectionSource, SelectionSnap } from "../../domain/selection/index.js";
import type { SelectionTextDeleteOptions } from "../../domain/selection/textDelete.js";
import type { SelectionTextEditOptions } from "../../domain/selection/textEdit.js";
import type { DuplicateOpts } from "../../domain/verbs/duplicate.js";
import type { HistoryTransactionOptions } from "./stateOps.js";

export interface PlanDocumentPatchCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  operations: ReadonlyArray<JSONPatchOperation>;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentRemoveCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: SelectionSource;
  selectionSource?: SelectionSource | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentReplaceCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  value: unknown;
  target?: Pointer;
  selectionTarget?: Pointer | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentReplaceArgsInput {
  pathOrValue: Pointer | unknown;
  value: unknown;
  hasValueArg: boolean;
}

export type DocumentReplaceArgsPlan = { target?: Pointer; value: unknown };

export interface PlanDocumentReplaceTextCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection: SelectionSnap;
  replacement: string;
  options?: SelectionTextEditOptions & HistoryTransactionOptions;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentDeleteTextCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  selection: SelectionSnap;
  options?: SelectionTextDeleteOptions & HistoryTransactionOptions;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentMoveCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  target: Pointer;
  source?: Pointer;
  selectionSource?: Pointer | null;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}

export interface PlanDocumentDuplicateCapabilityInput<S extends z.ZodType> {
  schema: S;
  state: z.output<S>;
  source?: Pointer;
  selectionSource?: Pointer | null;
  options?: DuplicateOpts;
  stateJsonTrusted?: boolean;
  previewPatch?: (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<S>;
}
