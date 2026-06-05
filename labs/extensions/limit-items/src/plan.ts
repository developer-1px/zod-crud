import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { LimitItemsError, LimitItemsErrorCode, LimitItemsOptions, LimitItemsResult } from "./types.js";

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

function error(code: LimitItemsErrorCode, reason: string, pointer?: Pointer): LimitItemsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
