// SPEC §0.2 (9) — Axis 1 op 적용 시 Axis 2 좌표를 자동 추적한다.
// 입력: 적용된 op + 기존 Pointer
// 출력: 새 Pointer (또는 null = cascading drop)

import { parsePointer, buildPointer, isPrefix, parentPointer, lastSegmentIndex, withLastSegment, readAt, type Pointer } from "./pointer.js";
import type { JsonPatchOperation } from "./patch.js";

function exists(state: unknown, pointer: Pointer): boolean {
  return readAt(state, parsePointer(pointer)).ok;
}

// SPEC §5.7 rule 1 / §5.8 rule 1 — applied ops 의 add/copy/move destination 첫 매치.
// `/-` 는 after-state 의 array length-1 으로 resolve. root replace ("") 는 무시.
export function pickAutoTarget(
  applied: ReadonlyArray<JsonPatchOperation>,
  after: unknown,
): Pointer | null {
  for (const op of applied) {
    let dest: Pointer | null = null;
    if (op.op === "add" || op.op === "copy" || op.op === "move") dest = op.path;
    if (dest === null) continue;
    if (dest === "") continue;
    if (dest.endsWith("/-")) {
      const parent = dest.slice(0, -2);
      const r = readAt(after, parsePointer(parent));
      if (r.ok && Array.isArray(r.value) && r.value.length > 0) {
        return buildPointer([...parsePointer(parent), r.value.length - 1]);
      }
      return null;
    }
    return dest;
  }
  return null;
}

// SPEC §5.7 rule 2 / §5.8 rule 2 — lost pointer 복구: nextSibling → prevSibling → parent.
export function recoverLostPointer(
  lost: Pointer,
  applied: ReadonlyArray<JsonPatchOperation>,
  after: unknown,
): Pointer | null {
  const idx = lastSegmentIndex(lost);
  const parent = parentPointer(lost);
  if (idx === null || parent === null) return null;
  const trackedParent = trackPointer(parent, applied);
  if (trackedParent === null) return null;
  const nextCandidate = withLastSegment(`${trackedParent}/${idx}`, idx);
  if (nextCandidate !== null && exists(after, nextCandidate)) return nextCandidate;
  if (idx > 0) {
    const prevCandidate = `${trackedParent}/${idx - 1}`;
    if (exists(after, prevCandidate)) return prevCandidate;
  }
  if (trackedParent === "") return null;
  if (exists(after, trackedParent)) return trackedParent;
  return null;
}

function isArrayIndex(seg: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(seg);
}

// at = parent + [pivotSeg]. target 이 같은 array 부모를 공유하고 그 위치의 인덱스가
// 영향 받으면 새 segment 배열을 반환. 그렇지 않으면 null.
//
// add 의 경우 delta = +1 (pivot >= insert 위치는 한 칸 밀림).
// remove 의 경우 delta = -1 (pivot > remove 위치는 한 칸 당겨짐).
//
// `at` 의 마지막 segment 가 array index 가 아니거나 "-" 이면 영향 없음.
function shiftArraySibling(at: string[], target: string[], delta: 1 | -1): string[] | null {
  if (at.length === 0) return null;
  const pivotSeg = at[at.length - 1]!;
  if (pivotSeg === "-") return null;
  if (!isArrayIndex(pivotSeg)) return null;
  const parent = at.slice(0, at.length - 1);
  if (target.length < at.length) return null;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] !== target[i]) return null;
  }
  const targetIdxSeg = target[parent.length]!;
  if (!isArrayIndex(targetIdxSeg)) return null;
  const pivot = Number(pivotSeg);
  const tIdx = Number(targetIdxSeg);
  if (delta === 1 && tIdx < pivot) return null;
  if (delta === -1 && tIdx <= pivot) return null;
  const next = [...target];
  next[parent.length] = String(tIdx + delta);
  return next;
}

function sameArrayParent(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] !== b[i]) return false;
  }
  return isArrayIndex(a[a.length - 1]!) && isArrayIndex(b[b.length - 1]!);
}

// 한 op 가 한 pointer 에 어떤 영향을 주는가.
// null = pointer 자체가 cascading drop 됨.
function trackOne(pointer: Pointer, op: JsonPatchOperation): Pointer | null {
  const target = parsePointer(pointer);

  switch (op.op) {
    case "test":
      return pointer;

    case "add": {
      const at = parsePointer(op.path);
      const shifted = shiftArraySibling(at, target, 1);
      return shifted ? buildPointer(shifted) : pointer;
    }

    case "remove": {
      const at = parsePointer(op.path);
      // 동일 또는 자손이면 drop
      if (isPrefix(at, target)) return null;
      const shifted = shiftArraySibling(at, target, -1);
      return shifted ? buildPointer(shifted) : pointer;
    }

    case "replace": {
      const at = parsePointer(op.path);
      // 자손은 cascading drop (값이 통째로 교체됨)
      if (isPrefix(at, target) && at.length < target.length) return null;
      // 동일 위치는 유지 (값만 바뀐 것)
      return pointer;
    }

    case "move": {
      const from = parsePointer(op.from);
      const to = parsePointer(op.path);
      // from === target → to 로 이동
      if (from.length === target.length && isPrefix(from, target)) {
        return op.path;
      }
      // from prefix of target → 자손도 이동: from 부분을 to 로 치환
      if (isPrefix(from, target) && from.length < target.length) {
        const tail = target.slice(from.length);
        return buildPointer([...to, ...tail]);
      }
      // 그 외: remove(from) 적용 후 add(to) 적용으로 합성
      const afterRemove = trackOne(pointer, { op: "remove", path: op.from });
      if (afterRemove === null) return null;
      return trackOne(afterRemove, { op: "add", path: op.path, value: null });
    }

    case "copy": {
      // copy 는 add 와 같은 영향 (target 위치에 새 노드)
      return trackOne(pointer, { op: "add", path: op.path, value: null });
    }
  }
}

export function trackPointer(
  pointer: Pointer,
  applied: ReadonlyArray<JsonPatchOperation>,
): Pointer | null {
  let cur: Pointer | null = pointer;
  for (const op of applied) {
    if (cur === null) return null;
    cur = trackOne(cur, op);
  }
  return cur;
}

export function trackPointers(
  pointers: ReadonlyArray<Pointer>,
  applied: ReadonlyArray<JsonPatchOperation>,
): Pointer[] {
  const out: Pointer[] = [];
  for (const p of pointers) {
    const next = trackPointer(p, applied);
    if (next !== null) out.push(next);
  }
  return out;
}
