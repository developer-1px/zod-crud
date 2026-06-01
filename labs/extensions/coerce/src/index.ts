import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type CoerceErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_coercible"
  | "patch_rejected"
  | "patch_failed";

export interface CoerceError {
  ok: false;
  code: CoerceErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export type CoerceTarget = "string" | "number" | "integer" | "boolean";

export interface CoerceChange {
  ok: true;
  pointer: Pointer;
  from: unknown;
  to: string | number | boolean;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type CoerceResult = CoerceChange | CoerceError;

export interface Coerce<TDocument> {
  canCoerce(pointer: Pointer, to: CoerceTarget): CoerceResult;
  coerce(pointer: Pointer, to: CoerceTarget): CoerceResult;
}

export function createCoerce<TDocument>(doc: JSONDocument<TDocument>): Coerce<TDocument> {
  return {
    canCoerce(pointer, to) {
      return canCoerce(doc, pointer, to);
    },
    coerce(pointer, to) {
      return coerce(doc, pointer, to);
    },
  };
}

export function canCoerce<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  to: CoerceTarget,
): CoerceResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `coerce path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;

  const converted = convert(current, to);
  if (!converted.ok) {
    return error("not_coercible", converted.reason, pointer);
  }
  const next = converted.value;

  const changed = JSON.stringify(current) !== JSON.stringify(next);
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: pointer, value: next }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(pointer, capability);
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

export function coerce<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  to: CoerceTarget,
): CoerceResult {
  const change = canCoerce(doc, pointer, to);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

const TRUTHY = new Set(["true", "1", "yes", "y", "on"]);
const FALSY = new Set(["false", "0", "no", "n", "off", ""]);

function convert(
  value: unknown,
  to: CoerceTarget,
): { ok: true; value: string | number | boolean } | { ok: false; reason: string } {
  switch (to) {
    case "string":
      return { ok: true, value: typeof value === "string" ? value : stringify(value) };
    case "number":
    case "integer": {
      const n = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : value);
      if (!Number.isFinite(n)) return { ok: false, reason: `cannot coerce ${stringify(value)} to a ${to}` };
      return { ok: true, value: to === "integer" ? Math.trunc(n) : n };
    }
    case "boolean": {
      if (typeof value === "boolean") return { ok: true, value };
      if (typeof value === "number") return { ok: true, value: value !== 0 };
      if (typeof value === "string") {
        const key = value.trim().toLowerCase();
        if (TRUTHY.has(key)) return { ok: true, value: true };
        if (FALSY.has(key)) return { ok: true, value: false };
        return { ok: false, reason: `cannot coerce string "${value}" to a boolean` };
      }
      return { ok: false, reason: `cannot coerce ${stringify(value)} to a boolean` };
    }
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): CoerceError {
  const result: CoerceError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `coerce patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): CoerceError {
  const result: CoerceError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `coerce patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: CoerceErrorCode, reason: string, pointer?: Pointer): CoerceError {
  const result: CoerceError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
