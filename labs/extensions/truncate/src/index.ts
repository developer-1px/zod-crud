import {
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type TruncateErrorCode =
  | "invalid_pointer"
  | "invalid_max"
  | "path_not_found"
  | "not_a_string"
  | "patch_rejected"
  | "patch_failed";

export interface TruncateError {
  ok: false;
  code: TruncateErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface TruncateOptions {
  /** Suffix appended when truncated, counted within maxLength. Default `""`. */
  ellipsis?: string;
  /** Trim at the last whitespace boundary within the limit. Default `false`. */
  wordBoundary?: boolean;
}

export interface TruncateChange {
  ok: true;
  pointer: Pointer;
  from: string;
  to: string;
  changed: boolean;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type TruncateResult = TruncateChange | TruncateError;

export interface Truncate<TDocument> {
  canTruncate(pointer: Pointer, maxLength: number, options?: TruncateOptions): TruncateResult;
  truncate(pointer: Pointer, maxLength: number, options?: TruncateOptions): TruncateResult;
}

export function createTruncate<TDocument>(doc: JSONDocument<TDocument>): Truncate<TDocument> {
  return {
    canTruncate(pointer, maxLength, options) {
      return canTruncate(doc, pointer, maxLength, options);
    },
    truncate(pointer, maxLength, options) {
      return truncate(doc, pointer, maxLength, options);
    },
  };
}

export function canTruncate<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  maxLength: number,
  options?: TruncateOptions,
): TruncateResult {
  if (!Number.isInteger(maxLength) || maxLength < 0) {
    return error("invalid_max", `maxLength must be a non-negative integer, got ${maxLength}`, pointer);
  }

  const read = doc.at(pointer);
  if (!read.ok) {
    return error(read.code, read.reason ?? `truncate path not found: ${pointer}`, read.pointer);
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
    if (!capability.ok) return capabilityError(pointer, capability);
  }

  return { ok: true, pointer, from: current, to: next, changed, operations };
}

export function truncate<TDocument>(
  doc: JSONDocument<TDocument>,
  pointer: Pointer,
  maxLength: number,
  options?: TruncateOptions,
): TruncateResult {
  const change = canTruncate(doc, pointer, maxLength, options);
  if (!change.ok) return change;
  if (!change.changed) return change;
  const patched = doc.patch(change.operations);
  if (!patched.ok) return patchError(pointer, patched);
  return change;
}

function cut(text: string, maxLength: number, options?: TruncateOptions): string {
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

function capabilityError(
  pointer: Pointer,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): TruncateError {
  const result: TruncateError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `truncate patch rejected at ${pointer}`,
    capability,
  };
  if (capability.pointer !== undefined) result.pointer = capability.pointer;
  return result;
}

function patchError(pointer: Pointer, patch: Extract<JSONResult, { ok: false }>): TruncateError {
  const result: TruncateError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? `truncate patch failed at ${pointer}`,
    patch,
  };
  if (patch.pointer !== undefined) result.pointer = patch.pointer;
  return result;
}

function error(code: TruncateErrorCode, reason: string, pointer?: Pointer): TruncateError {
  const result: TruncateError = { ok: false, code, reason };
  if (pointer !== undefined) result.pointer = pointer;
  return result;
}
