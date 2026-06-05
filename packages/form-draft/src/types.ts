import type {
  JSONCapabilityResult,
  JSONPatchOperation,
  JSONResult,
  Pointer,
  SchemaKind,
} from "zod-crud";

export type FormDraftErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "missing_draft"
  | "parse_failed"
  | "value_rejected"
  | "commit_rejected"
  | "commit_failed";

export interface FormDraftError {
  ok: false;
  code: FormDraftErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult | JSONCapabilityResult, { ok: true }>;
}

export interface FormDraftParseContext<TInput = unknown> {
  path: Pointer;
  input: TInput;
  currentValue: unknown;
  kind: SchemaKind;
}

export type FormDraftParseResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

export type FormDraftParser<TInput = unknown> = (
  context: FormDraftParseContext<TInput>,
) => FormDraftParseResult;

export interface CreateFormDraftOptions<TInput = unknown> {
  parse?: FormDraftParser<TInput>;
}

export interface FormDraftSnapshot<TInput = unknown> {
  pointer: Pointer;
  input: TInput;
  currentValue: unknown;
  kind: SchemaKind;
  parsed: unknown;
  valid: boolean;
  dirty: boolean;
  error: FormDraftError | null;
  capability: JSONCapabilityResult | null;
}

export type FormDraftSetResult<TInput = unknown> =
  | { ok: true; snapshot: FormDraftSnapshot<TInput> }
  | FormDraftError;

export type FormDraftCommitResult<TInput = unknown> =
  | { ok: true; snapshot: FormDraftSnapshot<TInput>; result: JSONResult }
  | FormDraftError;

export interface FormDraftBatchChange<TInput = unknown> {
  ok: true;
  root: Pointer;
  snapshots: ReadonlyArray<FormDraftSnapshot<TInput>>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type FormDraftBatchResult<TInput = unknown> =
  | FormDraftBatchChange<TInput>
  | FormDraftError;

export type FormDraftBatchCommitResult<TInput = unknown> =
  | (FormDraftBatchChange<TInput> & { result: JSONResult })
  | FormDraftError;

export type FormDraftListener<TInput = unknown> = (snapshot: FormDraftSnapshot<TInput>) => void;

export interface FormDrafts<TInput = unknown> {
  current(path: Pointer): FormDraftSnapshot<TInput> | null;
  currentAll(root?: Pointer): ReadonlyArray<FormDraftSnapshot<TInput>>;
  set(path: Pointer, input: TInput): FormDraftSetResult<TInput>;
  canCommit(path: Pointer): JSONCapabilityResult | FormDraftError;
  commit(path: Pointer): FormDraftCommitResult<TInput>;
  canCommitAll(root?: Pointer): FormDraftBatchResult<TInput>;
  commitAll(root?: Pointer): FormDraftBatchCommitResult<TInput>;
  reset(path: Pointer): boolean;
  clear(): void;
  subscribe(listener: FormDraftListener<TInput>): () => void;
  dispose(): void;
}

export interface StoredDraft<TInput> {
  pointer: Pointer;
  input: TInput;
}
