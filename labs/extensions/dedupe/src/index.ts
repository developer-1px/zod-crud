import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type DedupeErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_array"
  | "key_failed"
  | "patch_rejected"
  | "patch_failed";

export interface DedupeError {
  ok: false;
  code: DedupeErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

/** Host policy: the equality key for an item. Default is whole-value JSON. */
export type DedupeKeyOf<TValue = unknown> = (item: TValue, index: number) => unknown;

export interface DedupeOptions<TValue = unknown> {
  keyOf?: DedupeKeyOf<TValue>;
}

export interface DedupeChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  /** Item count before dedupe. */
  count: number;
  /** Number of duplicate items removed. */
  removed: number;
  /** Original indices that were removed (ascending). */
  removedIndices: ReadonlyArray<number>;
  changed: boolean;
  /** The deduped array (first occurrence of each key kept, in order). */
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type DedupeResult<TValue = unknown> = DedupeChange<TValue> | DedupeError;

export interface Dedupe<TDocument> {
  canDedupe<TValue = unknown>(path: Pointer, options?: DedupeOptions<TValue>): DedupeResult<TValue>;
  dedupe<TValue = unknown>(path: Pointer, options?: DedupeOptions<TValue>): DedupeResult<TValue>;
}

export function createDedupe<TDocument>(doc: JSONDocument<TDocument>): Dedupe<TDocument> {
  return {
    canDedupe: (path, options) => canDedupe(doc, path, options),
    dedupe: (path, options) => dedupe(doc, path, options),
  };
}

export function canDedupe<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: DedupeOptions<TValue>,
): DedupeResult<TValue> {
  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `dedupe path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `dedupe path is not an array: ${path}`, path);
  }
  const items = read.value as TValue[];
  const keyOf = options?.keyOf;

  const seen = new Set<string>();
  const kept: TValue[] = [];
  const removedIndices: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as TValue;
    let key: unknown;
    try {
      key = keyOf ? keyOf(item, index) : item;
    } catch (cause) {
      return error("key_failed", cause instanceof Error ? cause.message : "dedupe keyOf threw.", path);
    }
    const fingerprint = JSON.stringify(key ?? null);
    if (seen.has(fingerprint)) {
      removedIndices.push(index);
      continue;
    }
    seen.add(fingerprint);
    kept.push(item);
  }

  const changed = removedIndices.length > 0;
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path, value: cloneJson(kept) }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(path, capability);
  }

  return {
    ok: true,
    path,
    count: items.length,
    removed: removedIndices.length,
    removedIndices,
    changed,
    values: cloneJson(kept),
    operations,
  };
}

export function dedupe<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: DedupeOptions<TValue>,
): DedupeResult<TValue> {
  const change = canDedupe(doc, path, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): DedupeError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `dedupe patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): DedupeError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `dedupe patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: DedupeErrorCode, reason: string, pointer?: Pointer): DedupeError {
  const result: DedupeError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
