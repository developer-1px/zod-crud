import { describe, expect, test } from "vitest";

import type { HistoryStack } from "../src/core/history.js";
import type { JSONPatchOperation, JSONResult } from "../src/core/patch/index.js";
import { EMPTY_SELECTION } from "../src/core/selection/index.js";
import { buildJSONDocumentOps } from "../src/hooks/buildJSONDocumentOps.js";
import type { HistoryEntry } from "../src/hooks/jsonDocumentHistory.js";
import type { SelectionState } from "../src/hooks/useSelection.js";
import type { JSONOps } from "../src/jsonOps.js";

describe("buildJSONDocumentOps restore", () => {
  test("undo clears restoring flag when raw patch throws", () => {
    const entry: HistoryEntry = {
      forward: [{ op: "replace", path: "/name", value: "next" }],
      inverse: [{ op: "replace", path: "/name", value: "old" }],
      selectionBefore: EMPTY_SELECTION,
      selectionAfter: EMPTY_SELECTION,
    };
    const stackRef = { current: { undo: [entry], redo: [] } satisfies HistoryStack<HistoryEntry> };
    const isRestoringRef = { current: false };
    const selectionRef = { current: selectionStub() };
    const rawOps = throwingPatchOps();

    const ops = buildJSONDocumentOps({
      rawOps,
      stackRef,
      isRestoringRef,
      selectionRef,
      historyLimit: 10,
    });

    expect(ops.undo()).toBe(false);
    expect(isRestoringRef.current).toBe(false);
    expect(stackRef.current.undo).toEqual([entry]);
    expect(stackRef.current.redo).toEqual([]);
  });

  test("redo clears restoring flag when raw patch returns failure", () => {
    const entry: HistoryEntry = {
      forward: [{ op: "replace", path: "/name", value: "next" }],
      inverse: [{ op: "replace", path: "/name", value: "old" }],
      selectionBefore: EMPTY_SELECTION,
      selectionAfter: EMPTY_SELECTION,
    };
    const stackRef = { current: { undo: [], redo: [entry] } satisfies HistoryStack<HistoryEntry> };
    const isRestoringRef = { current: false };
    const selectionRef = { current: selectionStub() };
    const rawOps = failingPatchOps();

    const ops = buildJSONDocumentOps({
      rawOps,
      stackRef,
      isRestoringRef,
      selectionRef,
      historyLimit: 10,
    });

    expect(ops.redo()).toBe(false);
    expect(isRestoringRef.current).toBe(false);
    expect(stackRef.current.undo).toEqual([]);
    expect(stackRef.current.redo).toEqual([entry]);
  });
});

function throwingPatchOps(): JSONOps<{ name: string }> {
  return baseOps(() => {
    throw new Error("patch failed");
  });
}

function failingPatchOps(): JSONOps<{ name: string }> {
  return baseOps(() => ({ ok: false, code: "schema_violation", reason: "invalid" }));
}

function baseOps(patch: (operations: ReadonlyArray<JSONPatchOperation>) => JSONResult): JSONOps<{ name: string }> {
  return {
    add: () => ({ ok: true }),
    remove: () => ({ ok: true }),
    replace: () => ({ ok: true }),
    move: () => ({ ok: true }),
    copy: () => ({ ok: true }),
    test: () => ({ ok: true }),
    set: () => ({ ok: true }),
    patch,
    apply: () => undefined,
    load: () => ({ ok: true }),
    reset: () => ({ ok: true }),
    subscribe: () => () => undefined,
    state: { name: "old" },
  };
}

function selectionStub(): SelectionState<{ name: string }> {
  return {
    ranges: [],
    selectedPointers: [],
    selectionRanges: [],
    primaryIndex: -1,
    primaryRange: null,
    primaryPointer: null,
    caret: null,
    caretPointer: null,
    anchor: null,
    focus: null,
    isCollapsed: false,
    type: "None",
    collapse: () => undefined,
    setBaseAndExtent: () => undefined,
    extend: () => undefined,
    addRange: () => undefined,
    removeRange: () => undefined,
    toggleRange: () => undefined,
    selectRanges: () => undefined,
    empty: () => undefined,
    containsNode: () => false,
  };
}
