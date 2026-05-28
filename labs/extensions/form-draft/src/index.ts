import type {
  JSONCapabilityResult,
  JSONDocument,
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

export interface FormDrafts<TDocument, TInput = unknown> {
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

interface StoredDraft<TInput> {
  pointer: Pointer;
  input: TInput;
}

export function createFormDraft<TDocument, TInput = unknown>(
  doc: JSONDocument<TDocument>,
  options: CreateFormDraftOptions<TInput> = {},
): FormDrafts<TDocument, TInput> {
  const parse = options.parse ?? identityParser<TInput>;
  const drafts = new Map<Pointer, StoredDraft<TInput>>();
  const listeners = new Set<FormDraftListener<TInput>>();
  let disposed = false;

  const emitSnapshot = (snapshot: FormDraftSnapshot<TInput>): void => {
    emit(listeners, snapshot);
  };

  return {
    current(path) {
      const draft = drafts.get(path);
      if (draft === undefined) return null;
      const snapshot = readSnapshot(doc, draft, parse);
      return snapshot.ok ? snapshot.snapshot : null;
    },
    currentAll(root = "") {
      const batch = readBatch(doc, drafts, parse, root);
      return batch.ok ? batch.snapshots.map(copySnapshot) : [];
    },
    set(path, input) {
      const readable = doc.at(path);
      if (!readable.ok) {
        return readError(readable.code, readable.pointer, readable.reason);
      }
      const draft: StoredDraft<TInput> = { pointer: readable.path, input: cloneJson(input) };
      drafts.set(readable.path, draft);
      const snapshot = readSnapshot(doc, draft, parse);
      if (!snapshot.ok) return snapshot;
      emitSnapshot(snapshot.snapshot);
      return { ok: true, snapshot: copySnapshot(snapshot.snapshot) };
    },
    canCommit(path) {
      const draft = drafts.get(path);
      if (draft === undefined) return missingDraft(path);
      const snapshot = readSnapshot(doc, draft, parse);
      if (!snapshot.ok) return snapshot;
      if (snapshot.snapshot.error !== null) return snapshot.snapshot.error;
      return snapshot.snapshot.capability ?? { ok: true };
    },
    commit(path) {
      const draft = drafts.get(path);
      if (draft === undefined) return missingDraft(path);
      const snapshot = readSnapshot(doc, draft, parse);
      if (!snapshot.ok) return snapshot;
      if (snapshot.snapshot.error !== null) return snapshot.snapshot.error;

      const result = doc.replace(path, cloneJson(snapshot.snapshot.parsed));
      if (!result.ok) return commitFailed(path, result);

      drafts.delete(path);
      const committed = readCommittedSnapshot(doc, path, draft.input);
      emitSnapshot(committed);
      return {
        ok: true,
        snapshot: committed,
        result,
      };
    },
    canCommitAll(root = "") {
      return canCommitBatch(doc, drafts, parse, root);
    },
    commitAll(root = "") {
      const change = canCommitBatch(doc, drafts, parse, root);
      if (!change.ok) return change;

      const result: JSONResult = change.operations.length === 0
        ? { ok: true }
        : doc.patch(change.operations);
      if (!result.ok) return commitFailed(root, result);

      const committed = change.snapshots.map((snapshot) => {
        drafts.delete(snapshot.pointer);
        return readCommittedSnapshot(doc, snapshot.pointer, snapshot.input);
      });
      for (const snapshot of committed) {
        emitSnapshot(snapshot);
      }

      return {
        ok: true,
        root,
        snapshots: committed.map(copySnapshot),
        operations: change.operations,
        result,
      };
    },
    reset(path) {
      const removed = drafts.delete(path);
      if (!removed) return false;
      const readable = doc.at(path);
      if (readable.ok) {
        emitSnapshot(readCommittedSnapshot(doc, readable.path, readable.value as TInput));
      }
      return true;
    },
    clear() {
      drafts.clear();
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      disposed = true;
      drafts.clear();
      listeners.clear();
    },
  };
}

function canCommitBatch<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  drafts: ReadonlyMap<Pointer, StoredDraft<TInput>>,
  parse: FormDraftParser<TInput>,
  root: Pointer,
): FormDraftBatchResult<TInput> {
  const batch = readBatch(doc, drafts, parse, root);
  if (!batch.ok) return batch;

  for (const snapshot of batch.snapshots) {
    if (snapshot.error !== null) return snapshot.error;
  }

  const operations = batch.snapshots
    .filter((snapshot) => snapshot.dirty)
    .map((snapshot): JSONPatchOperation => ({
      op: "replace",
      path: snapshot.pointer,
      value: cloneJson(snapshot.parsed),
    }));
  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError("commit_rejected", root, capability);
  }

  return {
    ok: true,
    root,
    snapshots: batch.snapshots.map(copySnapshot),
    operations,
  };
}

function readBatch<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  drafts: ReadonlyMap<Pointer, StoredDraft<TInput>>,
  parse: FormDraftParser<TInput>,
  root: Pointer,
): { ok: true; snapshots: ReadonlyArray<FormDraftSnapshot<TInput>> } | FormDraftError {
  const readable = doc.at(root);
  if (!readable.ok) return readError(readable.code, readable.pointer, readable.reason);

  const snapshots: FormDraftSnapshot<TInput>[] = [];
  for (const draft of [...drafts.values()].sort((left, right) => left.pointer.localeCompare(right.pointer))) {
    if (!isInScope(draft.pointer, readable.path)) continue;
    const snapshot = readSnapshot(doc, draft, parse);
    if (!snapshot.ok) return snapshot;
    snapshots.push(snapshot.snapshot);
  }

  return { ok: true, snapshots };
}

function readSnapshot<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  draft: StoredDraft<TInput>,
  parse: FormDraftParser<TInput>,
): { ok: true; snapshot: FormDraftSnapshot<TInput> } | FormDraftError {
  const readable = doc.at(draft.pointer);
  if (!readable.ok) return readError(readable.code, readable.pointer, readable.reason);

  const schema = doc.schema.kind(draft.pointer);
  const kind = schema.ok ? schema.kind : "unknown";
  const parsed = parse({
    path: readable.path,
    input: cloneJson(draft.input),
    currentValue: cloneJson(readable.value),
    kind,
  });
  if (!parsed.ok) {
    const error: FormDraftError = {
      ok: false,
      code: "parse_failed",
      reason: parsed.reason,
      pointer: readable.path,
    };
    return {
      ok: true,
      snapshot: snapshotFromParts({
        pointer: readable.path,
        input: draft.input,
        currentValue: readable.value,
        kind,
        parsed: null,
        error,
        capability: null,
      }),
    };
  }

  const accepted = doc.schema.accepts(readable.path, parsed.value);
  if (!accepted.ok) {
    const error = capabilityError("value_rejected", readable.path, accepted);
    return {
      ok: true,
      snapshot: snapshotFromParts({
        pointer: readable.path,
        input: draft.input,
        currentValue: readable.value,
        kind,
        parsed: parsed.value,
        error,
        capability: accepted,
      }),
    };
  }

  const capability = doc.canReplace(readable.path, parsed.value);
  const error = capability.ok ? null : capabilityError("commit_rejected", readable.path, capability);
  return {
    ok: true,
    snapshot: snapshotFromParts({
      pointer: readable.path,
      input: draft.input,
      currentValue: readable.value,
      kind,
      parsed: parsed.value,
      error,
      capability,
    }),
  };
}

function snapshotFromParts<TInput>(input: {
  pointer: Pointer;
  input: TInput;
  currentValue: unknown;
  kind: SchemaKind;
  parsed: unknown;
  error: FormDraftError | null;
  capability: JSONCapabilityResult | null;
}): FormDraftSnapshot<TInput> {
  return {
    pointer: input.pointer,
    input: cloneJson(input.input),
    currentValue: cloneJson(input.currentValue),
    kind: input.kind,
    parsed: cloneJson(input.parsed),
    valid: input.error === null,
    dirty: JSON.stringify(input.parsed) !== JSON.stringify(input.currentValue),
    error: input.error,
    capability: input.capability,
  };
}

function readCommittedSnapshot<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  input: TInput,
): FormDraftSnapshot<TInput> {
  const readable = doc.at(path);
  const currentValue = readable.ok ? readable.value : null;
  const kindResult = doc.schema.kind(path);
  return {
    pointer: path,
    input: cloneJson(input),
    currentValue: cloneJson(currentValue),
    kind: kindResult.ok ? kindResult.kind : "unknown",
    parsed: cloneJson(currentValue),
    valid: true,
    dirty: false,
    error: null,
    capability: { ok: true },
  };
}

function capabilityError(
  code: "value_rejected" | "commit_rejected",
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): FormDraftError {
  return {
    ok: false,
    code,
    reason: capability.reason ?? `${code}: ${pointer}`,
    pointer: capability.pointer ?? pointer,
    capability,
  };
}

function commitFailed(
  pointer: Pointer,
  result: Exclude<JSONResult | JSONCapabilityResult, { ok: true }>,
): FormDraftError {
  return {
    ok: false,
    code: "commit_failed",
    reason: result.reason ?? `commit failed: ${pointer}`,
    pointer: result.pointer ?? pointer,
    result,
  };
}

function missingDraft(pointer: Pointer): FormDraftError {
  return {
    ok: false,
    code: "missing_draft",
    reason: `draft not found: ${pointer}`,
    pointer,
  };
}

function readError(
  code: "invalid_pointer" | "path_not_found",
  pointer: Pointer,
  reason?: string,
): FormDraftError {
  return {
    ok: false,
    code,
    reason: reason ?? `field path not found: ${pointer}`,
    pointer,
  };
}

function isInScope(pointer: Pointer, root: Pointer): boolean {
  return root === "" || pointer === root || pointer.startsWith(`${root}/`);
}

function emit<TInput>(
  listeners: Set<FormDraftListener<TInput>>,
  snapshot: FormDraftSnapshot<TInput>,
): void {
  const event = copySnapshot(snapshot);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot<TInput>(
  snapshot: FormDraftSnapshot<TInput>,
): FormDraftSnapshot<TInput> {
  return {
    pointer: snapshot.pointer,
    input: cloneJson(snapshot.input),
    currentValue: cloneJson(snapshot.currentValue),
    kind: snapshot.kind,
    parsed: cloneJson(snapshot.parsed),
    valid: snapshot.valid,
    dirty: snapshot.dirty,
    error: snapshot.error,
    capability: snapshot.capability,
  };
}

function identityParser<TInput>(
  context: FormDraftParseContext<TInput>,
): FormDraftParseResult {
  return { ok: true, value: context.input };
}

function cloneJson<TValue>(value: TValue): TValue {
  const text = JSON.stringify(value);
  if (text === undefined) return undefined as TValue;
  return JSON.parse(text) as TValue;
}
