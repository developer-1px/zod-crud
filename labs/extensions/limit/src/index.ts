import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type LimitErrorCode =
  | "invalid_pointer"
  | "invalid_max"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface LimitError {
  ok: false;
  code: LimitErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface LimitOptions {
  /** Which end to keep when trimming. `"start"` keeps the first `max`, `"end"` keeps the last `max`. Default `"start"`. */
  from?: "start" | "end";
}

export interface LimitChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  /** Item count before. */
  count: number;
  /** Number of items dropped. */
  removed: number;
  changed: boolean;
  /** The kept items, in order. */
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type LimitResult<TValue = unknown> = LimitChange<TValue> | LimitError;

export interface Limit<TDocument> {
  canLimit<TValue = unknown>(path: Pointer, max: number, options?: LimitOptions): LimitResult<TValue>;
  limit<TValue = unknown>(path: Pointer, max: number, options?: LimitOptions): LimitResult<TValue>;
}

export function createLimit<TDocument>(doc: JSONDocument<TDocument>): Limit<TDocument> {
  return {
    canLimit(path, max, options) {
      return canLimit(doc, path, max, options);
    },
    limit(path, max, options) {
      return limit(doc, path, max, options);
    },
  };
}

export function canLimit<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  max: number,
  options?: LimitOptions,
): LimitResult<TValue> {
  if (!Number.isInteger(max) || max < 0) {
    return error("invalid_max", `max must be a non-negative integer, got ${max}`, path);
  }

  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `limit path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `limit path is not an array: ${path}`, path);
  }
  const items = read.value as TValue[];

  const kept = items.length <= max
    ? items
    : options?.from === "end"
      ? items.slice(items.length - max)
      : items.slice(0, max);

  const changed = kept.length !== items.length;
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
    removed: items.length - kept.length,
    changed,
    values: cloneJson(kept),
    operations,
  };
}

export function limit<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  max: number,
  options?: LimitOptions,
): LimitResult<TValue> {
  const change = canLimit<TDocument, TValue>(doc, path, max, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): LimitError {
  const result: LimitError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `limit patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): LimitError {
  const result: LimitError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `limit patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: LimitErrorCode, reason: string, pointer?: Pointer): LimitError {
  const result: LimitError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
