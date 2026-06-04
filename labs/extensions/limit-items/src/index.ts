import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type LimitItemsErrorCode =
  | "invalid_pointer"
  | "invalid_max"
  | "path_not_found"
  | "not_array"
  | "patch_rejected"
  | "patch_failed";

export interface LimitItemsError {
  ok: false;
  code: LimitItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface LimitItemsOptions {
  /** Which end to keep when trimming. `"start"` keeps the first `max`, `"end"` keeps the last `max`. Default `"start"`. */
  from?: "start" | "end";
}

export interface LimitItemsChange<TValue = unknown> {
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

export type LimitItemsResult<TValue = unknown> = LimitItemsChange<TValue> | LimitItemsError;

export interface LimitItems<TDocument> {
  canLimitItems<TValue = unknown>(path: Pointer, max: number, options?: LimitItemsOptions): LimitItemsResult<TValue>;
  limitItems<TValue = unknown>(path: Pointer, max: number, options?: LimitItemsOptions): LimitItemsResult<TValue>;
}

export function createLimitItems<TDocument>(doc: JSONDocument<TDocument>): LimitItems<TDocument> {
  return {
    canLimitItems: (path, max, options) => canLimitItems(doc, path, max, options),
    limitItems: (path, max, options) => limitItems(doc, path, max, options),
  };
}

export function canLimitItems<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  max: number,
  options?: LimitItemsOptions,
): LimitItemsResult<TValue> {
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
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `limit patch rejected at ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
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

export function limitItems<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  max: number,
  options?: LimitItemsOptions,
): LimitItemsResult<TValue> {
  const change = canLimitItems<TDocument, TValue>(doc, path, max, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) {
    return {
      ok: false,
      code: "patch_failed",
      reason: patched.reason ?? `limit patch failed at ${path}`,
      patch: patched,
      ...(patched.pointer === undefined ? {} : { pointer: patched.pointer }),
    };
  }
  return change;
}

function error(code: LimitItemsErrorCode, reason: string, pointer?: Pointer): LimitItemsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
