import type { JSONDocument, JSONPatchOperation, Pointer } from "zod-crud";
import type { CaseTransform, ChangeCaseError, ChangeCaseErrorCode, ChangeCaseResult } from "./types.js";

export function canTransform<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  transform: CaseTransform,
): ChangeCaseResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `change-case path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;
  if (typeof current !== "string") {
    return error("not_a_string", `field is not a string: ${pointer}`, pointer);
  }

  let next: string;
  try {
    next = runTransform(current, transform);
  } catch (cause) {
    return error("transform_failed", cause instanceof Error ? cause.message : "text transform threw.", pointer);
  }

  const changed = next !== current;
  const operations: JSONPatchOperation[] = changed
    ? [{ op: "replace", path: pointer, value: next }]
    : [];

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) {
      return {
        ok: false,
        code: "patch_rejected",
        reason: capability.reason ?? `change-case patch rejected at ${pointer}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

function runTransform(value: string, transform: CaseTransform): string {
  if (typeof transform === "function") return transform(value);
  switch (transform) {
    case "upper":
      return value.toUpperCase();
    case "lower":
      return value.toLowerCase();
    case "trim":
      return value.trim();
    case "capitalize":
      return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
    case "title":
      return value.replace(/\S+/g, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());
  }
}

function error(code: ChangeCaseErrorCode, reason: string, pointer?: Pointer): ChangeCaseError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
