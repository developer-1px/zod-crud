import {
  lastSegmentIndex,
  parentPointer,
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type SwapItemsErrorCode =
  | "invalid_pointer"
  | "not_array_item"
  | "mixed_parent"
  | "path_not_found"
  | "not_array"
  | "index_out_of_range"
  | "patch_rejected"
  | "patch_failed";

export interface SwapItemsError {
  ok: false;
  code: SwapItemsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface SwapItemsChange {
  ok: true;
  /** Parent array pointer. */
  path: Pointer;
  a: Pointer;
  b: Pointer;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type SwapItemsResult = SwapItemsChange | SwapItemsError;

export interface SwapItems<TDocument> {
  canSwapItems(a: Pointer, b: Pointer): SwapItemsResult;
  swapItems(a: Pointer, b: Pointer): SwapItemsResult;
}

export function createSwapItems<TDocument>(doc: JSONDocument<TDocument>): SwapItems<TDocument> {
  return {
    canSwapItems: (a, b) => canSwapItems(doc, a, b),
    swapItems: (a, b) => swapItems(doc, a, b),
  };
}

export function canSwapItems<TDocument>(doc: JSONDocument<TDocument>, a: Pointer, b: Pointer): SwapItemsResult {
  const left = locate(a);
  if (!left.ok) return left;
  const right = locate(b);
  if (!right.ok) return right;
  if (left.parent !== right.parent) {
    return error("mixed_parent", `swapItems pointers must share one parent array: ${left.parent} vs ${right.parent}`, b);
  }
  const parent = left.parent;

  const read = doc.at(parent);
  if (!read.ok) {
    return error(read.code, read.reason ?? `parent not found: ${parent}`, parent);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `swapItems parent is not an array: ${parent}`, parent);
  }
  const items = read.value as unknown[];
  if (left.index >= items.length) return error("index_out_of_range", `index ${left.index} out of range at ${parent}`, a);
  if (right.index >= items.length) return error("index_out_of_range", `index ${right.index} out of range at ${parent}`, b);

  const changed = left.index !== right.index && JSON.stringify(items[left.index]) !== JSON.stringify(items[right.index]);
  let operations: JSONPatchOperation[] = [];
  if (changed) {
    const next = [...items];
    const tmp = next[left.index];
    next[left.index] = next[right.index];
    next[right.index] = tmp;
    operations = [{ op: "replace", path: parent, value: cloneJson(next) }];
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(parent, capability);
  }

  return { ok: true, path: parent, a, b, changed, operations };
}

export function swapItems<TDocument>(doc: JSONDocument<TDocument>, a: Pointer, b: Pointer): SwapItemsResult {
  const change = canSwapItems(doc, a, b);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(change.path, patched);
  return change;
}

interface Located {
  ok: true;
  parent: Pointer;
  index: number;
}

function locate(pointer: Pointer): Located | SwapItemsError {
  if (tryParsePointer(pointer) === null) {
    return error("invalid_pointer", `invalid JSON Pointer: ${pointer}`, pointer);
  }
  const index = lastSegmentIndex(pointer);
  const parent = parentPointer(pointer);
  if (index === null || parent === null) {
    return error("not_array_item", `pointer does not address an array item: ${pointer}`, pointer);
  }
  return { ok: true, parent, index };
}

function capabilityError(pointer: Pointer, capability: Exclude<JSONCapabilityResult, { ok: true }>): SwapItemsError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `swapItems patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): SwapItemsError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `swapItems patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: SwapItemsErrorCode, reason: string, pointer?: Pointer): SwapItemsError {
  const result: SwapItemsError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
