import type {
  JSONDocument,
  JSONPatchOperation,
} from "zod-crud";

import {
  capabilityError,
  patchError,
  searchReplaceError,
} from "./errors.js";
import type {
  SearchReplaceError,
  SearchReplaceMatchApplyResult,
  SearchReplaceMatchChangeResult,
  SearchReplaceMatchTarget,
  TextMatchRange,
} from "./types.js";

export function canReplaceTextMatch<TDocument>(
  doc: JSONDocument<TDocument>,
  target: SearchReplaceMatchTarget,
  replacement: string,
): SearchReplaceMatchChangeResult {
  const read = doc.at(target.pointer);
  if (!read.ok) {
    return searchReplaceError(read.code, read.reason ?? `path not found: ${target.pointer}`, read.pointer);
  }
  if (typeof read.value !== "string") {
    return searchReplaceError("not_text", `replace match target is not a string: ${read.path}`, read.path);
  }
  const validRange = validateRange(target.range, read.value);
  if (!validRange.ok) return validRange;

  const currentText = read.value.slice(target.range.start, target.range.end);
  if (currentText !== target.range.text) {
    return searchReplaceError("stale_match", `match no longer exists at ${read.path}`, read.path);
  }

  const nextValue = read.value.slice(0, target.range.start) + replacement + read.value.slice(target.range.end);
  const operations: JSONPatchOperation[] = nextValue === read.value
    ? []
    : [{ op: "replace", path: read.path, value: nextValue }];
  if (operations.length > 0) {
    const capability = doc.canReplace(read.path, nextValue);
    if (!capability.ok) return capabilityError(read.path, capability);
  }

  return {
    ok: true,
    pointer: read.path,
    range: { ...target.range },
    replacement,
    currentValue: read.value,
    nextValue,
    operations,
  };
}

export function replaceTextMatch<TDocument>(
  doc: JSONDocument<TDocument>,
  target: SearchReplaceMatchTarget,
  replacement: string,
): SearchReplaceMatchApplyResult {
  const change = canReplaceTextMatch(doc, target, replacement);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;

  const patched = doc.replace(change.pointer, change.nextValue);
  if (!patched.ok) return patchError(change.pointer, patched);
  return change;
}

function validateRange(range: TextMatchRange, value: string): { ok: true } | SearchReplaceError {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start || range.end > value.length) {
    return searchReplaceError("invalid_match", "match range is outside the target string");
  }
  if (range.text.length !== range.end - range.start) {
    return searchReplaceError("invalid_match", "match text length does not match its range");
  }
  return { ok: true };
}
