import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { DedupeError, DedupeErrorCode, DedupeOptions, DedupeResult } from "./types.js";

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
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `dedupe patch rejected at ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
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

function error(code: DedupeErrorCode, reason: string, pointer?: Pointer): DedupeError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
