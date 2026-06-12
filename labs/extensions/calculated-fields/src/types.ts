import type { JSONCapabilityResult, JSONDocument, JSONPatchOperation, JSONResult, Pointer, ReadResult } from "@interactive-os/json-document";

export type CalculatedFieldErrorCode =
  | "read_failed"
  | "compute_failed"
  | "value_rejected"
  | "patch_rejected"
  | "patch_failed";

export interface CalculatedFieldError {
  ok: false;
  code: CalculatedFieldErrorCode;
  reason: string;
  key?: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Extract<JSONResult, { ok: false }>;
}

export interface CalculatedFieldContext<TDocument> {
  key: string;
  path: Pointer;
  value: TDocument;
  doc: JSONDocument<TDocument>;
  at(path: Pointer): ReadResult;
}

export interface CalculatedFieldDefinition<TDocument> {
  key?: string;
  path: Pointer;
  compute(context: CalculatedFieldContext<TDocument>): unknown;
}

export interface CalculatedFieldChange {
  key: string;
  path: Pointer;
  current: unknown;
  computed: unknown;
  changed: boolean;
  operation: JSONPatchOperation | null;
}

export interface CalculatedFieldsChange {
  ok: true;
  changed: boolean;
  fields: ReadonlyArray<CalculatedFieldChange>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type CalculatedFieldsPlanResult =
  | CalculatedFieldsChange
  | CalculatedFieldError;

export type CalculatedFieldsSyncResult =
  | CalculatedFieldsChange
  | CalculatedFieldError;

export interface CalculatedFields<TDocument> {
  current(): CalculatedFieldsPlanResult;
  canSync(): CalculatedFieldsPlanResult;
  sync(): CalculatedFieldsSyncResult;
}
