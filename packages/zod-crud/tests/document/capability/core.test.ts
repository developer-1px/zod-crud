import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  canDocumentCopy,
  canDocumentFind,
  canDocumentPatch,
  canDocumentRemove,
  canDocumentReplace,
  planDocumentCapabilityResult,
  planDocumentCopyCapability,
  planDocumentCutCapability,
  planDocumentDeleteTextCapability,
  planDocumentDuplicateCapability,
  planDocumentMoveCapability,
  planDocumentPatchCapability,
  planDocumentPasteCapability,
  planDocumentRemoveCapability,
  planDocumentReplaceCapability,
  planDocumentReplaceTextCapability,
} from "../../../src/application/document/capabilityChecks.js";
import type {
  DocumentCapabilityContext,
} from "../../../src/application/document/capabilityFacadeTypes.js";
import type { JSONPatchOperation } from "../../../src/foundation/json-patch/types.js";
import type { SelectionSnap } from "../../../src/domain/selection/selectionTypes.js";

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

describe("document capability core functions", () => {
  test("normalizes capability domain results without running a document facade", () => {
    expect(planDocumentCapabilityResult({ ok: true })).toEqual({ ok: true });

    expect(planDocumentCapabilityResult({
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

    expect(planDocumentCapabilityResult({
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

  test("evaluates a patch capability through an injected preview without a document facade", () => {
    const operations: JSONPatchOperation[] = [{ op: "remove", path: "/missing" }];
    let previewed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentPatchCapability({
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

    const context: DocumentCapabilityContext<typeof Schema> = {
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

    expect(canDocumentPatch(context, operations)).toMatchObject({
      ok: false,
      code: "path_not_found",
    });
    expect(initial.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("evaluates selected-source operations from plain state and selection data", () => {
    const context: DocumentCapabilityContext<typeof Schema> = {
      schema: Schema,
      state: initial,
      selection: selectedFirstItem,
    };

    expect(canDocumentRemove(context)).toEqual({ ok: true });
    expect(canDocumentReplace(context, { id: "a1", name: "A1" })).toEqual({ ok: true });
    expect(initial.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("evaluates replace overload arguments through capability checks", () => {
    const context: DocumentCapabilityContext<typeof Schema> = {
      schema: Schema,
      state: initial,
      selection: selectedFirstItem,
    };

    expect(canDocumentReplace(context, "/items/0/name", "Alpha")).toEqual({ ok: true });
    expect(canDocumentReplace(context, { id: "a1", name: "Alpha" })).toEqual({ ok: true });
  });

  test("plans remove capabilities from explicit state and selection source", () => {
    let removed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentRemoveCapability({
      schema: Schema,
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "remove source selection is empty",
    });

    expect(planDocumentRemoveCapability({
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

  test("plans replace capabilities from explicit state, target fallback, and JSONPath targets", () => {
    let previewed: ReadonlyArray<JSONPatchOperation> | undefined;
    let jsonpathPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentReplaceCapability({
      schema: Schema,
      state: initial,
      value: { id: "x", name: "X" },
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "replace target selection is empty",
    });

    expect(planDocumentReplaceCapability({
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

    expect(planDocumentReplaceCapability({
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

  test("plans text replacement and deletion capabilities from explicit selection", () => {
    let replaced: ReadonlyArray<JSONPatchOperation> | undefined;
    let deleted: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentReplaceTextCapability({
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

    expect(planDocumentDeleteTextCapability({
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

  test("plans move and duplicate capabilities from explicit state and selection source", () => {
    let moved: ReadonlyArray<JSONPatchOperation> | undefined;
    let duplicated: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentMoveCapability({
      schema: Schema,
      state: initial,
      target: "/items/1",
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "move source selection is empty",
    });

    expect(planDocumentMoveCapability({
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

    expect(planDocumentDuplicateCapability({
      schema: Schema,
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "duplicate source selection is empty",
    });

    expect(planDocumentDuplicateCapability({
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

  test("plans clipboard copy and cut capabilities from explicit state and selection source", () => {
    let cutPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;

    expect(planDocumentCopyCapability({
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "copy source selection is empty",
    });

    expect(planDocumentCopyCapability({
      state: initial,
      selectionSource: "/items/0",
      stateJsonTrusted: true,
    })).toEqual({ ok: true });

    expect(planDocumentCutCapability({
      schema: Schema,
      state: initial,
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "cut source selection is empty",
    });

    expect(planDocumentCutCapability({
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

    expect(planDocumentCopyCapability({ state, source: "/items/0" })).toMatchObject({
      ok: false,
      code: "not_serializable",
    });
    expect(planDocumentCopyCapability({
      state,
      source: "/items/0",
      stateJsonTrusted: true,
    })).toEqual({ ok: true });

    expect(canDocumentCopy({ schema: UnknownSchema, state }, "/items/0")).toMatchObject({
      ok: false,
      code: "not_serializable",
    });
    expect(canDocumentCopy({
      schema: UnknownSchema,
      state,
      stateJsonTrusted: true,
    }, "/items/0")).toEqual({ ok: true });
    expect(state.items[0]).toBe(bad);
  });

  test("plans paste capabilities from explicit state, selection target, and preview trust", () => {
    let defaultPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;
    let trustedPreviewed: ReadonlyArray<JSONPatchOperation> | undefined;
    const next = {
      ...initial,
      items: [
        ...initial.items,
        { id: "c", name: "C" },
      ],
    };

    expect(planDocumentPasteCapability({
      schema: Schema,
      state: initial,
      payload: { id: "c", name: "C" },
    })).toEqual({
      ok: false,
      code: "empty_selection",
      reason: "paste target selection is empty",
    });

    expect(planDocumentPasteCapability({
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

  test("evaluates JSONPath syntax without any document state", () => {
    expect(canDocumentFind("$.items[*].id")).toEqual({ ok: true });
    expect(canDocumentFind("$.items[")).toMatchObject({
      ok: false,
      code: "syntax_error",
    });
  });
});
