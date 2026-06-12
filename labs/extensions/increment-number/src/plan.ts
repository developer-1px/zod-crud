import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { IncrementNumberError, IncrementNumberErrorCode, IncrementNumberOptions, IncrementNumberResult } from "./types.js";

export function canStep<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  options?: IncrementNumberOptions,
): IncrementNumberResult {
  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `increment-number path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;
  if (typeof current !== "number" || Number.isNaN(current)) {
    return error("not_a_number", `field is not a number: ${pointer}`, pointer);
  }

  const delta = options?.step ?? 1;
  let next = current + delta;
  if (options?.min !== undefined) next = Math.max(options.min, next);
  if (options?.max !== undefined) next = Math.min(options.max, next);

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
        reason: capability.reason ?? `increment-number patch rejected at ${pointer}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

function error(code: IncrementNumberErrorCode, reason: string, pointer?: Pointer): IncrementNumberError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
