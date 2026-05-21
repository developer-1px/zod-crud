import { describe, expect, test } from "vitest";

import {
  emptyHistory,
  historyBack,
  historyCanRedo,
  historyCanUndo,
  historyCommit,
  historyForward,
  historyMergeLast,
  type HistoryStack,
} from "../src/index.js";

interface Entry {
  id: string;
  forward: ReadonlyArray<{ op: "replace"; path: string; value: string }>;
  inverse: ReadonlyArray<{ op: "replace"; path: string; value: string }>;
}

describe("headless history primitives", () => {
  test("commit/back/forward keep standalone undo-redo state React-free", () => {
    const first: Entry = {
      id: "first",
      forward: [{ op: "replace", path: "/title", value: "a" }],
      inverse: [{ op: "replace", path: "/title", value: "" }],
    };
    const second: Entry = {
      id: "second",
      forward: [{ op: "replace", path: "/title", value: "b" }],
      inverse: [{ op: "replace", path: "/title", value: "a" }],
    };

    const initialStack: HistoryStack<Entry> = emptyHistory();
    const committed = historyCommit(historyCommit(initialStack, first, 10), second, 10);

    expect(emptyHistory().undo).toEqual([]);
    expect(historyCanUndo(committed)).toBe(true);
    expect(historyCanRedo(committed)).toBe(false);

    const undone = historyBack(committed);

    expect(undone?.entry.id).toBe("second");
    expect(undone?.next.undo.map((entry) => entry.id)).toEqual(["first"]);
    expect(undone?.next.redo.map((entry) => entry.id)).toEqual(["second"]);
    expect(historyCanRedo(undone!.next)).toBe(true);

    const redone = historyForward(undone!.next);

    expect(redone?.entry.id).toBe("second");
    expect(redone?.next.undo.map((entry) => entry.id)).toEqual(["first", "second"]);
    expect(redone?.next.redo).toEqual([]);
  });

  test("mergeLast and commit limit expose the same reducer used by document history", () => {
    const entries: Entry[] = ["a", "b", "c"].map((id) => ({
      id,
      forward: [{ op: "replace", path: "/title", value: id }],
      inverse: [{ op: "replace", path: "/title", value: "" }],
    }));
    const limited = entries.reduce(
      (stack, entry) => historyCommit(stack, entry, 2),
      emptyHistory<Entry>(),
    );

    expect(limited.undo.map((entry) => entry.id)).toEqual(["b", "c"]);

    const merged = historyMergeLast(limited, (prev, top) => ({
      id: `${prev.id}+${top.id}`,
      forward: [...prev.forward, ...top.forward],
      inverse: [...top.inverse, ...prev.inverse],
    }));

    expect(merged?.undo.map((entry) => entry.id)).toEqual(["b+c"]);
    expect(merged?.undo[0]?.forward.map((op) => op.value)).toEqual(["b", "c"]);
    expect(merged?.undo[0]?.inverse.map((op) => op.value)).toEqual(["", ""]);
  });
});
