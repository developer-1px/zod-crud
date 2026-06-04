import {
  appendSegment,
  type JSONCapabilityResult,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchOperation,
  type JSONResult,
  type Pointer,
} from "zod-crud";

export type DocumentDiffErrorCode =
  | "patch_rejected"
  | "patch_failed";

export interface DocumentDiffError {
  ok: false;
  code: DocumentDiffErrorCode;
  reason: string;
  pointer?: Pointer;
  capability?: Exclude<JSONCapabilityResult, { ok: true }>;
  patch?: Extract<JSONResult, { ok: false }>;
}

export interface DocumentDiffChange<TValue = unknown> {
  ok: true;
  changed: boolean;
  value: TValue;
  operations: ReadonlyArray<JSONPatchOperation>;
}

export type DocumentDiffChangeResult<TValue = unknown> =
  | DocumentDiffChange<TValue>
  | DocumentDiffError;

export type DocumentDiffApplyResult<TValue = unknown> =
  | DocumentDiffChange<TValue>
  | DocumentDiffError;

export interface DocumentDiff<TDocument> {
  diff<TValue = unknown>(target: TValue): DocumentDiffChangeResult<TValue>;
  canApply<TValue = unknown>(target: TValue): DocumentDiffChangeResult<TValue>;
  apply<TValue = unknown>(target: TValue, metadata?: JSONChangeMetadata): DocumentDiffApplyResult<TValue>;
}

export function createDocumentDiff<TDocument>(
  doc: JSONDocument<TDocument>,
): DocumentDiff<TDocument> {
  return {
    diff: (target) => diffDocument(doc, target),
    canApply: (target) => canApplyDocumentDiff(doc, target),
    apply: (target, metadata) => applyDocumentDiff(doc, target, metadata),
  };
}

export function diffDocument<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  target: TValue,
): DocumentDiffChangeResult<TValue> {
  const operations: JSONPatchOperation[] = [];
  diffValue("", doc.value, target, operations);

  if (operations.length > 0) {
    const capability = doc.canPatch(operations);
    if (!capability.ok) return capabilityError(capability);
  }

  return {
    ok: true,
    changed: operations.length > 0,
    value: cloneJson(target),
    operations: JSON.parse(JSON.stringify(operations)) as JSONPatchOperation[],
  };
}

export function canApplyDocumentDiff<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  target: TValue,
): DocumentDiffChangeResult<TValue> {
  return diffDocument(doc, target);
}

export function applyDocumentDiff<TDocument, TValue = unknown>(
  doc: JSONDocument<TDocument>,
  target: TValue,
  metadata?: JSONChangeMetadata,
): DocumentDiffApplyResult<TValue> {
  const change = diffDocument(doc, target);
  if (!change.ok) return change;
  if (change.operations.length === 0) return change;

  const patched = doc.patch(change.operations, metadata);
  if (!patched.ok) return patchError(patched);
  return change;
}

function diffValue(
  path: Pointer,
  current: unknown,
  target: unknown,
  operations: JSONPatchOperation[],
): void {
  if (jsonEqual(current, target)) return;

  if (isPlainRecord(current) && isPlainRecord(target)) {
    diffObject(path, current, target, operations);
    return;
  }

  if (Array.isArray(current) && Array.isArray(target)) {
    if (current.length === target.length) {
      const start = operations.length;
      for (let index = 0; index < current.length; index += 1) {
        diffValue(appendSegment(path, index), current[index], target[index], operations);
      }
      if (operations.length !== start) return;
    }
    operations.push({ op: "replace", path, value: target });
    return;
  }

  operations.push({ op: "replace", path, value: target });
}

function diffObject(
  path: Pointer,
  current: Record<string, unknown>,
  target: Record<string, unknown>,
  operations: JSONPatchOperation[],
): void {
  for (const key of Object.keys(current).sort().reverse()) {
    if (Object.prototype.hasOwnProperty.call(target, key)) continue;
    operations.push({ op: "remove", path: appendSegment(path, key) });
  }

  for (const key of Object.keys(target).sort()) {
    const childPath = appendSegment(path, key);
    if (!Object.prototype.hasOwnProperty.call(current, key)) {
      operations.push({ op: "add", path: childPath, value: target[key] });
      continue;
    }
    diffValue(childPath, current[key], target[key], operations);
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (let index = 0; index < leftKeys.length; index += 1) {
      const key = leftKeys[index]!;
      if (key !== rightKeys[index]) return false;
      if (!jsonEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function capabilityError(
  capability: Exclude<JSONCapabilityResult, { ok: true }>,
): DocumentDiffError {
  const error: DocumentDiffError = {
    ok: false,
    code: "patch_rejected",
    reason: capability.reason ?? "document diff patch rejected",
    capability,
  };
  if (capability.pointer !== undefined) error.pointer = capability.pointer;
  return error;
}

function patchError(
  patch: Extract<JSONResult, { ok: false }>,
): DocumentDiffError {
  const error: DocumentDiffError = {
    ok: false,
    code: "patch_failed",
    reason: patch.reason ?? "document diff patch failed",
    patch,
  };
  if (patch.pointer !== undefined) error.pointer = patch.pointer;
  return error;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
