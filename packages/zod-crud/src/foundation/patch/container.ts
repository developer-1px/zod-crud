// patch.ts 내부 헬퍼 — public API 아님. docs/standard/zod-crud-spec.md §3 의 RFC 6902 구현 디테일.

import { parsePointer, readAt, type Pointer, PointerSyntaxError } from "../pointer/index.js";
import type { ErrorCode, JSONPatchOperation } from "./contract.js";

// RFC 6902 §4.1: `/-` 는 array append marker. 적용 시점의 array 길이로 concrete index 정규화.
// 비-array 부모거나 path 가 `/-` 가 아니면 원본 path 유지.
export function resolveAppendPath(path: Pointer, before: unknown): Pointer {
  if (!path.endsWith("/-")) return path;
  const parent = path.slice(0, -2);
  const segs = parent === "" ? [] : parsePointer(parent);
  const r = readAt(before, segs);
  if (!r.ok || !Array.isArray(r.value)) return path;
  return parent === "" ? `/${r.value.length}` : `${parent}/${r.value.length}`;
}

// move to `/-` is resolved after the source has been removed. The applied
// record must point at the concrete inserted element so selection/history can
// track it.
export function resolveAppliedAppendPath(path: Pointer, after: unknown): Pointer {
  if (!path.endsWith("/-")) return path;
  const parent = path.slice(0, -2);
  const segs = parent === "" ? [] : parsePointer(parent);
  const r = readAt(after, segs);
  if (!r.ok || !Array.isArray(r.value) || r.value.length === 0) return path;
  return parent === "" ? `/${r.value.length - 1}` : `${parent}/${r.value.length - 1}`;
}

// op 안의 `/-` (path 만; from 은 RFC 6902 상 array append 의미가 없음) 을 적용 시점 상태 기준으로 정규화.
export function normalizeOp(op: JSONPatchOperation, before: unknown): JSONPatchOperation {
  if (op === null || typeof op !== "object") return op;
  if (op.op === "test" || op.op === "remove") return op;
  if (typeof (op as { path?: unknown }).path !== "string") return op;
  if (op.op === "move" && op.path.endsWith("/-")) return op;
  const path = resolveAppendPath(op.path, before);
  if (path === op.path) return op;
  if (op.op === "move" || op.op === "copy") return { op: op.op, from: op.from, path };
  return { ...op, path } as JSONPatchOperation;
}

export function normalizeAppliedOp(op: JSONPatchOperation, after: unknown): JSONPatchOperation {
  if (op.op !== "move" || !op.path.endsWith("/-")) return op;
  const path = resolveAppliedAppendPath(op.path, after);
  return path === op.path ? op : { op: "move", from: op.from, path };
}

export type ContainerError = { error: ErrorCode; reason?: string };
export type ParseSafeResult = { ok: true; segs: string[] } | { error: ErrorCode; reason: string; pointer: Pointer };

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== (b as unknown[]).length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], (b as unknown[])[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  if (ak.length !== Object.keys(bo).length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

function parseArrayIndex(seg: string): number | null {
  if (seg === "-") return -1; // RFC 6901 §4 append marker
  if (seg.length === 0) return null;
  const first = seg.charCodeAt(0);
  if (first === 48) return seg.length === 1 ? 0 : null;
  if (first < 49 || first > 57) return null;
  for (let index = 1; index < seg.length; index += 1) {
    const code = seg.charCodeAt(index);
    if (code < 48 || code > 57) return null;
  }
  return Number(seg);
}

export function attachPointer(e: ContainerError, pointer: Pointer): ContainerError & { pointer: Pointer } {
  return { ...e, pointer };
}

export function parseSafe(p: Pointer): ParseSafeResult {
  try { return { ok: true, segs: parsePointer(p) }; }
  catch (e) {
    if (e instanceof PointerSyntaxError) return { error: "invalid_pointer", reason: e.message, pointer: p };
    throw e;
  }
}

export function getValueAt(state: unknown, segments: string[]): { ok: true; value: unknown } | { ok: false; error: ErrorCode; reason: string } {
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
    } else return fail(`segment ${i}: not a container`);
  }
  return { ok: true, value: cur };
}

// 불변 set: parent 체인을 spread 복제하며 마지막 단계만 mutator 적용.
export function withMutated(
  state: unknown,
  segments: string[],
  mutate: (parent: unknown, key: string) => { value: unknown } | ContainerError,
): { state: unknown } | ContainerError {
  if (segments.length === 0) {
    const r = mutate(state, "");
    return "error" in r ? r : { state: r.value };
  }
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
    } else return { error: "path_not_found", reason: `segment ${i}: not a container` };
  }
  const m = mutate(cur, segments[segments.length - 1]!);
  if ("error" in m) return m;
  let next = m.value;
  for (let i = parents.length - 1; i >= 0; i--) {
    const { container, key } = parents[i]!;
    if (Array.isArray(container)) {
      const arr = container.slice();
      arr[Number(key)] = next;
      next = arr;
    } else next = { ...(container as Record<string, unknown>), [key]: next };
  }
  return { state: next };
}

export type Verb = "set" | "replace" | "remove";

// container mutation 정본. set/replace/remove 의 array vs object 분기 통합.
export function mutateContainer(parent: unknown, key: string, verb: Verb, value?: unknown): { value: unknown } | ContainerError {
  if (parent === null || typeof parent !== "object") {
    return { error: "path_not_found", reason: "parent is not a container" };
  }
  if (Array.isArray(parent)) {
    if (verb === "set" && key === "-") return { value: parent.concat([value]) };
    const idx = parseArrayIndex(key);
    if (idx === null || idx === -1) return { error: "path_not_found", reason: `array index: ${key}` };
    if (verb === "set") {
      if (idx > parent.length) return { error: "path_not_found", reason: `out of range: ${key}` };
      if (idx === parent.length) return { value: parent.concat([value]) };
      const next = parent.slice();
      next.splice(idx, 0, value);
      return { value: next };
    }
    if (idx >= parent.length) return { error: "path_not_found", reason: `array index: ${key}` };
    if (verb === "replace") {
      const next = parent.slice();
      next[idx] = value;
      return { value: next };
    }
    if (idx === parent.length - 1) return { value: parent.slice(0, idx) };
    const next = parent.slice();
    next.splice(idx, 1);
    return { value: next };
  }
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
