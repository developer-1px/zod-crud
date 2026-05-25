import { describe, expect, test } from "vitest";

import { planDocumentSelectionRuntime } from "../../../src/application/document/plan/interaction.js";
import {
  planInitialSelection,
  planSelectionPatchUpdate,
  planSelectionStateUpdate,
  selectionAddRangeAction,
  selectionRemoveRangeAction,
  selectionSelectRangesAction,
  selectionToggleRangeAction,
} from "../../../src/application/document/selection/plan.js";
import type { JSONPatchOperation } from "../../../src/foundation/json-patch/types.js";
import type { SelectionSnap } from "../../../src/domain/selection/types.js";

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

  test("compares selection snapshots by value for observer decisions", () => {
    const textSelection: SelectionSnap = {
      selectedPointers: ["/items/0/name"],
      selectionRanges: [
        {
          anchor: { path: "/items/0/name", offset: 1, edge: "before", affinity: "forward" },
          focus: { path: "/items/0/name", offset: 4, edge: "after", affinity: "backward" },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/items/0/name", offset: 1, edge: "before", affinity: "forward" },
      focus: { path: "/items/0/name", offset: 4, edge: "after", affinity: "backward" },
      context: { source: "keyboard", nested: { depth: 1 } },
    };

    expect(planSelectionStateUpdate(textSelection, {
      selectedPointers: ["/items/0/name"],
      selectionRanges: [
        {
          anchor: { path: "/items/0/name", offset: 1, edge: "before", affinity: "forward" },
          focus: { path: "/items/0/name", offset: 4, edge: "after", affinity: "backward" },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/items/0/name", offset: 1, edge: "before", affinity: "forward" },
      focus: { path: "/items/0/name", offset: 4, edge: "after", affinity: "backward" },
      context: { source: "keyboard", nested: { depth: 1 } },
    }, true).emit).toBe(false);

    expect(planSelectionStateUpdate(textSelection, {
      ...textSelection,
      focus: { path: "/items/0/name", offset: 4, edge: "before", affinity: "forward" },
    }, true).emit).toBe(true);

    expect(planSelectionStateUpdate(textSelection, {
      ...textSelection,
      selectedPointers: ["/items/1/name"],
    }, true).emit).toBe(true);

    expect(planSelectionStateUpdate(textSelection, {
      ...textSelection,
      context: { source: "mouse", nested: { depth: 1 } },
    }, true).emit).toBe(true);
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

  test("plans patch-driven selection updates with metadata taking precedence over auto rules", () => {
    const state = {
      items: [
        { name: "Inserted" },
        { name: "A" },
        { name: "B" },
      ],
    };
    const applied: JSONPatchOperation[] = [
      { op: "add", path: "/items/0", value: { name: "Inserted" } },
    ];
    const metadataSelection: SelectionSnap = {
      selectedPointers: ["/items/2"],
      selectionRanges: [{ anchor: "/items/2", focus: "/items/2" }],
      primaryIndex: 0,
      anchor: "/items/2",
      focus: "/items/2",
    };

    expect(planSelectionPatchUpdate({
      current: itemSelection,
      applied,
      state,
      mode: "single",
      applyMetadataSelectionAfter: true,
      metadata: { selectionAfter: metadataSelection },
    })).toEqual(metadataSelection);

    expect(planSelectionPatchUpdate({
      current: itemSelection,
      applied,
      state,
      mode: "single",
      applyMetadataSelectionAfter: false,
      metadata: { selectionAfter: metadataSelection },
    })).toMatchObject({
      selectedPointers: ["/items/0"],
      primaryIndex: 0,
    });
  });

  test("plans document selection runtime options from facade options", () => {
    expect(planDocumentSelectionRuntime({
      selection: undefined,
      onChange: undefined,
    })).toEqual({
      selectionEnabled: false,
      selectionMode: "single",
      createSelectionOptions: {
        applyMetadataSelectionAfter: true,
      },
    });

    expect(planDocumentSelectionRuntime({
      selection: false,
      onChange: undefined,
    })).toMatchObject({
      selectionEnabled: false,
      selectionMode: "single",
    });

    const onChange = () => {};
    expect(planDocumentSelectionRuntime({
      selection: {
        mode: "multiple",
        initial: ["/items/0"],
        context: { source: "test" },
      },
      onChange,
    })).toEqual({
      selectionEnabled: true,
      selectionMode: "multiple",
      createSelectionOptions: {
        mode: "multiple",
        initial: ["/items/0"],
        context: { source: "test" },
        applyMetadataSelectionAfter: true,
        onChange,
      },
    });
  });
});
