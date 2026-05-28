import {
  tryParsePointer,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type BulkEditErrorCode =
  | "invalid_query"
  | "empty_match"
  | "read_failed"
  | "mapper_failed"
  | "patch_rejected"
  | "patch_failed";

export interface BulkEditError {
  ok: false;
  code: BulkEditErrorCode;
  reason: string;
  jsonPath?: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface BulkEditPlan {
  ok: true;
  jsonPath: string;
  count: number;
  pointers: ReadonlyArray<Pointer>;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type BulkEditPlanResult = BulkEditPlan | BulkEditError;
export type BulkEditResult = BulkEditPlan | BulkEditError;

export interface BulkEditMatch<TValue = unknown> {
  jsonPath: string;
  pointer: Pointer;
  value: TValue;
  index: number;
}

export type BulkEditValueMapper<TValue = unknown> = (
  match: BulkEditMatch<TValue>,
) => unknown;

type BulkEditReplacementInput<TValue> = unknown | BulkEditValueMapper<TValue>;

export interface BulkEditCanReplaceQuery {
  <TValue = unknown>(
    jsonPath: string,
    valueOrMapper: BulkEditValueMapper<TValue>,
  ): BulkEditPlanResult;
  (jsonPath: string, value: unknown): BulkEditPlanResult;
}

export interface BulkEditReplaceQuery {
  <TValue = unknown>(
    jsonPath: string,
    valueOrMapper: BulkEditValueMapper<TValue>,
  ): BulkEditResult;
  (jsonPath: string, value: unknown): BulkEditResult;
}

export interface BulkEdit<TDocument> {
  canReplaceQuery: BulkEditCanReplaceQuery;
  replaceQuery: BulkEditReplaceQuery;
  canDeleteQuery(jsonPath: string): BulkEditPlanResult;
  deleteQuery(jsonPath: string): BulkEditResult;
}

interface BulkEditReadOk<TValue> {
  ok: true;
  jsonPath: string;
  matches: ReadonlyArray<BulkEditMatch<TValue>>;
}

type BulkEditReadResult<TValue> = BulkEditReadOk<TValue> | BulkEditError;

export function createBulkEdit<TDocument>(
  doc: JSONDocument<TDocument>,
): BulkEdit<TDocument> {
  const bulk: BulkEdit<TDocument> = {
    canReplaceQuery: (jsonPath: string, valueOrMapper: unknown): BulkEditPlanResult => {
      return canReplaceQuery(doc, jsonPath, valueOrMapper);
    },
    replaceQuery: (jsonPath: string, valueOrMapper: unknown): BulkEditResult => {
      return replaceQuery(doc, jsonPath, valueOrMapper);
    },
    canDeleteQuery(jsonPath) {
      return canDeleteQuery(doc, jsonPath);
    },
    deleteQuery(jsonPath) {
      return deleteQuery(doc, jsonPath);
    },
  };
  return bulk;
}

export function canReplaceQuery<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditValueMapper<TValue>,
): BulkEditPlanResult;
export function canReplaceQuery<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  value: unknown,
): BulkEditPlanResult;
export function canReplaceQuery<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditReplacementInput<TValue>,
): BulkEditPlanResult {
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

  return planWithCapability(
    doc,
    jsonPath,
    operations.map((operation) => operation.path),
    operations,
  );
}

export function replaceQuery<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditValueMapper<TValue>,
): BulkEditResult;
export function replaceQuery<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  value: unknown,
): BulkEditResult;
export function replaceQuery<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  valueOrMapper: BulkEditReplacementInput<TValue>,
): BulkEditResult {
  const plan = canReplaceQuery(doc, jsonPath, valueOrMapper);
  if (!plan.ok) return plan;

  const patched = doc.patch(plan.operations);
  if (!patched.ok) return patchError("patch_failed", jsonPath, patched);
  return plan;
}

export function canDeleteQuery<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): BulkEditPlanResult {
  const pointers = queryPointers(doc, jsonPath);
  if (!pointers.ok) return pointers;

  const sorted = [...pointers.pointers]
    .sort(comparePatchPointerOrder);
  const operations = sorted.map<JSONPatchOperation>((path) => ({
    op: "remove",
    path,
  }));

  return planWithCapability(doc, jsonPath, sorted, operations);
}

export function deleteQuery<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): BulkEditResult {
  const plan = canDeleteQuery(doc, jsonPath);
  if (!plan.ok) return plan;

  const patched = doc.patch(plan.operations);
  if (!patched.ok) return patchError("patch_failed", jsonPath, patched);
  return plan;
}

function readQueryMatches<TDocument, TValue>(
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
      return readError(jsonPath, pointer, read.reason ?? `read failed: ${pointer}`);
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

function queryPointers<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
): { ok: true; jsonPath: string; pointers: ReadonlyArray<Pointer> } | BulkEditError {
  const queried = doc.query(jsonPath);
  if (!queried.ok) {
    return {
      ok: false,
      code: "invalid_query",
      reason: queried.reason ?? `invalid JSONPath: ${jsonPath}`,
      jsonPath,
    };
  }

  const pointers = uniquePointers(queried.pointers);
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

function planWithCapability<TDocument>(
  doc: JSONDocument<TDocument>,
  jsonPath: string,
  pointers: ReadonlyArray<Pointer>,
  operations: ReadonlyArray<JSONPatchOperation>,
): BulkEditPlanResult {
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

function uniquePointers(pointers: ReadonlyArray<Pointer>): Pointer[] {
  const seen = new Set<Pointer>();
  const unique: Pointer[] = [];
  for (const pointer of pointers) {
    if (seen.has(pointer)) continue;
    seen.add(pointer);
    unique.push(pointer);
  }
  return unique;
}

function comparePatchPointerOrder(left: Pointer, right: Pointer): number {
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

function capabilityError(
  jsonPath: string,
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): BulkEditError {
  const error: BulkEditError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? `bulk edit patch rejected for ${jsonPath}`,
    jsonPath,
    capability,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  return error;
}

function patchError(
  code: "patch_failed",
  jsonPath: string,
  patch: Extract<JSONResult, { ok: false }>,
): BulkEditError {
  const error: BulkEditError = {
    ok: false,
    code,
    reason: patch.reason ?? `bulk edit patch failed for ${jsonPath}`,
    jsonPath,
    patch,
  };
  if (patch.pointer !== undefined) error.pointer = patch.pointer;
  return error;
}

function readError(
  jsonPath: string,
  pointer: Pointer,
  reason: string,
): BulkEditError {
  return {
    ok: false,
    code: "read_failed",
    reason,
    jsonPath,
    pointer,
  };
}
