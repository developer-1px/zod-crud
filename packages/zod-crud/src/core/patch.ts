// RFC 6902 — JSON Patch. SPEC.md §3.
// 순수함수. state 입력 → state 출력 (불변). Schema 검증은 호출자(useJson 또는 applyPatch wrapper)가 끝에서 1회.

import type * as z from "zod";

import { parsePointer, isPrefix, readAt, type Pointer, PointerSyntaxError } from "./pointer.js";

export type JsonPatchOperation =
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

export type JsonResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer };

const ok: JsonResult = { ok: true };
const fail = (code: ErrorCode, reason?: string, pointer?: Pointer): JsonResult => {
  const r: { ok: false; code: ErrorCode; reason?: string; pointer?: Pointer } = { ok: false, code };
  if (reason !== undefined) r.reason = reason;
  if (pointer !== undefined) r.pointer = pointer;
  return r;
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arr = a as unknown[];
    const brr = b as unknown[];
    if (arr.length !== brr.length) return false;
    for (let i = 0; i < arr.length; i++) {
      if (!deepEqual(arr[i], brr[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

// path resolution. 마지막 segment를 제외한 부모 노드와, 마지막 segment를 반환.
function parseArrayIndex(seg: string): number | null {
  if (seg === "-") return -1; // append marker (RFC 6901 §4)
  if (!/^(0|[1-9][0-9]*)$/.test(seg)) return null;
  return Number(seg);
}

function getValueAt(state: unknown, segments: string[]): { ok: true; value: unknown } | { ok: false; error: ErrorCode; reason: string } {
  let cur: unknown = state;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const fail = (reason: string) => ({ ok: false as const, error: "path_not_found" as ErrorCode, reason });
    if (cur === null || cur === undefined) return fail(`segment ${i}: ${seg}`);
    if (Array.isArray(cur)) {
      const idx = parseArrayIndex(seg);
      if (idx === null || idx === -1 || idx >= cur.length) return fail(`segment ${i}: ${seg}`);
      cur = cur[idx];
    } else if (typeof cur === "object") {
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return fail(`segment ${i}: ${seg}`);
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return fail(`segment ${i}: not a container`);
    }
  }
  return { ok: true, value: cur };
}

// 불변 set: parent 경로의 컨테이너들을 spread로 복제하며 마지막 단계만 mutator 적용.
function withMutated(state: unknown, segments: string[], mutate: (parent: unknown, key: string) => { value: unknown } | { error: ErrorCode; reason?: string }): { state: unknown } | { error: ErrorCode; reason?: string } {
  if (segments.length === 0) {
    const r = mutate(state, "");
    return "error" in r ? r : { state: r.value };
  }

  // 부모 체인을 복제하면서 내려간다.
  const parents: Array<{ container: unknown; key: string }> = [];
  let cur: unknown = state;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (cur === null || cur === undefined) return { error: "path_not_found", reason: `segment ${i}` };
    if (Array.isArray(cur)) {
      const idx = parseArrayIndex(seg);
      if (idx === null || idx === -1 || idx >= cur.length) return { error: "path_not_found", reason: `segment ${i}: ${seg}` };
      parents.push({ container: cur, key: String(idx) });
      cur = cur[idx];
    } else if (typeof cur === "object") {
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return { error: "path_not_found", reason: `segment ${i}: ${seg}` };
      parents.push({ container: cur, key: seg });
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return { error: "path_not_found", reason: `segment ${i}: not a container` };
    }
  }

  const lastKey = segments[segments.length - 1]!;
  const m = mutate(cur, lastKey);
  if ("error" in m) return m;

  // 위로 복제 전파
  let next = m.value;
  for (let i = parents.length - 1; i >= 0; i--) {
    const { container, key } = parents[i]!;
    if (Array.isArray(container)) {
      const arr = container.slice();
      arr[Number(key)] = next;
      next = arr;
    } else {
      next = { ...(container as Record<string, unknown>), [key]: next };
    }
  }
  return { state: next };
}

type Verb = "set" | "replace" | "remove";

// container mutation 정본. set/replace/remove 의 array vs object 분기 통합.
function mutateContainer(
  parent: unknown,
  key: string,
  verb: Verb,
  value?: unknown,
): { value: unknown } | { error: ErrorCode; reason?: string } {
  if (parent === null || typeof parent !== "object") {
    return { error: "path_not_found", reason: "parent is not a container" };
  }
  if (Array.isArray(parent)) {
    if (verb === "set" && key === "-") return { value: [...parent, value] };
    const idx = parseArrayIndex(key);
    if (idx === null || idx === -1) return { error: "path_not_found", reason: `array index: ${key}` };
    if (verb === "set") {
      if (idx > parent.length) return { error: "path_not_found", reason: `out of range: ${key}` };
      return { value: [...parent.slice(0, idx), value, ...parent.slice(idx)] };
    }
    if (idx >= parent.length) return { error: "path_not_found", reason: `array index: ${key}` };
    if (verb === "replace") {
      const next = parent.slice();
      next[idx] = value;
      return { value: next };
    }
    return { value: [...parent.slice(0, idx), ...parent.slice(idx + 1)] };
  }
  // object
  const obj = parent as Record<string, unknown>;
  if (verb === "set") return { value: { ...obj, [key]: value } };
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    return { error: "path_not_found", reason: `object key: ${key}` };
  }
  if (verb === "replace") return { value: { ...obj, [key]: value } };
  const { [key]: _, ...rest } = obj;
  void _;
  return { value: rest };
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function attachPointer(
  e: { error: ErrorCode; reason?: string },
  pointer: Pointer,
): { error: ErrorCode; reason?: string; pointer: Pointer } {
  return { ...e, pointer };
}

// Pointer parse + invalid_pointer 에러 변환을 한 줄로.
function parseSafe(p: Pointer): { ok: true; segs: string[] } | { error: ErrorCode; reason: string; pointer: Pointer } {
  try { return { ok: true, segs: parsePointer(p) }; }
  catch (e) {
    if (e instanceof PointerSyntaxError) return { error: "invalid_pointer", reason: e.message, pointer: p };
    throw e;
  }
}

function applyOpRaw(state: unknown, op: JsonPatchOperation): { state: unknown } | { error: ErrorCode; reason?: string; pointer?: Pointer } {
  // RFC 6902 §3 — op shape 검증. path 는 모든 op 에 필수, value 는 add/replace/test, from 은 move/copy.
  if (!op || typeof op !== "object") return { error: "invalid_pointer", reason: "op must be object" };
  const validOps = ["add", "remove", "replace", "move", "copy", "test"];
  if (!validOps.includes((op as { op: string }).op)) {
    return { error: "invalid_pointer", reason: `unrecognized op: ${(op as { op: string }).op}` };
  }
  if (typeof op.path !== "string") {
    return { error: "invalid_pointer", reason: "missing 'path'" };
  }
  const opName = (op as { op: string }).op;
  if ((opName === "add" || opName === "replace" || opName === "test") && !("value" in op)) {
    return { error: "invalid_pointer", reason: `missing 'value' for op '${opName}'` };
  }
  if ((opName === "move" || opName === "copy") && typeof (op as { from?: unknown }).from !== "string") {
    return { error: "invalid_pointer", reason: `missing 'from' for op '${opName}'` };
  }

  const parsed = parseSafe(op.path);
  if ("error" in parsed) return parsed;
  const segments = parsed.segs;

  switch (op.op) {
    case "add": {
      if (segments.length === 0) return { state: op.value };
      const r = withMutated(state, segments, (p, k) => mutateContainer(p, k, "set", op.value));
      return "error" in r ? attachPointer(r, op.path) : r;
    }
    case "replace": {
      if (segments.length === 0) return { state: op.value };
      const r = withMutated(state, segments, (p, k) => mutateContainer(p, k, "replace", op.value));
      return "error" in r ? attachPointer(r, op.path) : r;
    }
    case "remove": {
      if (segments.length === 0) return { error: "path_not_found", reason: "cannot remove root", pointer: op.path };
      const r = withMutated(state, segments, (p, k) => mutateContainer(p, k, "remove"));
      return "error" in r ? attachPointer(r, op.path) : r;
    }
    case "test": {
      const got = getValueAt(state, segments);
      if (!got.ok) return attachPointer(got, op.path);
      if (!deepEqual(got.value, op.value)) return { error: "test_failed", reason: "value mismatch", pointer: op.path };
      return { state };
    }
    case "copy":
    case "move": {
      const fromParsed = parseSafe(op.from);
      if ("error" in fromParsed) return fromParsed;
      const fromSeg = fromParsed.segs;
      if (op.op === "move" && isPrefix(fromSeg, segments)) {
        // 자기 자신으로 move = no-op. 자손 path 로 move = 위반.
        if (fromSeg.length === segments.length) return { state };
        return { error: "move_into_self", reason: "cannot move into own descendant", pointer: op.path };
      }
      const got = getValueAt(state, fromSeg);
      if (!got.ok) return attachPointer(got, op.from);
      if (op.op === "copy") {
        return applyOpRaw(state, { op: "add", path: op.path, value: deepClone(got.value) });
      }
      const removed = applyOpRaw(state, { op: "remove", path: op.from });
      if ("error" in removed) return removed;
      return applyOpRaw(removed.state, { op: "add", path: op.path, value: got.value });
    }
  }
}

export interface ApplyResult<S extends z.ZodType> {
  state: z.output<S>;
  result: JsonResult;
  applied: ReadonlyArray<JsonPatchOperation>;
}

// 단일 op. Schema 검증 포함. SPEC §5.3.
export function applyOperation<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  op: JsonPatchOperation,
): ApplyResult<S> {
  const r = applyOpRaw(state, op);
  if ("error" in r) {
    return { state, result: fail(r.error, r.reason, r.pointer), applied: [] };
  }
  if (op.op === "test") {
    return { state, result: ok, applied: [op] };
  }
  const parsed = schema.safeParse(r.state);
  if (!parsed.success) {
    return { state, result: fail("schema_violation", parsed.error.message), applied: [] };
  }
  return { state: parsed.data as z.output<S>, result: ok, applied: [op] };
}

// 각 forward op 의 inverse 를 계산. before-state 기준. 적용 순서를 따라가며 반환.
// 반환 배열은 reverse 적용용 — 호출자는 [last, ..., first] 로 받아서 그대로 applyPatch 에 넘기면 forward 를 되돌린다.
export function computeInverses(
  state: unknown,
  ops: ReadonlyArray<JsonPatchOperation>,
): { ok: true; inverses: JsonPatchOperation[] } | { ok: false } {
  const out: JsonPatchOperation[] = [];
  let cur: unknown = state;
  for (const op of ops) {
    const inv = inverseOp(op, cur);
    const r = applyOpRaw(cur, op);
    if ("error" in r) return { ok: false };
    if (inv) out.unshift(inv);
    cur = r.state;
  }
  return { ok: true, inverses: out };
}

function resolveAppendPath(path: Pointer, before: unknown): Pointer {
  if (!path.endsWith("/-")) return path;
  const parent = path.slice(0, -2);
  const parentSegs = parent === "" ? [] : parsePointer(parent);
  const r = readAt(before, parentSegs);
  if (!r.ok || !Array.isArray(r.value)) return path;
  return parent === "" ? `/${r.value.length}` : `${parent}/${r.value.length}`;
}

function inverseOp(op: JsonPatchOperation, before: unknown): JsonPatchOperation | null {
  switch (op.op) {
    case "add": {
      const path = resolveAppendPath(op.path, before);
      return { op: "remove", path };
    }
    case "remove": {
      const segs = parsePointer(op.path);
      const prev = readAt(before, segs);
      if (!prev.ok) return null;
      return { op: "add", path: op.path, value: prev.value };
    }
    case "replace": {
      if (op.path === "") return { op: "replace", path: "", value: before };
      const segs = parsePointer(op.path);
      const prev = readAt(before, segs);
      if (!prev.ok) return null;
      return { op: "replace", path: op.path, value: prev.value };
    }
    case "move": {
      // forward: from → path. inverse: path → from. /- destination 은 적용 후 idx 로 resolve 필요.
      // 같은 array 내부 move 는 length 불변, 다른 부모면 destination array length 가 +1.
      // 단순화: applyOpRaw 후 위치를 추정 — append 가 아니면 그대로.
      const path = resolveAppendPath(op.path, before);
      return { op: "move", from: path, path: op.from };
    }
    case "copy": {
      const path = resolveAppendPath(op.path, before);
      return { op: "remove", path };
    }
    case "test": return null;
  }
}

// Batch (RFC 6902 §3): atomic. 한 op 실패 시 전체 롤백. Schema 검증은 끝에서 1회. SPEC §5.3.
export function applyPatch<S extends z.ZodType>(
  schema: S,
  state: z.output<S>,
  ops: ReadonlyArray<JsonPatchOperation>,
): ApplyResult<S> {
  let cur: unknown = state;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const r = applyOpRaw(cur, op);
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
  if (!parsed.success) {
    return { state, result: fail("schema_violation", parsed.error.message), applied: [] };
  }
  return { state: parsed.data as z.output<S>, result: ok, applied: ops };
}
