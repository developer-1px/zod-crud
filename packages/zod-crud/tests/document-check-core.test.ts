import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  checkDocumentCopy,
  checkDocumentFind,
  checkDocumentPatch,
  checkDocumentRemove,
  checkDocumentReplace,
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
    const context: DocumentCheckContext<typeof Schema> = {
      schema: Schema,
      state: initial,
      previewPatch(next) {
        previewed = next;
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
    expect(previewed).toBe(operations);
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

  test("checks JSONPath syntax without any document state", () => {
    expect(checkDocumentFind("$.items[*].id")).toEqual({ ok: true });
    expect(checkDocumentFind("$.items[")).toMatchObject({
      ok: false,
      code: "syntax_error",
    });
  });
});
