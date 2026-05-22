// RFC 6902 — JSON Patch. SPEC.md §3.
// Root public surface: types + applyOperation + applyPatch.
// computeInverses stays source-internal for document history.

import type * as z from "zod";
import { jsonSerializableError } from "../json.js";
import { appendSegment, parentPointer, type Pointer } from "../json-pointer/index.js";
import { applyOpRaw, validateOperationShape } from "./apply.js";
import { getValueAt, normalizeOp, parseSafe } from "./internal.js";

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

type FastPatchResult =
  | { handled: true; state: unknown; applied: ReadonlyArray<JSONPatchOperation> }
  | { handled: false };

const ok: JSONResult = { ok: true };
const fail = (code: ErrorCode, reason?: string, pointer?: Pointer): JSONResult => {
  const r: { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer } = { ok: false, code };
  if (reason !== undefined) r.reason = reason;
  if (pointer !== undefined) r.pointer = pointer;
  return r;
};
const zodIssuesReason = (error: z.ZodError): string => JSON.stringify(error.issues);

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

// Internal document path for callers that already verified `state` is JSON.
// Op values and schema validity are still checked for every patch.
export function applyPatchToTrustedState<S extends z.ZodTypeAny>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JSONPatchOperation>,
): ApplyResult<S> {
  if (!Array.isArray(ops)) {
    return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  }
  const fast = applyIndependentReplacePatch(state, ops);
  if (fast.handled) {
    const parsed = schema.safeParse(fast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: fast.state as z.output<S>, result: ok, applied: fast.applied };
  }
  const arrayFast = applySameArrayAddRemovePatch(state, ops);
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

// Internal replay path for history entries that were already accepted by
// applyPatch. It keeps RFC 6902 atomicity but skips schema revalidation.
export function applyTrustedPatch<T>(
  state: T,
  ops: ReadonlyArray<JSONPatchOperation>,
): TrustedApplyResult<T> {
  if (!Array.isArray(ops)) {
    return { state, result: fail("invalid_pointer", "patch must be an array"), applied: [] };
  }
  const fast = applyIndependentReplacePatch(state, ops);
  if (fast.handled) {
    return { state: fast.state as T, result: ok, applied: fast.applied };
  }
  const arrayFast = applySameArrayAddRemovePatch(state, ops);
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

function applyIndependentReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
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
    if (jsonSerializableError(normalized.value) !== null) return { handled: false };
    items.push({ op: normalized, path: normalized.path, segments: parsed.segs, value: normalized.value });
  }

  if (!hasIndependentPaths(items)) return { handled: false };
  return { handled: true, state: applyReplaceTree(state, buildReplaceTree(items)), applied: items.map((item) => item.op) };
}

function applySameArrayAddRemovePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  const items: Array<
    | { op: "add"; path: Pointer; index: number | "-"; value: unknown }
    | { op: "remove"; path: Pointer; index: number }
  > = [];

  for (let index = 0; index < ops.length; index++) {
    if (!(index in ops)) return { handled: false };
    const op = ops[index]!;
    if (validateOperationShape(op) !== null || (op.op !== "add" && op.op !== "remove") || op.path === "") {
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
      if (jsonSerializableError(op.value) !== null) return { handled: false };
      items.push({ op: "add", path: op.path, index: location.index, value: op.value });
    } else {
      if (location.index === "-") return { handled: false };
      items.push({ op: "remove", path: op.path, index: location.index });
    }
  }

  if (parent === null) return { handled: false };
  const parsedParent = parseSafe(parent);
  if (!("ok" in parsedParent)) return { handled: false };
  const current = getValueAt(state, parsedParent.segs);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };

  const next = current.value.slice();
  const applied: JSONPatchOperation[] = [];
  for (const item of items) {
    if (item.op === "add") {
      const index = item.index === "-" ? next.length : item.index;
      if (index < 0 || index > next.length) return { handled: false };
      next.splice(index, 0, item.value);
      applied.push({ op: "add", path: appendSegment(parent, index), value: item.value });
      continue;
    }

    if (item.index < 0 || item.index >= next.length) return { handled: false };
    next.splice(item.index, 1);
    applied.push({ op: "remove", path: item.path });
  }

  const stateWithArray = replaceValueAtSegments(state, parsedParent.segs, 0, next);
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

function numericSegment(segment: string): number | null {
  if (!/^(0|[1-9][0-9]*)$/.test(segment)) return null;
  return Number(segment);
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

  if (!Object.prototype.hasOwnProperty.call(current, segment)) return null;
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
