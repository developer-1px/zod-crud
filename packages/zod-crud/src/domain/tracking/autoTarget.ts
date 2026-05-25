import type { JSONPatchOperation } from "../../foundation/json-patch/types.js";
import type { Pointer } from "../../foundation/json-pointer/pointerCore.js";
import { appendArrayIndexes, arrayElementLocation, arrayIndexValue } from "./arrayPointer.js";
import { trackPointerFrom } from "./pointer.js";

const MOVE_BUCKET_TARGET_THRESHOLD = 1024;

export interface AutoTargetResult {
  targets: Pointer[];
  unique: boolean;
}

// SPEC §5.7 rule 1 / §5.8 rule 1 — applied ops 의 add/copy/move destination 모두 수집.
// 단일 표준 모델: applyPatch 가 `/-` 를 concrete index 로 이미 정규화했으므로
// 모든 op.path 는 적용 시점의 실제 위치. 이후 ops 의 index shift 는 trackPointer 가 처리.
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
  let prefixText: Pointer | null = null;
  let previousIndex = -1;
  let increasing = true;
  let nonIncreasing = true;
  let indexes: number[] | null = null;
  const paths = new Array<Pointer>(applied.length);

  for (let opIndex = 0; opIndex < applied.length; opIndex += 1) {
    const op = applied[opIndex]!;
    if (op.op !== "add" && op.op !== "copy") return null;

    let targetIndex: number;
    if (prefixText === null) {
      const location = arrayElementLocation(op.path);
      if (location === null) return null;
      parent = location.parent;
      prefixText = arrayElementPrefixText(parent);
      targetIndex = location.index;
    } else {
      const knownIndex = parseKnownArrayElementIndex(op.path, prefixText);
      if (knownIndex === null) return null;
      targetIndex = knownIndex;
    }

    if (opIndex > 0) {
      if (targetIndex <= previousIndex) {
        increasing = false;
        indexes ??= backfillAutoTargetIndexes(paths, opIndex);
      }
      if (targetIndex > previousIndex) nonIncreasing = false;
    }
    if (indexes !== null) indexes[opIndex] = targetIndex;
    paths[opIndex] = op.path;
    previousIndex = targetIndex;
  }

  if (parent === null) return { targets: [], unique: true };
  if (increasing) {
    return { targets: paths, unique: true };
  }
  if (!nonIncreasing || indexes === null) return null;

  const finalIndexes = new Array<number>(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) {
    finalIndexes[index] = indexes[index]! + indexes.length - index - 1;
  }
  return { targets: appendArrayIndexes(parent, finalIndexes), unique: true };
}

function arrayElementPrefixText(parent: Pointer): Pointer {
  return parent === "" ? "/" : `${parent}/`;
}

function parseKnownArrayElementIndex(path: Pointer, prefixText: Pointer): number | null {
  if (!path.startsWith(prefixText)) return null;
  const indexText = path.slice(prefixText.length);
  return indexText.includes("/") ? null : arrayIndexValue(indexText);
}

function backfillAutoTargetIndexes(paths: ReadonlyArray<Pointer>, end: number): number[] {
  const indexes = new Array<number>(paths.length);
  for (let index = 0; index < end; index += 1) {
    const location = arrayElementLocation(paths[index]!);
    indexes[index] = location?.index ?? -1;
  }
  return indexes;
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
