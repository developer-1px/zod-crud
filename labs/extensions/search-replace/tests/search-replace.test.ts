import { describe, expect, test } from "vitest";
import * as z from "zod";

import { createJSONDocument } from "zod-crud";
import {
  canReplaceAllText,
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

describe("@zod-crud/search-replace", () => {
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
