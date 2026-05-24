import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  checkDocumentCopy,
  checkDocumentFind,
  checkDocumentPatch,
  checkDocumentRemove,
  checkDocumentReplace,
  planDocumentPatchCheck,
  planDocumentPasteCheck,
  planDocumentReplaceCheck,
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

describe("document check core functions", () => {
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

  test("keeps JSON guard decisions testable without createJSONDocument", () => {
    const UnknownSchema = z.object({ items: z.array(z.unknown()) });
    const bad = () => "bad";
    const state = { items: [bad] };

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
