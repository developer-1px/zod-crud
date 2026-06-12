import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "@interactive-os/json-document";
import {
  canReplaceAllText,
  canReplaceTextMatch,
  createSearchReplace,
  findText,
} from "../src/index.js";

const Schema = z.object({
  title: z.string(),
  pages: z.array(z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    notes: z.array(z.string()),
  })),
  hidden: z.object({
    label: z.string(),
  }),
});

function createDoc() {
  return createJSONDocument(Schema, {
    title: "Draft doc",
    pages: [
      {
        id: "p1",
        title: "Draft intro",
        body: "draft body draft",
        notes: ["first draft", "DONE"],
      },
      {
        id: "p2",
        title: "Done",
        body: "nothing here",
        notes: [],
      },
    ],
    hidden: {
      label: "draft-hidden",
    },
  });
}

function firstRange(doc: ReturnType<typeof createDoc>, pointer: string) {
  const found = findText(doc, "draft");
  if (!found.ok) throw new Error(found.reason);
  const match = found.matches.find((candidate) => candidate.pointer === pointer);
  if (match === undefined) throw new Error(`missing match: ${pointer}`);
  const range = match.ranges[0];
  if (range === undefined) throw new Error(`missing range: ${pointer}`);
  return { pointer: match.pointer, range };
}

describe("@interactive-os/json-document-search-replace", () => {
  test("finds text occurrences across a document", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);

    expect(text.find("draft")).toMatchObject({
      ok: true,
      search: "draft",
      root: "",
      caseSensitive: false,
      count: 6,
      matches: [
        {
          pointer: "/title",
          value: "Draft doc",
          ranges: [{ start: 0, end: 5, text: "Draft" }],
        },
        {
          pointer: "/pages/0/title",
          value: "Draft intro",
        },
        {
          pointer: "/pages/0/body",
          value: "draft body draft",
          ranges: [
            { start: 0, end: 5, text: "draft" },
            { start: 11, end: 16, text: "draft" },
          ],
        },
        {
          pointer: "/pages/0/notes/0",
          value: "first draft",
        },
        {
          pointer: "/hidden/label",
          value: "draft-hidden",
        },
      ],
    });
  });

  test("finds text within a subtree", () => {
    const doc = createDoc();

    expect(findText(doc, "draft", { root: "/pages" })).toMatchObject({
      ok: true,
      root: "/pages",
      count: 4,
      matches: [
        { pointer: "/pages/0/title" },
        { pointer: "/pages/0/body" },
        { pointer: "/pages/0/notes/0" },
      ],
    });
  });

  test("filters search and replace-all targets with a host predicate", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);
    expect(doc.replace("/pages/0/id", "draft-id")).toEqual({ ok: true });

    const include = ({ pointer }: { pointer: string }) =>
      pointer === "/title"
      || pointer.endsWith("/title")
      || pointer.endsWith("/body")
      || pointer.includes("/notes/");

    expect(text.find("draft", { include })).toMatchObject({
      ok: true,
      count: 5,
      matches: [
        { pointer: "/title" },
        { pointer: "/pages/0/title" },
        { pointer: "/pages/0/body" },
        { pointer: "/pages/0/notes/0" },
      ],
    });

    expect(text.canReplaceAll("draft", "final", { include })).toMatchObject({
      ok: true,
      count: 5,
      operations: [
        { op: "replace", path: "/title", value: "final doc" },
        { op: "replace", path: "/pages/0/title", value: "final intro" },
        { op: "replace", path: "/pages/0/body", value: "final body final" },
        { op: "replace", path: "/pages/0/notes/0", value: "first final" },
      ],
    });

    expect(text.replaceAll("draft", "final", { include })).toMatchObject({
      ok: true,
      count: 5,
    });
    expect(doc.value.pages[0]?.id).toBe("draft-id");
    expect(doc.value.hidden.label).toBe("draft-hidden");
  });

  test("supports case-sensitive search", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);

    expect(text.find("draft", { caseSensitive: true })).toMatchObject({
      ok: true,
      count: 4,
    });
    expect(text.find("Draft", { caseSensitive: true })).toMatchObject({
      ok: true,
      count: 2,
    });
  });

  test("plans replace-all without mutating", () => {
    const doc = createDoc();

    const change = canReplaceAllText(doc, "draft", "final", { root: "/pages" });

    expect(change).toMatchObject({
      ok: true,
      count: 4,
      operations: [
        { op: "replace", path: "/pages/0/title", value: "final intro" },
        { op: "replace", path: "/pages/0/body", value: "final body final" },
        { op: "replace", path: "/pages/0/notes/0", value: "first final" },
      ],
    });
    expect(doc.value.pages[0]?.title).toBe("Draft intro");
  });

  test("replaces all text through patch", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);

    expect(text.replaceAll("draft", "final", { root: "/pages" })).toMatchObject({
      ok: true,
      count: 4,
    });
    expect(doc.value.pages[0]).toMatchObject({
      title: "final intro",
      body: "final body final",
      notes: ["first final", "DONE"],
    });
    expect(doc.value.hidden.label).toBe("draft-hidden");
  });

  test("plans and replaces a single current match", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);
    const target = firstRange(doc, "/pages/0/body");

    expect(canReplaceTextMatch(doc, target, "final")).toMatchObject({
      ok: true,
      pointer: "/pages/0/body",
      nextValue: "final body draft",
      operations: [
        { op: "replace", path: "/pages/0/body", value: "final body draft" },
      ],
    });
    expect(doc.value.pages[0]?.body).toBe("draft body draft");

    expect(text.replaceMatch(target, "final")).toMatchObject({
      ok: true,
      pointer: "/pages/0/body",
      nextValue: "final body draft",
    });
    expect(doc.value.pages[0]?.body).toBe("final body draft");
    expect(doc.lastPatch).toEqual([
      { op: "replace", path: "/pages/0/body", value: "final body draft" },
    ]);
  });

  test("rejects stale single-match replacement", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);
    const target = firstRange(doc, "/pages/0/body");

    expect(doc.replace("/pages/0/body", "changed body")).toEqual({ ok: true });

    expect(text.replaceMatch(target, "final")).toMatchObject({
      ok: false,
      code: "stale_match",
      pointer: "/pages/0/body",
    });
    expect(doc.value.pages[0]?.body).toBe("changed body");
  });

  test("returns no-op single-match replacement without patching", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);
    const target = firstRange(doc, "/pages/0/body");

    expect(text.replaceMatch(target, target.range.text)).toMatchObject({
      ok: true,
      operations: [],
      nextValue: "draft body draft",
    });
    expect(doc.lastPatch).toEqual([]);
  });

  test("reports invalid single-match targets", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);

    expect(text.replaceMatch({
      pointer: "/pages/0",
      range: { start: 0, end: 5, text: "draft" },
    }, "final")).toMatchObject({
      ok: false,
      code: "not_text",
      pointer: "/pages/0",
    });
    expect(text.replaceMatch({
      pointer: "/pages/0/body",
      range: { start: 3, end: 1, text: "" },
    }, "final")).toMatchObject({
      ok: false,
      code: "invalid_match",
    });
  });

  test("reports empty search and missing roots", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);

    expect(text.find("")).toMatchObject({
      ok: false,
      code: "empty_search",
    });
    expect(text.find("draft", { root: "/missing" })).toMatchObject({
      ok: false,
      code: "path_not_found",
      pointer: "/missing",
    });
  });

  test("returns an empty successful replacement when nothing matches", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);

    expect(text.replaceAll("absent", "x")).toMatchObject({
      ok: true,
      count: 0,
      operations: [],
    });
    expect(doc.lastPatch).toEqual([]);
  });

  test("returns isolated search matches and operations", () => {
    const doc = createDoc();
    const text = createSearchReplace(doc);

    const found = text.find("draft");
    if (!found.ok) throw new Error(found.reason);
    const first = found.matches[0];
    if (first === undefined) throw new Error("expected match");
    (first.ranges[0] as { text: string }).text = "changed";

    const change = text.canReplaceAll("draft", "final");
    if (!change.ok) throw new Error(change.reason);
    const operation = change.operations[0];
    if (operation?.op !== "replace") throw new Error("expected replace operation");
    operation.value = "changed";

    const foundAgain = text.find("draft");
    if (!foundAgain.ok) throw new Error(foundAgain.reason);
    expect(foundAgain.matches[0]).toMatchObject({
      pointer: "/title",
      ranges: [{ text: "Draft" }],
    });

    const changeAgain = text.canReplaceAll("draft", "final");
    if (!changeAgain.ok) throw new Error(changeAgain.reason);
    expect(changeAgain.operations[0]).toEqual({ op: "replace", path: "/title", value: "final doc" });
  });
});
