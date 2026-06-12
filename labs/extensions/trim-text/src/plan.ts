import type { JSONDocument, JSONPatchOperation, Pointer } from "@interactive-os/json-document";
import type { TrimTextError, TrimTextErrorCode, TrimTextOptions, TrimTextResult } from "./types.js";

export function canTrimText<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  maxLength: number,
  options?: TrimTextOptions,
): TrimTextResult {
  if (!Number.isInteger(maxLength) || maxLength < 0) {
    return error("invalid_max", `maxLength must be a non-negative integer, got ${maxLength}`, pointer);
  }

  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `trim-text path not found: ${pointer}`, read.pointer);
  }
  const current = read.value;
  if (typeof current !== "string") {
    return error("not_a_string", `field is not a string: ${pointer}`, pointer);
  }

  const next = cut(current, maxLength, options);

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
        reason: capability.reason ?? `trim-text patch rejected at ${pointer}`,
        capability,
        ...(capability.pointer === undefined ? {} : { pointer: capability.pointer }),
      };
    }
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

function cut(text: string, maxLength: number, options?: TrimTextOptions): string {
  if (text.length <= maxLength) return text;
  const ellipsis = options?.ellipsis ?? "";
  // Reserve room for the ellipsis; if it does not fit, the ellipsis itself is clipped.
  const budget = Math.max(0, maxLength - ellipsis.length);
  let head = text.slice(0, budget);
  if (options?.wordBoundary) {
    const lastSpace = head.search(/\s\S*$/);
    if (lastSpace > 0) head = head.slice(0, lastSpace);
  }
  const result = head + ellipsis;
  // Guard: never exceed maxLength even when ellipsis is longer than the budget.
  return result.length <= maxLength ? result : result.slice(0, maxLength);
}

function error(code: TrimTextErrorCode, reason: string, pointer?: Pointer): TrimTextError {
  return { ok: false, code, reason, ...(pointer === undefined ? {} : { pointer }) };
}
