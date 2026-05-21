// 격차 1+2 해소 검증 — document facade 의 commands + can group (TipTap 식).
// React testing library 미사용 (노드 환경) — buildCommands + buildCan 직접 호출.
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { buildCommands } from "../src/commands/buildCommands.js";
import { buildCan } from "../src/commands/buildCan.js";
import type { JSONDocumentOps } from "../src/jsonOps.js";
import { applyPatch, type JSONPatchOperation } from "../src/core/patch/index.js";
import { EMPTY_SELECTION } from "../src/core/selection/index.js";
import { JSONCrudError } from "../src/JSONCrudError.js";

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

/** 테스트용 in-memory ops — React 없이 commands wiring 만 검증. */
function makeOps(s0: State): JSONDocumentOps<State> {
  let cur = s0;
  return {
    add: () => ({ ok: true }),
    remove: () => ({ ok: true }),
    replace: () => ({ ok: true }),
    move: () => ({ ok: true }),
    copy: () => ({ ok: true }),
    test: () => ({ ok: true }),
    set: () => ({ ok: true }),
    patch(operations: ReadonlyArray<JSONPatchOperation>) {
      const r = applyPatch(Schema, cur, operations);
      if (r.result.ok) cur = r.state;
      return r.result;
    },
    apply(operations) {
      const r = applyPatch(Schema, cur, operations);
      if (!r.result.ok) throw new JSONCrudError("patch", r.result);
      cur = r.state;
    },
    undo: () => false,
    redo: () => false,
    canUndo: () => false,
    canRedo: () => false,
    load: () => ({ ok: true }),
    reset: () => ({ ok: true }),
    subscribe: () => () => {},
    get state() { return cur; },
  };
}

const emptySelectionRef = { current: EMPTY_SELECTION };

describe("buildCommands — TipTap 식 commands group", () => {
  test("commands.copy(source) — read-only payload", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.copy("/items/0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual({ id: "a", name: "A" });
  });

  test("commands.cut(source) — atomic remove + payload", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.cut("/items/0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toEqual({ id: "a", name: "A" });
    expect(ops.state.items).toHaveLength(1);
  });

  test("commands.remove(source) — structural delete without payload", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.remove("/items/0");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch).toEqual([{ op: "remove", path: "/items/0" }]);
    expect("payload" in r).toBe(false);
    expect(ops.state.items).toHaveLength(1);
  });

  test("commands.remove(source[]) normalizes sources and avoids array index shift", () => {
    const ops = makeOps({
      items: [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
        { id: "c", name: "C" },
      ],
      meta: { foo: "bar" },
    });
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.remove(["/items/0/name", "/items/0", "/items/1"]);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sources).toEqual(["/items/0", "/items/1"]);
    expect(r.patch).toEqual([
      { op: "remove", path: "/items/1" },
      { op: "remove", path: "/items/0" },
    ]);
    expect("payload" in r).toBe(false);
    expect(ops.state.items).toEqual([{ id: "c", name: "C" }]);
  });

  test("commands.remove(source) reports invalid pointers before mutation", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });

    expect(commands.remove("items/0" as never)).toMatchObject({
      ok: false,
      code: "invalid_pointer",
      pointer: "items/0",
    });
    expect(ops.state).toEqual(initial);
  });

  test("commands.paste(payload, target, mode)", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.paste({ id: "z", name: "Z" }, "/items/-", "into");
    expect(r.ok).toBe(true);
    expect(ops.state.items).toHaveLength(3);
  });

  test("commands.duplicate(source) — array next index", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.duplicate("/items/0");
    expect(r.ok).toBe(true);
    expect(ops.state.items).toHaveLength(3);
  });

  test("commands.move(from, to) — RFC 6902 move", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.move("/items/0", "/items/1");
    expect(r.ok).toBe(true);
  });

  test("commands.find(query) — RFC 9535", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.find("$.items[*].id");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pointers).toEqual(["/items/0/id", "/items/1/id"]);
  });

  test("commands.replace(path, value) — RFC 6901 Pointer (어휘 일관성)", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const r = commands.replace("/items/0/name", "renamed");
    expect(r.ok).toBe(true);
    expect(ops.state.items[0]?.name).toBe("renamed");
  });

  test("commands.replace multi-match — JSONPath batch", () => {
    const ops = makeOps(initial);
    const commands = buildCommands({ schema: Schema, ops, selectionRef: emptySelectionRef });
    const replaced = commands.replace("$.items[*].name", "renamed");
    expect(replaced).toMatchObject({
      ok: true,
      pointers: ["/items/0/name", "/items/1/name"],
    });
    expect(ops.state.items.every((i) => i.name === "renamed")).toBe(true);
  });
});

describe("buildCan — TipTap 식 can group", () => {
  test("can.cut(source) returns true for valid cut", () => {
    const ops = makeOps(initial);
    const can = buildCan({ schema: Schema, ops });
    expect(can.cut("/items/0")).toBe(true);
  });

  test("can.remove(source) returns true for valid structural remove", () => {
    const ops = makeOps(initial);
    const can = buildCan({ schema: Schema, ops });
    expect(can.remove("/items/0")).toBe(true);
  });

  test("can.cut(source) returns false when schema would be violated", () => {
    const NonEmpty = z.object({ items: z.array(z.string()).min(2) });
    type S = z.output<typeof NonEmpty>;
    let cur: S = { items: ["a", "b"] };
    const ops: JSONDocumentOps<S> = {
      add: () => ({ ok: true }), remove: () => ({ ok: true }), replace: () => ({ ok: true }),
      move: () => ({ ok: true }), copy: () => ({ ok: true }), test: () => ({ ok: true }),
      set: () => ({ ok: true }),
      patch(operations) { const r = applyPatch(NonEmpty, cur, operations); if (r.result.ok) cur = r.state; return r.result; },
      apply(operations) {
        const r = applyPatch(NonEmpty, cur, operations);
        if (!r.result.ok) throw new JSONCrudError("patch", r.result);
        cur = r.state;
      },
      undo: () => false, redo: () => false, canUndo: () => false, canRedo: () => false,
      load: () => ({ ok: true }), reset: () => ({ ok: true }), subscribe: () => () => {},
      get state() { return cur; },
    };
    const can = buildCan({ schema: NonEmpty, ops });
    expect(can.cut("/items/0")).toBe(false);
    expect(can.remove("/items/0")).toBe(false);
  });

  test("can.move(from, to) — preFlight gate", () => {
    const ops = makeOps(initial);
    const can = buildCan({ schema: Schema, ops });
    expect(can.move("/items/0", "/items/1")).toBe(true);
    expect(can.move("/items/99", "/items/0")).toBe(false); // path 없음
  });

  test("can.find(query) — JSONPath syntax guard", () => {
    const ops = makeOps(initial);
    const can = buildCan({ schema: Schema, ops });
    expect(can.find("$.items[*].id")).toBe(true);
    expect(can.find("$.items[")).toBe(false);
  });

  test("can.copy(source) — path 존재 확인", () => {
    const ops = makeOps(initial);
    const can = buildCan({ schema: Schema, ops });
    expect(can.copy("/items/0")).toBe(true);
    expect(can.copy("/items/99")).toBe(false);
  });

  test("can.duplicate(source, opts) — array vs object", () => {
    const ops = makeOps(initial);
    const can = buildCan({ schema: Schema, ops });
    expect(can.duplicate("/items/0")).toBe(true);
    expect(can.duplicate("/meta/foo")).toBe(false); // newKey 없음
    expect(can.duplicate("/meta/foo", { newKey: "baz" })).toBe(true);
  });

  test("can.undo / can.redo — stack flags", () => {
    const ops = makeOps(initial);
    const can = buildCan({ schema: Schema, ops });
    expect(can.undo).toBe(false); // 초기엔 비어있음
    expect(can.redo).toBe(false);
  });
});
