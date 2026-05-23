// RFC 6902 — JSON Patch. SPEC.md §3.
// Root public surface: types + applyOperation + applyPatch.
// computeInverses stays source-internal for document history.

import type * as z from "zod";
import { jsonSerializableError } from "../json.js";
import { appendSegment, buildPointer, parentPointer, type Pointer } from "../json-pointer/index.js";
import { applyOpRaw, validateOperationShape } from "./apply.js";
import {
  deepCloneTrusted,
  getValueAt,
  mutateContainer,
  normalizeOp,
  parseSafe,
  withMutated,
} from "./internal.js";

export type JSONPatchOperation =
  | { op: "add";     path: Pointer; value: unknown }
  | { op: "remove";  path: Pointer }
  | { op: "replace"; path: Pointer; value: unknown }
  | { op: "move";    from: Pointer; path: Pointer }
  | { op: "copy";    from: Pointer; path: Pointer }
  | { op: "test";    path: Pointer; value: unknown };

export type ErrorCode =
  | "invalid_pointer"
  | "path_not_found"
  | "move_into_self"
  | "schema_violation"
  | "test_failed"
  | "not_serializable";

export type JSONResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer };

export interface ApplyResult<S extends z.ZodTypeAny> {
  state: z.output<S>;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

interface TrustedApplyResult<T> {
  state: T;
  result: JSONResult;
  applied: ReadonlyArray<JSONPatchOperation>;
}

interface TrustedPatchOptions {
  valuesTrusted?: boolean;
}

type FastPatchResult =
  | { handled: true; state: unknown; applied: ReadonlyArray<JSONPatchOperation> }
  | { handled: false };

interface ArrayFieldPath {
  arrayPath: Pointer;
  index: number;
  key: string;
}

interface ArrayNestedPath {
  arrayPath: Pointer;
  arraySegments: string[];
  index: number;
  simplePrefixText: string | null;
  simpleSuffixText: string | null;
  suffixSegments: string[];
}

type SameArrayStructuralItem =
  | { op: "add"; path: Pointer; index: number | "-"; value: unknown }
  | { op: "remove"; path: Pointer; index: number }
  | { op: "copy"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" }
  | { op: "move"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" };

const ok: JSONResult = { ok: true };
const objectHasOwn = Object.prototype.hasOwnProperty;
const fail = (code: ErrorCode, reason?: string, pointer?: Pointer): JSONResult => {
  const r: { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer } = { ok: false, code };
  if (reason !== undefined) r.reason = reason;
  if (pointer !== undefined) r.pointer = pointer;
  return r;
};
const zodIssuesReason = (error: z.ZodError): string => JSON.stringify(error.issues);

function copyRootObject(source: Record<string, unknown>): Record<string, unknown> {
  return copyRootObjectKeys(source, Object.keys(source));
}

function copyRootObjectKeys(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): Record<string, unknown> {
  return copyRootObjectKeyPrefix(source, keys, keys.length);
}

function copyRootObjectKeyPrefix(
  source: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  end: number,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (!objectHasOwn.call(source, "__proto__")) {
    for (let index = 0; index < end; index += 1) {
      const key = keys[index]!;
      next[key] = source[key];
    }
    return next;
  }

  for (let index = 0; index < end; index += 1) {
    const key = keys[index]!;
    if (key !== "__proto__") {
      next[key] = source[key];
      continue;
    }
    Object.defineProperty(next, key, {
      value: source[key],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return next;
}

function removedRootKeysMatchSuffix(
  keys: ReadonlyArray<string>,
  keepCount: number,
  removedKeys: Record<string, true>,
): boolean {
  for (let index = keepCount; index < keys.length; index += 1) {
    if (!objectHasOwn.call(removedKeys, keys[index]!)) return false;
  }
  return true;
}

// 단일 op + schema 검증. applied 는 `/-` 가 적용 시점의 concrete index 로 정규화된 op.
export function applyOperation<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  op: JSONPatchOperation,
): ApplyResult<S> {
  const stateJsonErr = jsonSerializableError(state);
  if (stateJsonErr) return { state, result: fail("not_serializable", stateJsonErr), applied: [] };
  const shape = validateOperationShape(op);
  if (shape) return { state, result: fail(shape.error, shape.reason), applied: [] };
  const normalized = normalizeOp(op, state);
  const r = applyOpRaw(state, normalized);
  if ("error" in r) return { state, result: fail(r.error, r.reason, r.pointer), applied: [] };
  if (normalized.op === "test") return { state, result: ok, applied: [normalized] };
  const parsed = schema.safeParse(r.state);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  // #57 structural sharing: withMutated 이미 touched path 만 spread. parsed.data 대신 r.state 반환.
  return { state: r.state as z.output<S>, result: ok, applied: [normalized] };
}

// Batch (RFC 6902 §3): atomic — 한 op 실패 시 전체 롤백. Schema 검증은 끝에서 1회.
// applied 는 적용 시점 기준으로 `/-` 가 concrete index 로 정규화된 ops 의 누적.
export function applyPatch<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  const stateJsonErr = jsonSerializableError(state);
  if (stateJsonErr) return { state, result: fail("not_serializable", stateJsonErr), applied: [] };
  return applyPatchToTrustedState(schema, state, ops);
}

// Trusted-state path for callers that already verified `state` is JSON.
// Op values and schema validity are still checked for every patch.
export function applyPatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  if (!Array.isArray(ops)) {
    return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  }
  const appendFast = applyAppendOnlyAddPatch(state, ops);
  if (appendFast.handled) {
    const parsed = schema.safeParse(appendFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: appendFast.state as z.output<S>, result: ok, applied: appendFast.applied };
  }
  const tailRemoveFast = applyTailRemovePatch(state, ops);
  if (tailRemoveFast.handled) {
    const parsed = schema.safeParse(tailRemoveFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: tailRemoveFast.state as z.output<S>, result: ok, applied: tailRemoveFast.applied };
  }
  const rootObjectRemoveFast = applyRootObjectRemovePatch(state, ops);
  if (rootObjectRemoveFast.handled) {
    const parsed = schema.safeParse(rootObjectRemoveFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: rootObjectRemoveFast.state as z.output<S>, result: ok, applied: rootObjectRemoveFast.applied };
  }
  const rootObjectAddFast = applyRootObjectAddPatch(state, ops);
  if (rootObjectAddFast.handled) {
    const parsed = schema.safeParse(rootObjectAddFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: rootObjectAddFast.state as z.output<S>, result: ok, applied: rootObjectAddFast.applied };
  }
  const rootObjectReplaceFast = applyRootObjectReplacePatch(state, ops);
  if (rootObjectReplaceFast.handled) {
    const parsed = schema.safeParse(rootObjectReplaceFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: rootObjectReplaceFast.state as z.output<S>, result: ok, applied: rootObjectReplaceFast.applied };
  }
  const arrayReplaceFast = applySameArrayFieldReplacePatch(state, ops);
  if (arrayReplaceFast.handled) {
    const parsed = schema.safeParse(arrayReplaceFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: arrayReplaceFast.state as z.output<S>, result: ok, applied: arrayReplaceFast.applied };
  }
  const arrayNestedReplaceFast = applySameArrayNestedReplacePatch(state, ops);
  if (arrayNestedReplaceFast.handled) {
    const parsed = schema.safeParse(arrayNestedReplaceFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: arrayNestedReplaceFast.state as z.output<S>, result: ok, applied: arrayNestedReplaceFast.applied };
  }
  const arrayElementReplaceFast = applySameArrayElementReplacePatch(state, ops);
  if (arrayElementReplaceFast.handled) {
    const parsed = schema.safeParse(arrayElementReplaceFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: arrayElementReplaceFast.state as z.output<S>, result: ok, applied: arrayElementReplaceFast.applied };
  }
  const fast = applyIndependentReplacePatch(state, ops);
  if (fast.handled) {
    const parsed = schema.safeParse(fast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: fast.state as z.output<S>, result: ok, applied: fast.applied };
  }
  const arrayFast = applySameArrayStructuralPatch(state, ops);
  if (arrayFast.handled) {
    const parsed = schema.safeParse(arrayFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: arrayFast.state as z.output<S>, result: ok, applied: arrayFast.applied };
  }

  let cur: unknown = state;
  const normalized: JSONPatchOperation[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (!(i in ops)) {
      return { state, result: fail("invalid_pointer", `op[${i}]: op must be object`), applied: [] };
    }
    const shape = validateOperationShape(ops[i]!);
    if (shape) {
      return {
        state,
        result: fail(shape.error, `op[${i}]: ${shape.reason}`),
        applied: [],
      };
    }
    const n = normalizeOp(ops[i]!, cur);
    normalized.push(n);
    const r = applyOpRaw(cur, n);
    if ("error" in r) {
      return {
        state,
        result: fail(r.error, r.reason ? `op[${i}]: ${r.reason}` : `op[${i}]`, r.pointer),
        applied: [],
      };
    }
    cur = r.state;
  }
  const parsed = schema.safeParse(cur);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  // #57 structural sharing: withMutated 이미 touched path 만 spread. parsed.data 대신 cur 반환.
  return { state: cur as z.output<S>, result: ok, applied: normalized };
}

// Internal document path for a trusted JSON state plus a trusted JSON op value.
// This is intentionally narrow: public patch input and untrusted clipboard
// payloads still go through the normal JSON boundary.
export function applySingleTrustedValuePatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> | null {
  if (!Array.isArray(ops) || ops.length !== 1 || !(0 in ops)) return null;

  const op = ops[0]!;
  if (op === null || typeof op !== "object") return null;
  if (op.op !== "add" && op.op !== "replace") return null;

  const shape = validateOperationShape(op);
  if (shape) {
    return {
      state,
      result: fail(shape.error, `op[0]: ${shape.reason}`),
      applied: [],
    };
  }

  const normalized = normalizeOp(op, state);
  if (normalized.op !== "add" && normalized.op !== "replace") return null;

  const applied = applyTrustedValueMutation(state, normalized);
  if ("error" in applied) {
    return {
      state,
      result: fail(applied.error, applied.reason ? `op[0]: ${applied.reason}` : "op[0]", applied.pointer),
      applied: [],
    };
  }

  const parsed = schema.safeParse(applied.state);
  if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
  return { state: applied.state as z.output<S>, result: ok, applied: [normalized] };
}

// Internal replay path for history entries that were already accepted by
// applyPatch. It keeps RFC 6902 atomicity but skips schema revalidation.
export function applyTrustedPatch<T>(
  state: T,
  ops: ReadonlyArray<JSONPatchOperation>,
  options: TrustedPatchOptions = {},
): TrustedApplyResult<T> {
  if (!Array.isArray(ops)) {
    return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  }
  const valuesTrusted = options.valuesTrusted === true;
  const appendFast = applyAppendOnlyAddPatch(state, ops, valuesTrusted);
  if (appendFast.handled) {
    return { state: appendFast.state as T, result: ok, applied: appendFast.applied };
  }
  const tailRemoveFast = applyTailRemovePatch(state, ops);
  if (tailRemoveFast.handled) {
    return { state: tailRemoveFast.state as T, result: ok, applied: tailRemoveFast.applied };
  }
  const rootObjectRemoveFast = applyRootObjectRemovePatch(state, ops);
  if (rootObjectRemoveFast.handled) {
    return { state: rootObjectRemoveFast.state as T, result: ok, applied: rootObjectRemoveFast.applied };
  }
  const rootObjectAddFast = applyRootObjectAddPatch(state, ops, valuesTrusted);
  if (rootObjectAddFast.handled) {
    return { state: rootObjectAddFast.state as T, result: ok, applied: rootObjectAddFast.applied };
  }
  const arrayReplaceFast = applySameArrayFieldReplacePatch(state, ops, valuesTrusted);
  if (arrayReplaceFast.handled) {
    return { state: arrayReplaceFast.state as T, result: ok, applied: arrayReplaceFast.applied };
  }
  const arrayNestedReplaceFast = applySameArrayNestedReplacePatch(state, ops, valuesTrusted);
  if (arrayNestedReplaceFast.handled) {
    return { state: arrayNestedReplaceFast.state as T, result: ok, applied: arrayNestedReplaceFast.applied };
  }
  if (valuesTrusted) {
    const rootObjectReplaceFast = applyRootObjectReplacePatch(state, ops, true);
    if (rootObjectReplaceFast.handled) {
      return { state: rootObjectReplaceFast.state as T, result: ok, applied: rootObjectReplaceFast.applied };
    }
  }
  const arrayElementReplaceFast = applySameArrayElementReplacePatch(state, ops, valuesTrusted);
  if (arrayElementReplaceFast.handled) {
    return { state: arrayElementReplaceFast.state as T, result: ok, applied: arrayElementReplaceFast.applied };
  }
  const fast = applyIndependentReplacePatch(state, ops, valuesTrusted);
  if (fast.handled) {
    return { state: fast.state as T, result: ok, applied: fast.applied };
  }
  const arrayFast = applySameArrayStructuralPatch(state, ops, valuesTrusted);
  if (arrayFast.handled) {
    return { state: arrayFast.state as T, result: ok, applied: arrayFast.applied };
  }

  let cur: unknown = state;
  const normalized: JSONPatchOperation[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (!(i in ops)) {
      return { state, result: fail("invalid_pointer", `op[${i}]: op must be object`), applied: [] };
    }
    const shape = validateOperationShape(ops[i]!);
    if (shape) {
      return {
        state,
        result: fail(shape.error, `op[${i}]: ${shape.reason}`),
        applied: [],
      };
    }
    const n = normalizeOp(ops[i]!, cur);
    normalized.push(n);
    const r = applyOpRaw(cur, n);
    if ("error" in r) {
      return {
        state,
        result: fail(r.error, r.reason ? `op[${i}]: ${r.reason}` : `op[${i}]`, r.pointer),
        applied: [],
      };
    }
    cur = r.state;
  }
  return { state: cur as T, result: ok, applied: normalized };
}

// Internal replay for entries that already passed document commit validation.
// This keeps applyTrustedPatch's stricter value checks for local preflight users.
export function applyAcceptedPatch<T>(
  state: T,
  ops: ReadonlyArray<JSONPatchOperation>,
): TrustedApplyResult<T> {
  if (!Array.isArray(ops)) {
    return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  }

  if (ops.length === 1 && 0 in ops) {
    const op = ops[0]!;
    if (
      op !== null
      && typeof op === "object"
      && (op.op === "add" || op.op === "replace")
      && typeof op.path === "string"
      && "value" in op
    ) {
      const normalized = op.op === "add" && op.path.endsWith("/-")
        ? normalizeOp(op, state)
        : op;
      if (normalized.op === "add" || normalized.op === "replace") {
        const applied = applyTrustedValueMutation(state, normalized);
        if ("error" in applied) {
          return {
            state,
            result: fail(applied.error, applied.reason ? `op[0]: ${applied.reason}` : "op[0]", applied.pointer),
            applied: [],
          };
        }
        return { state: applied.state as T, result: ok, applied: [normalized] };
      }
    }
  }

  const arrayReplaceFast = applySameArrayFieldReplacePatch(state, ops, true);
  if (arrayReplaceFast.handled) {
    return { state: arrayReplaceFast.state as T, result: ok, applied: arrayReplaceFast.applied };
  }

  const arrayNestedReplaceFast = applySameArrayNestedReplacePatch(state, ops, true);
  if (arrayNestedReplaceFast.handled) {
    return { state: arrayNestedReplaceFast.state as T, result: ok, applied: arrayNestedReplaceFast.applied };
  }

  const arrayElementReplaceFast = applySameArrayElementReplacePatch(state, ops, true);
  if (arrayElementReplaceFast.handled) {
    return { state: arrayElementReplaceFast.state as T, result: ok, applied: arrayElementReplaceFast.applied };
  }

  const rootObjectRemoveFast = applyRootObjectRemovePatch(state, ops);
  if (rootObjectRemoveFast.handled) {
    return { state: rootObjectRemoveFast.state as T, result: ok, applied: rootObjectRemoveFast.applied };
  }

  const rootObjectAddFast = applyRootObjectAddPatch(state, ops, true);
  if (rootObjectAddFast.handled) {
    return { state: rootObjectAddFast.state as T, result: ok, applied: rootObjectAddFast.applied };
  }

  return applyTrustedPatch(state, ops, { valuesTrusted: true });
}

function applySameArrayFieldReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let arrayPath: Pointer | null = null;
  let arraySegments: string[] | null = null;
  let field: string | null = null;
  let arrayValue: unknown[] | null = null;
  const updates = new Map<number, unknown>();
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return { handled: false };
    const op = ops[opIndex]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") {
      return { handled: false };
    }
    const normalized = normalizeOp(op, state);
    if (normalized.op !== "replace") return { handled: false };
    const location = parseArrayFieldPath(normalized.path);
    if (location === null) return { handled: false };
    if (field === null) field = location.key;
    else if (field !== location.key) return { handled: false };

    if (arrayValue === null) {
      arrayPath = location.arrayPath;
      const parsedArray = parseSafe(arrayPath);
      if (!("ok" in parsedArray)) return { handled: false };
      arraySegments = parsedArray.segs;
      const current = getValueAt(state, arraySegments);
      if (!current.ok || !Array.isArray(current.value)) return { handled: false };
      arrayValue = current.value;
    } else if (arrayPath !== location.arrayPath) {
      return { handled: false };
    }

    if (!valuesTrusted && jsonSerializableError(normalized.value) !== null) return { handled: false };

    if (arrayValue === null || location.index < 0 || location.index >= arrayValue.length) return { handled: false };
    const row = arrayValue[location.index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) return { handled: false };
    if (!objectHasOwn.call(row, location.key)) return { handled: false };
    updates.set(location.index, normalized.value);
    applied[opIndex] = normalized;
  }

  if (arraySegments === null || field === null || arrayValue === null) return { handled: false };
  const next = arrayValue.slice();
  for (const [rowIndex, value] of updates) {
    const row = arrayValue[rowIndex] as Record<string, unknown>;
    const replaced = { ...row };
    if (field === "__proto__") {
      Object.defineProperty(replaced, field, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      replaced[field] = value;
    }
    next[rowIndex] = replaced;
  }

  const stateWithArray = replaceValueAtSegments(state, arraySegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applySameArrayNestedReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let arrayPath: Pointer | null = null;
  let arraySegments: string[] | null = null;
  let simplePrefixText: string | null = null;
  let simpleSuffixText: string | null = null;
  let suffixSegments: string[] | null = null;
  let arrayValue: unknown[] | null = null;
  const updates = new Map<number, unknown>();
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    if (!(opIndex in ops)) return { handled: false };
    const op = ops[opIndex]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") {
      return { handled: false };
    }
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };

    const location: ArrayNestedPath | null = arrayPath === null
      ? parseFirstArrayNestedPath(state, op.path)
      : suffixSegments === null
        || arraySegments === null
        ? null
        : parseKnownArrayNestedPath(op.path, arrayPath, arraySegments, suffixSegments, simplePrefixText, simpleSuffixText);
    if (location === null) return { handled: false };

    if (arrayValue === null) {
      arrayPath = location.arrayPath;
      arraySegments = location.arraySegments;
      simplePrefixText = location.simplePrefixText;
      simpleSuffixText = location.simpleSuffixText;
      suffixSegments = location.suffixSegments;
      const current = getValueAt(state, location.arraySegments);
      if (!current.ok || !Array.isArray(current.value)) return { handled: false };
      arrayValue = current.value;
    }

    if (location.index < 0 || location.index >= arrayValue.length) return { handled: false };
    if (!getValueAt(arrayValue[location.index], location.suffixSegments).ok) return { handled: false };
    updates.set(location.index, op.value);
    applied[opIndex] = op;
  }

  if (arraySegments === null || suffixSegments === null || arrayValue === null) return { handled: false };
  const next = arrayValue.slice();
  for (const [rowIndex, value] of updates) {
    const replaced = replaceValueAtSegments(arrayValue[rowIndex], suffixSegments, 0, value);
    if (replaced === null) return { handled: false };
    next[rowIndex] = replaced;
  }

  const stateWithArray = replaceValueAtSegments(state, arraySegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyAppendOnlyAddPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  let appendPath: Pointer | null = null;
  const values = new Array<unknown>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      op === null
      || typeof op !== "object"
      || op.op !== "add"
      || typeof op.path !== "string"
      || !("value" in op)
      || !op.path.endsWith("/-")
    ) {
      return { handled: false };
    }

    if (appendPath === null) {
      appendPath = op.path;
      parent = op.path.slice(0, -2);
    } else if (op.path !== appendPath) {
      return { handled: false };
    }

    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    values[index] = op.value;
  }

  if (parent === null) return { handled: false };
  const parsedParent = parseSafe(parent);
  if (!("ok" in parsedParent)) return { handled: false };
  const current = getValueAt(state, parsedParent.segs);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };

  const initialLength = current.value.length;
  const stateWithArray = replaceValueAtSegments(
    state,
    parsedParent.segs,
    0,
    current.value.concat(values),
  );
  if (stateWithArray === null) return { handled: false };

  const applied = new Array<JSONPatchOperation>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    applied[index] = {
      op: "add",
      path: appendArrayIndexPath(parent, initialLength + index),
      value: values[index],
    };
  }

  return {
    handled: true,
    state: stateWithArray,
    applied,
  };
}

function applyTailRemovePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  let parentSegments: string[] | null = null;
  let currentArray: unknown[] | null = null;
  let initialLength = 0;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      op === null
      || typeof op !== "object"
      || op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
    ) {
      return { handled: false };
    }

    const location = arrayRemoveLocation(op.path);
    if (location === null) return { handled: false };

    if (parent === null) {
      parent = location.parent;
      const parsedParent = parseSafe(parent);
      if (!("ok" in parsedParent)) return { handled: false };
      const current = getValueAt(state, parsedParent.segs);
      if (!current.ok || !Array.isArray(current.value) || ops.length > current.value.length) {
        return { handled: false };
      }
      parentSegments = parsedParent.segs;
      currentArray = current.value;
      initialLength = current.value.length;
    } else if (parent !== location.parent) {
      return { handled: false };
    }

    if (location.index !== initialLength - index - 1) return { handled: false };
    applied[index] = { op: "remove", path: op.path };
  }

  if (parentSegments === null || currentArray === null) return { handled: false };
  const stateWithArray = replaceValueAtSegments(
    state,
    parentSegments,
    0,
    currentArray.slice(0, initialLength - ops.length),
  );
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyRootObjectRemovePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): FastPatchResult {
  if (ops.length < 2 || state === null || typeof state !== "object" || Array.isArray(state)) {
    return { handled: false };
  }

  const source = state as Record<string, unknown>;
  const sourceKeys = Object.keys(source);
  let removedKeys: Record<string, true> | null = null;
  let matchesReverseSuffix = ops.length <= sourceKeys.length;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "remove"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return { handled: false };
    }

    const key = op.path.slice(1);
    if (matchesReverseSuffix && key === sourceKeys[sourceKeys.length - index - 1]) {
      applied[index] = op;
      continue;
    }
    matchesReverseSuffix = false;
    if (removedKeys === null) {
      removedKeys = Object.create(null) as Record<string, true>;
      for (let seenIndex = 0; seenIndex < index; seenIndex += 1) {
        removedKeys[ops[seenIndex]!.path.slice(1)] = true;
      }
    }
    if (!objectHasOwn.call(source, key) || objectHasOwn.call(removedKeys, key)) {
      return { handled: false };
    }
    removedKeys[key] = true;
    applied[index] = op;
  }

  if (ops.length === sourceKeys.length) {
    return { handled: true, state: {}, applied };
  }
  const keepCount = sourceKeys.length - ops.length;
  if (removedKeys === null || removedRootKeysMatchSuffix(sourceKeys, keepCount, removedKeys)) {
    return {
      handled: true,
      state: copyRootObjectKeyPrefix(source, sourceKeys, keepCount),
      applied,
    };
  }
  if (ops.length * 2 < sourceKeys.length) {
    const next = copyRootObjectKeys(source, sourceKeys);
    for (let index = 0; index < ops.length; index += 1) {
      delete next[ops[index]!.path.slice(1)];
    }
    return { handled: true, state: next, applied };
  }

  const next: Record<string, unknown> = {};
  for (const key of sourceKeys) {
    if (objectHasOwn.call(removedKeys, key)) continue;
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: source[key],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = source[key];
    }
  }

  return { handled: true, state: next, applied };
}

function applyRootObjectAddPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2 || state === null || typeof state !== "object" || Array.isArray(state)) {
    return { handled: false };
  }

  let next: Record<string, unknown> | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || typeof op.path !== "string"
      || op.path === ""
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return { handled: false };
    }
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };

    const key = op.path.slice(1);
    if (next === null) next = copyRootObject(state as Record<string, unknown>);
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
    applied[index] = op;
  }

  return next === null
    ? { handled: false }
    : { handled: true, state: next, applied };
}

function applyRootObjectReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2 || state === null || typeof state !== "object" || Array.isArray(state)) {
    return { handled: false };
  }

  let next: Record<string, unknown> | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);
  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "replace"
      || typeof op.path !== "string"
      || op.path[0] !== "/"
      || op.path.includes("~")
      || op.path.indexOf("/", 1) !== -1
    ) {
      return { handled: false };
    }
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };

    const key = op.path.slice(1);
    if (key === "" || !objectHasOwn.call(state, key)) return { handled: false };

    if (next === null) next = copyRootObject(state as Record<string, unknown>);
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
    applied[index] = op;
  }

  return next === null
    ? { handled: false }
    : { handled: true, state: next, applied };
}

function applyIndependentReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  const items: Array<{ op: JSONPatchOperation; path: Pointer; segments: string[]; value: unknown }> = [];
  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") {
      return { handled: false };
    }
    const normalized = normalizeOp(op, state);
    if (normalized.op !== "replace") return { handled: false };
    const parsed = parseSafe(normalized.path);
    if (!("ok" in parsed)) return { handled: false };
    if (!getValueAt(state, parsed.segs).ok) return { handled: false };
    if (!valuesTrusted && jsonSerializableError(normalized.value) !== null) return { handled: false };
    items.push({ op: normalized, path: normalized.path, segments: parsed.segs, value: normalized.value });
  }

  if (!hasIndependentPaths(items)) return { handled: false };
  return { handled: true, state: applyReplaceTree(state, buildReplaceTree(items)), applied: items.map((item) => item.op) };
}

function applySameArrayElementReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  let parentSegments: string[] | null = null;
  let next: unknown[] | null = null;
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || op.op !== "replace" || op.path === "") {
      return { handled: false };
    }
    const location = arrayRemoveLocation(op.path);
    if (location === null) return { handled: false };
    if (parent === null) {
      parent = location.parent;
      const parsedParent = parseSafe(parent);
      if (!("ok" in parsedParent)) return { handled: false };
      parentSegments = parsedParent.segs;
      const current = getValueAt(state, parentSegments);
      if (!current.ok || !Array.isArray(current.value)) return { handled: false };
      next = current.value.slice();
    } else if (parent !== location.parent) {
      return { handled: false };
    }

    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    if (next === null || location.index < 0 || location.index >= next.length) return { handled: false };
    next[location.index] = op.value;
    applied[index] = op;
  }

  if (parentSegments === null || next === null) return { handled: false };
  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applySameArrayStructuralPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 1) return { handled: false };

  const increasingAddFast = applyIncreasingArrayAddOpsPatch(state, ops, valuesTrusted);
  if (increasingAddFast !== null) return increasingAddFast;

  let parent: Pointer | null = null;
  const items: SameArrayStructuralItem[] = [];

  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || (
        op.op !== "add"
        && op.op !== "remove"
        && op.op !== "copy"
        && op.op !== "move"
      )
      || op.path === ""
    ) {
      return { handled: false };
    }
    const location = arrayLocation(op.path);
    if (!location) return { handled: false };
    if (parent === null) {
      parent = location.parent;
    } else if (location.parent !== parent) {
      return { handled: false };
    }
    if (op.op === "add") {
      if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
      items.push({ op: "add", path: op.path, index: location.index, value: op.value });
    } else if (op.op === "remove") {
      if (location.index === "-") return { handled: false };
      items.push({ op: "remove", path: op.path, index: location.index });
    } else {
      const fromLocation = arrayLocation(op.from);
      if (!fromLocation || fromLocation.parent !== parent || fromLocation.index === "-") {
        return { handled: false };
      }
      items.push({
        op: op.op,
        from: op.from,
        path: op.path,
        fromIndex: fromLocation.index,
        index: location.index,
      });
    }
  }

  if (parent === null) return { handled: false };
  const parsedParent = parseSafe(parent);
  if (!("ok" in parsedParent)) return { handled: false };
  const current = getValueAt(state, parsedParent.segs);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };

  const parsedIncreasingAddFast = applyIncreasingArrayAddPatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (parsedIncreasingAddFast !== null) return parsedIncreasingAddFast;

  const nonDecreasingRemoveFast = applyNonDecreasingArrayRemovePatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (nonDecreasingRemoveFast !== null) return nonDecreasingRemoveFast;

  const nonIncreasingAddFast = applyNonIncreasingArrayAddPatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (nonIncreasingAddFast !== null) return nonIncreasingAddFast;

  const nonIncreasingCopyFast = applyNonIncreasingArrayCopyPatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (nonIncreasingCopyFast !== null) return nonIncreasingCopyFast;

  const appendThenRemoveFast = applyAppendThenNonDecreasingRemovePatch(
    state,
    parent,
    parsedParent.segs,
    current.value,
    items,
  );
  if (appendThenRemoveFast !== null) return appendThenRemoveFast;

  if (items.length === 1) {
    const item = items[0]!;
    if (item.op === "add") {
      const index = item.index === "-" ? current.value.length : item.index;
      if (index < 0 || index > current.value.length) return { handled: false };
      if (index === current.value.length) {
        const stateWithArray = replaceValueAtSegments(
          state,
          parsedParent.segs,
          0,
          current.value.concat([item.value]),
        );
        return stateWithArray === null
          ? { handled: false }
          : {
              handled: true,
              state: stateWithArray,
              applied: [{ op: "add", path: appendSegment(parent, index), value: item.value }],
            };
      }
    } else if (item.op === "remove") {
      if (item.index < 0 || item.index >= current.value.length) return { handled: false };
      if (item.index === current.value.length - 1) {
        const stateWithArray = replaceValueAtSegments(state, parsedParent.segs, 0, current.value.slice(0, item.index));
        return stateWithArray === null
          ? { handled: false }
          : { handled: true, state: stateWithArray, applied: [{ op: "remove", path: item.path }] };
      }
    } else if (item.op === "copy") {
      if (item.fromIndex < 0 || item.fromIndex >= current.value.length) return { handled: false };
      const index = item.index === "-" ? current.value.length : item.index;
      if (index < 0 || index > current.value.length) return { handled: false };
      if (index === current.value.length) {
        const value = deepCloneTrusted(current.value[item.fromIndex]);
        const stateWithArray = replaceValueAtSegments(state, parsedParent.segs, 0, current.value.concat([value]));
        return stateWithArray === null
          ? { handled: false }
          : {
              handled: true,
              state: stateWithArray,
              applied: [{ op: "copy", from: item.from, path: appendSegment(parent, index) }],
            };
      }
    }
  }

  const next = current.value.slice();
  const applied: JSONPatchOperation[] = [];
  for (const item of items) {
    if (item.op === "add") {
      const index = item.index === "-" ? next.length : item.index;
      if (index < 0 || index > next.length) return { handled: false };
      if (index === next.length) next.push(item.value);
      else next.splice(index, 0, item.value);
      applied.push({ op: "add", path: appendSegment(parent, index), value: item.value });
      continue;
    }

    if (item.op === "remove") {
      if (item.index < 0 || item.index >= next.length) return { handled: false };
      if (item.index === next.length - 1) next.pop();
      else next.splice(item.index, 1);
      applied.push({ op: "remove", path: item.path });
      continue;
    }

    if (item.fromIndex < 0 || item.fromIndex >= next.length) return { handled: false };
    const index = item.index === "-" ? next.length : item.index;
    if (item.op === "copy") {
      if (index < 0 || index > next.length) return { handled: false };
      const value = deepCloneTrusted(next[item.fromIndex]);
      if (index === next.length) next.push(value);
      else next.splice(index, 0, value);
      applied.push({ op: "copy", from: item.from, path: appendSegment(parent, index) });
      continue;
    }

    if (index < 0 || index >= next.length) return { handled: false };
    if (item.fromIndex === index) {
      applied.push({ op: "move", from: item.from, path: appendSegment(parent, index) });
      continue;
    }
    if (Math.abs(item.fromIndex - index) === 1) {
      const value = next[item.fromIndex];
      next[item.fromIndex] = next[index];
      next[index] = value;
    } else {
      const [value] = next.splice(item.fromIndex, 1);
      if (index < 0 || index > next.length) return { handled: false };
      next.splice(index, 0, value);
    }
    applied.push({ op: "move", from: item.from, path: appendSegment(parent, index) });
  }

  const stateWithArray = replaceValueAtSegments(state, parsedParent.segs, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyIncreasingArrayAddOpsPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted: boolean,
): FastPatchResult | null {
  if (ops.length < 2) return null;
  const first = ops[0];
  if (
    first === undefined
    || validateOperationShape(first) !== null
    || first.op !== "add"
    || first.path === ""
    || first.path.endsWith("/-")
  ) {
    return null;
  }

  const firstLocation = arrayLocation(first.path);
  if (firstLocation === null || firstLocation.index === "-") return null;

  const parent = firstLocation.parent;
  const start = firstLocation.index;
  const values = new Array<unknown>(ops.length);
  const applied = new Array<JSONPatchOperation>(ops.length);

  for (let index = 0; index < ops.length; index += 1) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (
      validateOperationShape(op) !== null
      || op.op !== "add"
      || op.path === ""
      || op.path.endsWith("/-")
    ) {
      return null;
    }

    const location = arrayLocation(op.path);
    if (location === null || location.index === "-" || location.parent !== parent) return null;
    if (location.index !== start + index) return null;
    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    values[index] = op.value;
    applied[index] = {
      op: "add",
      path: appendSegment(parent, location.index),
      value: op.value,
    };
  }

  const parsedParent = parseSafe(parent);
  if (!("ok" in parsedParent)) return { handled: false };
  const current = getValueAt(state, parsedParent.segs);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };
  if (start < 0 || start > current.value.length) return { handled: false };

  const next = start === current.value.length
    ? current.value.concat(values)
    : current.value.slice(0, start).concat(values, current.value.slice(start));
  const stateWithArray = replaceValueAtSegments(state, parsedParent.segs, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyIncreasingArrayAddPatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 1) return null;

  let start = -1;
  const values = new Array<unknown>(items.length);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.op !== "add" || item.index === "-") return null;
    if (index === 0) {
      start = item.index;
      if (start < 0 || start > current.length) return { handled: false };
    } else if (item.index !== start + index) {
      return null;
    }
    values[index] = item.value;
    applied[index] = {
      op: "add",
      path: appendSegment(parent, start + index),
      value: item.value,
    };
  }

  const next = start === current.length
    ? current.concat(values)
    : current.slice(0, start).concat(values, current.slice(start));
  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyNonDecreasingArrayRemovePatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  let previousIndex = -1;
  const removedIndexes = new Array<number>(items.length);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op !== "remove") return null;
    if (item.index < previousIndex) return null;

    const sourceIndex = item.index + itemIndex;
    if (item.index < 0 || sourceIndex >= current.length) return { handled: false };
    removedIndexes[itemIndex] = sourceIndex;
    applied[itemIndex] = { op: "remove", path: item.path };
    previousIndex = item.index;
  }

  const next = new Array<unknown>(current.length - items.length);
  let removeIndex = 0;
  let write = 0;
  for (let index = 0; index < current.length; index += 1) {
    if (removeIndex < removedIndexes.length && index === removedIndexes[removeIndex]) {
      removeIndex += 1;
      continue;
    }
    next[write] = current[index];
    write += 1;
  }

  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyNonIncreasingArrayAddPatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  let previousIndex = Number.POSITIVE_INFINITY;
  const buckets = new Array<unknown[] | undefined>(current.length + 1);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op !== "add" || item.index === "-") return null;
    if (item.index > previousIndex) return null;
    if (item.index < 0 || item.index > current.length) return { handled: false };

    const bucket = buckets[item.index];
    if (bucket === undefined) buckets[item.index] = [item.value];
    else bucket.push(item.value);
    applied[itemIndex] = {
      op: "add",
      path: appendSegment(parent, item.index),
      value: item.value,
    };
    previousIndex = item.index;
  }

  const next = new Array<unknown>(current.length + items.length);
  let write = 0;
  for (let index = 0; index <= current.length; index += 1) {
    const bucket = buckets[index];
    if (bucket !== undefined) {
      for (let bucketIndex = bucket.length - 1; bucketIndex >= 0; bucketIndex -= 1) {
        next[write] = bucket[bucketIndex];
        write += 1;
      }
    }
    if (index < current.length) {
      next[write] = current[index];
      write += 1;
    }
  }

  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyNonIncreasingArrayCopyPatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  let previousIndex = Number.POSITIVE_INFINITY;
  let previousMinimumInsertIndex = Number.POSITIVE_INFINITY;
  const buckets = new Array<unknown[] | undefined>(current.length + 1);
  const applied = new Array<JSONPatchOperation>(items.length);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op !== "copy" || item.index === "-") return null;
    if (item.index > previousIndex) return null;
    if (item.index < 0 || item.index > current.length) return { handled: false };
    if (item.fromIndex < 0 || item.fromIndex >= current.length) return { handled: false };
    if (item.fromIndex >= previousMinimumInsertIndex) return null;

    const value = deepCloneTrusted(current[item.fromIndex]);
    const bucket = buckets[item.index];
    if (bucket === undefined) buckets[item.index] = [value];
    else bucket.push(value);
    applied[itemIndex] = {
      op: "copy",
      from: item.from,
      path: appendSegment(parent, item.index),
    };
    previousIndex = item.index;
    if (item.index < previousMinimumInsertIndex) previousMinimumInsertIndex = item.index;
  }

  const next = new Array<unknown>(current.length + items.length);
  let write = 0;
  for (let index = 0; index <= current.length; index += 1) {
    const bucket = buckets[index];
    if (bucket !== undefined) {
      for (let bucketIndex = bucket.length - 1; bucketIndex >= 0; bucketIndex -= 1) {
        next[write] = bucket[bucketIndex];
        write += 1;
      }
    }
    if (index < current.length) {
      next[write] = current[index];
      write += 1;
    }
  }

  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

function applyAppendThenNonDecreasingRemovePatch(
  state: unknown,
  parent: Pointer,
  parentSegments: ReadonlyArray<string>,
  current: ReadonlyArray<unknown>,
  items: ReadonlyArray<SameArrayStructuralItem>,
): FastPatchResult | null {
  if (items.length < 2) return null;

  const values: unknown[] = [];
  const removedIndexes: number[] = [];
  const applied = new Array<JSONPatchOperation>(items.length);
  let removing = false;
  let previousRemoveIndex = -1;

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    if (item.op === "add") {
      if (removing) return null;
      const expectedAppendIndex = current.length + values.length;
      if (item.index !== "-" && item.index !== expectedAppendIndex) return null;
      values.push(item.value);
      applied[itemIndex] = {
        op: "add",
        path: appendSegment(parent, expectedAppendIndex),
        value: item.value,
      };
      continue;
    }

    if (item.op !== "remove") return null;
    removing = true;
    if (item.index < previousRemoveIndex) return null;
    const sourceIndex = item.index + removedIndexes.length;
    if (item.index < 0 || sourceIndex >= current.length) return { handled: false };
    removedIndexes.push(sourceIndex);
    applied[itemIndex] = { op: "remove", path: item.path };
    previousRemoveIndex = item.index;
  }

  if (values.length === 0 || removedIndexes.length === 0) return null;

  const next = new Array<unknown>(current.length - removedIndexes.length + values.length);
  let removeIndex = 0;
  let write = 0;
  for (let index = 0; index < current.length; index += 1) {
    if (removeIndex < removedIndexes.length && index === removedIndexes[removeIndex]) {
      removeIndex += 1;
      continue;
    }
    next[write] = current[index];
    write += 1;
  }
  for (let index = 0; index < values.length; index += 1) {
    next[write] = values[index];
    write += 1;
  }

  const stateWithArray = replaceValueAtSegments(state, parentSegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied };
}

interface ReplaceTree {
  value?: unknown;
  children: Map<string, ReplaceTree>;
}

function buildReplaceTree(items: ReadonlyArray<{ segments: string[]; value: unknown }>): ReplaceTree {
  const root: ReplaceTree = { children: new Map() };
  for (const item of items) {
    let node = root;
    for (const segment of item.segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.value = item.value;
  }
  return root;
}

function applyReplaceTree(value: unknown, tree: ReplaceTree): unknown {
  if (tree.children.size === 0) return tree.value;
  if (Array.isArray(value)) {
    const next = value.slice();
    for (const [segment, child] of tree.children) {
      next[Number(segment)] = applyReplaceTree(next[Number(segment)], child);
    }
    return next;
  }
  const next = { ...(value as Record<string, unknown>) };
  for (const [segment, child] of tree.children) {
    next[segment] = applyReplaceTree(next[segment], child);
  }
  return next;
}

function hasIndependentPaths(paths: ReadonlyArray<{ path: string }>): boolean {
  const sorted = paths.map((item) => item.path).sort();
  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current === previous || current.startsWith(`${previous}/`)) return false;
  }
  return true;
}

function arrayLocation(path: Pointer): { parent: Pointer; index: number | "-" } | null {
  const parent = parentPointer(path);
  if (parent === null) return null;
  const parsed = parseSafe(path);
  if (!("ok" in parsed)) return null;
  const segment = parsed.segs[parsed.segs.length - 1];
  if (segment === undefined) return null;
  const index = segment === "-" ? "-" : numericSegment(segment);
  return index === null ? null : { parent, index };
}

function arrayRemoveLocation(path: Pointer): { parent: Pointer; index: number } | null {
  const simple = parseSimpleArrayElementPath(path);
  if (simple !== null) return simple;

  const location = arrayLocation(path);
  return location === null || location.index === "-"
    ? null
    : { parent: location.parent, index: location.index };
}

function numericSegment(segment: string): number | null {
  if (segment.length === 0) return null;
  const first = segment.charCodeAt(0);
  if (first === 48) return segment.length === 1 ? 0 : null;
  if (first < 49 || first > 57) return null;
  for (let index = 1; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    if (code < 48 || code > 57) return null;
  }
  return Number(segment);
}

function appendArrayIndexPath(parent: Pointer, index: number): Pointer {
  return parent === "" ? `/${index}` : `${parent}/${index}`;
}

function indexDirection(previous: number, current: number): -1 | 0 | 1 {
  return current > previous ? 1 : current < previous ? -1 : 0;
}

function parseArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  const simple = parseSimpleArrayFieldPath(path);
  if (simple !== null) return simple;

  const parsed = parseSafe(path);
  if (!("ok" in parsed) || parsed.segs.length < 2) return null;
  const key = parsed.segs[parsed.segs.length - 1]!;
  const index = numericSegment(parsed.segs[parsed.segs.length - 2]!);
  return index === null
    ? null
    : { arrayPath: buildPointer(parsed.segs.slice(0, -2)), index, key };
}

function parseSimpleArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  if (index === null) return null;

  return { arrayPath: path.slice(0, indexSlash), index, key: path.slice(keySlash + 1) };
}

function parseFirstArrayNestedPath(state: unknown, path: Pointer): ArrayNestedPath | null {
  const parsed = parseSafe(path);
  if (!("ok" in parsed) || parsed.segs.length < 3) return null;

  for (let index = 0; index < parsed.segs.length - 1; index += 1) {
    const rowIndex = numericSegment(parsed.segs[index]!);
    if (rowIndex === null) continue;

    const arraySegments = parsed.segs.slice(0, index);
    const current = getValueAt(state, arraySegments);
    if (!current.ok || !Array.isArray(current.value)) continue;

    const hasEscapedSegment = path.includes("~");
    const suffixSegments = parsed.segs.slice(index + 1);
    return {
      arrayPath: buildPointer(arraySegments),
      arraySegments,
      index: rowIndex,
      simplePrefixText: hasEscapedSegment ? null : simpleArrayNestedPrefixText(arraySegments),
      simpleSuffixText: hasEscapedSegment ? null : `/${suffixSegments.join("/")}`,
      suffixSegments,
    };
  }

  return null;
}

function parseKnownArrayNestedPath(
  path: Pointer,
  arrayPath: Pointer,
  knownArraySegments: string[],
  suffixSegments: string[],
  simplePrefixText: string | null,
  simpleSuffixText: string | null,
): ArrayNestedPath | null {
  if (simplePrefixText !== null && simpleSuffixText !== null) {
    const index = parseKnownSimpleArrayNestedIndex(path, simplePrefixText, simpleSuffixText);
    if (index !== null) {
      return {
        arrayPath,
        arraySegments: knownArraySegments,
        index,
        simplePrefixText,
        simpleSuffixText,
        suffixSegments,
      };
    }
  }

  const parsed = parseSafe(path);
  if (!("ok" in parsed) || parsed.segs.length < suffixSegments.length + 2) return null;

  const arraySegmentsLength = parsed.segs.length - suffixSegments.length - 1;
  for (let index = 0; index < suffixSegments.length; index += 1) {
    if (parsed.segs[arraySegmentsLength + 1 + index] !== suffixSegments[index]) return null;
  }

  const arraySegments = parsed.segs.slice(0, arraySegmentsLength);
  if (buildPointer(arraySegments) !== arrayPath) return null;

  const rowIndex = numericSegment(parsed.segs[arraySegmentsLength]!);
  return rowIndex === null
    ? null
    : {
        arrayPath,
        arraySegments,
        index: rowIndex,
        simplePrefixText: null,
        simpleSuffixText: null,
        suffixSegments: parsed.segs.slice(arraySegmentsLength + 1),
      };
}

function simpleArrayNestedPrefixText(arraySegments: ReadonlyArray<string>): string {
  return arraySegments.length === 0 ? "/" : `/${arraySegments.join("/")}/`;
}

function parseKnownSimpleArrayNestedIndex(
  path: Pointer,
  prefixText: string,
  suffixText: string,
): number | null {
  if (path.includes("~") || !path.startsWith(prefixText) || !path.endsWith(suffixText)) return null;
  const indexEnd = path.length - suffixText.length;
  const indexText = path.slice(prefixText.length, indexEnd);
  return indexText.includes("/") ? null : numericSegment(indexText);
}

function parseSimpleArrayElementPath(path: Pointer): { parent: Pointer; index: number } | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const indexSlash = path.lastIndexOf("/");
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1));
  return index === null
    ? null
    : { parent: path.slice(0, indexSlash), index };
}

function applyTrustedValueMutation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "add" | "replace" }>,
): { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer } {
  if (op.path === "") return { state: op.value };

  const singleSegment = applySingleSegmentTrustedValueMutation(state, op);
  if (singleSegment !== null) return singleSegment;

  const parsed = parseSafe(op.path);
  if ("error" in parsed) return parsed;

  const verb = op.op === "add" ? "set" : "replace";
  const result = withMutated(
    state,
    parsed.segs,
    (parent, key) => mutateContainer(parent, key, verb, op.value),
  );
  return "error" in result ? { ...result, pointer: op.path } : result;
}

function applySingleSegmentTrustedValueMutation(
  state: unknown,
  op: Extract<JSONPatchOperation, { op: "add" | "replace" }>,
): { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer } | null {
  if (op.path[0] !== "/" || op.path.includes("~") || op.path.indexOf("/", 1) !== -1) return null;
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    const key = op.path.slice(1);
    if (op.op === "replace" && !objectHasOwn.call(state, key)) {
      return { error: "path_not_found", reason: `object key: ${key}`, pointer: op.path };
    }
    const next = { ...(state as Record<string, unknown>) };
    if (key === "__proto__") {
      Object.defineProperty(next, key, {
        value: op.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      next[key] = op.value;
    }
    return { state: next };
  }

  const verb = op.op === "add" ? "set" : "replace";
  const result = mutateContainer(state, op.path.slice(1), verb, op.value);
  return "error" in result ? { ...result, pointer: op.path } : { state: result.value };
}

function replaceValueAtSegments(
  current: unknown,
  segments: ReadonlyArray<string>,
  index: number,
  value: unknown,
): unknown | null {
  if (index === segments.length) return value;
  if (current === null || typeof current !== "object") return null;

  const segment = segments[index]!;
  if (Array.isArray(current)) {
    const childIndex = numericSegment(segment);
    if (childIndex === null || childIndex >= current.length) return null;
    const child = replaceValueAtSegments(current[childIndex], segments, index + 1, value);
    if (child === null) return null;
    const next = current.slice();
    next[childIndex] = child;
    return next;
  }

  if (!objectHasOwn.call(current, segment)) return null;
  const child = replaceValueAtSegments(
    (current as Record<string, unknown>)[segment],
    segments,
    index + 1,
    value,
  );
  if (child === null) return null;
  return {
    ...(current as Record<string, unknown>),
    [segment]: child,
  };
}
