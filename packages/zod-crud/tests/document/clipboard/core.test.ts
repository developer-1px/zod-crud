import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  planClipboardCopy,
  planClipboardCutApplyResult,
  planClipboardCut,
  planClipboardPaste,
  planClipboardPasteApplyResult,
  planClipboardPeekBuffer,
  planClipboardReadBuffer,
  planClipboardSchemaTrustedSourceBuffer,
  planClipboardSource,
  planClipboardWriteBuffer,
} from "../../../src/application/document/clipboard/clipboard.js";
import type { ClipboardBuffer } from "../../../src/application/document/clipboard/types.js";
import type { ApplyResult, JSONPatchOperation } from "../../../src/foundation/patch/types.js";

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
    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload: initial,
    })).toMatchObject({ ok: true, buffer: { sources: null } });
    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload: initial.items[0],
      options: {
        source: "/items/0",
        sources: ["/items/0/name", "/items/0"],
      },
    })).toMatchObject({ ok: true, buffer: { sources: ["/items/0"] } });
    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload: initial,
      options: { source: "items/0" },
    })).toEqual({
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
    const schemaTrusted = (
      payload: unknown,
      stateJsonTrusted: boolean,
      options = {},
    ): boolean => {
      const result = planClipboardWriteBuffer({
        state: initial,
        stateJsonTrusted,
        payload,
        options,
      });
      if (!result.ok) throw new Error("expected write buffer plan to succeed");
      return result.buffer.schemaTrusted;
    };

    expect(schemaTrusted(initial, false)).toBe(false);
    expect(schemaTrusted(initial, true)).toBe(true);
    expect(schemaTrusted(sourcePayload, true, { source: "/items/0" })).toBe(true);
    expect(schemaTrusted(initial.items, true)).toBe(true);
    expect(schemaTrusted({ id: "a", name: "A" }, true, { source: "/items/0" })).toBe(false);
  });

  test("plans write payload cloning and JSON guard decisions", () => {
    const payload = { id: "a", nested: { name: "A" } };
    const cloned = planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload,
      options: { clonePayload: true },
    });

    expect(cloned).toMatchObject({ ok: true, buffer: { payload } });
    if (cloned.ok) expect(cloned.buffer.payload).not.toBe(payload);

    const direct = planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload,
      options: { clonePayload: false },
    });
    expect(direct).toMatchObject({ ok: true, buffer: { payload } });
    if (direct.ok) expect(direct.buffer.payload).toBe(payload);

    const bad = () => "bad";
    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: false,
      payload: bad,
      options: { clonePayload: true },
    })).toMatchObject({ ok: false });
    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: false,
      payload: bad,
      options: { trustedPayload: true, clonePayload: false },
    })).toMatchObject({ ok: true, buffer: { payload: bad } });
  });

  test("plans write buffers from state trust, sources, and payload guards", () => {
    const payload = initial.items[0]!;
    const sourceTrusted = planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload,
      options: { source: "/items/0" },
    });

    expect(sourceTrusted).toMatchObject({
      ok: true,
      buffer: {
        payload,
        source: "/items/0",
        sources: ["/items/0"],
        schemaTrusted: true,
      },
    });
    if (sourceTrusted.ok) expect(sourceTrusted.buffer.payload).not.toBe(payload);

    const trustedExternal = () => "external";
    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload: trustedExternal,
      options: { trustedPayload: true, clonePayload: false },
    })).toEqual({
      ok: true,
      buffer: {
        payload: trustedExternal,
        source: null,
        sources: null,
        schemaTrusted: false,
      },
    });

    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload,
      options: { source: "items/0" },
    })).toEqual({
      ok: false,
      result: {
        ok: false,
        code: "invalid_pointer",
        reason: "invalid clipboard source pointer: items/0",
        pointer: "items/0",
      },
    });

    expect(planClipboardWriteBuffer({
      state: initial,
      stateJsonTrusted: true,
      payload: trustedExternal,
    })).toMatchObject({
      ok: false,
      result: {
        ok: false,
        code: "not_serializable",
      },
    });
  });

  test("plans copy without a clipboard shell", () => {
    const result = planClipboardCopy({
      state: initial,
      source: "/items/0",
      stateJsonTrusted: true,
    });

    expect(result).toEqual({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
    if (result.ok) expect(result.payload).not.toBe(initial.items[0]);

    const direct = planClipboardCopy({
      state: initial,
      source: "/items/0",
      stateJsonTrusted: true,
      clonePayload: false,
    });
    if (!direct.ok) throw new Error("expected copy to succeed");
    expect(direct.payload).toBe(initial.items[0]);

    expect(planClipboardCopy({
      state: initial,
      source: "items/0",
      stateJsonTrusted: true,
    })).toEqual({
      ok: false,
      code: "invalid_pointer",
      message: "invalid source pointer: items/0",
    });
  });

  test("plans schema-trusted source buffers for copy and cut results", () => {
    const payload = { id: "a", name: "A" };
    const sources = ["/items/0"];

    const buffer = planClipboardSchemaTrustedSourceBuffer({
      payload,
      source: "/items/0",
      sources,
    });

    expect(buffer).toEqual({
      payload,
      source: "/items/0",
      sources: ["/items/0"],
      schemaTrusted: true,
    });
    expect(buffer.sources).not.toBe(sources);
  });

  test("plans copy and cut source resolution from explicit input and selection fallback", () => {
    expect(planClipboardSource({
      operation: "copy",
      source: "/items/0",
      selectionSource: "/items/1",
    })).toEqual({
      ok: true,
      source: "/items/0",
    });

    expect(planClipboardSource({
      operation: "cut",
      selectionSource: ["/items/0", "/items/1"],
    })).toEqual({
      ok: true,
      source: ["/items/0", "/items/1"],
    });

    expect(planClipboardSource({
      operation: "copy",
      selectionSource: null,
    })).toEqual({
      ok: false,
      result: {
        ok: false,
        code: "empty_selection",
        message: "copy source selection is empty",
      },
    });

    expect(planClipboardSource({
      operation: "cut",
      selectionSource: null,
    })).toEqual({
      ok: false,
      result: {
        ok: false,
        code: "empty_selection",
        message: "cut source selection is empty",
      },
    });
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
