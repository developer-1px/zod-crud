import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type EnsureFieldsErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_object"
  | "patch_rejected"
  | "patch_failed";

export interface EnsureFieldsError {
  ok: false;
  code: EnsureFieldsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface EnsureFieldsChange {
  ok: true;
  path: Pointer;
  /** Keys that were missing and added, in defaults order. */
  added: ReadonlyArray<string>;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type EnsureFieldsResult = EnsureFieldsChange | EnsureFieldsError;

export interface EnsureFields<TDocument> {
  canEnsure(path: Pointer, defaults: Readonly<Record<string, unknown>>): EnsureFieldsResult;
  ensure(path: Pointer, defaults: Readonly<Record<string, unknown>>): EnsureFieldsResult;
}

export function createEnsureFields<TDocument>(doc: JSONDocument<TDocument>): EnsureFields<TDocument> {
  return {
    canEnsure(path, defaults) {
      return canEnsure(doc, path, defaults);
    },
    ensure(path, defaults) {
      return ensure(doc, path, defaults);
    },
  };
}

export function canEnsure<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  defaults: Readonly<Record<string, unknown>>,
): EnsureFieldsResult {
  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `ensure-fields path not found: ${path}`, read.pointer);
  }
  if (read.value === null || typeof read.value !== "object" || Array.isArray(read.value)) {
    return error("not_object", `ensure-fields path is not an object: ${path}`, path);
  }
  const object = read.value as Record<string, unknown>;

  const added: string[] = [];
  const operations: JSONPatchOperation[] = [];
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(object, key)) continue;
    added.push(key);
    operations.push({ op: "add", path: appendSegment(path, key), value: cloneJson(defaults[key]) });
  }

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(path, capability);
  }

  return { ok: true, path, added, changed: operations.length > 0, operations };
}

export function ensure<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  defaults: Readonly<Record<string, unknown>>,
): EnsureFieldsResult {
  const change = canEnsure(doc, path, defaults);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(path, patched);
  return change;
}

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): EnsureFieldsError {
  const result: EnsureFieldsError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `ensure-fields patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): EnsureFieldsError {
  const result: EnsureFieldsError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `ensure-fields patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: EnsureFieldsErrorCode, reason: string, pointer?: Pointer): EnsureFieldsError {
  const result: EnsureFieldsError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
