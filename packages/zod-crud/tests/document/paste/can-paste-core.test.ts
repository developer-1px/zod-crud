import { describe, expect, test } from "vitest";
import * as z from "zod";

import {
  planDocumentCanPaste,
} from "../../../src/application/document/state/commit.js";
import type { ClipboardPeekResult } from "../../../src/application/document/clipboard/types.js";

const Schema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
});

const initial: z.output<typeof Schema> = {
  items: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ],
};

const emptyClipboard: ClipboardPeekResult = {
  ok: false,
  code: "empty_clipboard",
  message: "clipboard is empty",
};

function clipboardWithData(
  overrides: Partial<Extract<ClipboardPeekResult, { ok: true }>> = {},
): Extract<ClipboardPeekResult, { ok: true }> {
  return {
    ok: true,
    payload: initial.items[0],
    source: "/items/0",
    sources: ["/items/0"],
    schemaTrusted: true,
    ...overrides,
  };
}

describe("document canPaste core planning", () => {
  test("returns the empty clipboard capability result without a document facade", () => {
    expect(planDocumentCanPaste({
      schema: Schema,
      state: initial,
      clipboard: emptyClipboard,
      target: "/items/-",
    })).toEqual({
      kind: "result",
      result: {
        ok: false,
        code: "empty_clipboard",
        reason: "clipboard is empty",
      },
    });
  });

  test("accepts trusted same-source replace capabilities without schema preview work", () => {
    const clipboard = clipboardWithData();

    expect(planDocumentCanPaste({
      schema: Schema,
      state: initial,
      clipboard,
      target: { replace: "/items/0" },
    })).toEqual({
      kind: "result",
      result: { ok: true },
    });
  });

  test("falls back to capability planning when same-source replace trust does not apply", () => {
    const clipboard = clipboardWithData();

    expect(planDocumentCanPaste({
      schema: Schema,
      state: initial,
      clipboard,
      target: "/items/-",
    })).toEqual({
      kind: "capability",
      payload: initial.items[0],
      target: "/items/-",
      options: { spread: false },
      executionOptions: { trustedPayload: true },
    });
  });

  test("defaults multi-source clipboard capabilities to spread paste", () => {
    const payload = [initial.items[0], initial.items[1]];
    const clipboard = clipboardWithData({
      payload,
      source: null,
      sources: ["/items/0", "/items/1"],
    });

    expect(planDocumentCanPaste({
      schema: Schema,
      state: initial,
      clipboard,
      target: "/items/-",
    })).toEqual({
      kind: "capability",
      payload,
      target: "/items/-",
      options: { spread: true },
      executionOptions: { trustedPayload: true },
    });
    expect(planDocumentCanPaste({
      schema: Schema,
      state: initial,
      clipboard,
      target: "/items/-",
      options: { spread: false },
    })).toMatchObject({
      kind: "capability",
      options: { spread: false },
    });
  });

  test("does not use same-source trust when paste options can change the payload", () => {
    const clipboard = clipboardWithData();

    expect(planDocumentCanPaste({
      schema: Schema,
      state: initial,
      clipboard,
      target: { replace: "/items/0" },
      options: { rekey: { fields: ["id"], strategy: "suffix" } },
    })).toMatchObject({
      kind: "capability",
      options: {
        rekey: { fields: ["id"], strategy: "suffix" },
        spread: false,
      },
    });
  });
});
