// RFC 6902 — JSON Patch. SPEC.md §3.
// Root public surface: types + applyOperation + applyPatch.
// computeInverses stays source-internal for document history.

import type * as z from "zod";
import { jsonSerializableError } from "../json.js";
import { appendSegment, parentPointer, type Pointer } from "../json-pointer/index.js";
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
  arraySegments: string[];
  index: number;
  key: string;
}

const ok: JSONResult = { ok: true };
const objectHasOwn = Object.prototype.hasOwnProperty;
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
  const appendFast = applyAppendOnlyAddPatch(state, ops);
  if (appendFast.handled) {
    const parsed = schema.safeParse(appendFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: appendFast.state as z.output<S>, result: ok, applied: appendFast.applied };
  }
  const arrayReplaceFast = applySameArrayFieldReplacePatch(state, ops);
  if (arrayReplaceFast.handled) {
    const parsed = schema.safeParse(arrayReplaceFast.state);
    if (!parsed.success) return { state, result: fail("schema_violation", zodIssuesReason(parsed.error)), applied: [] };
    return { state: arrayReplaceFast.state as z.output<S>, result: ok, applied: arrayReplaceFast.applied };
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
  const arrayReplaceFast = applySameArrayFieldReplacePatch(state, ops, valuesTrusted);
  if (arrayReplaceFast.handled) {
    return { state: arrayReplaceFast.state as T, result: ok, applied: arrayReplaceFast.applied };
  }
  const fast = applyIndependentReplacePatch(state, ops);
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

  return applyTrustedPatch(state, ops, { valuesTrusted: true });
}

function applySameArrayFieldReplacePatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let arraySegments: string[] | null = null;
  let field: string | null = null;
  const seenIndexes = new Set<number>();
  const items: Array<{ op: JSONPatchOperation; index: number; key: string; value: unknown }> = [];

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

    const nextArraySegments = location.arraySegments;
    if (arraySegments === null) arraySegments = nextArraySegments;
    else if (!sameSegments(arraySegments, nextArraySegments)) return { handled: false };

    if (seenIndexes.has(location.index)) return { handled: false };
    if (!valuesTrusted && jsonSerializableError(normalized.value) !== null) return { handled: false };
    seenIndexes.add(location.index);
    items.push({ op: normalized, index: location.index, key: location.key, value: normalized.value });
  }

  if (arraySegments === null || field === null) return { handled: false };
  const current = getValueAt(state, arraySegments);
  if (!current.ok || !Array.isArray(current.value)) return { handled: false };

  const next = current.value.slice();
  for (const item of items) {
    if (item.index < 0 || item.index >= next.length) return { handled: false };
    const row = next[item.index];
    if (row === null || typeof row !== "object" || Array.isArray(row)) return { handled: false };
    if (!objectHasOwn.call(row, item.key)) return { handled: false };
    const replaced = { ...(row as Record<string, unknown>) };
    if (item.key === "__proto__") {
      Object.defineProperty(replaced, item.key, {
        value: item.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      replaced[item.key] = item.value;
    }
    next[item.index] = replaced;
  }

  const stateWithArray = replaceValueAtSegments(state, arraySegments, 0, next);
  return stateWithArray === null
    ? { handled: false }
    : { handled: true, state: stateWithArray, applied: items.map((item) => item.op) };
}

function applyAppendOnlyAddPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 2) return { handled: false };

  let parent: Pointer | null = null;
  const values: unknown[] = [];
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

    const nextParent = op.path.slice(0, -2);
    if (parent === null) parent = nextParent;
    else if (parent !== nextParent) return { handled: false };

    if (!valuesTrusted && jsonSerializableError(op.value) !== null) return { handled: false };
    values.push(op.value);
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

  return {
    handled: true,
    state: stateWithArray,
    applied: values.map((value, index): JSONPatchOperation => ({
      op: "add",
      path: appendSegment(parent, initialLength + index),
      value,
    })),
  };
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

function applySameArrayStructuralPatch(
  state: unknown,
  ops: ReadonlyArray<JSONPatchOperation>,
  valuesTrusted = false,
): FastPatchResult {
  if (ops.length < 1) return { handled: false };

  let parent: Pointer | null = null;
  const items: Array<
    | { op: "add"; path: Pointer; index: number | "-"; value: unknown }
    | { op: "remove"; path: Pointer; index: number }
    | { op: "copy"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" }
    | { op: "move"; from: Pointer; path: Pointer; fromIndex: number; index: number | "-" }
  > = [];

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

function sameSegments(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
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

function parseArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  const simple = parseSimpleArrayFieldPath(path);
  if (simple !== null) return simple;

  const parsed = parseSafe(path);
  if (!("ok" in parsed) || parsed.segs.length < 2) return null;
  const key = parsed.segs[parsed.segs.length - 1]!;
  const index = numericSegment(parsed.segs[parsed.segs.length - 2]!);
  return index === null
    ? null
    : { arraySegments: parsed.segs.slice(0, -2), index, key };
}

function parseSimpleArrayFieldPath(path: Pointer): ArrayFieldPath | null {
  if (path === "" || path[0] !== "/" || path.includes("~")) return null;
  const keySlash = path.lastIndexOf("/");
  if (keySlash <= 0) return null;
  const indexSlash = path.lastIndexOf("/", keySlash - 1);
  if (indexSlash < 0) return null;

  const index = numericSegment(path.slice(indexSlash + 1, keySlash));
  if (index === null) return null;

  const arrayPath = path.slice(0, indexSlash);
  const arraySegments = arrayPath === "" ? [] : arrayPath.slice(1).split("/");
  return { arraySegments, index, key: path.slice(keySlash + 1) };
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
