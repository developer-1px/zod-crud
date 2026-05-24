import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  checkDocumentCopy,
  checkDocumentFind,
  checkDocumentPatch,
  checkDocumentRemove,
  checkDocumentReplace,
  planDocumentCopyCheck,
  planDocumentCheckResult,
  planDocumentCutCheck,
  planDocumentDeleteTextCheck,
  planDocumentDuplicateCheck,
  planDocumentMoveCheck,
  planDocumentPatchCheck,
  planDocumentPasteCheck,
  planDocumentRemoveCheck,
  planDocumentReplaceCheck,
  planDocumentReplaceTextCheck,
  type DocumentCheckContext,
} from "../src/application/document/check.js";
import type { JSONPatchOperation } from "../src/foundation/json-patch/index.js";
import type { SelectionSnap } from "../src/domain/selection/index.js";

const Item = z.object({ id: z.string(), name: z.string() });
const Schema = z.object({
  items: z.array(Item),
  meta: z.record(z.string(), z.string()),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: { owner: "core" },
};

const selectedFirstItem: SelectionSnap = {
  selectedPointers: ["/items/0"],
  selectionRanges: [{ anchor: "/items/0", focus: "/items/0" }],
  primaryIndex: 0,
  anchor: "/items/0",
  focus: "/items/0",
};

const selectedFirstNameText: SelectionSnap = {
  selectedPointers: ["/items/0/name"],
  selectionRanges: [
    {
      anchor: { path: "/items/0/name", offset: 0 },
      focus: { path: "/items/0/name", offset: 1 },
    },
  ],
  primaryIndex: 0,
  anchor: { path: "/items/0/name", offset: 0 },
  focus: { path: "/items/0/name", offset: 1 },
};

describe("document check core functions", () => {
  test("normalizes checkable domain results without running a document facade", () => {
    expect(planDocumentCheckResult({ ok: true })).toEqual({ ok: true });

    expect(planDocumentCheckResult({
      ok: false,
      code: "path_not_found",
      message: "missing path",
      pointer: "/missing",
      violations: [{ path: "/missing", message: "Missing" }],
    })).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "missing path",
      pointer: "/missing",
      violations: [{ path: "/missing", message: "Missing" }],
    });

    expect(planDocumentCheckResult({
      ok: false,
      code: "path_not_found",
      reason: "preferred reason",
      message: "fallback message",
      pointer: null,
    })).toEqual({
      ok: false,
      code: "path_not_found",
      reason: "preferred reason",
    });
  });

  test("checks a patch through an injected preview without a document facade", () => {
    const operations: JSONPatchOperation[] = [{ op: "remove", path: "/missing" }];
    let previewed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentPatchCheck({
      schema: Schema,
      state: initial,
      operations,
      previewPatch(next) {
        previewed = next;
        return {
          state: initial,
          result: { ok: false, code: "path_not_found", pointer: "/missing" },
          applied: [],
        };
      },
    })).toMatchObject({
      ok: false,
      code: "path_not_found",
    });
    expect(previewed).toBe(operations);

    const context: DocumentCheckContext<typeof Schema> = {
      schema: Schema,
      state: initial,
      previewPatch(next) {
        return {
          state: initial,
          result: { ok: false, code: "path_not_found", pointer: "/missing" },
          applied: [],
        };
      },
    };

    expect(checkDocumentPatch(context, operations)).toMatchObject({
      ok: false,
      code: "path_not_found",
    });
    expect(initial.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("checks selected-source operations from plain state and selection data", () => {
    const context: DocumentCheckContext<typeof Schema> = {
      schema: Schema,
      state: initial,
      selection: selectedFirstItem,
    };

    expect(checkDocumentRemove(context)).toEqual({ ok: true });
    expect(checkDocumentReplace(context, { id: "a1", name: "A1" })).toEqual({ ok: true });
    expect(initial.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("plans remove checks from explicit state and selection source", () => {
    let removed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentRemoveCheck({
      schema: Schema,
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "remove source selection is empty",
    });

    expect(planDocumentRemoveCheck({
      schema: Schema,
      state: initial,
      selectionSource: "/items/0",
      previewPatch(operations) {
        removed = operations;
        return {
          state: {
            ...initial,
            items: [initial.items[1]!],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(removed).toEqual([
      { op: "remove", path: "/items/0" },
    ]);
  });

  test("plans replace checks from explicit state, target fallback, and JSONPath targets", () => {
    let previewed: ReadonlyArray<JSONPatchOperation> | undefined;
    let jsonpathPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentReplaceCheck({
      schema: Schema,
      state: initial,
      value: { id: "x", name: "X" },
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "replace target selection is empty",
    });

    expect(planDocumentReplaceCheck({
      schema: Schema,
      state: initial,
      value: { id: "a1", name: "A1" },
      selectionTarget: "/items/0",
      previewPatch(operations) {
        previewed = operations;
        return {
          state: {
            ...initial,
            items: [{ id: "a1", name: "A1" }, initial.items[1]!],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(previewed).toEqual([
      { op: "replace", path: "/items/0", value: { id: "a1", name: "A1" } },
    ]);

    expect(planDocumentReplaceCheck({
      schema: Schema,
      state: initial,
      value: "Renamed",
      target: "$.items[*].name",
      previewPatch(operations) {
        jsonpathPreviewed = operations;
        return {
          state: {
            ...initial,
            items: [
              { id: "a", name: "Renamed" },
              { id: "b", name: "Renamed" },
            ],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(jsonpathPreviewed).toEqual([
      { op: "replace", path: "/items/0/name", value: "Renamed" },
      { op: "replace", path: "/items/1/name", value: "Renamed" },
    ]);
  });

  test("plans text replacement and deletion checks from explicit selection", () => {
    let replaced: ReadonlyArray<JSONPatchOperation> | undefined;
    let deleted: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentReplaceTextCheck({
      schema: Schema,
      state: initial,
      selection: selectedFirstNameText,
      replacement: "Alpha",
      previewPatch(operations) {
        replaced = operations;
        return {
          state: {
            ...initial,
            items: [{ id: "a", name: "Alpha" }, initial.items[1]!],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(replaced).toEqual([
      { op: "replace", path: "/items/0/name", value: "Alpha" },
    ]);

    expect(planDocumentDeleteTextCheck({
      schema: Schema,
      state: initial,
      selection: selectedFirstNameText,
      previewPatch(operations) {
        deleted = operations;
        return {
          state: {
            ...initial,
            items: [{ id: "a", name: "" }, initial.items[1]!],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(deleted).toEqual([
      { op: "replace", path: "/items/0/name", value: "" },
    ]);
  });

  test("plans move and duplicate checks from explicit state and selection source", () => {
    let moved: ReadonlyArray<JSONPatchOperation> | undefined;
    let duplicated: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentMoveCheck({
      schema: Schema,
      state: initial,
      target: "/items/1",
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "move source selection is empty",
    });

    expect(planDocumentMoveCheck({
      schema: Schema,
      state: initial,
      selectionSource: "/items/0",
      target: "/items/1",
      previewPatch(operations) {
        moved = operations;
        return {
          state: {
            ...initial,
            items: [initial.items[1]!, initial.items[0]!],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(moved).toEqual([
      { op: "move", from: "/items/0", path: "/items/1" },
    ]);

    expect(planDocumentDuplicateCheck({
      schema: Schema,
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "duplicate source selection is empty",
    });

    expect(planDocumentDuplicateCheck({
      schema: Schema,
      state: initial,
      selectionSource: "/items/0",
      previewPatch(operations) {
        duplicated = operations;
        return {
          state: {
            ...initial,
            items: [initial.items[0]!, initial.items[0]!, initial.items[1]!],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(duplicated).toEqual([
      { op: "copy", from: "/items/0", path: "/items/1" },
    ]);
  });

  test("plans clipboard copy and cut checks from explicit state and selection source", () => {
    let cutPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentCopyCheck({
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "copy source selection is empty",
    });

    expect(planDocumentCopyCheck({
      state: initial,
      selectionSource: "/items/0",
      stateJsonTrusted: true,
    })).toEqual({ ok: true });

    expect(planDocumentCutCheck({
      schema: Schema,
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "cut source selection is empty",
    });

    expect(planDocumentCutCheck({
      schema: Schema,
      state: initial,
      selectionSource: "/items/0",
      stateJsonTrusted: true,
      previewPatch(operations) {
        cutPreviewed = operations;
        return {
          state: {
            ...initial,
            items: [initial.items[1]!],
          },
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(cutPreviewed).toEqual([
      { op: "remove", path: "/items/0" },
    ]);
  });

  test("keeps JSON guard decisions testable without createJSONDocument", () => {
    const UnknownSchema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const state = { items: [bad] };

    expect(planDocumentCopyCheck({ state, source: "/items/0" })).toMatchObject({
      ok: false,
      code: "not_serializable",
    });
    expect(planDocumentCopyCheck({
      state,
      source: "/items/0",
      stateJsonTrusted: true,
    })).toEqual({ ok: true });

    expect(checkDocumentCopy({ schema: UnknownSchema, state }, "/items/0")).toMatchObject({
      ok: false,
      code: "not_serializable",
    });
    expect(checkDocumentCopy({
      schema: UnknownSchema,
      state,
      stateJsonTrusted: true,
    }, "/items/0")).toEqual({ ok: true });
    expect(state.items[0]).toBe(bad);
  });

  test("plans paste checks from explicit state, selection target, and preview trust", () => {
    let defaultPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;
    let trustedPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;
    const next = {
      ...initial,
      items: [
        ...initial.items,
        { id: "c", name: "C" },
      ],
    };

    expect(planDocumentPasteCheck({
      schema: Schema,
      state: initial,
      payload: { id: "c", name: "C" },
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "paste target selection is empty",
    });

    expect(planDocumentPasteCheck({
      schema: Schema,
      state: initial,
      payload: { id: "c", name: "C" },
      selectionTarget: "/items/-",
      trustedPayload: true,
      previewPatch(operations) {
        defaultPreviewed = operations;
        return {
          state: initial,
          result: { ok: false, code: "path_not_found" },
          applied: [],
        };
      },
      previewTrustedValuesPatch(operations) {
        trustedPreviewed = operations;
        return {
          state: next,
          result: { ok: true },
          applied: operations,
        };
      },
    })).toEqual({ ok: true });
    expect(defaultPreviewed).toBeUndefined();
    expect(trustedPreviewed).toEqual([
      { op: "add", path: "/items/-", value: { id: "c", name: "C" } },
    ]);
  });

  test("checks JSONPath syntax without any document state", () => {
    expect(checkDocumentFind("$.items[*].id")).toEqual({ ok: true });
    expect(checkDocumentFind("$.items[")).toMatchObject({
      ok: false,
      code: "syntax_error",
    });
  });
});
