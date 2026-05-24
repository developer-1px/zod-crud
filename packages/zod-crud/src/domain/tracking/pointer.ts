// SPEC §0.2 — RFC 6902 op 적용 시 Pointer 좌표를 자동 추적한다.
// 입력: 적용된 op + 기존 Pointer
// 출력: 새 Pointer (또는 null = cascading drop)

import { tryParsePointer, buildPointer, isPrefix, parentPointer, lastSegmentIndex, withLastSegment, readAt, type Pointer } from "../../foundation/json-pointer/index.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";
import { arrayIndexValue } from "./arrayPointer.js";

export function exists(state: unknown, pointer: Pointer): boolean {
  const segments = tryParsePointer(pointer);
  return segments !== null && readAt(state, segments).ok;
}

// SPEC §5.7 rule 2 / §5.8 rule 2 — lost pointer 복구: nextSibling → prevSibling → 가장 가까운 존재 ancestor.
// array container 는 좌표 의미가 없는 "항목 컨테이너" 라 fallback 시 건너뛰고 한 단계 더 climb.
export function recoverLostPointer(
  lost: Pointer,
  applied: ReadonlyArray<JSONPatchOperation>,
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
  // array container 를 건너뛰며 가장 가까운 non-array ancestor 로 fallback.
  let cur: Pointer | null = trackedParent;
  while (cur !== null && cur !== "") {
    const segments = tryParsePointer(cur);
    if (segments === null) return null;
    const r = readAt(after, segments);
    if (r.ok && !Array.isArray(r.value)) return cur;
    cur = parentPointer(cur);
  }
  return null;
}

function isArrayIndex(seg: string): boolean {
  return arrayIndexValue(seg) !== null;
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

// 한 op 가 한 pointer 에 어떤 영향을 주는가.
// null = pointer 자체가 cascading drop 됨.
function trackOne(pointer: Pointer, op: JSONPatchOperation): Pointer | null {
  const target = tryParsePointer(pointer);
  if (target === null) return null;

  switch (op.op) {
    case "test":
      return pointer;

    case "add": {
      const at = tryParsePointer(op.path);
      if (at === null) return null;
      const shifted = shiftArraySibling(at, target, 1);
      return shifted ? buildPointer(shifted) : pointer;
    }

    case "remove": {
      const at = tryParsePointer(op.path);
      if (at === null) return null;
      // 동일 또는 자손이면 drop
      if (isPrefix(at, target)) return null;
      const shifted = shiftArraySibling(at, target, -1);
      return shifted ? buildPointer(shifted) : pointer;
    }

    case "replace": {
      const at = tryParsePointer(op.path);
      if (at === null) return null;
      // 자손은 cascading drop (값이 통째로 교체됨)
      if (isPrefix(at, target) && at.length < target.length) return null;
      // 동일 위치는 유지 (값만 바뀐 것)
      return pointer;
    }

    case "move": {
      const from = tryParsePointer(op.from);
      const to = tryParsePointer(op.path);
      if (from === null || to === null) return null;
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
  applied: ReadonlyArray<JSONPatchOperation>,
): Pointer | null {
  return trackPointerFrom(pointer, applied, 0);
}

export function trackPointerFrom(
  pointer: Pointer,
  applied: ReadonlyArray<JSONPatchOperation>,
  startIndex: number,
): Pointer | null {
  let cur: Pointer | null = pointer;
  for (let index = startIndex; index < applied.length; index += 1) {
    if (cur === null) return null;
    const op = applied[index]!;
    cur = trackOne(cur, op);
    // 방어: `/-` 가 결과 pointer 에 누출되면 broken — null 반환.
    // applyPatch 의 applied 는 normalizeOp 으로 이미 concrete index. 이 가드는 hand-built ops 보호용.
    if (cur !== null && (cur === "-" || cur.endsWith("/-"))) return null;
  }
  return cur;
}
