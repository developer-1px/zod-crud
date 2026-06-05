import { appendSegment, type JSONDocument, type JSONPatchOperation, type Pointer } from "zod-crud";
import type { ApplyDefaultsError, ApplyDefaultsErrorCode, ApplyDefaultsResult } from "./types.js";

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
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `apply-defaults patch rejected at ${path}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, path, added, changed: operations.length > 0, operations };
}

function error(code: ApplyDefaultsErrorCode, reason: string, pointer?: Pointer): ApplyDefaultsError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
