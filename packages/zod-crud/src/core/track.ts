// SPEC §0.2 (9) — Axis 1 op 적용 시 Axis 2 좌표를 자동 추적한다.
// 입력: 적용된 op + 기존 Pointer
// 출력: 새 Pointer (또는 null = cascading drop)

import { parsePointer, buildPointer, type Pointer } from "./pointer.js";
import type { JsonPatchOperation } from "./patch.js";

function startsWith(prefix: string[], full: string[]): boolean {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

function isArrayIndex(seg: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(seg);
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
      // append marker /-: 끝에 추가, 다른 pointer 영향 없음
      if (at.length > 0 && at[at.length - 1] === "-") return pointer;

      // 같은 부모 array 안에서 인덱스 shift
      if (sameArrayParent(at, target)) {
        const insertAt = Number(at[at.length - 1]);
        const targetIdx = Number(target[target.length - 1]);
        if (targetIdx >= insertAt) {
          const next = [...target];
          next[next.length - 1] = String(targetIdx + 1);
          return buildPointer(next);
        }
      }
      // 더 깊은 자식 영향: at 가 target 의 prefix 인 경우 인덱스 shift 전파
      if (
        at.length < target.length &&
        startsWith(at.slice(0, -1), target) === false &&
        startsWith(at.slice(0, at.length - 1), target.slice(0, at.length - 1))
      ) {
        // at = parent + [insertIdx], target = parent + [tIdx, ...rest]
        const parent = at.slice(0, at.length - 1);
        if (
          startsWith(parent, target) &&
          isArrayIndex(at[at.length - 1]!) &&
          isArrayIndex(target[parent.length]!)
        ) {
          const insertAt = Number(at[at.length - 1]);
          const targetIdx = Number(target[parent.length]);
          if (targetIdx >= insertAt) {
            const next = [...target];
            next[parent.length] = String(targetIdx + 1);
            return buildPointer(next);
          }
        }
      }
      return pointer;
    }

    case "remove": {
      const at = parsePointer(op.path);
      // 동일 또는 자손이면 drop
      if (startsWith(at, target)) return null;
      // 같은 부모 array 안에서 인덱스 shift
      if (sameArrayParent(at, target)) {
        const removeAt = Number(at[at.length - 1]);
        const targetIdx = Number(target[target.length - 1]);
        if (targetIdx > removeAt) {
          const next = [...target];
          next[next.length - 1] = String(targetIdx - 1);
          return buildPointer(next);
        }
      }
      // 더 깊은 자식 영향
      if (at.length < target.length) {
        const parent = at.slice(0, at.length - 1);
        if (
          startsWith(parent, target) &&
          isArrayIndex(at[at.length - 1]!) &&
          isArrayIndex(target[parent.length]!)
        ) {
          const removeAt = Number(at[at.length - 1]);
          const targetIdx = Number(target[parent.length]);
          if (targetIdx > removeAt) {
            const next = [...target];
            next[parent.length] = String(targetIdx - 1);
            return buildPointer(next);
          }
        }
      }
      return pointer;
    }

    case "replace": {
      const at = parsePointer(op.path);
      // 자손은 cascading drop (값이 통째로 교체됨)
      if (startsWith(at, target) && at.length < target.length) return null;
      // 동일 위치는 유지 (값만 바뀐 것)
      return pointer;
    }

    case "move": {
      const from = parsePointer(op.from);
      const to = parsePointer(op.path);
      // from === target → to 로 이동
      if (from.length === target.length && startsWith(from, target)) {
        return op.path;
      }
      // from prefix of target → 자손도 이동: from 부분을 to 로 치환
      if (startsWith(from, target) && from.length < target.length) {
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
