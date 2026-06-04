import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type ApplyDefaultsErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "not_object"
  | "patch_rejected"
  | "patch_failed";

export interface ApplyDefaultsError {
  ok: false;
  code: ApplyDefaultsErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface ApplyDefaultsChange {
  ok: true;
  path: Pointer;
  /** Keys that were missing and added, in defaults order. */
  added: ReadonlyArray<string>;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type ApplyDefaultsResult = ApplyDefaultsChange | ApplyDefaultsError;

export interface ApplyDefaults<TDocument> {
  canEnsure(path: Pointer, defaults: Readonly<Record<string, unknown>>): ApplyDefaultsResult;
  ensure(path: Pointer, defaults: Readonly<Record<string, unknown>>): ApplyDefaultsResult;
}

export function createApplyDefaults<TDocument>(doc: JSONDocument<TDocument>): ApplyDefaults<TDocument> {
  return {
    canEnsure: (path, defaults) => canEnsure(doc, path, defaults),
    ensure: (path, defaults) => ensure(doc, path, defaults),
  };
}

export function canEnsure<TDocument>(
  doc: JSONDocument<TDocument>,
  path: Pointer,
  defaults: Readonly<Record<string, unknown>>,
): ApplyDefaultsResult {
  const read = doc.at(path);
  if (!read.ok) {
    return error(read.code, read.reason ?? `apply-defaults path not found: ${path}`, read.pointer);
  }
  if (read.value === null || typeof read.value !== "object" || Array.isArray(read.value)) {
    return error("not_object", `apply-defaults path is not an object: ${path}`, path);
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
): ApplyDefaultsResult {
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
): ApplyDefaultsError {
  return {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `apply-defaults patch rejected at ${pointer}`,
    capability,
    ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
  };
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): ApplyDefaultsError {
  return {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `apply-defaults patch failed at ${pointer}`,
    patch,
    ...(patch.pointer === undefined ? {} : { pointer: patch.pointer }),
  };
}

function error(code: ApplyDefaultsErrorCode, reason: string, pointer?: Pointer): ApplyDefaultsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
