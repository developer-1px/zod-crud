// replayRecording — 세션 재생. useRecorder 자체는 React 환경 필요해 outliner 통합 테스트로.
// 여기서는 Recording shape 로 replay 가 정확히 ops 를 재현하는지 확인.

import { describe, expect, test } from "vitest";
import { z } from "zod";
import { applyPatch, JSONCrudError, replayRecording, type JSONOps, type Recording } from "../src/index.js";

const Schema = z.object({ items: z.array(z.string()) });
type S = z.infer<typeof Schema>;

function makeOps(initial: S): JSONOps<S> {
  let state: S = Schema.parse(initial);
  const subs = new Set<(applied: any) => void>();
  return {
    get state() { return state; },
    load(v) {
      const parsed = Schema.safeParse(v);
      if (!parsed.success) return { ok: false, code: "schema_violation", reason: parsed.error.message } as const;
      state = parsed.data;
      return { ok: true } as const;
    },
    reset(v) {
      if (!v) return { ok: true } as const;
      const parsed = Schema.safeParse(v);
      if (!parsed.success) return { ok: false, code: "schema_violation", reason: parsed.error.message } as const;
      state = parsed.data;
      return { ok: true } as const;
    },
    patch(ops) {
      const r = applyPatch(Schema, state, ops);
      if (r.result.ok) { state = r.state; for (const s of subs) s(r.applied); }
      return r.result;
    },
    add: () => ({ ok: true }),
    remove: () => ({ ok: true }),
    replace: () => ({ ok: true }),
    move: () => ({ ok: true }),
    copy: () => ({ ok: true }),
    test: () => ({ ok: true }),
    set: () => ({ ok: true }),
    apply: (ops) => {
      const r = applyPatch(Schema, state, ops);
      if (!r.result.ok) throw new JSONCrudError("patch", r.result);
      state = r.state;
      for (const s of subs) s(r.applied);
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

describe("replayRecording", () => {
  test("loads initial then applies steps in order", async () => {
    const recording: Recording<S> = {
      startedAt: 0,
      initial: { items: [] },
      steps: [
        { ops: [{ op: "add", path: "/items/-", value: "a" }], at: 100 },
        { ops: [{ op: "add", path: "/items/-", value: "b" }], at: 200 },
        { ops: [{ op: "remove", path: "/items/0" }], at: 300 },
      ],
    };
    const ops = makeOps({ items: ["x"] });
    await replayRecording(recording, ops, { speed: Infinity });
    expect(ops.state).toEqual({ items: ["b"] });
  });

  test("respects abort signal", async () => {
    const recording: Recording<S> = {
      startedAt: 0,
      initial: { items: [] },
      steps: Array.from({ length: 5 }, (_, i) => ({
        ops: [{ op: "add", path: "/items/-", value: String(i) }],
        at: i * 30,
      })),
    };
    const ops = makeOps({ items: [] });
    const ctrl = new AbortController();
    const seen: number[] = [];
    await replayRecording(recording, ops, {
      speed: 1,
      signal: ctrl.signal,
      onStep: (i) => { seen.push(i); if (i === 1) ctrl.abort(); },
    });
    expect(seen.length).toBeLessThan(5);
  });

  test("load 실패를 성공처럼 숨기지 않는다", async () => {
    const recording: Recording<S> = {
      startedAt: 0,
      initial: { items: [1] } as never,
      steps: [],
    };
    await expect(replayRecording(recording, makeOps({ items: [] }))).rejects.toBeInstanceOf(JSONCrudError);
  });

  test("patch 실패 시 onStep 호출 전에 중단한다", async () => {
    const recording: Recording<S> = {
      startedAt: 0,
      initial: { items: [] },
      steps: [{ ops: [{ op: "remove", path: "/items/0" }], at: 0 }],
    };
    const seen: number[] = [];
    await expect(replayRecording(recording, makeOps({ items: [] }), {
      speed: Infinity,
      onStep: (i) => seen.push(i),
    })).rejects.toBeInstanceOf(JSONCrudError);
    expect(seen).toEqual([]);
  });
});
