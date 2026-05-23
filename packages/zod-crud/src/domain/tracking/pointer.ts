// SPEC §0.2 — RFC 6902 op 적용 시 Pointer 좌표를 자동 추적한다.
// 입력: 적용된 op + 기존 Pointer
// 출력: 새 Pointer (또는 null = cascading drop)

import { tryParsePointer, buildPointer, isPrefix, parentPointer, lastSegmentIndex, withLastSegment, readAt, type Pointer } from "../../foundation/json-pointer/index.js";
import type { JSONPatchOperation } from "../../foundation/json-patch/index.js";

const MOVE_BUCKET_TARGET_THRESHOLD = 1024;

export interface AutoTargetResult {
  targets: Pointer[];
  unique: boolean;
}

export function exists(state: unknown, pointer: Pointer): boolean {
  const segments = tryParsePointer(pointer);
  return segments !== null && readAt(state, segments).ok;
}

// SPEC §5.7 rule 1 / §5.8 rule 1 — applied ops 의 add/copy/move destination 모두 수집.
// 단일 표준 모델: applyPatch 가 `/-` 를 concrete index 로 이미 정규화했으므로
// 모든 op.path 는 적용 시점의 실제 위치. 이후 ops 의 index shift 는 trackPointer 가 처리.
export function pickAutoTargets(
  applied: ReadonlyArray<JSONPatchOperation>,
  _after?: unknown,
): Pointer[] {
  return pickAutoTargetsInfo(applied).targets;
}

export function pickAutoTargetsInfo(
  applied: ReadonlyArray<JSONPatchOperation>,
): AutoTargetResult {
  const sameArray = pickSameArrayAutoTargets(applied);
  if (sameArray !== null) return sameArray;

  const out: Pointer[] = [];
  for (let i = 0; i < applied.length; i++) {
    const op = applied[i]!;
    if (op.op !== "add" && op.op !== "copy" && op.op !== "move") continue;
    if (op.path === "") continue;
    const tracked = trackPointerFrom(op.path, applied, i + 1);
    if (tracked !== null) out.push(tracked);
  }
  return { targets: out, unique: false };
}

function pickSameArrayAutoTargets(
  applied: ReadonlyArray<JSONPatchOperation>,
): AutoTargetResult | null {
  const monotonicInsertTargets = pickMonotonicInsertAutoTargets(applied);
  if (monotonicInsertTargets !== null) return monotonicInsertTargets;

  let parent: Pointer | null = null;
  let increasingInsertTargets: number[] | null = [];
  let previousInsertTarget = -1;
  const targets: number[] = [];
  let targetBuckets: Map<number, number[]> | null = null;

  for (let index = 0; index < applied.length; index += 1) {
    const op = applied[index]!;
    if (op.op !== "add" && op.op !== "remove" && op.op !== "copy" && op.op !== "move") return null;

    const location = arrayElementLocation(op.path);
    if (location === null) return null;
    if (parent === null) parent = location.parent;
    else if (location.parent !== parent) return null;

    if (op.op === "add" || op.op === "copy") {
      if (increasingInsertTargets !== null) {
        if (location.index > previousInsertTarget) {
          increasingInsertTargets.push(location.index);
          previousInsertTarget = location.index;
          continue;
        } else {
          targets.push(...increasingInsertTargets);
          increasingInsertTargets = null;
        }
      }
      shiftTargetsForInsert(targets, location.index);
      targetBuckets = null;
      targets.push(location.index);
    } else if (op.op === "remove") {
      if (increasingInsertTargets !== null) {
        targets.push(...increasingInsertTargets);
      }
      increasingInsertTargets = null;
      removeTargetIndex(targets, location.index);
      targetBuckets = null;
    } else {
      if (increasingInsertTargets !== null) {
        targets.push(...increasingInsertTargets);
      }
      increasingInsertTargets = null;
      const from = arrayElementLocation(op.from);
      if (from === null || from.parent !== parent) return null;
      if (targetBuckets !== null || shouldUseMoveBuckets(targets, from.index, location.index)) {
        targetBuckets ??= buildTargetBuckets(targets);
        shiftTargetsForMove(targets, from.index, location.index, targetBuckets);
        appendTargetBucket(targetBuckets, location.index, targets.length);
      } else {
        shiftTargetsForMoveLinear(targets, from.index, location.index);
      }
      targets.push(location.index);
    }
  }

  if (parent === null) return { targets: [], unique: true };
  const indexes = increasingInsertTargets ?? targets;
  return {
    targets: appendArrayIndexes(parent, indexes),
    unique: indexes === increasingInsertTargets,
  };
}

function pickMonotonicInsertAutoTargets(
  applied: ReadonlyArray<JSONPatchOperation>,
): AutoTargetResult | null {
  let parent: Pointer | null = null;
  let previousIndex = -1;
  let increasing = true;
  let nonIncreasing = true;
  const indexes = new Array<number>(applied.length);
  const paths = new Array<Pointer>(applied.length);

  for (let opIndex = 0; opIndex < applied.length; opIndex += 1) {
    const op = applied[opIndex]!;
    if (op.op !== "add" && op.op !== "copy") return null;

    const location = arrayElementLocation(op.path);
    if (location === null) return null;
    if (parent === null) parent = location.parent;
    else if (location.parent !== parent) return null;

    if (opIndex > 0) {
      if (location.index <= previousIndex) increasing = false;
      if (location.index > previousIndex) nonIncreasing = false;
    }
    indexes[opIndex] = location.index;
    paths[opIndex] = op.path;
    previousIndex = location.index;
  }

  if (parent === null) return { targets: [], unique: true };
  if (increasing) {
    return { targets: paths, unique: true };
  }
  if (!nonIncreasing) return null;

  const finalIndexes = new Array<number>(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) {
    finalIndexes[index] = indexes[index]! + indexes.length - index - 1;
  }
  return { targets: appendArrayIndexes(parent, finalIndexes), unique: true };
}

function shiftTargetsForInsert(targets: number[], index: number): void {
  for (let target = 0; target < targets.length; target += 1) {
    if (targets[target]! >= index) targets[target]! += 1;
  }
}

function removeTargetIndex(targets: number[], index: number): void {
  let write = 0;
  for (let read = 0; read < targets.length; read += 1) {
    const target = targets[read]!;
    if (target === index) continue;
    targets[write] = target > index ? target - 1 : target;
    write += 1;
  }
  targets.length = write;
}

function shiftTargetsForMoveLinear(targets: number[], from: number, to: number): void {
  if (from === to) return;
  for (let target = 0; target < targets.length; target += 1) {
    let index = targets[target]!;
    if (index === from) {
      targets[target] = to;
      continue;
    }
    if (index > from) index -= 1;
    if (index >= to) index += 1;
    targets[target] = index;
  }
}

function shouldUseMoveBuckets(targets: ReadonlyArray<number>, from: number, to: number): boolean {
  return targets.length >= MOVE_BUCKET_TARGET_THRESHOLD
    && Math.abs(from - to) + 1 <= targets.length;
}

function shiftTargetsForMove(
  targets: number[],
  from: number,
  to: number,
  buckets: Map<number, number[]>,
): void {
  if (from === to) return;
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (end - start + 1 > targets.length) {
    shiftTargetsForMoveLinear(targets, from, to);
    rebuildTargetBuckets(buckets, targets);
    return;
  }
  const affected: Array<{ index: number; nextIndex: number; positions: number[] }> = [];

  for (let index = start; index <= end; index += 1) {
    const positions = buckets.get(index);
    if (positions === undefined) continue;
    affected.push({
      index,
      nextIndex: nextMoveIndex(index, from, to),
      positions,
    });
  }

  for (const item of affected) {
    buckets.delete(item.index);
  }
  for (const item of affected) {
    for (const position of item.positions) {
      targets[position] = item.nextIndex;
    }
    buckets.set(item.nextIndex, item.positions);
  }
}

function nextMoveIndex(index: number, from: number, to: number): number {
  if (index === from) return to;
  return from < to ? index - 1 : index + 1;
}

function buildTargetBuckets(targets: ReadonlyArray<number>): Map<number, number[]> {
  const buckets = new Map<number, number[]>();
  for (let position = 0; position < targets.length; position += 1) {
    appendTargetBucket(buckets, targets[position]!, position);
  }
  return buckets;
}

function rebuildTargetBuckets(
  buckets: Map<number, number[]>,
  targets: ReadonlyArray<number>,
): void {
  buckets.clear();
  for (let position = 0; position < targets.length; position += 1) {
    appendTargetBucket(buckets, targets[position]!, position);
  }
}

function appendTargetBucket(
  buckets: Map<number, number[]>,
  index: number,
  position: number,
): void {
  const positions = buckets.get(index);
  if (positions === undefined) buckets.set(index, [position]);
  else positions.push(position);
}

export function pickPrimaryAutoTarget(
  applied: ReadonlyArray<JSONPatchOperation>,
  _after: unknown,
): Pointer | null {
  for (let i = applied.length - 1; i >= 0; i -= 1) {
    const op = applied[i]!;
    if (op.op !== "add" && op.op !== "copy" && op.op !== "move") continue;
    if (op.path === "") continue;
    return trackPointerFrom(op.path, applied, i + 1);
  }
  return null;
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

function arrayIndexValue(seg: string): number | null {
  if (seg === "0") return 0;
  if (seg.length === 0) return null;
  const first = seg.charCodeAt(0);
  if (first < 49 || first > 57) return null;
  for (let index = 1; index < seg.length; index += 1) {
    const code = seg.charCodeAt(index);
    if (code < 48 || code > 57) return null;
  }
  return Number(seg);
}

function arrayElementLocation(path: Pointer): { parent: Pointer; index: number } | null {
  if (path === "" || path[0] !== "/") return null;
  if (!path.includes("~")) {
    const indexSlash = path.lastIndexOf("/");
    if (indexSlash < 0) return null;
    const index = arrayIndexValue(path.slice(indexSlash + 1));
    return index === null
      ? null
      : { parent: path.slice(0, indexSlash), index };
  }
  const segments = tryParsePointer(path);
  if (segments === null) return null;
  const segment = segments[segments.length - 1];
  if (segment === undefined) return null;
  const index = arrayIndexValue(segment);
  if (index === null) return null;
  return {
    parent: buildPointer(segments.slice(0, -1)),
    index,
  };
}

function appendArrayIndex(parent: Pointer, index: number): Pointer {
  return parent === "" ? `/${index}` : `${parent}/${index}`;
}

function appendArrayIndexes(parent: Pointer, indexes: ReadonlyArray<number>): Pointer[] {
  const targets = new Array<Pointer>(indexes.length);
  if (parent === "") {
    for (let index = 0; index < indexes.length; index += 1) {
      targets[index] = `/${indexes[index]!}`;
    }
    return targets;
  }

  for (let index = 0; index < indexes.length; index += 1) {
    targets[index] = `${parent}/${indexes[index]!}`;
  }
  return targets;
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

function trackPointerFrom(
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
