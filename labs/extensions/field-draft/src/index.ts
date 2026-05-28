import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONResult,
  Pointer,
  SchemaKind,
} from "zod-crud";

export type FieldDraftErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "missing_draft"
  | "parse_failed"
  | "value_rejected"
  | "commit_rejected"
  | "commit_failed";

export interface FieldDraftError {
  ok: false;
  code: FieldDraftErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  result?: Exclude<JSONResult | JSONCapabilityResult, { ok: true }>;
}

export interface FieldDraftParseContext<TInput = unknown> {
  path: Pointer;
  input: TInput;
  currentValue: unknown;
  kind: SchemaKind;
}

export type FieldDraftParseResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

export type FieldDraftParser<TInput = unknown> = (
  context: FieldDraftParseContext<TInput>,
) => FieldDraftParseResult;

export interface CreateFieldDraftOptions<TInput = unknown> {
  parse?: FieldDraftParser<TInput>;
}

export interface FieldDraftSnapshot<TInput = unknown> {
  pointer: Pointer;
  input: TInput;
  currentValue: unknown;
  kind: SchemaKind;
  parsed: unknown;
  valid: boolean;
  dirty: boolean;
  error: FieldDraftError | null;
  capability: JSONCapabilityResult | null;
}

export type FieldDraftSetResult<TInput = unknown> =
  | { ok: true; snapshot: FieldDraftSnapshot<TInput> }
  | FieldDraftError;

export type FieldDraftCommitResult<TInput = unknown> =
  | { ok: true; snapshot: FieldDraftSnapshot<TInput>; result: JSONResult }
  | FieldDraftError;

export type FieldDraftListener<TInput = unknown> = (snapshot: FieldDraftSnapshot<TInput>) => void;

export interface FieldDrafts<TDocument, TInput = unknown> {
  current(path: Pointer): FieldDraftSnapshot<TInput> | null;
  set(path: Pointer, input: TInput): FieldDraftSetResult<TInput>;
  canCommit(path: Pointer): JSONCapabilityResult | FieldDraftError;
  commit(path: Pointer): FieldDraftCommitResult<TInput>;
  reset(path: Pointer): boolean;
  clear(): void;
  subscribe(listener: FieldDraftListener<TInput>): () => void;
  dispose(): void;
}

interface StoredDraft<TInput> {
  pointer: Pointer;
  input: TInput;
}

export function createFieldDraft<TDocument, TInput = unknown>(
  doc: JSONDocument<TDocument>,
  options: CreateFieldDraftOptions<TInput> = {},
): FieldDrafts<TDocument, TInput> {
  const parse = options.parse ?? identityParser<TInput>;
  const drafts = new Map<Pointer, StoredDraft<TInput>>();
  const listeners = new Set<FieldDraftListener<TInput>>();
  let disposed = false;

  const emitSnapshot = (snapshot: FieldDraftSnapshot<TInput>): void => {
    emit(listeners, snapshot);
  };

  return {
    current(path) {
      const draft = drafts.get(path);
      if (draft === undefined) return null;
      const snapshot = readSnapshot(doc, draft, parse);
      return snapshot.ok ? snapshot.snapshot : null;
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

function readSnapshot<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  draft: StoredDraft<TInput>,
  parse: FieldDraftParser<TInput>,
): { ok: true; snapshot: FieldDraftSnapshot<TInput> } | FieldDraftError {
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
    const error: FieldDraftError = {
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
  error: FieldDraftError | null;
  capability: JSONCapabilityResult | null;
}): FieldDraftSnapshot<TInput> {
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
): FieldDraftSnapshot<TInput> {
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
): FieldDraftError {
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
): FieldDraftError {
  return {
    ok: false,
    code: "commit_failed",
    reason: result.reason ?? `commit failed: ${pointer}`,
    pointer: result.pointer ?? pointer,
    result,
  };
}

function missingDraft(pointer: Pointer): FieldDraftError {
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
): FieldDraftError {
  return {
    ok: false,
    code,
    reason: reason ?? `field path not found: ${pointer}`,
    pointer,
  };
}

function emit<TInput>(
  listeners: Set<FieldDraftListener<TInput>>,
  snapshot: FieldDraftSnapshot<TInput>,
): void {
  const event = copySnapshot(snapshot);
  for (const listener of [...listeners]) {
    listener(event);
  }
}

function copySnapshot<TInput>(
  snapshot: FieldDraftSnapshot<TInput>,
): FieldDraftSnapshot<TInput> {
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
  context: FieldDraftParseContext<TInput>,
): FieldDraftParseResult {
  return { ok: true, value: context.input };
}

function cloneJson<TValue>(value: TValue): TValue {
  const text = JSON.stringify(value);
  if (text === undefined) return undefined as TValue;
  return JSON.parse(text) as TValue;
}
