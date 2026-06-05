import type {
  JSONChangeMetadata,
  JSONDocument,
  JSONPatchOperation,
  Pointer,
} from "zod-crud";

import {
  patchError,
} from "./errors.js";
import {
  changeWithCapability,
  comparePatchPointerOrder,
  readQueryMatches,
} from "./matches.js";
import type {
  BulkEditChangeResult,
  BulkEditError,
  BulkEditMatch,
  BulkEditReplacementInput,
  BulkEditResult,
  BulkEditValueMapper,
} from "./types.js";

export function canReplaceAll<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditValueMapper<TValue>,
): BulkEditChangeResult;
export function canReplaceAll<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  value: unknown,
): BulkEditChangeResult;
export function canReplaceAll<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditReplacementInput<TValue>,
): BulkEditChangeResult {
  const read = readQueryMatches<TDocument, TValue>(doc, jsonPath);
  if (!read.ok) return read;

  const replacements: Array<{ pointer: Pointer; value: unknown }> = [];
  for (const match of read.matches) {
    const value = mapReplacement(valueOrMapper, match);
    if (!value.ok) return value;
    replacements.push({ pointer: match.pointer, value: value.value });
  }

  const operations = replacements
    .sort((left, right) => comparePatchPointerOrder(left.pointer, right.pointer))
    .map<JSONPatchOperation>((replacement) => ({
      op: "replace",
      path: replacement.pointer,
      value: replacement.value,
    }));

  return changeWithCapability(
    doc,
    jsonPath,
    operations.map((operation) => operation.path),
    operations,
  );
}

export function replaceAll<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditValueMapper<TValue>,
  metadata?: JSONChangeMetadata,
): BulkEditResult;
export function replaceAll<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  value: unknown,
  metadata?: JSONChangeMetadata,
): BulkEditResult;
export function replaceAll<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditReplacementInput<TValue>,
  metadata?: JSONChangeMetadata,
): BulkEditResult {
  const change = canReplaceAll(doc, jsonPath, valueOrMapper);
  if (!change.ok) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) return patchError(jsonPath, patched);
  return change;
}

function mapReplacement<TValue>(
  valueOrMapper: BulkEditReplacementInput<TValue>,
  match: BulkEditMatch<TValue>,
): { ok: true; value: unknown } | BulkEditError {
  if (typeof valueOrMapper !== "function") {
    return { ok: true, value: valueOrMapper };
  }

  try {
    return { ok: true, value: valueOrMapper(match) };
  } catch (error) {
    return {
      ok: false,
      code: "mapper_failed",
      reason: error instanceof Error ? error.message : "replacement mapper failed",
      jsonPath: match.jsonPath,
      pointer: match.pointer,
    };
  }
}
