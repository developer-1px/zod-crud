import { appendSegment, type JSONDocument, type JSONPatchOperation, type Pointer } from "zod-crud";
import type { FillDownError, FillDownErrorCode, FillDownOptions, FillDownResult } from "./types.js";

export function canFillDown<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  options?: FillDownOptions,
): FillDownResult {
  const field = options?.field ?? "";
  if (field !== "" && !field.startsWith("/")) {
    return error("invalid_field", `field must be empty or start with '/': ${field}`, field);
  }
  const isEmpty =
    options?.isEmpty ?? ((value: unknown) => value === null || value === undefined || value === "");
  const up = options?.direction === "up";

  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `fill-down path not found: ${path}`, read.pointer);
  }
  if (!Array.isArray(read.value)) {
    return error("not_array", `fill-down path is not an array: ${path}`, path);
  }
  const items = read.value as unknown[];

  const valueAt = (index: number): unknown => {
    const item = items[index];
    if (field === "") return item;
    if (item === null || typeof item !== "object") return undefined;
    // field starts with "/"; resolve a shallow single-segment path for the common case.
    const key = field.slice(1);
    return (item as Record<string, unknown>)[key];
  };

  const order = up ? range(items.length - 1, -1, -1) : range(0, items.length, 1);
  const operations: JSONPatchOperation[] = [];
  let filled = 0;
  let carry: { has: boolean; value: unknown } = { has: false, value: undefined };
  for (const index of order) {
    const current = valueAt(index);
    if (isEmpty(current)) {
      if (carry.has) {
        const writePointer = field === "" ? appendSegment(path, index) : appendSegment(path, index) + field;
        operations.push({ op: "replace", path: writePointer, value: cloneJson(carry.value) });
        filled += 1;
      }
    } else {
      carry = { has: true, value: current };
    }
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `fill-down patch rejected at ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, path, field, filled, changed: operations.length > 0, operations };
}

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(i);
  return out;
}

function error(code: FillDownErrorCode, reason: string, pointer?: Pointer): FillDownError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as TValue);
}
