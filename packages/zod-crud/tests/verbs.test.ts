// verbs/ 단위 테스트 (P3 추가 — verbs/* pure 함수 검증).
import { describe, expect, test } from "vitest";
import * as z from "zod";

import { move } from "../src/verbs/move.js";
import { undo } from "../src/verbs/undo.js";
import { redo } from "../src/verbs/redo.js";
import { select, EMPTY_SELECTION } from "../src/verbs/select.js";
import {
  anchorPointer,
  caretPoint,
  caretPointer,
  focusPointer,
  hasSelection,
  pointPointer,
  isSelected,
  primaryPointer,
  primaryRange,
  rangeCount,
  reduceSelection,
  selectedCount,
  selectedSource,
  selectionSnapshot,
} from "../src/core/selection/index.js";
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
    expect(s.selectedPointers).toEqual(["/items/0"]);
    expect(s.selectionRanges).toEqual([{ anchor: "/items/0", focus: "/items/0" }]);
    expect(s.primaryIndex).toBe(0);
    expect(s.anchor).toBe("/items/0");
    expect(s.focus).toBe("/items/0");
    expect(rangeCount(s)).toBe(1);
    expect(selectedCount(s)).toBe(1);
    expect(hasSelection(s)).toBe(true);
    expect(isSelected(s, "/items/0")).toBe(true);
    expect(isSelected(s, "/items/1")).toBe(false);
    expect(primaryRange(s)).toEqual({ anchor: "/items/0", focus: "/items/0" });
    expect(anchorPointer(s)).toBe("/items/0");
    expect(focusPointer(s)).toBe("/items/0");
    expect(selectedSource(s)).toBe("/items/0");
    expect(primaryPointer(s)).toBe("/items/0");
    expect(caretPoint(s)).toBe("/items/0");
    expect(caretPointer(s)).toBe("/items/0");
  });

  test("JSONPoint caret preserves text offset separately from selected pointer", () => {
    const point = { path: "/items/0/name" as const, offset: 1, affinity: "forward" as const };
    const s = select(EMPTY_SELECTION, { type: "collapse", point }, "single");

    expect(s.ranges).toEqual(["/items/0/name"]);
    expect(s.selectedPointers).toEqual(["/items/0/name"]);
    expect(s.selectionRanges).toEqual([{ anchor: point, focus: point }]);
    expect(s.anchor).toEqual(point);
    expect(s.focus).toEqual(point);
    expect(primaryRange(s)).toEqual({ anchor: point, focus: point });
    expect(primaryPointer(s)).toBe("/items/0/name");
    expect(caretPoint(s)).toEqual(point);
    expect(caretPointer(s)).toBe("/items/0/name");
    expect(pointPointer(point)).toBe("/items/0/name");
  });

  test("JSONPoint coordinates are stored and projected as value snapshots", () => {
    const point = { path: "/items/0/name" as const, offset: 1, affinity: "forward" as const };
    const s = select(EMPTY_SELECTION, { type: "collapse", point }, "single");

    point.offset = 99;
    expect(caretPoint(s)).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const projectedCaret = caretPoint(s);
    if (projectedCaret === null || typeof projectedCaret === "string") throw new Error("expected JSONPoint object");
    projectedCaret.offset = 88;
    expect(caretPoint(s)).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const projectedRange = primaryRange(s);
    if (projectedRange === null || typeof projectedRange.anchor === "string") throw new Error("expected JSONPoint object");
    projectedRange.anchor.offset = 66;
    expect(caretPoint(s)).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });

    const snapshot = selectionSnapshot(s);
    const snapshotAnchor = snapshot.selectionRanges[0]?.anchor;
    if (snapshotAnchor === undefined || typeof snapshotAnchor === "string") throw new Error("expected JSONPoint object");
    snapshotAnchor.offset = 77;
    expect(caretPoint(s)).toEqual({ path: "/items/0/name", offset: 1, affinity: "forward" });
  });

  test("JSONPoint string offsets are normalized against current state", () => {
    const s = reduceSelection(
      EMPTY_SELECTION,
      {
        type: "setBaseAndExtent",
        anchor: { path: "/items/0/name", offset: -1 },
        focus: { path: "/items/1/name", offset: 99 },
      },
      "extended",
      initial,
    );

    expect(s.selectionRanges).toEqual([{
      anchor: { path: "/items/0/name", offset: 0 },
      focus: { path: "/items/1/name", offset: 1 },
    }]);
    expect(s.anchor).toEqual({ path: "/items/0/name", offset: 0 });
    expect(s.focus).toEqual({ path: "/items/1/name", offset: 1 });
  });

  test("multiple mode stores independent ranges and primary range", () => {
    const first = select(EMPTY_SELECTION, { type: "addRange", pointer: "/items/0" }, "multiple");
    const second = select(first, { type: "addRange", range: { anchor: "/items/1/name", focus: "/items/1/name" } }, "multiple");

    expect(second.ranges).toEqual(["/items/0", "/items/1/name"]);
    expect(second.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1/name", focus: "/items/1/name" },
    ]);
    expect(second.primaryIndex).toBe(1);
    expect(second.anchor).toBe("/items/1/name");
    expect(second.focus).toBe("/items/1/name");
    expect(rangeCount(second)).toBe(2);
    expect(selectedCount(second)).toBe(2);
    expect(hasSelection(second)).toBe(true);
    expect(isSelected(second, "/items/0")).toBe(true);
    expect(isSelected(second, "/items/1/name")).toBe(true);
    expect(isSelected(second, "/items/2")).toBe(false);
    expect(primaryRange(second)).toEqual({ anchor: "/items/1/name", focus: "/items/1/name" });
    expect(anchorPointer(second)).toBe("/items/1/name");
    expect(focusPointer(second)).toBe("/items/1/name");
    expect(selectedSource(second)).toEqual(["/items/0", "/items/1/name"]);
    expect(primaryPointer(second)).toBe("/items/1/name");
    expect(caretPoint(second)).toBe(null);
    expect(caretPointer(second)).toBe(null);
  });

  test("selectRanges dedupes ranges while preserving primary range intent", () => {
    const s = select(EMPTY_SELECTION, {
      type: "selectRanges",
      ranges: ["/items/0", "/items/1", "/items/0"],
      primaryIndex: 2,
    }, "multiple");

    expect(s.selectedPointers).toEqual(["/items/0", "/items/1"]);
    expect(s.selectionRanges).toEqual([
      { anchor: "/items/0", focus: "/items/0" },
      { anchor: "/items/1", focus: "/items/1" },
    ]);
    expect(s.primaryIndex).toBe(0);
    expect(primaryRange(s)).toEqual({ anchor: "/items/0", focus: "/items/0" });
    expect(primaryPointer(s)).toBe("/items/0");
  });

  test("selectRanges accepts JSONPoint objects as collapsed ranges", () => {
    const point = { path: "/items/0/name" as const, offset: 99, affinity: "forward" as const };
    const s = select(EMPTY_SELECTION, {
      type: "selectRanges",
      ranges: [point, { anchor: "/items/2", focus: "/items/2" }],
      primaryIndex: 0,
    }, "multiple", initial);

    expect(s.selectedPointers).toEqual(["/items/0/name", "/items/2"]);
    expect(s.selectionRanges).toEqual([
      {
        anchor: { path: "/items/0/name", offset: 1, affinity: "forward" },
        focus: { path: "/items/0/name", offset: 1, affinity: "forward" },
      },
      { anchor: "/items/2", focus: "/items/2" },
    ]);
    expect(s.primaryIndex).toBe(0);
    expect(primaryPointer(s)).toBe("/items/0/name");
    expect(caretPoint(s)).toBe(null);
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

  test("empty selection reports zero counts", () => {
    expect(rangeCount(EMPTY_SELECTION)).toBe(0);
    expect(selectedCount(EMPTY_SELECTION)).toBe(0);
    expect(hasSelection(EMPTY_SELECTION)).toBe(false);
    expect(isSelected(EMPTY_SELECTION, "/items/0")).toBe(false);
    expect(selectedSource(EMPTY_SELECTION)).toBe(null);
  });
});
