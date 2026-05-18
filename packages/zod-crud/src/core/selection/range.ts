// state-aware DFS range expansion. anchor 의 값 타입 (object/array/primitive) 과
// 같은 종류의 좌표만 DFS pre-order 로 펼친다. 도메인 무관.
//
//   - anchor 값이 object  → 모든 object 위치 (트리 노드 모델)
//   - anchor 값이 string  → 모든 string 위치 (flat list 모델)
//   - 등등
//
// state 모르면 (또는 endpoint 가 그 type 집합에 없으면) [anchor, focus] 두 점만.

import { readAt, escapeSegment, tryParsePointer, type Pointer } from "../pointer/index.js";

type ValueKind = "null" | "object" | "array" | "string" | "number" | "boolean" | "undefined";

function kindOf(v: unknown): ValueKind {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v as ValueKind;
}

function* walkSameKind(state: unknown, refKind: ValueKind, base: Pointer = ""): Generator<Pointer> {
  if (kindOf(state) === refKind) yield base;
  if (state && typeof state === "object") {
    if (Array.isArray(state)) {
      for (let i = 0; i < state.length; i++) {
        yield* walkSameKind(state[i], refKind, `${base}/${i}`);
      }
    } else {
      for (const k of Object.keys(state as Record<string, unknown>)) {
        yield* walkSameKind((state as Record<string, unknown>)[k], refKind, `${base}/${escapeSegment(k)}`);
      }
    }
  }
}

// state 가 주어지면 anchor 와 같은 kind 의 좌표를 DFS 순서로 펼침. 없거나 endpoint 가
// kind 집합 밖이면 [anchor, focus] (uniq) 로 fallback — 호출자가 별도 처리할 필요 없음.
export function expandRange(anchor: Pointer, focus: Pointer, state?: unknown): Pointer[] {
  if (state !== undefined) {
    const segments = tryParsePointer(anchor);
    const a: ReturnType<typeof readAt> = segments === null ? { ok: false } : readAt(state, segments);
    if (a.ok) {
      const refKind = kindOf(a.value);
      const arr = [...walkSameKind(state, refKind)];
      const ia = arr.indexOf(anchor);
      const ib = arr.indexOf(focus);
      if (ia >= 0 && ib >= 0) {
        const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
        return arr.slice(lo, hi + 1);
      }
    }
  }
  return anchor === focus ? [anchor] : [anchor, focus];
}
