import { describe, expect, test } from "vitest";

import {
  planDocumentCommitPreview,
  planDocumentCommitRoute,
  planDocumentCommitSelection,
  shouldRecordDocumentCommitHistory,
} from "../../../src/application/document/createJSONDocumentInteractionPlan.js";
import type { SelectionSnap } from "../../../src/domain/selection/index.js";
import type { JSONPatchOperation } from "../../../src/foundation/json-patch/index.js";

const emptySelection: SelectionSnap = {
  selectedPointers: [],
  selectionRanges: [],
  primaryIndex: -1,
  anchor: null,
  focus: null,
};

const titleSelection: SelectionSnap = {
  selectedPointers: ["/title"],
  selectionRanges: [{ anchor: "/title", focus: "/title" }],
  primaryIndex: 0,
  anchor: "/title",
  focus: "/title",
};

describe("document commit core functions", () => {
  test("routes commit previews to trusted apply only after successful prediction", () => {
    const state = { title: "final" };
    const applied: JSONPatchOperation[] = [{ op: "replace", path: "/title", value: "final" }];

    expect(planDocumentCommitPreview({
      result: { ok: false, code: "path_not_found", pointer: "/missing" },
      state,
      applied,
    })).toEqual({ kind: "fallbackPatch" });

    expect(planDocumentCommitPreview({
      result: { ok: true },
      state,
      applied,
    })).toEqual({
      kind: "trustedApply",
      state,
      applied,
    });
  });

  test("routes commit options to patch or explicit selection execution", () => {
    expect(planDocumentCommitRoute({ options: undefined })).toEqual({
      kind: "patch",
      metadata: undefined,
    });

    expect(planDocumentCommitRoute({
      options: { label: "Rename", origin: "keyboard", mergeKey: "typing:title" },
    })).toEqual({
      kind: "patch",
      metadata: {
        label: "Rename",
        origin: "keyboard",
        mergeKey: "typing:title",
      },
    });

    expect(planDocumentCommitRoute({
      options: {
        label: "Rename",
        selection: { type: "collapse", point: "/title" },
      },
    })).toEqual({
      kind: "selection",
      metadata: { label: "Rename" },
      selection: { type: "collapse", point: "/title" },
    });
  });

  test("plans explicit commit selection and merged metadata without a document facade", () => {
    const plan = planDocumentCommitSelection({
      activeHistoryMetadata: { origin: "keyboard" },
      metadata: { label: "Rename", mergeKey: "typing:title" },
      selection: { type: "collapse", point: "/title" },
      selectionBefore: emptySelection,
      state: { title: "final" },
      selectionMode: "single",
      selectionEnabled: true,
    });

    expect(plan.selectionAfter).toEqual(titleSelection);
    expect(plan.changeMetadata).toEqual({
      label: "Rename",
      origin: "keyboard",
      mergeKey: "typing:title",
      selectionBefore: emptySelection,
      selectionAfter: titleSelection,
    });
  });

  test("accepts commit selection snapshots as the final selection", () => {
    const selection: SelectionSnap = {
      selectedPointers: ["/items/0", "/items/9"],
      selectionRanges: [
        { anchor: "/items/0", focus: "/items/0" },
        { anchor: "/items/9", focus: "/items/9" },
      ],
      primaryIndex: 1,
      anchor: "/items/9",
      focus: "/items/9",
    };

    const plan = planDocumentCommitSelection({
      activeHistoryMetadata: undefined,
      metadata: undefined,
      selection,
      selectionBefore: emptySelection,
      state: { items: [{ id: "a" }] },
      selectionMode: "multiple",
      selectionEnabled: false,
    });

    expect(plan.selectionAfter).toEqual(selection);
    expect(plan.selectionAfter).not.toBe(selection);
    expect(plan.changeMetadata).toEqual({
      selectionBefore: emptySelection,
      selectionAfter: selection,
    });
  });

  test("decides whether explicit selection commits should enter history", () => {
    expect(shouldRecordDocumentCommitHistory({
      historyLimit: 10,
      isRestoring: false,
      operationCount: 1,
    })).toBe(true);

    expect(shouldRecordDocumentCommitHistory({
      historyLimit: 0,
      isRestoring: false,
      operationCount: 1,
    })).toBe(false);

    expect(shouldRecordDocumentCommitHistory({
      historyLimit: 10,
      isRestoring: true,
      operationCount: 1,
    })).toBe(false);

    expect(shouldRecordDocumentCommitHistory({
      historyLimit: 10,
      isRestoring: false,
      operationCount: 0,
    })).toBe(false);
  });
});
