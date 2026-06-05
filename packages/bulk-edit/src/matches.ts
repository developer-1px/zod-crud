import {
  tryParsePointer,
  type JSONDocument,
  type JSONPatchOperation,
  type Pointer,
} from "zod-crud";

import {
  capabilityError,
} from "./errors.js";
import type {
  BulkEditChangeResult,
  BulkEditError,
  BulkEditMatch,
  BulkEditReadResult,
} from "./types.js";

export function readQueryMatches<TDocument, TValue>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): BulkEditReadResult<TValue> {
  const pointers = queryPointers(doc, jsonPath);
  if (!pointers.ok) return pointers;

  const matches: BulkEditMatch<TValue>[] = [];
  for (let index = 0; index < pointers.pointers.length; index += 1) {
    const pointer = pointers.pointers[index]!;
    const read = doc.at(pointer);
    if (!read.ok) {
      return {
        ok: false,
        code: "read_failed",
        reason: read.reason ?? `read failed: ${pointer}`,
        jsonPath,
        pointer,
      };
    }
    matches.push({
      jsonPath,
      pointer,
      value: read.value as TValue,
      index,
    });
  }

  return { ok: true, jsonPath, matches };
}

export function queryPointers<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): { ok: true; jsonPath: string; pointers: ReadonlyArray<Pointer> } | BulkEditError {
  const capability = doc.canFind(jsonPath);
  if (!capability.ok) {
    return {
      ok: false,
      code: "invalid_query",
      reason: capability.reason ?? `invalid JSONPath: ${jsonPath}`,
      jsonPath,
    };
  }

  const queried = doc.query(jsonPath);
  if (!queried.ok) {
    return {
      ok: false,
      code: "invalid_query",
      reason: queried.reason ?? `invalid JSONPath: ${jsonPath}`,
      jsonPath,
    };
  }

  const pointers = [...new Set(queried.pointers)];
  if (pointers.length === 0) {
    return {
      ok: false,
      code: "empty_match",
      reason: `no matches for ${jsonPath}`,
      jsonPath,
    };
  }

  return { ok: true, jsonPath, pointers };
}

export function changeWithCapability<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  pointers: ReadonlyArray<Pointer>,
  operations: ReadonlyArray<JSONPatchOperation>,
): BulkEditChangeResult {
  const capability = doc.canPatch(operations);
  if (!capability.ok) {
    return capabilityError(jsonPath, capability);
  }

  return {
    ok: true,
    jsonPath,
    count: operations.length,
    pointers: [...pointers],
    operations,
  };
}

export function comparePatchPointerOrder(left: Pointer, right: Pointer): number {
  const leftSegments = tryParsePointer(left) ?? [];
  const rightSegments = tryParsePointer(right) ?? [];
  if (leftSegments.length !== rightSegments.length) {
    return rightSegments.length - leftSegments.length;
  }

  const shared = Math.min(leftSegments.length, rightSegments.length);
  for (let index = 0; index < shared; index += 1) {
    const leftSegment = leftSegments[index]!;
    const rightSegment = rightSegments[index]!;
    if (leftSegment === rightSegment) continue;

    const leftIndex = arrayIndexSegment(leftSegment);
    const rightIndex = arrayIndexSegment(rightSegment);
    if (leftIndex !== null && rightIndex !== null) return rightIndex - leftIndex;
    return right.localeCompare(left);
  }

  return 0;
}

function arrayIndexSegment(segment: string): number | null {
  if (segment === "0") return 0;
  if (segment.length === 0 || segment[0] === "0") return null;

  let value = 0;
  for (let index = 0; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    if (code < 48 || code > 57) return null;
    value = value * 10 + code - 48;
  }
  return value;
}
