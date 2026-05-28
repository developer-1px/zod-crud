import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type CollectionSortErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_collection"
  | "compare_failed"
  | "patch_rejected"
  | "patch_failed";

export interface CollectionSortError {
  ok: false;
  code: CollectionSortErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface CollectionSortItem<TValue = unknown> {
  pointer: Pointer;
  value: TValue;
  index: number;
}

export type CollectionSortCompare<TValue = unknown> = (
  left: CollectionSortItem<TValue>,
  right: CollectionSortItem<TValue>,
) => number;

export interface CollectionSortChange<TValue = unknown> {
  ok: true;
  path: Pointer;
  count: number;
  changed: boolean;
  values: ReadonlyArray<TValue>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type CollectionSortChangeResult<TValue = unknown> =
  | CollectionSortChange<TValue>
  | CollectionSortError;

export type CollectionSortResult<TValue = unknown> =
  | CollectionSortChange<TValue>
  | CollectionSortError;

export interface CollectionSort<TDocument> {
  canSort<TValue = unknown>(
    path: Pointer,
    compare: CollectionSortCompare<TValue>,
  ): CollectionSortChangeResult<TValue>;
  sort<TValue = unknown>(
    path: Pointer,
    compare: CollectionSortCompare<TValue>,
  ): CollectionSortResult<TValue>;
  canReverse<TValue = unknown>(path: Pointer): CollectionSortChangeResult<TValue>;
  reverse<TValue = unknown>(path: Pointer): CollectionSortResult<TValue>;
}

interface CollectionReadOk<TValue> {
  ok: true;
  path: Pointer;
  values: TValue[];
}

type CollectionReadResult<TValue> = CollectionReadOk<TValue> | CollectionSortError;

export function createCollectionSort<TDocument>(
  doc: JSONDocument<TDocument>,
): CollectionSort<TDocument> {
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
  compare: CollectionSortCompare<TValue>,
): CollectionSortChangeResult<TValue> {
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
  compare: CollectionSortCompare<TValue>,
): CollectionSortResult<TValue> {
  const change = canSort(doc, path, compare);
  if (!change.ok) return change;
  return applyChange(doc, change);
}

export function canReverse<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
): CollectionSortChangeResult<TValue> {
  const read = readCollection<TDocument, TValue>(doc, path);
  if (!read.ok) return read;
  return changeWithCapability(doc, read.path, read.values, [...read.values].reverse());
}

export function reverse<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
): CollectionSortResult<TValue> {
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
    return collectionSortError(
      read.code,
      read.reason ?? `collection path not found: ${path}`,
      read.pointer,
    );
  }
  if (!Array.isArray(read.value)) {
    return collectionSortError("not_collection", `path is not an array: ${path}`, path);
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
  compare: CollectionSortCompare<TValue>,
): { ok: true; values: TValue[] } | CollectionSortError {
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
    return collectionSortError(
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
): CollectionSortChangeResult<TValue> {
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
  change: CollectionSortChange<TValue>,
): CollectionSortResult<TValue> {
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(change.path, patched);
  return change;
}

function capabilityError(
  path: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): CollectionSortError {
  const error: CollectionSortError = {
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
): CollectionSortError {
  const error: CollectionSortError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `collection sort patch failed for ${path}`,
    patch,
  };
  if (patch.pointer !== undefined) error.pointer = patch.pointer;
  return error;
}

function collectionSortError(
  code: CollectionSortErrorCode,
  reason: string,
  pointer?: Pointer,
): CollectionSortError {
  const error: CollectionSortError = { ok: false, code, reason };
  if (pointer !== undefined) error.pointer = pointer;
  return error;
}

function itemPointer(path: Pointer, index: number): Pointer {
  return path === "" ? `/${index}` : `${path}/${index}`;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
