import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type SortItemsErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_collection"
  | "compare_failed"
  | "patch_rejected"
  | "patch_failed";

export interface SortItemsError {
  ok: false;
  code: SortItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SortItemsItem<TValue = unknown> {
  pointer: Pointer;
  value: TValue;
  index: number;
}

export type SortItemsCompare<TValue = unknown> = (
  left: SortItemsItem<TValue>,
  right: SortItemsItem<TValue>,
) => number;

export interface SortItemsChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  count: number;
  changed: boolean;
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SortItemsChangeResult<TValue = unknown> =
  | SortItemsChange<TValue>
  | SortItemsError;

export type SortItemsResult<TValue = unknown> =
  | SortItemsChange<TValue>
  | SortItemsError;

export interface SortItems<TDocument> {
  canSort<TValue = unknown>(
    path: Pointer,
    compare: SortItemsCompare<TValue>,
  ): SortItemsChangeResult<TValue>;
  sort<TValue = unknown>(
    path: Pointer,
    compare: SortItemsCompare<TValue>,
  ): SortItemsResult<TValue>;
  canReverse<TValue = unknown>(path: Pointer): SortItemsChangeResult<TValue>;
  reverse<TValue = unknown>(path: Pointer): SortItemsResult<TValue>;
}

interface CollectionReadOk<TValue> {
  ok: true;
  path: Pointer;
  values: TValue[];
}

type CollectionReadResult<TValue> = CollectionReadOk<TValue> | SortItemsError;

export function createSortItems<TDocument>(
  doc: JSONDocument<TDocument>,
): SortItems<TDocument> {
  return {
    canSort(path, compare) {
      return canSort(doc, path, compare);
    },
    sort(path, compare) {
      return sort(doc, path, compare);
    },
    canReverse(path) {
      return canReverse(doc, path);
    },
    reverse(path) {
      return reverse(doc, path);
    },
  };
}

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

export function sort<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  compare: SortItemsCompare<TValue>,
): SortItemsResult<TValue> {
  const change = canSort(doc, path, compare);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

export function canReverse<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
): SortItemsChangeResult<TValue> {
  const read = readCollection<TDocument, TValue>(doc, path);
  if (!read.ok) return read;
  return changeWithCapability(doc, read.path, read.values, [...read.values].reverse());
}

export function reverse<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
): SortItemsResult<TValue> {
  const change = canReverse<TDocument, TValue>(doc, path);
  if (!change.ok) return change;
  return applyChange(doc, change);
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
        pointer: itemPointer(path, index),
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
    if (!capability.ok) return capabilityError(path, capability);
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

function applyChange<TDocument, TValue>(
  doc: JSONDocument<TDocument>,
  change: SortItemsChange<TValue>,
): SortItemsResult<TValue> {
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(change.path, patched);
  return change;
}

function capabilityError(
  path: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): SortItemsError {
  const error: SortItemsError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `collection sort patch rejected for ${path}`,
    capability,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  return error;
}

function patchError(
  path: Pointer,
  patch: Extract<JSONResult, { ok: false }>,
): SortItemsError {
  const error: SortItemsError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `collection sort patch failed for ${path}`,
    patch,
  };
  if (patch.pointer !== undefined) error.pointer = patch.pointer;
  return error;
}

function sortItemsError(
  code: SortItemsErrorCode,
  reason: string,
  pointer?: Pointer,
): SortItemsError {
  const error: SortItemsError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}

function itemPointer(path: Pointer, index: number): Pointer {
  return path === "" ? `/${index}` : `${path}/${index}`;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
