import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  planClipboardCut,
  planClipboardPaste,
} from "../src/application/document/clipboard.js";
import type { ApplyResult, JSONPatchOperation } from "../src/foundation/json-patch/index.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
  meta: z.record(z.string(), z.string()),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
  meta: { owner: "core" },
};

describe("document clipboard core functions", () => {
  test("plans cut without applying document state or touching clipboard buffer", () => {
    const result = planClipboardCut({
      schema: Schema,
      state: initial,
      source: "/items/0",
      stateJsonTrusted: true,
    });

    expect(result).toMatchObject({
      ok: true,
      next: {
        items: [{ id: "b", name: "B" }],
      },
      patch: [{ op: "remove", path: "/items/0" }],
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
    expect(initial.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("plans paste against an explicit selection target", () => {
    const result = planClipboardPaste({
      schema: Schema,
      state: initial,
      payload: { id: "c", name: "C" },
      selectionTarget: "/items/-",
    });

    expect(result).toMatchObject({
      ok: true,
      next: {
        items: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
          { id: "c", name: "C" },
        ],
      },
      patch: [{ op: "add", path: "/items/-", value: { id: "c", name: "C" } }],
      applied: [{ op: "add", path: "/items/2", value: { id: "c", name: "C" } }],
    });
    expect(initial.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("uses trusted preview when the payload boundary is already owned", () => {
    let previewKind: "none" | "plain" | "trusted" = "none";
    const trustedState: z.output<typeof Schema> = {
      items: [
        ...initial.items,
        { id: "trusted", name: "Trusted" },
      ],
      meta: initial.meta,
    };
    const previewPatch = ((operations: ReadonlyArray<JSONPatchOperation>) => {
      previewKind = "plain";
      return {
        state: initial,
        result: { ok: false, code: "schema_violation", reason: "plain preview should not run" },
        applied: operations,
      };
    }) satisfies (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<typeof Schema>;
    const previewTrustedValuesPatch = ((operations: ReadonlyArray<JSONPatchOperation>) => {
      previewKind = "trusted";
      return {
        state: trustedState,
        result: { ok: true },
        applied: operations,
      };
    }) satisfies (operations: ReadonlyArray<JSONPatchOperation>) => ApplyResult<typeof Schema>;

    const result = planClipboardPaste({
      schema: Schema,
      state: initial,
      payload: { id: "trusted", name: "Trusted" },
      target: "/items/-",
      trustedPayload: true,
      previewPatch,
      previewTrustedValuesPatch,
    });

    expect(result).toMatchObject({
      ok: true,
      next: trustedState,
    });
    expect(previewKind).toBe("trusted");
    expect(initial.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("reports empty paste target without a clipboard shell", () => {
    expect(planClipboardPaste({
      schema: Schema,
      state: initial,
      payload: { id: "c", name: "C" },
    })).toMatchObject({
      ok: false,
      code: "empty_selection",
    });
  });
});
