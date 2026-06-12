// docs/standard/json-document-spec.md §7 — G1~G8 보장 직접 검증.
// G4·G5·G2·G3·G8은 rfc6902.test.ts에서 다룸. 여기서는 G6·G7·G1을 추가 검증.

import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  applyOperation,
  applyPatch,
  type JSONPatchOperation,
} from "@interactive-os/json-document";

const Any = z.any();

describe("G6 — purity", () => {
  it("same input always yields same output", () => {
    const state = { a: 1, b: [1, 2] };
    const op: JSONPatchOperation = { op: "add", path: "/c", value: 3 };
    const r1 = applyOperation(Any, state, op);
    const r2 = applyOperation(Any, state, op);
    expect(r1.state).toEqual(r2.state);
    expect(r1.result).toEqual(r2.result);
  });

  it("does not depend on Date or random", () => {
    const state = { x: 0 };
    const op: JSONPatchOperation = { op: "replace", path: "/x", value: 1 };
    const samples = Array.from({ length: 5 }, () => applyOperation(Any, state, op).state);
    samples.forEach((s) => expect(s).toEqual({ x: 1 }));
  });
});

describe("G7 — history round-trip", () => {
  // history는 forward/inverse stack을 단일 root replace로 모델링할 수 있다.
  // 동일 모델을 applyPatch로 재현해 round-trip을 검증한다.
  it("undo then redo restores state via root replace", () => {
    const initial = { a: 1, b: [1, 2] };
    const forward: JSONPatchOperation[] = [
      { op: "replace", path: "/a", value: 9 },
      { op: "add", path: "/b/-", value: 3 },
    ];
    const after = applyPatch(Any, initial, forward);
    expect(after.result.ok).toBe(true);
    const inverse: JSONPatchOperation[] = [{ op: "replace", path: "", value: initial }];
    const undone = applyPatch(Any, after.state, inverse);
    expect(undone.state).toEqual(initial);
    const redoInverse: JSONPatchOperation[] = [{ op: "replace", path: "", value: after.state }];
    const redone = applyPatch(Any, undone.state, redoInverse);
    expect(redone.state).toEqual(after.state);
  });
});

describe("G1 — JSON-only state and patch", () => {
  it("operations and resulting state are pure JSON", () => {
    const state = { tasks: [] as { id: string; done: boolean }[] };
    const ops: JSONPatchOperation[] = [
      { op: "add", path: "/tasks/-", value: { id: "a", done: false } },
      { op: "replace", path: "/tasks/0/done", value: true },
    ];
    const r = applyPatch(Any, state, ops);
    expect(r.result.ok).toBe(true);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
    expect(JSON.parse(JSON.stringify(ops))).toEqual(ops);
  });
});
