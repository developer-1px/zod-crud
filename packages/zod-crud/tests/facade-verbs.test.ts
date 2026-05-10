// 격차 1+2 해소 검증 — useJsonDocument facade 가 6 verbs 를 method 로 노출.
// React testing library 미사용 (노드 환경) — 직접 verb facade 호출 패턴 검증.
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { buildVerbFacade } from "../src/hooks/buildVerbFacade.js";
import type { JsonOps } from "../src/hooks/useJson.js";
import { applyPatch, type JsonPatchOperation } from "../src/core/patch/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
  meta: z.record(z.string(), z.string()),
});
type State = z.output<typeof Schema>;

const initial: State = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: { foo: "bar" },
};

/** 테스트용 in-memory ops — useJson 없이 verb facade wiring 만 검증. */
function makeOps(s0: State): JsonOps<State> {
  let cur = s0;
  return {
    add: () => ({ ok: true }),
    remove: () => ({ ok: true }),
    replace: () => ({ ok: true }),
    move: () => ({ ok: true }),
    copy: () => ({ ok: true }),
    test: () => ({ ok: true }),
    patch(operations: ReadonlyArray<JsonPatchOperation>) {
      const r = applyPatch(Schema, cur, operations);
      if (r.result.ok) cur = r.state;
      return r.result;
    },
    undo: () => false,
    redo: () => false,
    canUndo: () => false,
    canRedo: () => false,
    load: () => ({ ok: true }),
    reset: () => {},
    subscribe: () => () => {},
    get state() { return cur; },
  };
}

describe("buildVerbFacade — facade 가 6 verbs 표면화 (격차 1 해소)", () => {
  test("doc.copy(source) — read-only payload 추출", () => {
    const ops = makeOps(initial);
    const facade = buildVerbFacade(Schema, ops);
    const r = facade.copy("/items/0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual({ id: "a", name: "A" });
  });

  test("doc.cut(source) — atomic remove + payload, ops.patch 로 commit", () => {
    const ops = makeOps(initial);
    const facade = buildVerbFacade(Schema, ops);
    const r = facade.cut("/items/0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({ id: "a", name: "A" });
    expect(ops.state.items).toHaveLength(1); // commit 됨
  });

  test("doc.paste(payload, target, mode) — RFC 6902 add/replace 합성", () => {
    const ops = makeOps(initial);
    const facade = buildVerbFacade(Schema, ops);
    const r = facade.paste({ id: "z", name: "Z" }, "/items/-", "into");
    expect(r.ok).toBe(true);
    expect(ops.state.items).toHaveLength(3);
    expect(ops.state.items[2]).toEqual({ id: "z", name: "Z" });
  });

  test("doc.duplicate(source) — 배열 다음 인덱스 자동", () => {
    const ops = makeOps(initial);
    const facade = buildVerbFacade(Schema, ops);
    const r = facade.duplicate("/items/0");
    expect(r.ok).toBe(true);
    expect(ops.state.items).toHaveLength(3);
    expect(ops.state.items[1]).toEqual({ id: "a", name: "A" });
  });

  test("doc.duplicate(source, { newKey }) — object key 명시", () => {
    const ops = makeOps(initial);
    const facade = buildVerbFacade(Schema, ops);
    const r = facade.duplicate("/meta/foo", { newKey: "baz" });
    expect(r.ok).toBe(true);
    expect(ops.state.meta.baz).toBe("bar");
  });

  test("doc.find(query) — RFC 9535 query → pointers", () => {
    const ops = makeOps(initial);
    const facade = buildVerbFacade(Schema, ops);
    const r = facade.find("$.items[*].id");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pointers).toEqual(["/items/0/id", "/items/1/id"]);
  });

  test("doc.replace(query, value) — multi-pointer batch", () => {
    const ops = makeOps(initial);
    const facade = buildVerbFacade(Schema, ops);
    const r = facade.replace("$.items[*].name", "renamed");
    expect(r.ok).toBe(true);
    expect(ops.state.items.every((i) => i.name === "renamed")).toBe(true);
  });

  test("schema 위반 시 verb 가 commit 하지 않음", () => {
    const NonEmpty = z.object({ items: z.array(z.string()).min(2) });
    type S = z.output<typeof NonEmpty>;
    const initialS: S = { items: ["a", "b"] };
    let cur = initialS;
    const ops: JsonOps<S> = {
      add: () => ({ ok: true }), remove: () => ({ ok: true }), replace: () => ({ ok: true }),
      move: () => ({ ok: true }), copy: () => ({ ok: true }), test: () => ({ ok: true }),
      patch(operations) {
        const r = applyPatch(NonEmpty, cur, operations);
        if (r.result.ok) cur = r.state;
        return r.result;
      },
      undo: () => false, redo: () => false, canUndo: () => false, canRedo: () => false,
      load: () => ({ ok: true }), reset: () => {}, subscribe: () => () => {},
      get state() { return cur; },
    };
    const facade = buildVerbFacade(NonEmpty, ops);
    const r = facade.cut("/items/0"); // 1개 남으면 min(2) 위반
    expect(r.ok).toBe(false);
    expect(cur.items).toHaveLength(2); // unchanged
  });
});
