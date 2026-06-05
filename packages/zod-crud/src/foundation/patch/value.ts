import type { Pointer } from "../pointer/index.js";
import {
  mutateContainer,
  parseSafe,
  withMutated,
} from "./container.js";
import { objectHasOwn } from "./object.js";
import { numericSegment } from "./path.js";
import type { ErrorCode, JSONPatchOperation } from "./contract.js";

export function applyTrustedValueMutation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "add" | "replace" }>,
): { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer } {
  if (op.path === "") return { state: op.value };

  const singleSegment = applySingleSegmentTrustedValueMutation(state, op);
  if (singleSegment !== null) return singleSegment;

  const arrayElement = applyObjectArrayElementTrustedValueMutation(state, op);
  if (arrayElement !== null) return arrayElement;

  const arrayField = applyObjectArrayFieldTrustedValueMutation(state, op);
  if (arrayField !== null) return arrayField;

  const parsed = parseSafe(op.path);
  if ("error" in parsed) return parsed;

  const verb = op.op === "add" ? "set" : "replace";
  const result = withMutated(
    state,
    parsed.segs,
    (parent, key) => mutateContainer(parent, key, verb, op.value),
  );
  return "error" in result ? { ...result, pointer: op.path } : result;
}

function applySingleSegmentTrustedValueMutation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "add" | "replace" }>,
): { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer } | null {
  if (op.path[0] !== "/" || op.path.includes("~") || op.path.indexOf("/", 1) !== -1) return null;
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const key = op.path.slice(1);
    if (op.op === "replace" && !objectHasOwn.call(state, key)) {
      return { error: "path_not_found", reason: `object key: ${key}`, pointer: op.path };
    }
    const next = { ...(state as Record<string, unknown>) };
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
    return { state: next };
  }

  const verb = op.op === "add" ? "set" : "replace";
  const result = mutateContainer(state, op.path.slice(1), verb, op.value);
  return "error" in result ? { ...result, pointer: op.path } : { state: result.value };
}

function applyObjectArrayElementTrustedValueMutation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "add" | "replace" }>,
): { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer } | null {
  const path = op.path;
  if (path[0] !== "/" || path.includes("~")) return null;
  const arrayKeySlash = path.indexOf("/", 1);
  if (arrayKeySlash === -1 || path.indexOf("/", arrayKeySlash + 1) !== -1) return null;

  const arrayKey = path.slice(1, arrayKeySlash);
  const itemIndex = numericSegment(path.slice(arrayKeySlash + 1));
  if (itemIndex === null) return null;

  if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
  const root = state as Record<string, unknown>;
  if (!objectHasOwn.call(root, arrayKey)) {
    return { error: "path_not_found", reason: `object key: ${arrayKey}`, pointer: path };
  }
  const array = root[arrayKey];
  if (!Array.isArray(array)) return null;

  if (op.op === "add") {
    if (itemIndex > array.length) return { error: "path_not_found", reason: `out of range: ${itemIndex}`, pointer: path };
    const nextArray = itemIndex === array.length ? array.concat([op.value]) : array.slice();
    if (itemIndex < array.length) nextArray.splice(itemIndex, 0, op.value);
    return { state: { ...root, [arrayKey]: nextArray } };
  }

  if (itemIndex >= array.length) return { error: "path_not_found", reason: `array index: ${itemIndex}`, pointer: path };
  const nextArray = array.slice();
  nextArray[itemIndex] = op.value;
  return { state: { ...root, [arrayKey]: nextArray } };
}

function applyObjectArrayFieldTrustedValueMutation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "add" | "replace" }>,
): { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer } | null {
  const path = op.path;
  if (path[0] !== "/" || path.includes("~")) return null;
  const arrayKeySlash = path.indexOf("/", 1);
  if (arrayKeySlash === -1) return null;
  const fieldSlash = path.indexOf("/", arrayKeySlash + 1);
  if (fieldSlash === -1 || path.indexOf("/", fieldSlash + 1) !== -1) return null;

  const arrayKey = path.slice(1, arrayKeySlash);
  const rowIndex = numericSegment(path.slice(arrayKeySlash + 1, fieldSlash));
  if (rowIndex === null) return null;
  const field = path.slice(fieldSlash + 1);
  if (field === "") return null;

  if (state === null || typeof state !== "object" || Array.isArray(state)) return null;
  const root = state as Record<string, unknown>;
  if (!objectHasOwn.call(root, arrayKey)) return { error: "path_not_found", reason: `object key: ${arrayKey}`, pointer: path };
  const array = root[arrayKey];
  if (!Array.isArray(array)) return null;
  if (rowIndex >= array.length) return { error: "path_not_found", reason: `array index: ${rowIndex}`, pointer: path };
  const row = array[rowIndex];
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (op.op === "replace" && !objectHasOwn.call(record, field)) {
    return { error: "path_not_found", reason: `object key: ${field}`, pointer: path };
  }

  const nextRow = { ...record, [field]: op.value };
  const nextArray = array.slice();
  nextArray[rowIndex] = nextRow;
  return { state: { ...root, [arrayKey]: nextArray } };
}
