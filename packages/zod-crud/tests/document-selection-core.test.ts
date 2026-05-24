import { describe, expect, test } from "vitest";

import {
  planInitialSelection,
  planSelectionStateUpdate,
  selectionAddRangeAction,
  selectionRemoveRangeAction,
  selectionSelectRangesAction,
  selectionToggleRangeAction,
} from "../src/application/document/selection.js";
import type { SelectionSnap } from "../src/domain/selection/index.js";

const emptySelection: SelectionSnap = {
  selectedPointers: [],
  selectionRanges: [],
  primaryIndex: -1,
  anchor: null,
  focus: null,
};

const itemSelection: SelectionSnap = {
  selectedPointers: ["/items/0"],
  selectionRanges: [{ anchor: "/items/0", focus: "/items/0" }],
  primaryIndex: 0,
  anchor: "/items/0",
  focus: "/items/0",
};

describe("document selection core functions", () => {
  test("plans state updates without observer work when no observers exist", () => {
    expect(planSelectionStateUpdate(emptySelection, itemSelection, false)).toEqual({
      snap: itemSelection,
      emit: false,
    });
  });

  test("suppresses observer emits for equal selection snapshots", () => {
    const equivalent: SelectionSnap = {
      selectedPointers: ["/items/0"],
      selectionRanges: [{ anchor: "/items/0", focus: "/items/0" }],
      primaryIndex: 0,
      anchor: "/items/0",
      focus: "/items/0",
    };

    expect(planSelectionStateUpdate(itemSelection, equivalent, true)).toEqual({
      snap: itemSelection,
      emit: false,
    });
  });

  test("plans observer emits with a defensive previous snapshot", () => {
    const next: SelectionSnap = {
      selectedPointers: ["/items/1"],
      selectionRanges: [{ anchor: "/items/1", focus: "/items/1" }],
      primaryIndex: 0,
      anchor: "/items/1",
      focus: "/items/1",
    };

    const plan = planSelectionStateUpdate(itemSelection, next, true);

    expect(plan).toMatchObject({
      snap: next,
      emit: true,
      previous: { selectedPointers: ["/items/0"] },
    });
    if (plan.emit) {
      expect(plan.previous).not.toBe(itemSelection);
      expect(plan.previous.selectionRanges).not.toBe(itemSelection.selectionRanges);
    }
  });

  test("builds range actions from facade method inputs", () => {
    expect(selectionAddRangeAction("/items/0")).toEqual({
      type: "addRange",
      point: "/items/0",
    });
    expect(selectionAddRangeAction({ anchor: "/items/0", focus: "/items/1" })).toEqual({
      type: "addRange",
      range: { anchor: "/items/0", focus: "/items/1" },
    });
    expect(selectionRemoveRangeAction(1)).toEqual({
      type: "removeRange",
      index: 1,
    });
    expect(selectionToggleRangeAction({ path: "/items/0/name", offset: 1 })).toEqual({
      type: "toggleRange",
      point: { path: "/items/0/name", offset: 1 },
    });
    expect(selectionSelectRangesAction(["/items/0"], undefined, "/items/1", 0)).toEqual({
      type: "selectRanges",
      ranges: ["/items/0"],
      focus: "/items/1",
      primaryIndex: 0,
    });
  });

  test("plans initial selection and context without a selection facade", () => {
    const state = {
      items: [{ name: "A" }, { name: "B" }],
    };

    expect(planInitialSelection({
      initial: ["/items/0/name", "/items/1/name"],
      context: { source: "test" },
    }, "extended", state)).toMatchObject({
      selectedPointers: ["/items/0/name", "/items/1/name"],
      primaryIndex: 0,
      context: { source: "test" },
    });
  });
});
