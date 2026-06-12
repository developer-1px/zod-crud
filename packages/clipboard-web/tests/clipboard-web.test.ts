import { describe, expect, test, vi } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  WEB_CLIPBOARD_KIND,
  WEB_CLIPBOARD_VERSION,
  createWebClipboard,
  defaultWebClipboardCodec,
  type TextClipboardHost,
} from "../src/index.js";

const Item = z.object({ id: z.string(), name: z.string().min(1) });
const Schema = z.object({
  items: z.array(Item),
});

function createDoc() {
  return createJSONDocument(Schema, {
    items: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ],
  }, {
    history: 10,
  });
}

function createMemoryClipboard(initialText = ""): TextClipboardHost & { text: string } {
  return {
    text: initialText,
    readText() {
      return this.text;
    },
    writeText(text) {
      this.text = text;
    },
  };
}

describe("@interactive-os/json-document-clipboard-web", () => {
  test("copies a document payload to an injected text clipboard host", async () => {
    const doc = createDoc();
    const host = createMemoryClipboard();
    const clipboard = createWebClipboard(doc, { host });

    const result = await clipboard.copy("/items/0");

    expect(result).toMatchObject({
      ok: true,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
    expect(JSON.parse(host.text)).toEqual({
      kind: WEB_CLIPBOARD_KIND,
      version: WEB_CLIPBOARD_VERSION,
      payload: { id: "a", name: "A" },
      source: "/items/0",
      sources: ["/items/0"],
    });
  });

  test("pastes clipboard text through the public paste gate", async () => {
    const doc = createDoc();
    const host = createMemoryClipboard(defaultWebClipboardCodec.encode({
      payload: { id: "c", name: "C" },
      source: "/items/2",
      sources: ["/items/2"],
    }));
    const clipboard = createWebClipboard(doc, { host });

    expect(await clipboard.canPaste("/items/-")).toEqual({ ok: true });

    const result = await clipboard.paste("/items/-");

    expect(result).toMatchObject({
      ok: true,
      applied: [{ op: "add", path: "/items/2", value: { id: "c", name: "C" } }],
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  test("keeps cut atomic when the host write fails", async () => {
    const doc = createDoc();
    const host: TextClipboardHost = {
      writeText: vi.fn(async () => {
        throw new Error("denied");
      }),
    };
    const clipboard = createWebClipboard(doc, { host });

    const result = await clipboard.cut("/items/0");

    expect(result).toMatchObject({
      ok: false,
      code: "clipboard_write_failed",
      reason: "failed to write text to clipboard",
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(doc.clipboard.read()).toMatchObject({
      ok: false,
      code: "empty_clipboard",
    });
  });

  test("restores the previous document clipboard when copy host write fails", async () => {
    const doc = createDoc();
    expect(doc.clipboard.copy("/items/1")).toMatchObject({ ok: true });
    const host: TextClipboardHost = {
      writeText: vi.fn(async () => {
        throw new Error("denied");
      }),
    };
    const clipboard = createWebClipboard(doc, { host });

    const result = await clipboard.copy("/items/0");

    expect(result).toMatchObject({
      ok: false,
      code: "clipboard_write_failed",
    });
    expect(doc.clipboard.read()).toMatchObject({
      ok: true,
      payload: { id: "b", name: "B" },
      source: "/items/1",
    });
  });

  test("accepts raw JSON clipboard text as a payload", () => {
    const doc = createDoc();
    const clipboard = createWebClipboard(doc, { host: createMemoryClipboard() });

    const result = clipboard.pasteText("/items/-", JSON.stringify({ id: "c", name: "C" }));

    expect(result).toMatchObject({
      ok: true,
      applied: [{ op: "add", path: "/items/2", value: { id: "c", name: "C" } }],
    });
  });

  test("reports parse errors before mutating the document", () => {
    const doc = createDoc();
    const clipboard = createWebClipboard(doc, { host: createMemoryClipboard() });

    const result = clipboard.pasteText("/items/-", "not json");

    expect(result).toMatchObject({
      ok: false,
      code: "clipboard_parse_failed",
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  test("reports unavailable host operations without touching core state", async () => {
    const doc = createDoc();
    const clipboard = createWebClipboard(doc, { host: {} });

    await expect(clipboard.copy("/items/0")).resolves.toMatchObject({
      ok: false,
      code: "clipboard_unavailable",
    });
    await expect(clipboard.read()).resolves.toMatchObject({
      ok: false,
      code: "clipboard_unavailable",
    });
    expect(doc.value.items.map((item) => item.id)).toEqual(["a", "b"]);
  });
});
