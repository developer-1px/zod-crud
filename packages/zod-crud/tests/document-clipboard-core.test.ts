import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  isClipboardSchemaTrustedPayload,
  planClipboardCutApplyResult,
  planClipboardPasteApplyResult,
  planClipboardPeekBuffer,
  planClipboardReadBuffer,
  planClipboardCut,
  planClipboardPaste,
  planClipboardWritePayload,
  planClipboardWriteSources,
  type ClipboardBuffer,
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
  test("plans buffer reads and peeks without a clipboard shell", () => {
    const payload = { id: "a", nested: { name: "A" } };
    const buffer: ClipboardBuffer = {
      payload,
      source: "/items/0",
      sources: ["/items/0"],
      schemaTrusted: true,
    };

    expect(planClipboardReadBuffer(null)).toMatchObject({
      ok: false,
      code: "empty_clipboard",
    });

    const cloned = planClipboardReadBuffer(buffer);
    expect(cloned).toEqual({
      ok: true,
      payload,
      source: "/items/0",
      sources: ["/items/0"],
    });
    if (cloned.ok) {
      expect(cloned.payload).not.toBe(payload);
      expect(cloned.sources).not.toBe(buffer.sources);
    }

    const direct = planClipboardReadBuffer(buffer, { clonePayload: false });
    expect(direct).toMatchObject({ ok: true, payload });
    if (direct.ok) expect(direct.payload).toBe(payload);

    expect(planClipboardPeekBuffer(buffer)).toEqual({
      ok: true,
      payload,
      source: "/items/0",
      sources: ["/items/0"],
      schemaTrusted: true,
    });
  });

  test("plans write source normalization without a clipboard shell", () => {
    expect(planClipboardWriteSources({})).toEqual({ ok: true, sources: null });
    expect(planClipboardWriteSources({
      source: "/items/0",
      sources: ["/items/0/name", "/items/0"],
    })).toEqual({ ok: true, sources: ["/items/0"] });
    expect(planClipboardWriteSources({ source: "items/0" })).toEqual({
      ok: false,
      result: {
        ok: false,
        code: "invalid_pointer",
        reason: "invalid clipboard source pointer: items/0",
        pointer: "items/0",
      },
    });
  });

  test("checks schema-trusted clipboard payloads from explicit state and sources", () => {
    const sourcePayload = initial.items[0];

    expect(isClipboardSchemaTrustedPayload({
      state: initial,
      stateJsonTrusted: false,
      payload: initial,
      sources: null,
    })).toBe(false);
    expect(isClipboardSchemaTrustedPayload({
      state: initial,
      stateJsonTrusted: true,
      payload: initial,
      sources: null,
    })).toBe(true);
    expect(isClipboardSchemaTrustedPayload({
      state: initial,
      stateJsonTrusted: true,
      payload: sourcePayload,
      sources: ["/items/0"],
    })).toBe(true);
    expect(isClipboardSchemaTrustedPayload({
      state: initial,
      stateJsonTrusted: true,
      payload: initial.items,
      sources: null,
    })).toBe(true);
    expect(isClipboardSchemaTrustedPayload({
      state: initial,
      stateJsonTrusted: true,
      payload: { id: "a", name: "A" },
      sources: ["/items/0"],
    })).toBe(false);
  });

  test("plans write payload cloning and JSON guard decisions", () => {
    const payload = { id: "a", nested: { name: "A" } };
    const cloned = planClipboardWritePayload({
      payload,
      trustedPayload: false,
      clonePayload: true,
    });

    expect(cloned).toEqual({ ok: true, value: payload });
    if (cloned.ok) expect(cloned.value).not.toBe(payload);

    expect(planClipboardWritePayload({
      payload,
      trustedPayload: false,
      clonePayload: false,
    })).toEqual({ ok: true, value: payload });

    const bad = () => "bad";
    expect(planClipboardWritePayload({
      payload: bad,
      trustedPayload: false,
      clonePayload: true,
    })).toMatchObject({ ok: false });
    expect(planClipboardWritePayload({
      payload: bad,
      trustedPayload: true,
      clonePayload: false,
    })).toEqual({ ok: true, value: bad });
  });

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

  test("maps cut apply results to public cut mutation results", () => {
    const applied: JSONPatchOperation[] = [
      { op: "remove", path: "/items/0" },
    ];
    const payload = { id: "a", name: "A" };
    const state = {
      ...initial,
      items: [{ id: "b", name: "B" }],
    };

    expect(planClipboardCutApplyResult({
      result: { ok: true },
      state,
      applied,
      payload,
      source: "/items/0",
      sources: ["/items/0"],
    })).toEqual({
      ok: true,
      value: state,
      applied,
      payload,
      source: "/items/0",
      sources: ["/items/0"],
    });

    expect(planClipboardCutApplyResult({
      result: { ok: false, code: "path_not_found", reason: "missing source" },
      state,
      applied,
      payload,
      source: "/items/0",
      sources: ["/items/0"],
    })).toEqual({
      ok: false,
      code: "path_not_found",
      message: "missing source",
      violations: [],
    });
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

  test("maps paste apply results to public paste mutation results", () => {
    const applied: JSONPatchOperation[] = [
      { op: "add", path: "/items/2", value: { id: "c", name: "C" } },
    ];
    const state = {
      ...initial,
      items: [
        ...initial.items,
        { id: "c", name: "C" },
      ],
    };

    expect(planClipboardPasteApplyResult({
      result: { ok: true },
      state,
      applied,
    })).toEqual({
      ok: true,
      value: state,
      applied,
    });

    expect(planClipboardPasteApplyResult({
      result: { ok: false, code: "path_not_found", reason: "missing target" },
      state,
      applied,
    })).toEqual({
      ok: false,
      code: "path_not_found",
      message: "missing target",
    });
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
