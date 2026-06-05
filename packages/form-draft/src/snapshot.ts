import type {
  JSONCapabilityResult,
  JSONDocument,
  Pointer,
  SchemaKind,
} from "zod-crud";

import {
  capabilityError,
  readError,
} from "./errors.js";
import {
  cloneJson,
  valueKind,
} from "./json.js";
import type {
  FormDraftError,
  FormDraftParser,
  FormDraftSnapshot,
  StoredDraft,
} from "./types.js";

export function readSnapshot<TDocument, TInput>(
  doc: JSONDocument<TDocument>,
  draft: StoredDraft<TInput>,
  parse: FormDraftParser<TInput>,
): { ok: true; snapshot: FormDraftSnapshot<TInput> } | FormDraftError {
  const readable = doc.at(draft.pointer);
  if (!readable.ok) return readError(readable.code, readable.pointer, readable.reason);

  const schema = doc.schema.kind(draft.pointer);
  const kind = schema.ok ? schema.kind : valueKind(readable.value);
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
  if (!accepted.ok && accepted.code !== "path_not_found") {
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
  const error = capability.ok
    ? null
    : capabilityError(
        capability.code === "schema_violation" ? "value_rejected" : "commit_rejected",
        readable.path,
        capability,
      );
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

export function readCommittedSnapshot<TDocument, TInput>(
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

export function copySnapshot<TInput>(
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
