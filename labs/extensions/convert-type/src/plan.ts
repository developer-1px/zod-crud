import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { ConvertTypeError, ConvertTypeErrorCode, ConvertTypeResult, ConvertTypeTarget } from "./types.js";

export function canConvertType<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  to: ConvertTypeTarget,
): ConvertTypeResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `convert-type path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;

  const converted = convert(current, to);
  if (!converted.ok) {
    return error("not_convertible", converted.reason, pointer);
  }
  const next = converted.value;

  const changed = JSON.stringify(current) !== JSON.stringify(next);
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: pointer, value: next }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `convert-type patch rejected at ${pointer}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

const TRUTHY = new Set(["true", "1", "yes", "y", "on"]);

const FALSY = new Set(["false", "0", "no", "n", "off", ""]);

function convert(
  value: unknown,
  to: ConvertTypeTarget,
): { ok: true; value: string | number | boolean } | { ok: false; reason: string } {
  switch (to) {
    case "string":
      return { ok: true, value: typeof value === "string" ? value : stringify(value) };
    case "number":
    case "integer": {
      const n = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : value);
      if (!Number.isFinite(n)) return { ok: false, reason: `cannot convert ${stringify(value)} to a ${to}` };
      return { ok: true, value: to === "integer" ? Math.trunc(n) : n };
    }
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      if (typeof value === "number") return { ok: true, value: value !== 0 };
      if (typeof value === "string") {
        const key = value.trim().toLowerCase();
        if (TRUTHY.has(key)) return { ok: true, value: true };
        if (FALSY.has(key)) return { ok: true, value: false };
        return { ok: false, reason: `cannot convert string "${value}" to a boolean` };
      }
      return { ok: false, reason: `cannot convert ${stringify(value)} to a boolean` };
    }
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function error(code: ConvertTypeErrorCode, reason: string, pointer?: Pointer): ConvertTypeError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
