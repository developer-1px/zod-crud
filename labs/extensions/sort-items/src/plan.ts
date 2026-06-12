import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { CollectionReadResult, SortItemsChangeResult, SortItemsCompare, SortItemsError, SortItemsErrorCode } from "./types.js";

export function canSort<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  compare: SortItemsCompare<TValue>,
): SortItemsChangeResult<TValue> {
  const read = readCollection<TDocument, TValue>(doc, path);
  if (!read.ok) return read;

  const before = cloneJson(read.values);
  const planned = sortValues(read.path, cloneJson(read.values), compare);
  if (!planned.ok) return planned;

  return changeWithCapability(doc, read.path, before, planned.values);
}

export function canReverse<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
): SortItemsChangeResult<TValue> {
  const read = readCollection<TDocument, TValue>(doc, path);
  if (!read.ok) return read;
  return changeWithCapability(doc, read.path, read.values, [...read.values].reverse());
}

function readCollection<TDocument, TValue>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
): CollectionReadResult<TValue> {
  const read = doc.at(path);
  if (!read.ok) {
    return sortItemsError(
      read.code,
      read.reason ?? `collection path not found: ${path}`,
      read.pointer,
    );
  }
  if (!Array.isArray(read.value)) {
    return sortItemsError("not_collection", `path is not an array: ${path}`, path);
  }
  return {
    ok: true,
    path: read.path,
    values: cloneJson(read.value) as TValue[],
  };
}

function sortValues<TValue>(
  path: Pointer,
  values: TValue[],
  compare: SortItemsCompare<TValue>,
): { ok: true; values: TValue[] } | SortItemsError {
  try {
    const sorted = values
      .map((value, index) => ({
        pointer: path === "" ? `/${index}` : `${path}/${index}`,
        value,
        index,
      }))
      .sort((left, right) => {
        const ordered = compare(left, right);
        return ordered === 0 ? left.index - right.index : ordered;
      })
      .map((item) => item.value);
    return { ok: true, values: sorted };
  } catch (error) {
    return sortItemsError(
      "compare_failed",
      error instanceof Error ? error.message : "collection sort comparator failed",
      path,
    );
  }
}

function changeWithCapability<TDocument, TValue>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  before: ReadonlyArray<TValue>,
  after: ReadonlyArray<TValue>,
): SortItemsChangeResult<TValue> {
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  const operations = changed
    ? [{ op: "replace", path, value: cloneJson(after) } satisfies JSONPatchOperation]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `collection sort patch rejected for ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return {
    ok: true,
    path,
    count: after.length,
    changed,
    values: cloneJson(after) as TValue[],
    operations,
  };
}

function sortItemsError(
  code: SortItemsErrorCode,
  reason: string,
  pointer?: Pointer,
): SortItemsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
