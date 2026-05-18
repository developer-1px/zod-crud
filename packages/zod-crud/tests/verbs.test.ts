// verbs/ 단위 테스트 (P3 추가 — verbs/* pure 함수 검증).
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { move } from "../src/verbs/move.js";
import { undo } from "../src/verbs/undo.js";
import { redo } from "../src/verbs/redo.js";
import { select, EMPTY_SELECTION } from "../src/verbs/select.js";
import { reduceSelection } from "../src/core/selection/index.js";
import { commit, emptyHistory } from "../src/core/history.js";
import { computeInverses } from "../src/core/patch/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ],
};

describe("verbs/move", () => {
  test("RFC 6902 move op 으로 환원되어 next + patch 산출", () => {
    const r = move(Schema, initial, "/items/0", "/items/2");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(r.patch).toEqual([{ op: "move", from: "/items/0", path: "/items/2" }]);
  });

  test("invalid path 시 ok: false", () => {
    const r = move(Schema, initial, "/items/99", "/items/0");
    expect(r.ok).toBe(false);
  });
});

describe("verbs/undo + verbs/redo", () => {
  test("undo 가 inverse 를 적용하고 redo 가 forward 를 적용한다", () => {
    const m = move(Schema, initial, "/items/0", "/items/2");
    if (!m.ok) throw new Error("move failed");
    const inv = computeInverses(initial, m.patch);
    if (!inv.ok) throw new Error("inverse failed");
    const stack = commit(emptyHistory<{ forward: typeof m.patch; inverse: typeof inv.inverses }>(), {
      forward: m.patch,
      inverse: inv.inverses,
    }, 50);

    const u = undo(Schema, m.next, stack);
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.next).toEqual(initial);
    expect(u.nextStack.undo.length).toBe(0);
    expect(u.nextStack.redo.length).toBe(1);

    const r = redo(Schema, u.next, u.nextStack);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next).toEqual(m.next);
  });

  test("빈 스택 undo 는 empty_stack", () => {
    const r = undo(Schema, initial, emptyHistory<{ forward: never[]; inverse: never[] }>());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty_stack");
  });
});

describe("verbs/select", () => {
  test("collapse action 이 caret selection 으로 환원", () => {
    const s = select(EMPTY_SELECTION, { type: "collapse", pointer: "/items/0" }, "single");
    expect(s.ranges).toEqual(["/items/0"]);
    expect(s.anchor).toBe("/items/0");
    expect(s.focus).toBe("/items/0");
  });

  test("extended range falls back to endpoints when pointer is invalid", () => {
    const s = reduceSelection(
      EMPTY_SELECTION,
      { type: "setBaseAndExtent", anchor: "items/0" as never, focus: "/items/1" },
      "extended",
      initial,
    );
    expect(s.ranges).toEqual(["items/0", "/items/1"]);
    expect(s.anchor).toBe("items/0");
    expect(s.focus).toBe("/items/1");
  });
});
