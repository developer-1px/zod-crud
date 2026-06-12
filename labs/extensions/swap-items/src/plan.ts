import { type JSONDocument, type JSONPatchOperation, lastSegmentIndex, parentPointer, type Pointer, tryParsePointer } from "@interactive-os/json-document";
import type { Located, SwapItemsError, SwapItemsErrorCode, SwapItemsResult } from "./types.js";

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
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `swapItems patch rejected at ${parent}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, path: parent, a, b, changed, operations };
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

function error(code: SwapItemsErrorCode, reason: string, pointer?: Pointer): SwapItemsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
